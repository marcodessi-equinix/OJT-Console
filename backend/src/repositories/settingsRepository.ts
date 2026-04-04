import { appDatabase } from "../db/database";
import { env } from "../config/env";
import { parseJsonArray } from "../utils/json";

interface AppSettingRow {
  value_json: string;
}

const deliveryRecipientsKey = "delivery_recipients";
const deliveryEmailSubjectTemplateKey = "delivery_email_subject_template";
const deliveryEmailBodyTemplateKey = "delivery_email_body_template";

export const defaultDeliveryEmailSubjectTemplate = "OJT completion for {{employeeName}} | {{templateTitle}}";
export const defaultDeliveryEmailBodyTemplate = [
  "Hello,",
  "",
  "please find the completed OJT modules for {{employeeName}} attached.",
  "",
  "Modules:",
  "{{moduleList}}",
  "",
  "Trainer: {{trainerName}} ({{trainerEmail}})",
  "Employee: {{employeeName}} ({{employeeEmail}})",
  "Recipient: {{primaryRecipient}}",
  "CC: {{ccRecipients}}",
  "",
  "Best regards"
].join("\n");

function normalizeRecipients(recipients: string[]): string[] {
  const seen = new Set<string>();

  return recipients
    .map((recipient) => recipient.trim().toLowerCase())
    .filter((recipient) => Boolean(recipient))
    .filter((recipient) => {
      if (seen.has(recipient)) {
        return false;
      }

      seen.add(recipient);
      return true;
    });
}

function readJsonSetting<T>(key: string): T | undefined {
  const row = appDatabase.queryOne<AppSettingRow>(
    `
      SELECT value_json
      FROM app_settings
      WHERE key = ?;
    `,
    [key]
  );

  if (!row) {
    return undefined;
  }

  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return undefined;
  }
}

function normalizeTemplateText(value: string | undefined, fallback: string): string {
  const normalized = value?.replace(/\r\n/g, "\n").trim();
  return normalized ? normalized : fallback;
}

function getFallbackRecipients(): string[] {
  return normalizeRecipients(
    (env.DEFAULT_PRIMARY_RECIPIENT ?? "")
      .split(/[;,\n]/)
      .map((recipient) => recipient.trim())
  );
}

export function getStoredDeliveryRecipients(): string[] {
  const recipients = readJsonSetting<string[]>(deliveryRecipientsKey);
  return recipients ? normalizeRecipients(parseJsonArray<string>(JSON.stringify(recipients))) : [];
}

export async function saveDeliveryRecipients(recipients: string[]): Promise<string[]> {
  const normalizedRecipients = normalizeRecipients(recipients);
  const updatedAt = new Date().toISOString();

  await appDatabase.run(
    `
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at;
    `,
    [deliveryRecipientsKey, JSON.stringify(normalizedRecipients), updatedAt]
  );

  return normalizedRecipients;
}

export function getStoredDeliveryEmailSubjectTemplate(): string {
  return normalizeTemplateText(readJsonSetting<string>(deliveryEmailSubjectTemplateKey), defaultDeliveryEmailSubjectTemplate);
}

export function getStoredDeliveryEmailBodyTemplate(): string {
  return normalizeTemplateText(readJsonSetting<string>(deliveryEmailBodyTemplateKey), defaultDeliveryEmailBodyTemplate);
}

export async function saveDeliveryEmailTemplates(input: {
  subjectTemplate: string;
  bodyTemplate: string;
}): Promise<{ subjectTemplate: string; bodyTemplate: string }> {
  const subjectTemplate = normalizeTemplateText(input.subjectTemplate, defaultDeliveryEmailSubjectTemplate);
  const bodyTemplate = normalizeTemplateText(input.bodyTemplate, defaultDeliveryEmailBodyTemplate);
  const updatedAt = new Date().toISOString();

  await appDatabase.run(
    `
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at;
    `,
    [deliveryEmailSubjectTemplateKey, JSON.stringify(subjectTemplate), updatedAt]
  );

  await appDatabase.run(
    `
      INSERT INTO app_settings (key, value_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at;
    `,
    [deliveryEmailBodyTemplateKey, JSON.stringify(bodyTemplate), updatedAt]
  );

  return {
    subjectTemplate,
    bodyTemplate
  };
}

export function readDeliverySettings(): {
  deliveryRecipients: string[];
  defaultPrimaryRecipient: string;
  defaultCcMe: string;
  deliveryEmailSubjectTemplate: string;
  deliveryEmailBodyTemplate: string;
} {
  const storedRecipients = getStoredDeliveryRecipients();
  const deliveryRecipients = storedRecipients.length ? storedRecipients : getFallbackRecipients();

  return {
    deliveryRecipients,
    defaultPrimaryRecipient: deliveryRecipients[0] ?? "",
    defaultCcMe: "",
    deliveryEmailSubjectTemplate: getStoredDeliveryEmailSubjectTemplate(),
    deliveryEmailBodyTemplate: getStoredDeliveryEmailBodyTemplate()
  };
}