import type { EmployeeProfile, SubmissionListItem, TrainingTemplateSummary } from "../types/training";

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

function distinctTemplateCount(submissions: SubmissionListItem[]): number {
  return new Set(submissions.map((submission) => submission.templateId)).size;
}

export function getRelevantTemplates(
  employee: EmployeeProfile,
  templates: TrainingTemplateSummary[]
): TrainingTemplateSummary[] {
  if (employee.role !== "employee") {
    return [];
  }

  return templates.filter((template) => template.team === employee.team);
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
  const draftSubmissions = employeeSubmissions.filter((submission) => submission.sendStatus === "draft");
  const failedSubmissions = employeeSubmissions.filter((submission) => submission.sendStatus === "send_failed");
  const sentSubmissions = employeeSubmissions.filter((submission) => submission.sendStatus === "sent");
  const availableModules = relevantTemplates.length;
  const documentedModules = distinctTemplateCount(employeeSubmissions);
  const sentModules = distinctTemplateCount(sentSubmissions);
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