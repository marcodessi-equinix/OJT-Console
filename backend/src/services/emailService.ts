import nodemailer from "nodemailer";
import { env, smtpConfigured } from "../config/env";
import { readDeliverySettings } from "../repositories/settingsRepository";
import type { StoredSubmission } from "../types/training";
import { createSubmissionBundlePdfDisplayName, createSubmissionPdfDisplayName } from "../utils/pdfFileName";

interface MailAttachment {
  filename: string;
  path?: string;
  content?: Buffer;
  contentType: string;
}

function normalizeModuleTitle(title: string): string {
  return title.replace(/\s*(?:[-_–—]\s*|\(\s*|\[\s*)?(english|german|englisch|deutsch)(?:\s*[)\]])?\s*$/i, "").trim();
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

function renderMailTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/{{\s*([a-zA-Z0-9]+)\s*}}/g, (_match, key: string) => values[key] ?? "");
}

export function buildSubmissionMailDraft(input: {
  primaryRecipient: string;
  ccRecipients: string[];
  submissions: StoredSubmission[];
}): { to: string; cc: string[]; subject: string; text: string } {
  const settings = readDeliverySettings();
  const firstSubmission = input.submissions[0];
  const trainerName = Array.from(new Set(input.submissions.map((submission) => submission.trainerName).filter(Boolean))).join(", ");
  const trainerEmail = Array.from(new Set(input.submissions.map((submission) => submission.trainerEmail).filter(Boolean))).join(", ");
  const moduleList = input.submissions
    .map((submission) => `- ${normalizeModuleTitle(submission.templateTitle)}`)
    .join("\n");
  const values = {
    employeeName: firstSubmission?.employeeName ?? "",
    employeeEmail: firstSubmission?.employeeEmail ?? "",
    trainerName,
    trainerEmail,
    templateTitle: input.submissions.length === 1 ? normalizeModuleTitle(firstSubmission?.templateTitle ?? "") : `${input.submissions.length} modules`,
    moduleCount: String(input.submissions.length),
    moduleList,
    primaryRecipient: input.primaryRecipient,
    ccRecipients: input.ccRecipients.join("; ")
  };

  return {
    to: input.primaryRecipient,
    cc: input.ccRecipients,
    subject: renderMailTemplate(settings.deliveryEmailSubjectTemplate, values),
    text: renderMailTemplate(settings.deliveryEmailBodyTemplate, values)
  };
}

export async function sendSubmissionEmail(input: {
  submissions: StoredSubmission[];
  primaryRecipient: string;
  ccRecipients: string[];
  attachment?: { fileName: string; content: Buffer };
}): Promise<{ delivered: boolean; message: string }> {
  const draft = buildSubmissionMailDraft({
    primaryRecipient: input.primaryRecipient,
    ccRecipients: input.ccRecipients,
    submissions: input.submissions
  });
  const firstSubmission = input.submissions[0];
  const singleAttachment = input.submissions.length === 1 && firstSubmission
    ? {
        filename: createSubmissionPdfDisplayName(firstSubmission),
        path: firstSubmission.pdfPath,
        contentType: "application/pdf"
      }
    : undefined;
  const bundleAttachment = input.attachment
    ? {
        filename: input.attachment.fileName,
        content: input.attachment.content,
        contentType: "application/pdf"
      }
    : undefined;

  return sendMail({
    to: draft.to,
    cc: draft.cc,
    subject: draft.subject,
    text: draft.text,
    attachments: bundleAttachment
      ? [bundleAttachment]
      : (singleAttachment
        ? [singleAttachment]
        : [])
  });
}
