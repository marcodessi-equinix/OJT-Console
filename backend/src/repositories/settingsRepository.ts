import { appDatabase } from "../db/database";
import { parseJsonArray } from "../utils/json";

interface AppSettingRow {
  value_json: string;
}

const deliveryRecipientsKey = "delivery_recipients";

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

export function getStoredDeliveryRecipients(): string[] {
  const row = appDatabase.queryOne<AppSettingRow>(
    `
      SELECT value_json
      FROM app_settings
      WHERE key = ?;
    `,
    [deliveryRecipientsKey]
  );

  return row ? normalizeRecipients(parseJsonArray<string>(row.value_json)) : [];
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