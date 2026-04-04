import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { submissionsRoot } from "../config/paths";
import { getEmployeeById } from "../repositories/employeeRepository";
import {
  getSubmissionById,
  insertSubmission,
  listSubmissions,
  updateSubmissionDeliveryResult
} from "../repositories/submissionRepository";
import { getTemplateById } from "../repositories/templateRepository";
import { attachSubmissionToTrainingSession, getTrainingSessionById } from "../repositories/trainingSessionRepository";
import { buildSubmissionMailDraft, sendSubmissionEmail } from "../services/emailService";
import { combineSubmissionPdfs, generateSubmissionPdf } from "../services/pdfService";
import {
  exportExistingPdfToDownloads,
  exportPdfBufferToDownloads,
  openOutlookDraftWithAttachment
} from "../services/windowsIntegrationService";
import type { StoredSubmission } from "../types/training";
import {
  createSubmissionBundlePdfDisplayName,
  createSubmissionPdfDisplayName,
  createSubmissionPdfStorageName
} from "../utils/pdfFileName";
import { uniqueEmails } from "../utils/text";

const sectionReviewSchema = z.object({
  sectionId: z.string().min(1),
  acknowledged: z.boolean(),
  note: z.string().trim().optional()
});

const signatureFieldSchema = z.union([z.literal(""), z.string().startsWith("data:image/png;base64,")]).default("");
const optionalEmailFieldSchema = z.union([z.literal(""), z.email()]).default("");

const submissionSchema = z.object({
  trainingSessionId: z.string().trim().optional(),
  employeeId: z.string().min(1),
  templateId: z.string().min(1),
  employeeName: z.string().trim().min(2),
  employeeEmail: z.email(),
  trainerName: z.string().trim().default(""),
  trainerEmail: optionalEmailFieldSchema,
  supervisorEmail: optionalEmailFieldSchema,
  primaryRecipient: optionalEmailFieldSchema,
  additionalCc: z.array(z.email()).optional(),
  notes: z.string().trim().optional(),
  employeeSignatureDataUrl: signatureFieldSchema,
  trainerSignatureDataUrl: signatureFieldSchema,
  deliveryMode: z.enum(["draft", "send"]).default("draft"),
  sectionReviews: z.array(sectionReviewSchema).default([])
});

const selectionSchema = z.object({
  employeeId: z.string().min(1),
  submissionIds: z.array(z.string().min(1)).optional()
});

const sendBatchSchema = z.object({
  employeeId: z.string().min(1),
  submissionIds: z.array(z.string().min(1)).optional(),
  primaryRecipient: z.email().optional(),
  additionalCc: z.array(z.email()).optional()
});

const mailDraftSchema = z.object({
  employeeId: z.string().min(1),
  submissionIds: z.array(z.string().min(1)).optional(),
  primaryRecipient: z.email().optional(),
  additionalCc: z.array(z.email()).optional()
});

function sortSubmissions(submissions: StoredSubmission[]): StoredSubmission[] {
  return submissions.slice().sort((left, right) => left.templateTitle.localeCompare(right.templateTitle));
}

function getEmployeeSubmissionSelection(employeeId: string, submissionIds?: string[]): StoredSubmission[] {
  const employeeSubmissions = listSubmissions({ employeeId })
    .map((item) => getSubmissionById(item.id))
    .filter((item): item is StoredSubmission => Boolean(item));

  if (!submissionIds?.length) {
    return sortSubmissions(employeeSubmissions);
  }

  const idSet = new Set(submissionIds);
  const selected = employeeSubmissions.filter((submission) => idSet.has(submission.id));

  if (selected.length !== idSet.size) {
    throw new Error("One or more submissions do not belong to the selected employee.");
  }

  return sortSubmissions(selected);
}

