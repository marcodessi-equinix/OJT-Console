import { appDatabase } from "../db/database";
import { getTemplateById } from "../repositories/templateRepository";
import type { SectionReview, StoredSubmission, SubmissionListItem, SubmissionSendStatus } from "../types/training";
import { parseJsonArray } from "../utils/json";

interface SubmissionRow {
  id: string;
  training_session_id: string | null;
  employee_id: string | null;
  template_id: string;
  template_title: string;
  language: "English" | "German";
  employee_name: string;
  employee_email: string;
  trainer_name: string;
  trainer_email: string;
  supervisor_email: string | null;
  recipient_email: string;
  cc_json: string;
  notes: string | null;
  signature_data_url: string;
  employee_signature_data_url: string | null;
  trainer_signature_data_url: string | null;
  section_reviews_json: string;
  pdf_path: string;
  email_delivered: number;
  email_message: string;
  send_status: SubmissionSendStatus;
  sent_at: string | null;
  created_at: string;
}

function getSubmissionCompletionState(submission: Pick<StoredSubmission, "templateId" | "sectionReviews" | "trainerName" | "trainerEmail" | "primaryRecipient" | "employeeSignatureDataUrl" | "trainerSignatureDataUrl">): boolean {
  const template = getTemplateById(submission.templateId);
  const requiredSections = template?.sections.length ?? 0;
  const acknowledgedSections = submission.sectionReviews.filter((review) => review.acknowledged).length;

  return Boolean(
    submission.trainerName.trim()
    && submission.trainerEmail.trim()
    && submission.primaryRecipient.trim()
    && submission.employeeSignatureDataUrl.trim()
    && submission.trainerSignatureDataUrl.trim()
    && requiredSections > 0
    && acknowledgedSections === requiredSections
  );
}

function mapSubmission(row: SubmissionRow): StoredSubmission {
  const ccRecipients = parseJsonArray<string>(row.cc_json);
  const sectionReviews = parseJsonArray<SectionReview>(row.section_reviews_json);

  const submission: StoredSubmission = {
    id: row.id,
    trainingSessionId: row.training_session_id ?? undefined,
    employeeId: row.employee_id ?? "",
    templateId: row.template_id,
    templateTitle: row.template_title,
    language: row.language,
    employeeName: row.employee_name,
    employeeEmail: row.employee_email,
    trainerName: row.trainer_name,
    trainerEmail: row.trainer_email,
    supervisorEmail: row.supervisor_email ?? undefined,
    primaryRecipient: row.recipient_email,
    additionalCc: ccRecipients,
    notes: row.notes ?? undefined,
    employeeSignatureDataUrl: row.employee_signature_data_url ?? row.signature_data_url,
    trainerSignatureDataUrl: row.trainer_signature_data_url ?? row.signature_data_url,
    deliveryMode: row.send_status === "draft" ? "draft" : "send",
    sectionReviews,
    pdfPath: row.pdf_path,
    createdAt: row.created_at,
    ccRecipients,
    emailDelivered: Boolean(row.email_delivered),
    emailMessage: row.email_message,
    sendStatus: row.send_status,
    sentAt: row.sent_at ?? undefined
  };

  submission.isComplete = getSubmissionCompletionState(submission);
  return submission;
}

export async function insertSubmission(submission: StoredSubmission): Promise<void> {
  await appDatabase.run(
    `
      INSERT INTO submissions (
        id,
        training_session_id,
        employee_id,
        template_id,
        template_title,
        language,
        employee_name,
        employee_email,
        trainer_name,
        trainer_email,
        supervisor_email,
        recipient_email,
        cc_json,
        notes,
        signature_data_url,
        employee_signature_data_url,
        trainer_signature_data_url,
        section_reviews_json,
        pdf_path,
        email_delivered,
        email_message,
        send_status,
        sent_at,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      submission.id,
      submission.trainingSessionId ?? null,
      submission.employeeId,
      submission.templateId,
      submission.templateTitle,
      submission.language,
      submission.employeeName,
      submission.employeeEmail,
      submission.trainerName,
      submission.trainerEmail,
      submission.supervisorEmail ?? null,
      submission.primaryRecipient,
      JSON.stringify(submission.ccRecipients),
      submission.notes ?? null,
      submission.employeeSignatureDataUrl,
      submission.employeeSignatureDataUrl,
      submission.trainerSignatureDataUrl,
      JSON.stringify(submission.sectionReviews),
      submission.pdfPath,
      submission.emailDelivered ? 1 : 0,
      submission.emailMessage,
      submission.sendStatus,
      submission.sentAt ?? null,
      submission.createdAt
    ]
  );
}

export function getSubmissionById(id: string): StoredSubmission | undefined {
  const row = appDatabase.queryOne<SubmissionRow>(
    `
      SELECT *
      FROM submissions
      WHERE id = ?;
    `,
    [id]
  );

  return row ? mapSubmission(row) : undefined;
}

export function listSubmissions(filter?: { employeeId?: string; sendStatus?: SubmissionSendStatus }): SubmissionListItem[] {
  const whereParts: string[] = [];
  const params: string[] = [];

  if (filter?.employeeId) {
    whereParts.push("employee_id = ?");
    params.push(filter.employeeId);
  }

  if (filter?.sendStatus) {
    whereParts.push("send_status = ?");
    params.push(filter.sendStatus);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  return appDatabase
    .queryMany<SubmissionRow>(
      `
        SELECT *
        FROM submissions
        ${whereClause}
        ORDER BY created_at DESC;
      `,
      params
    )
    .map((row) => {
      const submission = mapSubmission(row);
      return {
        id: submission.id,
        trainingSessionId: submission.trainingSessionId,
        employeeId: submission.employeeId,
        templateId: submission.templateId,
        templateTitle: submission.templateTitle,
        language: submission.language,
        employeeName: submission.employeeName,
        employeeEmail: submission.employeeEmail,
        trainerName: submission.trainerName,
        trainerEmail: submission.trainerEmail,
        primaryRecipient: submission.primaryRecipient,
        ccRecipients: submission.ccRecipients,
        pdfPath: submission.pdfPath,
        createdAt: submission.createdAt,
        emailDelivered: submission.emailDelivered,
        emailMessage: submission.emailMessage,
        sendStatus: submission.sendStatus,
        isComplete: Boolean(submission.isComplete),
        sentAt: submission.sentAt
      };
    });
}

export async function updateSubmissionDeliveryResult(input: {
  id: string;
  sendStatus: SubmissionSendStatus;
  emailDelivered: boolean;
  emailMessage: string;
  sentAt?: string;
}): Promise<void> {
  await appDatabase.run(
    `
      UPDATE submissions
      SET email_delivered = ?,
          email_message = ?,
          send_status = ?,
          sent_at = ?
      WHERE id = ?;
    `,
    [input.emailDelivered ? 1 : 0, input.emailMessage, input.sendStatus, input.sentAt ?? null, input.id]
  );
}
