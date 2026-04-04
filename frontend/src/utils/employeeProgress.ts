import type { EmployeeProfile, SubmissionListItem, TrainingTemplateSummary } from "../types/training";
import { dedupeTemplatesByModule, getLogicalSubmissionRepresentatives } from "./moduleIdentity";

export type EmployeeProgressStatus = "not_started" | "blocked" | "ready" | "in_progress" | "complete";

export interface EmployeeProgressSummary {
  status: EmployeeProgressStatus;
  availableModules: number;
  documentedModules: number;
  sentModules: number;
  openModules: number;
  pendingDrafts: number;
  failedDeliveries: number;
}

export function getRelevantTemplates(
  employee: EmployeeProfile,
  templates: TrainingTemplateSummary[]
): TrainingTemplateSummary[] {
  if (employee.role !== "employee") {
    return [];
  }

  return dedupeTemplatesByModule(templates.filter((template) => template.team === employee.team));
}

export function getEmployeeSubmissions(
  employeeId: string,
  submissions: SubmissionListItem[]
): SubmissionListItem[] {
  return submissions
    .filter((submission) => submission.employeeId === employeeId)
    .sort((left, right) => {
      const leftTime = new Date(left.sentAt ?? left.createdAt).getTime();
      const rightTime = new Date(right.sentAt ?? right.createdAt).getTime();
      return rightTime - leftTime;
    });
}

export function buildEmployeeProgress(
  employee: EmployeeProfile,
  templates: TrainingTemplateSummary[],
  submissions: SubmissionListItem[]
): EmployeeProgressSummary | null {
  if (employee.role !== "employee") {
    return null;
  }

  const relevantTemplates = getRelevantTemplates(employee, templates);
  const employeeSubmissions = getEmployeeSubmissions(employee.id, submissions);
  const logicalSubmissions = getLogicalSubmissionRepresentatives(employeeSubmissions);
  const draftSubmissions = logicalSubmissions.filter((submission) => submission.sendStatus === "draft");
  const failedSubmissions = logicalSubmissions.filter((submission) => submission.sendStatus === "send_failed");
  const sentSubmissions = logicalSubmissions.filter((submission) => submission.sendStatus === "sent");
  const availableModules = relevantTemplates.length;
  const documentedModules = logicalSubmissions.length;
  const sentModules = sentSubmissions.length;
  const pendingDrafts = draftSubmissions.length;
  const failedDeliveries = failedSubmissions.length;
  const openModules = Math.max(availableModules - documentedModules, 0);

  let status: EmployeeProgressStatus = "not_started";

  if (failedDeliveries > 0) {
    status = "blocked";
  } else if (availableModules > 0 && documentedModules >= availableModules && pendingDrafts === 0) {
    status = "complete";
  } else if (pendingDrafts > 0) {
    status = "ready";
  } else if (documentedModules > 0) {
    status = "in_progress";
  }

  return {
    status,
    availableModules,
    documentedModules,
    sentModules,
    openModules,
    pendingDrafts,
    failedDeliveries
  };
}