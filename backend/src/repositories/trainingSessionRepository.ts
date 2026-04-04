import { randomUUID } from "node:crypto";
import { appDatabase } from "../db/database";
import { getEmployeeById } from "./employeeRepository";
import { getTemplateById } from "./templateRepository";
import type {
  EmployeeTeam,
  SectionReview,
  TemplateLanguage,
  TemplateTeam,
  TrainingSession,
  TrainingSessionDeliveryStatus,
  TrainingSessionInput,
  TrainingSessionListItem,
  TrainingSessionStatus,
  TrainingSessionUpdate
} from "../types/training";
import { parseJsonArray } from "../utils/json";

interface TrainingSessionRow {
  id: string;
  employee_id: string;
  template_id: string;
  trainer_id: string;
  trainer_name: string;
  trainer_email: string;
  status: string;
  delivery_status: string;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  delivery_updated_at: string | null;
  current_index: number;
  section_reviews_json: string;
  notes: string | null;
  primary_recipient: string | null;
  cc_json: string;
  employee_signature_data_url: string | null;
  trainer_signature_data_url: string | null;
  submission_id: string | null;
}

const sessionStatuses = new Set<TrainingSessionStatus>(["assigned", "in_progress", "paused", "completed", "delivered", "cancelled"]);
const deliveryStatuses = new Set<TrainingSessionDeliveryStatus>(["pending", "draft_saved", "mail_prepared", "sent", "send_failed"]);

function normalizeSessionStatus(value: string | null | undefined): TrainingSessionStatus {
  return sessionStatuses.has(value as TrainingSessionStatus) ? (value as TrainingSessionStatus) : "in_progress";
}

function normalizeDeliveryStatus(value: string | null | undefined): TrainingSessionDeliveryStatus {
  return deliveryStatuses.has(value as TrainingSessionDeliveryStatus) ? (value as TrainingSessionDeliveryStatus) : "pending";
}

function mapTrainingSession(row: TrainingSessionRow): TrainingSession {
  return {
    id: row.id,
    employeeId: row.employee_id,
    templateId: row.template_id,
    trainerId: row.trainer_id,
    trainerName: row.trainer_name,
    trainerEmail: row.trainer_email,
    status: normalizeSessionStatus(row.status),
    deliveryStatus: normalizeDeliveryStatus(row.delivery_status),
    startedAt: row.started_at,
    lastActivityAt: row.last_activity_at,
    completedAt: row.completed_at ?? undefined,
    deliveryUpdatedAt: row.delivery_updated_at ?? undefined,
    currentIndex: Number(row.current_index) || 0,
    sectionReviews: parseJsonArray<SectionReview>(row.section_reviews_json),
    notes: row.notes ?? undefined,
    primaryRecipient: row.primary_recipient ?? "",
    additionalCc: parseJsonArray<string>(row.cc_json),
    employeeSignatureDataUrl: row.employee_signature_data_url ?? "",
    trainerSignatureDataUrl: row.trainer_signature_data_url ?? "",
    submissionId: row.submission_id ?? undefined
  };
}

function toListItem(session: TrainingSession): TrainingSessionListItem {
  const employee = getEmployeeById(session.employeeId);
  const template = getTemplateById(session.templateId);
  const totalSections = template?.sections.length ?? 0;
  const acknowledgedSections = session.sectionReviews.filter((review) => review.acknowledged).length;

  return {
    ...session,
    employeeName: employee?.name ?? "Unknown employee",
    employeeEmail: employee?.email ?? "",
    employeeTeam: (employee?.team ?? "C-OPS") as EmployeeTeam,
    templateTitle: template?.title ?? "Unknown template",
    templateLanguage: (template?.language ?? "English") as TemplateLanguage,
    templateTeam: (template?.team ?? "C-OPS") as TemplateTeam,
    totalSections,
    acknowledgedSections
  };
}

function getTrainingSessionRowById(id: string): TrainingSessionRow | undefined {
  return appDatabase.queryOne<TrainingSessionRow>(
    `
      SELECT *
      FROM training_sessions
      WHERE id = ?;
    `,
    [id]
  );
}

export function getTrainingSessionById(id: string): TrainingSession | undefined {
  const row = getTrainingSessionRowById(id);
  return row ? mapTrainingSession(row) : undefined;
}

