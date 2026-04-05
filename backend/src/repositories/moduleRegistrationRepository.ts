import { randomUUID } from "node:crypto";
import { appDatabase } from "../db/database";
import { getEmployeeById } from "./employeeRepository";
import { listSubmissions } from "./submissionRepository";
import { getTemplateById } from "./templateRepository";
import type {
  ModuleRegistrationBatchInput,
  ModuleRegistrationBatchResult,
  ModuleRegistration,
  ModuleRegistrationInput,
  ModuleRegistrationListItem,
  ModuleRegistrationStatus,
  SubmissionListItem
} from "../types/training";
import { getModuleKey, normalizeModuleTitle } from "../utils/moduleIdentity";

interface ModuleRegistrationRow {
  id: string;
  employee_id: string;
  template_id: string;
  module_key: string;
  module_title: string;
  team: string;
  created_at: string;
}

function getCompletionMatch(employeeId: string, moduleKey: string): SubmissionListItem | undefined {
  return listSubmissions({ employeeId })
    .filter((submission) => getModuleKey(submission.templateTitle) === moduleKey)
    .sort((left, right) => new Date(right.completedAt ?? right.sentAt ?? right.createdAt).getTime() - new Date(left.completedAt ?? left.sentAt ?? left.createdAt).getTime())
    .find((submission) => submission.sendStatus === "completed" || submission.sendStatus === "sent");
}

function mapRegistration(row: ModuleRegistrationRow): ModuleRegistration {
  const completedSubmission = getCompletionMatch(row.employee_id, row.module_key);
  const status: ModuleRegistrationStatus = completedSubmission ? "completed" : "pending";

  return {
    id: row.id,
    employeeId: row.employee_id,
    templateId: row.template_id,
    moduleKey: row.module_key,
    moduleTitle: row.module_title,
    team: row.team === "F-OPS" ? "F-OPS" : "C-OPS",
    createdAt: row.created_at,
    completedAt: completedSubmission?.completedAt ?? completedSubmission?.sentAt,
    status
  };
}

function toListItem(registration: ModuleRegistration): ModuleRegistrationListItem {
  const employee = getEmployeeById(registration.employeeId);
  const template = getTemplateById(registration.templateId);

  return {
    ...registration,
    employeeName: employee?.name ?? "Unknown employee",
    employeeEmail: employee?.email ?? "",
    templateLanguage: template?.language ?? "English"
  };
}

function getRegistrationRowById(id: string): ModuleRegistrationRow | undefined {
  return appDatabase.queryOne<ModuleRegistrationRow>(
    `
      SELECT *
      FROM module_registrations
      WHERE id = ?;
    `,
    [id]
  );
}

export function getModuleRegistrationById(id: string): ModuleRegistration | undefined {
  const row = getRegistrationRowById(id);
  return row ? mapRegistration(row) : undefined;
}

export function listModuleRegistrations(filter?: {
  employeeId?: string;
  team?: "C-OPS" | "F-OPS";
  moduleKey?: string;
  status?: ModuleRegistrationStatus;
}): ModuleRegistrationListItem[] {
  const whereParts: string[] = [];
  const params: string[] = [];

  if (filter?.employeeId) {
    whereParts.push("employee_id = ?");
    params.push(filter.employeeId);
  }

  if (filter?.team) {
    whereParts.push("team = ?");
    params.push(filter.team);
  }

  if (filter?.moduleKey) {
    whereParts.push("module_key = ?");
    params.push(filter.moduleKey);
  }

  const whereClause = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  return appDatabase.queryMany<ModuleRegistrationRow>(
    `
      SELECT *
      FROM module_registrations
      ${whereClause}
      ORDER BY created_at DESC;
    `,
    params
  )
    .map((row) => toListItem(mapRegistration(row)))
    .filter((item) => !filter?.status || item.status === filter.status);
}

export function findModuleRegistration(employeeId: string, moduleKey: string): ModuleRegistration | undefined {
  const row = appDatabase.queryOne<ModuleRegistrationRow>(
    `
      SELECT *
      FROM module_registrations
      WHERE employee_id = ?
        AND module_key = ?
      ORDER BY created_at DESC
      LIMIT 1;
    `,
    [employeeId, moduleKey]
  );

  return row ? mapRegistration(row) : undefined;
}

export async function createModuleRegistration(input: ModuleRegistrationInput): Promise<ModuleRegistration> {
  const employee = getEmployeeById(input.employeeId);
  if (!employee) {
    throw new Error("Employee not found.");
  }

  const template = getTemplateById(input.templateId);
  if (!template) {
    throw new Error("Template not found.");
  }

  const moduleKey = getModuleKey(template.title);
  const existing = findModuleRegistration(input.employeeId, moduleKey);
  if (existing) {
    if (existing.status === "completed") {
      throw new Error("This module has already been completed for the selected employee.");
    }

    return existing;
  }

  const completion = getCompletionMatch(input.employeeId, moduleKey);
  if (completion) {
    throw new Error("This module has already been completed for the selected employee.");
  }

  const registration: ModuleRegistration = {
    id: randomUUID(),
    employeeId: input.employeeId,
    templateId: input.templateId,
    moduleKey,
    moduleTitle: normalizeModuleTitle(template.title),
    team: employee.team,
    createdAt: new Date().toISOString(),
    status: "pending",
    completedAt: undefined
  };

  await appDatabase.run(
    `
      INSERT INTO module_registrations (
        id,
        employee_id,
        template_id,
        module_key,
        module_title,
        team,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
    [
      registration.id,
      registration.employeeId,
      registration.templateId,
      registration.moduleKey,
      registration.moduleTitle,
      registration.team,
      registration.createdAt
    ]
  );

  return registration;
}

export async function createModuleRegistrations(input: ModuleRegistrationBatchInput): Promise<ModuleRegistrationBatchResult> {
  const templateIds = Array.from(new Set(input.templateIds.map((templateId) => templateId.trim()).filter(Boolean)));

  if (!templateIds.length) {
    throw new Error("At least one template must be selected.");
  }

  const registrations: ModuleRegistration[] = [];

  for (const templateId of templateIds) {
    registrations.push(await createModuleRegistration({
      employeeId: input.employeeId,
      templateId
    }));
  }

  const created = new Set(registrations.map((registration) => registration.id)).size;

  return {
    created,
    registrations
  };
}