async function regenerateSubmissionPdf(submission: StoredSubmission): Promise<void> {
  const template = getTemplateById(submission.templateId);

  if (!template) {
    throw new Error(`Template ${submission.templateId} could not be loaded for PDF regeneration.`);
  }

  await generateSubmissionPdf(template, submission, submission.pdfPath);
}

async function regenerateSubmissionPdfs(submissions: StoredSubmission[]): Promise<void> {
  for (const submission of submissions) {
    await regenerateSubmissionPdf(submission);
  }
}

async function markSubmissionCompleted(submission: StoredSubmission): Promise<string | undefined> {
  if (submission.sendStatus === "sent") {
    return submission.completedAt;
  }

  const completedAt = new Date().toISOString();
  await updateSubmissionDeliveryResult({
    id: submission.id,
    sendStatus: "completed",
    emailDelivered: submission.emailDelivered,
    emailMessage: "PDF exported. Completion marked as done.",
    completedAt,
    sentAt: submission.sentAt
  });

  return completedAt;
}

async function markSubmissionsCompleted(submissions: StoredSubmission[]): Promise<string> {
  const completedAt = new Date().toISOString();

  for (const submission of submissions) {
    if (submission.sendStatus === "sent") {
      continue;
    }

    await updateSubmissionDeliveryResult({
      id: submission.id,
      sendStatus: "completed",
      emailDelivered: submission.emailDelivered,
      emailMessage: "PDF exported. Completion marked as done.",
      completedAt,
      sentAt: submission.sentAt
    });
  }

  return completedAt;
}