export function listTrainingSessions(filter?: {
  employeeId?: string;
  trainerId?: string;
  status?: TrainingSessionStatus;
  excludeCancelled?: boolean;
}): TrainingSessionListItem[] {
  const whereParts: string[] = [];
  const params: string[] = [];

  if (filter?.employeeId) {
    whereParts.push("employee_id = ?");
    params.push(filter.employeeId);
  }

  if (filter?.trainerId) {
    whereParts.push("trainer_id = ?");
    params.push(filter.trainerId);
  }

  if (filter?.status) {
    whereParts.push("status = ?");
    params.push(filter.status);
  }

  if (filter?.excludeCancelled) {
    whereParts.push("status != 'cancelled'");
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  return appDatabase.queryMany<TrainingSessionRow>(
    `
      SELECT *
      FROM training_sessions
      ${whereClause}
      ORDER BY last_activity_at DESC, started_at DESC;
    `,
    params
  ).map((row) => toListItem(mapTrainingSession(row)));
}

export function findReusableTrainingSession(employeeId: string, templateId: string): TrainingSession | undefined {
  const row = appDatabase.queryOne<TrainingSessionRow>(
    `
      SELECT *
      FROM training_sessions
      WHERE employee_id = ?
        AND template_id = ?
        AND status IN ('assigned', 'in_progress', 'paused', 'completed')
      ORDER BY last_activity_at DESC
      LIMIT 1;
    `,
    [employeeId, templateId]
  );

  return row ? mapTrainingSession(row) : undefined;
}

export async function createTrainingSession(input: TrainingSessionInput): Promise<TrainingSession> {
  const existing = findReusableTrainingSession(input.employeeId, input.templateId);
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const session: TrainingSession = {
    id: randomUUID(),
    employeeId: input.employeeId,
    templateId: input.templateId,
    trainerId: input.trainerId,
    trainerName: input.trainerName.trim(),
    trainerEmail: input.trainerEmail.trim().toLowerCase(),
    status: "in_progress",
    deliveryStatus: "pending",
    startedAt: now,
    lastActivityAt: now,
    currentIndex: 0,
    sectionReviews: [],
    notes: undefined,
    primaryRecipient: input.primaryRecipient?.trim().toLowerCase() ?? "",
    additionalCc: [],
    employeeSignatureDataUrl: "",
    trainerSignatureDataUrl: "",
    submissionId: undefined
  };

  await appDatabase.run(
    `
      INSERT INTO training_sessions (
        id,
        employee_id,
        template_id,
        trainer_id,
        trainer_name,
        trainer_email,
        status,
        delivery_status,
        started_at,
        last_activity_at,
        completed_at,
        delivery_updated_at,
        current_index,
        section_reviews_json,
        notes,
        primary_recipient,
        cc_json,
        employee_signature_data_url,
        trainer_signature_data_url,
        submission_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      session.id,
      session.employeeId,
      session.templateId,
      session.trainerId,
      session.trainerName,
      session.trainerEmail,
      session.status,
      session.deliveryStatus,
      session.startedAt,
      session.lastActivityAt,
      null,
      null,
      session.currentIndex,
      JSON.stringify(session.sectionReviews),
      null,
      session.primaryRecipient,
      JSON.stringify(session.additionalCc),
      session.employeeSignatureDataUrl,
      session.trainerSignatureDataUrl,
      null
    ]
  );

  return session;
}

export async function updateTrainingSession(id: string, updates: TrainingSessionUpdate): Promise<TrainingSession> {
  const existing = getTrainingSessionById(id);
  if (!existing) {
    throw new Error("Training session not found.");
  }

  const nextStatus = updates.status ?? existing.status;
  const nextDeliveryStatus = updates.deliveryStatus ?? existing.deliveryStatus;
  const now = new Date().toISOString();
  const completedAt = nextStatus === "completed" || nextStatus === "delivered"
    ? (existing.completedAt ?? now)
    : updates.status
      ? undefined
      : existing.completedAt;
  const deliveryUpdatedAt = updates.deliveryStatus ? now : existing.deliveryUpdatedAt;

  const nextSession: TrainingSession = {
    ...existing,
    status: nextStatus,
    deliveryStatus: nextDeliveryStatus,
    currentIndex: updates.currentIndex ?? existing.currentIndex,
    sectionReviews: updates.sectionReviews ?? existing.sectionReviews,
    notes: updates.notes ?? existing.notes,
    primaryRecipient: updates.primaryRecipient ?? existing.primaryRecipient,
    additionalCc: updates.additionalCc ?? existing.additionalCc,
    employeeSignatureDataUrl: updates.employeeSignatureDataUrl ?? existing.employeeSignatureDataUrl,
    trainerSignatureDataUrl: updates.trainerSignatureDataUrl ?? existing.trainerSignatureDataUrl,
    trainerName: updates.trainerName ?? existing.trainerName,
    trainerEmail: updates.trainerEmail ?? existing.trainerEmail,
    submissionId: updates.submissionId ?? existing.submissionId,
    lastActivityAt: now,
    completedAt,
    deliveryUpdatedAt
  };

  await appDatabase.run(
    `
      UPDATE training_sessions
      SET trainer_name = ?,
          trainer_email = ?,
          status = ?,
          delivery_status = ?,
          last_activity_at = ?,
          completed_at = ?,
          delivery_updated_at = ?,
          current_index = ?,
          section_reviews_json = ?,
          notes = ?,
          primary_recipient = ?,
          cc_json = ?,
          employee_signature_data_url = ?,
          trainer_signature_data_url = ?,
          submission_id = ?
      WHERE id = ?;
    `,
    [
      nextSession.trainerName,
      nextSession.trainerEmail,
      nextSession.status,
      nextSession.deliveryStatus,
      nextSession.lastActivityAt,
      nextSession.completedAt ?? null,
      nextSession.deliveryUpdatedAt ?? null,
      nextSession.currentIndex,
      JSON.stringify(nextSession.sectionReviews),
      nextSession.notes ?? null,
      nextSession.primaryRecipient,
      JSON.stringify(nextSession.additionalCc),
      nextSession.employeeSignatureDataUrl,
      nextSession.trainerSignatureDataUrl,
      nextSession.submissionId ?? null,
      id
    ]
  );

  return nextSession;
}

export async function attachSubmissionToTrainingSession(
  id: string,
  input: { submissionId: string; deliveryStatus: TrainingSessionDeliveryStatus }
): Promise<TrainingSession> {
  const session = getTrainingSessionById(id);
  if (!session) {
    throw new Error("Training session not found.");
  }

  const nextStatus: TrainingSessionStatus = input.deliveryStatus === "mail_prepared" || input.deliveryStatus === "sent"
    ? "delivered"
    : session.status === "delivered"
      ? "completed"
      : session.status;

  return updateTrainingSession(id, {
    submissionId: input.submissionId,
    deliveryStatus: input.deliveryStatus,
    status: nextStatus
  });
}