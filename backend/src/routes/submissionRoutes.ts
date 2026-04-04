import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env";
import { submissionsRoot } from "../config/paths";
import { getEmployeeById } from "../repositories/employeeRepository";
import { getTemplateById } from "../repositories/templateRepository";
import { attachSubmissionToTrainingSession, getTrainingSessionById } from "../repositories/trainingSessionRepository";
import {
  getSubmissionById,
  insertSubmission,
  listSubmissions,
  updateSubmissionDeliveryResult
} from "../repositories/submissionRepository";
import { sendSubmissionBatchEmail, sendSubmissionEmail } from "../services/emailService";
import { generateSubmissionPdf } from "../services/pdfService";
import type { StoredSubmission } from "../types/training";
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

const sendBatchSchema = z.object({
  employeeId: z.string().min(1),
  primaryRecipient: z.email().optional(),
  additionalCc: z.array(z.email()).optional()
});

function createPdfFileName(submission: Pick<StoredSubmission, "employeeName" | "templateTitle">): string {
  const sanitize = (value: string): string => {
    const normalized = value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "");
    return normalized || "ojt-record";
  };

  return `${sanitize(submission.employeeName)}-${sanitize(submission.templateTitle)}.pdf`;
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

      try {
        await access(submission.pdfPath, constants.R_OK);
      } catch {
        response.status(404).json({ message: "PDF file not found." });
        return;
      }

      response.download(submission.pdfPath, createPdfFileName(submission), (error) => {
        if (error && !response.headersSent) {
          next(error);
        }
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
      const pdfPath = join(submissionsRoot, `${submissionId}.pdf`);

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

      try {
        await generateSubmissionPdf(template, submission, pdfPath);
      } catch (error) {
        console.error("Submission PDF generation failed", {
          submissionId,
          templateId: template.id,
          employeeId: employee.id,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }

      if (parsed.deliveryMode === "send") {
        const mailResult = await sendSubmissionEmail(submission, pdfPath);
        submission.emailDelivered = mailResult.delivered;
        submission.emailMessage = mailResult.message;
        submission.sendStatus = mailResult.delivered ? "sent" : "send_failed";
        submission.sentAt = mailResult.delivered ? new Date().toISOString() : undefined;
      }

      try {
        await insertSubmission(submission);
      } catch (error) {
        console.error("Submission persistence failed", {
          submissionId,
          trainingSessionId: parsed.trainingSessionId,
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }

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
        isComplete: Boolean(submission.isComplete)
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

      const mailResult = await sendSubmissionEmail(submission, submission.pdfPath);
      const nextStatus = mailResult.delivered ? "sent" : "send_failed";
      const sentAt = mailResult.delivered ? new Date().toISOString() : undefined;

      await updateSubmissionDeliveryResult({
        id: submission.id,
        sendStatus: nextStatus,
        emailDelivered: mailResult.delivered,
        emailMessage: mailResult.message,
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
        sentAt
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

      const drafts = listSubmissions({ employeeId: parsed.employeeId, sendStatus: "draft" })
        .map((item) => getSubmissionById(item.id))
        .filter((item): item is StoredSubmission => Boolean(item));

      if (!drafts.length) {
        response.status(400).json({ message: "No draft submissions available for this employee." });
        return;
      }

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

      const mailResult = await sendSubmissionBatchEmail({
        employeeName: employee.name,
        primaryRecipient,
        ccRecipients,
        submissions: drafts
      });

      const sentAt = mailResult.delivered ? new Date().toISOString() : undefined;
      for (const draft of drafts) {
        await updateSubmissionDeliveryResult({
          id: draft.id,
          sendStatus: mailResult.delivered ? "sent" : "send_failed",
          emailDelivered: mailResult.delivered,
          emailMessage: mailResult.message,
          sentAt
        });
      }

      response.json({
        employeeId: employee.id,
        count: drafts.length,
        emailDelivered: mailResult.delivered,
        emailMessage: mailResult.message,
        sentAt
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
