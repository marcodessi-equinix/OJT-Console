import type { TrainingSessionListItem } from "../types/training";
import { getModuleKey } from "./moduleIdentity";

export type EmployeeTrainingStatus = "not_started" | "blocked" | "ready" | "in_progress" | "complete";

export interface EmployeeTrainingSummary {
  status: EmployeeTrainingStatus;
  startedTemplates: number;
  finishedTemplates: number;
  openTemplates: number;
}

function distinctCount(values: string[]): number {
  return new Set(values).size;
}

export function isSessionDelivered(session: TrainingSessionListItem): boolean {
  return session.status === "delivered"
    || session.deliveryStatus === "mail_prepared"
    || session.deliveryStatus === "sent";
}

export function isSessionReadyForDelivery(session: TrainingSessionListItem): boolean {
  return session.status === "completed"
    || session.deliveryStatus === "draft_saved"
    || session.deliveryStatus === "send_failed";
}

export function isSessionActive(session: TrainingSessionListItem): boolean {
  return session.status === "assigned"
    || session.status === "in_progress"
    || session.status === "paused";
}

export function getEmployeeSessions(employeeId: string, sessions: TrainingSessionListItem[]): TrainingSessionListItem[] {
  return sessions
    .filter((session) => session.employeeId === employeeId && session.status !== "cancelled")
    .sort((left, right) => new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime());
}

export function getMostRelevantSession(employeeId: string, sessions: TrainingSessionListItem[]): TrainingSessionListItem | undefined {
  const employeeSessions = getEmployeeSessions(employeeId, sessions);

  return employeeSessions.sort((left, right) => {
    const score = (session: TrainingSessionListItem): number => {
      if (session.deliveryStatus === "send_failed") return 0;
      if (isSessionReadyForDelivery(session)) return 1;
      if (isSessionActive(session)) return 2;
      if (isSessionDelivered(session)) return 3;
      return 4;
    };

    const scoreDiff = score(left) - score(right);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return new Date(right.lastActivityAt).getTime() - new Date(left.lastActivityAt).getTime();
  })[0];
}

export function buildTrainingSummary(employeeId: string, sessions: TrainingSessionListItem[], templateCount: number): EmployeeTrainingSummary {
  const employeeSessions = getEmployeeSessions(employeeId, sessions);
  const startedTemplates = distinctCount(employeeSessions.map((session) => getModuleKey(session.templateTitle)));
  const finishedTemplates = distinctCount(employeeSessions.filter(isSessionDelivered).map((session) => getModuleKey(session.templateTitle)));
  const openTemplates = Math.max(templateCount - finishedTemplates, 0);

  let status: EmployeeTrainingStatus = "not_started";
  if (employeeSessions.some((session) => session.deliveryStatus === "send_failed")) status = "blocked";
  else if (templateCount > 0 && finishedTemplates >= templateCount) status = "complete";
  else if (employeeSessions.some(isSessionReadyForDelivery)) status = "ready";
  else if (employeeSessions.some(isSessionActive)) status = "in_progress";
  else if (startedTemplates > 0) status = "in_progress";

  return { status, startedTemplates, finishedTemplates, openTemplates };
}