export function createSubmissionRouter(): Router {
  const router = Router();

  router.get("/", (request, response) => {
    const employeeId = typeof request.query.employeeId === "string" ? request.query.employeeId : undefined;
    const sendStatus = typeof request.query.sendStatus === "string" ? request.query.sendStatus : undefined;
    response.json(listSubmissions({ employeeId, sendStatus: sendStatus as never }));
  });

  router.get("/:submissionId/pdf", async (request, response, next) => {
    try {
      const submission = getSubmissionById(request.params.submissionId);
      if (!submission) {
        response.status(404).json({ message: "Submission not found." });
        return;
      }

      await regenerateSubmissionPdf(submission);

      try {
        await access(submission.pdfPath, constants.R_OK);
      } catch {
        response.status(404).json({ message: "PDF file not found." });
        return;
      }

      await markSubmissionCompleted(submission);

      response.download(submission.pdfPath, createSubmissionPdfDisplayName(submission), (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:submissionId/export", async (request, response, next) => {
    try {
      const submission = getSubmissionById(request.params.submissionId);
      if (!submission) {
        response.status(404).json({ message: "Submission not found." });
        return;
      }

      await regenerateSubmissionPdf(submission);
      const fileName = createSubmissionPdfDisplayName(submission);
      const filePath = await exportExistingPdfToDownloads(submission.pdfPath, fileName);
      const completedAt = await markSubmissionCompleted(submission);

      response.json({
        fileName,
        filePath,
        completedAt,
        sendStatus: submission.sendStatus === "sent" ? "sent" : "completed",
        message: "PDF saved to Downloads."
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/", async (request, response, next) => {
    try {
      const parsed = submissionSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      const template = getTemplateById(parsed.templateId);
      const trainingSession = parsed.trainingSessionId ? getTrainingSessionById(parsed.trainingSessionId) : undefined;

      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      if (!template) {
        response.status(404).json({ message: "Template not found." });
        return;
      }

      if (parsed.trainingSessionId && !trainingSession) {
        response.status(404).json({ message: "Training session not found." });
        return;
      }

      const missingAcknowledgements = template.sections.filter((section) => {
        const review = parsed.sectionReviews.find((item) => item.sectionId === section.id);
        return !review?.acknowledged;
      });

      if (parsed.deliveryMode === "send") {
        const missingFields = [
          !parsed.trainerName.trim() ? "trainerName" : null,
          !parsed.trainerEmail.trim() ? "trainerEmail" : null,
          !parsed.primaryRecipient.trim() ? "primaryRecipient" : null,
          !parsed.employeeSignatureDataUrl.trim() ? "employeeSignatureDataUrl" : null,
          !parsed.trainerSignatureDataUrl.trim() ? "trainerSignatureDataUrl" : null
        ].filter(Boolean);

        if (missingFields.length || missingAcknowledgements.length) {
          response.status(400).json({
            message: "Submission is incomplete and cannot be sent yet.",
            missingFields,
            missingSectionIds: missingAcknowledgements.map((section) => section.id)
          });
          return;
        }
      }

      const createdAt = new Date().toISOString();
      const submissionId = randomUUID();
      const ccRecipients = uniqueEmails([
        parsed.employeeEmail,
        parsed.trainerEmail,
        ...(parsed.additionalCc ?? [])
      ]);
      const pdfPath = join(
        submissionsRoot,
        createSubmissionPdfStorageName(
          { employeeName: parsed.employeeName, templateTitle: template.title },
          submissionId
        )
      );

      const submission: StoredSubmission = {
        id: submissionId,
        trainingSessionId: parsed.trainingSessionId,
        employeeId: parsed.employeeId,
        templateId: parsed.templateId,
        templateTitle: template.title,
        language: template.language,
        employeeName: parsed.employeeName,
        employeeEmail: parsed.employeeEmail,
        trainerName: parsed.trainerName,
        trainerEmail: parsed.trainerEmail,
        supervisorEmail: undefined,
        primaryRecipient: parsed.primaryRecipient,
        additionalCc: ccRecipients,
        notes: undefined,
        employeeSignatureDataUrl: parsed.employeeSignatureDataUrl,
        trainerSignatureDataUrl: parsed.trainerSignatureDataUrl,
        deliveryMode: parsed.deliveryMode,
        sectionReviews: parsed.sectionReviews,
        pdfPath,
        createdAt,
        completedAt: undefined,
        ccRecipients,
        emailDelivered: false,
        emailMessage: "",
        sendStatus: "draft"
      };

      submission.isComplete = Boolean(
        parsed.trainerName.trim()
        && parsed.trainerEmail.trim()
        && parsed.primaryRecipient.trim()
        && parsed.employeeSignatureDataUrl.trim()
        && parsed.trainerSignatureDataUrl.trim()
        && !missingAcknowledgements.length
        && template.sections.length > 0
      );

      submission.emailMessage = submission.isComplete
        ? "Completion saved. PDF ready for download."
        : "Draft saved as incomplete.";

      await generateSubmissionPdf(template, submission, pdfPath);

      if (parsed.deliveryMode === "send") {
        const mailResult = await sendSubmissionEmail({
          submissions: [submission],
          primaryRecipient: submission.primaryRecipient,
          ccRecipients: submission.ccRecipients
        });
        submission.emailDelivered = mailResult.delivered;
        submission.emailMessage = mailResult.message;
        submission.sendStatus = mailResult.delivered ? "sent" : "send_failed";
        submission.completedAt = mailResult.delivered ? new Date().toISOString() : undefined;
        submission.sentAt = mailResult.delivered ? new Date().toISOString() : undefined;
      }

      await insertSubmission(submission);

      if (parsed.trainingSessionId) {
        await attachSubmissionToTrainingSession(parsed.trainingSessionId, {
          submissionId: submission.id,
          deliveryStatus: parsed.deliveryMode === "send"
            ? (submission.emailDelivered ? "sent" : "send_failed")
            : "draft_saved"
        });
      }

      response.status(201).json({
        id: submission.id,
        pdfPath: submission.pdfPath,
        emailDelivered: submission.emailDelivered,
        emailMessage: submission.emailMessage,
        ccRecipients: submission.ccRecipients,
        sendStatus: submission.sendStatus,
        isComplete: Boolean(submission.isComplete),
        completedAt: submission.completedAt
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:submissionId/send", async (request, response, next) => {
    try {
      const submission = getSubmissionById(request.params.submissionId);
      if (!submission) {
        response.status(404).json({ message: "Submission not found." });
        return;
      }

      await regenerateSubmissionPdf(submission);

      const mailResult = await sendSubmissionEmail({
        submissions: [submission],
        primaryRecipient: submission.primaryRecipient,
        ccRecipients: submission.ccRecipients
      });
      const nextStatus = mailResult.delivered ? "sent" : "send_failed";
      const completedAt = mailResult.delivered ? new Date().toISOString() : submission.completedAt;
      const sentAt = mailResult.delivered ? completedAt : undefined;

      await updateSubmissionDeliveryResult({
        id: submission.id,
        sendStatus: nextStatus,
        emailDelivered: mailResult.delivered,
        emailMessage: mailResult.message,
        completedAt,
        sentAt
      });

      if (submission.trainingSessionId) {
        await attachSubmissionToTrainingSession(submission.trainingSessionId, {
          submissionId: submission.id,
          deliveryStatus: mailResult.delivered ? "sent" : "send_failed"
        });
      }

      response.json({
        id: submission.id,
        emailDelivered: mailResult.delivered,
        emailMessage: mailResult.message,
        sendStatus: nextStatus,
        completedAt,
        sentAt
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/bundle-pdf", async (request, response, next) => {
    try {
      const parsed = selectionSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      const submissions = getEmployeeSubmissionSelection(parsed.employeeId, parsed.submissionIds);
      if (!submissions.length) {
        response.status(400).json({ message: "No submissions available for this employee." });
        return;
      }

      await regenerateSubmissionPdfs(submissions);
      const pdfBytes = await combineSubmissionPdfs(submissions.map((submission) => submission.pdfPath));
      await markSubmissionsCompleted(submissions);

      response.setHeader("Content-Type", "application/pdf");
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="${createSubmissionBundlePdfDisplayName({ employeeName: employee.name })}"`
      );
      response.send(Buffer.from(pdfBytes));
    } catch (error) {
      next(error);
    }
  });

  router.post("/bundle-export", async (request, response, next) => {
    try {
      const parsed = selectionSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      const submissions = getEmployeeSubmissionSelection(parsed.employeeId, parsed.submissionIds);
      if (!submissions.length) {
        response.status(400).json({ message: "No submissions available for this employee." });
        return;
      }

      await regenerateSubmissionPdfs(submissions);
      const pdfBytes = await combineSubmissionPdfs(submissions.map((submission) => submission.pdfPath));
      const fileName = createSubmissionBundlePdfDisplayName({ employeeName: employee.name });
      const filePath = await exportPdfBufferToDownloads(fileName, Buffer.from(pdfBytes));
      const completedAt = await markSubmissionsCompleted(submissions);

      response.json({
        fileName,
        filePath,
        count: submissions.length,
        completedAt,
        sendStatus: submissions.every((submission) => submission.sendStatus === "sent") ? "sent" : "completed",
        message: "Bundle PDF saved to Downloads."
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/mail-draft", (request, response, next) => {
    try {
      const parsed = mailDraftSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      const submissions = getEmployeeSubmissionSelection(parsed.employeeId, parsed.submissionIds);
      if (!submissions.length) {
        response.status(400).json({ message: "No submissions available for this employee." });
        return;
      }

      const primaryRecipient = parsed.primaryRecipient ?? submissions[0].primaryRecipient;
      const ccRecipients = uniqueEmails([
        ...submissions.flatMap((submission) => submission.ccRecipients),
        ...(parsed.additionalCc ?? [])
      ]);

      response.json(buildSubmissionMailDraft({
        primaryRecipient,
        ccRecipients,
        submissions
      }));
    } catch (error) {
      next(error);
    }
  });

  router.post("/outlook-draft", async (request, response, next) => {
    try {
      const parsed = mailDraftSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      const submissions = getEmployeeSubmissionSelection(parsed.employeeId, parsed.submissionIds);
      if (!submissions.length) {
        response.status(400).json({ message: "No submissions available for this employee." });
        return;
      }

      await regenerateSubmissionPdfs(submissions);

      const primaryRecipient = parsed.primaryRecipient ?? submissions[0].primaryRecipient;
      const ccRecipients = uniqueEmails([
        ...submissions.flatMap((submission) => submission.ccRecipients),
        ...(parsed.additionalCc ?? [])
      ]);
      const draft = buildSubmissionMailDraft({
        primaryRecipient,
        ccRecipients,
        submissions
      });

      let fileName = "";
      let attachmentPath = "";

      if (submissions.length === 1) {
        fileName = createSubmissionPdfDisplayName(submissions[0]);
        attachmentPath = await exportExistingPdfToDownloads(submissions[0].pdfPath, fileName);
      } else {
        const mergedPdf = await combineSubmissionPdfs(submissions.map((submission) => submission.pdfPath));
        fileName = createSubmissionBundlePdfDisplayName({ employeeName: employee.name });
        attachmentPath = await exportPdfBufferToDownloads(fileName, Buffer.from(mergedPdf));
      }

      const completedAt = await markSubmissionsCompleted(submissions);
      await openOutlookDraftWithAttachment({
        to: draft.to,
        cc: draft.cc,
        subject: draft.subject,
        body: draft.text,
        attachmentPath
      });

      response.json({
        fileName,
        filePath: attachmentPath,
        count: submissions.length,
        completedAt,
        sendStatus: submissions.every((submission) => submission.sendStatus === "sent") ? "sent" : "completed",
        message: "Outlook draft opened with the PDF attached."
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/send-batch", async (request, response, next) => {
    try {
      const parsed = sendBatchSchema.parse(request.body);
      const employee = getEmployeeById(parsed.employeeId);
      if (!employee) {
        response.status(404).json({ message: "Employee not found." });
        return;
      }

      const drafts = getEmployeeSubmissionSelection(parsed.employeeId, parsed.submissionIds)
        .filter((submission) => submission.sendStatus !== "sent");

      if (!drafts.length) {
        response.status(400).json({ message: "No open submissions available for this employee." });
        return;
      }

      await regenerateSubmissionPdfs(drafts);

      const primaryRecipient = parsed.primaryRecipient ?? drafts[0].primaryRecipient;
      if (!primaryRecipient.trim()) {
        response.status(400).json({ message: "Primary recipient is required for batch send." });
        return;
      }

      const ccRecipients = uniqueEmails([
        env.DEFAULT_CC_ME,
        ...drafts.flatMap((draft) => draft.ccRecipients),
        ...(parsed.additionalCc ?? [])
      ]);

      const mergedPdf = await combineSubmissionPdfs(drafts.map((draft) => draft.pdfPath));
      const mailResult = await sendSubmissionEmail({
        submissions: drafts,
        primaryRecipient,
        ccRecipients,
        attachment: {
          fileName: createSubmissionBundlePdfDisplayName({ employeeName: employee.name }),
          content: Buffer.from(mergedPdf)
        }
      });

      const sentAt = mailResult.delivered ? new Date().toISOString() : undefined;
      const completedAt = mailResult.delivered ? sentAt : undefined;
      for (const draft of drafts) {
        await updateSubmissionDeliveryResult({
          id: draft.id,
          sendStatus: mailResult.delivered ? "sent" : "send_failed",
          emailDelivered: mailResult.delivered,
          emailMessage: mailResult.message,
          completedAt,
          sentAt
        });
      }

      response.json({
        employeeId: employee.id,
        count: drafts.length,
        emailDelivered: mailResult.delivered,
        emailMessage: mailResult.message,
        sendStatus: mailResult.delivered ? "sent" : "send_failed",
        completedAt,
        sentAt
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
