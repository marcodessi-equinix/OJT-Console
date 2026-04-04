import nodemailer from "nodemailer";
import { env, smtpConfigured } from "../config/env";
import type { StoredSubmission } from "../types/training";
import { createSubmissionPdfDisplayName } from "../utils/pdfFileName";

interface MailAttachment {
  filename: string;
  path: string;
  contentType: string;
}

async function sendMail(options: {
  to: string;
  cc: string[];
  subject: string;
  text: string;
  attachments: MailAttachment[];
}): Promise<{ delivered: boolean; message: string }> {
  if (!smtpConfigured || !env.SMTP_HOST || !env.MAIL_FROM) {
    return {
      delivered: false,
      message: "SMTP is not configured. PDF was generated locally only."
    };
  }

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined
  });

  await transporter.sendMail({
    from: env.MAIL_FROM,
    to: options.to,
    cc: options.cc,
    subject: options.subject,
    text: options.text,
    attachments: options.attachments
  });

  return {
    delivered: true,
    message: "E-mail sent successfully."
  };
}

export async function sendSubmissionEmail(
  submission: StoredSubmission,
  pdfAbsolutePath: string
): Promise<{ delivered: boolean; message: string }> {
  return sendMail({
    to: submission.primaryRecipient,
    cc: submission.ccRecipients,
    subject: `OJT Completion - ${submission.templateTitle} - ${submission.employeeName}`,
    text: [
      `Training: ${submission.templateTitle}`,
      `Employee: ${submission.employeeName} <${submission.employeeEmail}>`,
      `Trainer: ${submission.trainerName} <${submission.trainerEmail}>`,
      `Submitted: ${submission.createdAt}`,
      "",
      submission.notes ?? "No additional notes."
    ].join("\n"),
    attachments: [
      {
        filename: createSubmissionPdfDisplayName(submission),
        path: pdfAbsolutePath,
        contentType: "application/pdf"
      }
    ]
  });
}

export async function sendSubmissionBatchEmail(input: {
  employeeName: string;
  primaryRecipient: string;
  ccRecipients: string[];
  submissions: StoredSubmission[];
}): Promise<{ delivered: boolean; message: string }> {
  return sendMail({
    to: input.primaryRecipient,
    cc: input.ccRecipients,
    subject: `OJT Completion Bundle - ${input.employeeName}`,
    text: [
      `${input.submissions.length} OJT records are attached for ${input.employeeName}.`,
      "",
      ...input.submissions.map((submission) => `- ${submission.templateTitle} (${submission.language})`)
    ].join("\n"),
    attachments: input.submissions.map((submission) => ({
      filename: createSubmissionPdfDisplayName(submission),
      path: submission.pdfPath,
      contentType: "application/pdf"
    }))
  });
}
