import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env";
import { appDatabase } from "../db/database";
import type { EmployeeProfile, TrainerSession } from "../types/training";

interface EmployeeRow {
  id: string;
  first_name?: string;
  last_name?: string;
  name: string;
  email: string;
  role: string;
  team?: string | null;
  trainer_pin_hash?: string | null;
  trainer_signature_data_url?: string | null;
  created_at: string;
}

const DEFAULT_TRAINER_PIN = "2026";
const DEFAULT_TRAINER_PIN_HASH = hashTrainerPin(DEFAULT_TRAINER_PIN);

function normalizeIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

function hashTrainerPin(pin: string): string {
  return createHash("sha256").update(`ojt-trainer-pin:${pin}`).digest("hex");
}

function normalizeEmployeeTeam(value: string | null | undefined): EmployeeProfile["team"] {
  return value === "F-OPS" ? "F-OPS" : "C-OPS";
}

function splitLegacyName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) {
    return { firstName: "", lastName: "" };
  }

  const parts = trimmed.split(" ");
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" ")
  };
}

function buildFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().replace(/\s+/g, " ");
}

function normalizeNameInput(input: { firstName?: string; lastName?: string; name?: string }): { firstName: string; lastName: string; name: string } {
  const firstName = input.firstName?.trim() ?? "";
  const lastName = input.lastName?.trim() ?? "";

  if (firstName || lastName) {
    return {
      firstName,
      lastName,
      name: buildFullName(firstName, lastName)
    };
  }

  const legacy = splitLegacyName(input.name ?? "");
  return {
    firstName: legacy.firstName,
    lastName: legacy.lastName,
    name: buildFullName(legacy.firstName, legacy.lastName)
  };
}

function mapEmployee(row: EmployeeRow): EmployeeProfile {
  const normalized = normalizeNameInput({
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name
  });

  return {
    id: row.id,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    name: normalized.name,
    email: row.email,
    role: (row.role === "trainer" ? "trainer" : "employee") as EmployeeProfile["role"],
    team: normalizeEmployeeTeam(row.team),
    hasPin: row.role === "trainer" && Boolean(row.trainer_pin_hash),
    mustChangePin: row.role === "trainer" && row.trainer_pin_hash === DEFAULT_TRAINER_PIN_HASH,
    createdAt: row.created_at
  };
}

function mapTrainer(row: EmployeeRow): TrainerSession {
  const normalized = normalizeNameInput({
    firstName: row.first_name,
    lastName: row.last_name,
    name: row.name
  });

  return {
    id: row.id,
    firstName: normalized.firstName,
    lastName: normalized.lastName,
    name: normalized.name,
    email: row.email,
    team: normalizeEmployeeTeam(row.team),
    createdAt: row.created_at,
    hasPin: Boolean(row.trainer_pin_hash),
    mustChangePin: row.trainer_pin_hash === DEFAULT_TRAINER_PIN_HASH,
    signatureDataUrl: row.trainer_signature_data_url ?? undefined
  };
}

function getEmployeeRowById(id: string): EmployeeRow | undefined {
  return appDatabase.queryOne<EmployeeRow>(
    `
      SELECT id, first_name, last_name, name, email, COALESCE(role, 'employee') as role, trainer_pin_hash, trainer_signature_data_url, created_at
      , team
      FROM employees
      WHERE id = ?;
    `,
    [id]
  );
}

function getTrainerRowById(id: string): EmployeeRow | undefined {
  const row = getEmployeeRowById(id);
  return row && row.role === "trainer" ? row : undefined;
}

function getTrainerRowByIdentifier(identifier: string): EmployeeRow | undefined {
  const normalized = normalizeIdentifier(identifier);

  return appDatabase.queryOne<EmployeeRow>(
    `
      SELECT id, first_name, last_name, name, email, COALESCE(role, 'employee') as role, trainer_pin_hash, trainer_signature_data_url, created_at
      , team
      FROM employees
      WHERE COALESCE(role, 'employee') = 'trainer'
        AND (lower(email) = lower(?) OR lower(name) = lower(?))
      LIMIT 1;
    `,
    [normalized, normalized]
  );
}

function getTrainerRowsByPinHash(pinHash: string): EmployeeRow[] {
  return appDatabase.queryMany<EmployeeRow>(
    `
      SELECT id, first_name, last_name, name, email, COALESCE(role, 'employee') as role, trainer_pin_hash, trainer_signature_data_url, created_at
      , team
      FROM employees
      WHERE COALESCE(role, 'employee') = 'trainer' AND trainer_pin_hash = ?;
    `,
    [pinHash]
  );
}

function assertTrainerPinAvailable(pin: string, excludeId?: string): void {
  if (pin === env.ADMIN_PIN) {
    throw new Error("This PIN is reserved for the admin account.");
  }

  const pinHash = hashTrainerPin(pin);
  const existing = appDatabase.queryOne<{ id: string }>(
    `
      SELECT id
      FROM employees
      WHERE COALESCE(role, 'employee') = 'trainer'
        AND trainer_pin_hash = ?
        ${excludeId ? "AND id != ?" : ""}
      LIMIT 1;
    `,
    excludeId ? [pinHash, excludeId] : [pinHash]
  );

  if (existing) {
    throw new Error("This PIN is already assigned to another trainer.");
  }
}

export function listEmployees(): EmployeeProfile[] {
  return appDatabase
    .queryMany<EmployeeRow>(`
      SELECT id, first_name, last_name, name, email, COALESCE(role, 'employee') as role, trainer_pin_hash, created_at
      , team
      FROM employees
      ORDER BY name COLLATE NOCASE ASC;
    `)
    .map(mapEmployee);
}

export function getEmployeeById(id: string): EmployeeProfile | undefined {
  const row = getEmployeeRowById(id);

  return row ? mapEmployee(row) : undefined;
}

export async function ensureTrainerDefaultPins(): Promise<void> {
  const missingPins = appDatabase.queryOne<{ count: number }>(
    `
      SELECT COUNT(*) as count
      FROM employees
      WHERE COALESCE(role, 'employee') = 'trainer'
        AND (trainer_pin_hash IS NULL OR trim(trainer_pin_hash) = '');
    `
  );

  if (!missingPins || Number(missingPins.count) === 0) {
    return;
  }

  await appDatabase.run(
    `
      UPDATE employees
      SET trainer_pin_hash = ?
      WHERE COALESCE(role, 'employee') = 'trainer'
        AND (trainer_pin_hash IS NULL OR trim(trainer_pin_hash) = '');
    `,
    [DEFAULT_TRAINER_PIN_HASH]
  );
}

export async function createEmployee(input: { firstName?: string; lastName?: string; name?: string; email: string; role?: string; team?: string; pin?: string }): Promise<EmployeeProfile> {
  const existing = appDatabase.queryOne<EmployeeRow>(
    `
      SELECT id, first_name, last_name, name, email, COALESCE(role, 'employee') as role, team, trainer_pin_hash, created_at
      FROM employees
      WHERE lower(email) = lower(?);
    `,
    [input.email]
  );

  if (existing) {
    throw new Error("An employee with this e-mail already exists.");
  }

  const role = input.role === "trainer" ? "trainer" : "employee";
  const team = normalizeEmployeeTeam(input.team);
  const normalizedName = normalizeNameInput(input);
  if (role === "trainer" && input.pin && input.pin !== DEFAULT_TRAINER_PIN) {
    assertTrainerPinAvailable(input.pin);
  }
  const trainerPinHash = role === "trainer"
    ? hashTrainerPin(input.pin || DEFAULT_TRAINER_PIN)
    : null;
  const employee: EmployeeProfile = {
    id: randomUUID(),
    firstName: normalizedName.firstName,
    lastName: normalizedName.lastName,
    name: normalizedName.name,
    email: input.email.toLowerCase(),
    role,
    team,
    hasPin: Boolean(trainerPinHash),
    mustChangePin: role === "trainer" && trainerPinHash === DEFAULT_TRAINER_PIN_HASH,
    createdAt: new Date().toISOString()
  };

  await appDatabase.run(
    `
      INSERT INTO employees (id, first_name, last_name, name, email, role, team, trainer_pin_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [employee.id, employee.firstName, employee.lastName, employee.name, employee.email, employee.role, employee.team, trainerPinHash, employee.createdAt]
  );

  return employee;
}

export async function updateEmployee(
  id: string,
  input: { firstName?: string; lastName?: string; name?: string; email?: string; role?: string; team?: string; pin?: string }
): Promise<EmployeeProfile> {
  const existingRow = getEmployeeRowById(id);
  if (!existingRow) {
    throw new Error("Employee not found.");
  }

  const existing = mapEmployee(existingRow);

  const normalizedName = normalizeNameInput({
    firstName: input.firstName ?? existing.firstName,
    lastName: input.lastName ?? existing.lastName,
    name: input.name ?? existing.name
  });
  const newEmail = (input.email?.trim() || existing.email).toLowerCase();
  const newRole = input.role === "trainer" ? "trainer" : input.role === "employee" ? "employee" : existing.role;
  const newTeam = normalizeEmployeeTeam(input.team ?? existing.team);
  if (newRole === "trainer" && input.pin && input.pin !== DEFAULT_TRAINER_PIN) {
    assertTrainerPinAvailable(input.pin, id);
  }
  const isPromotedToTrainer = existing.role !== "trainer" && newRole === "trainer";
  const nextPinHash = newRole === "trainer"
    ? (
        input.pin
          ? hashTrainerPin(input.pin)
          : isPromotedToTrainer
            ? DEFAULT_TRAINER_PIN_HASH
            : existingRow.trainer_pin_hash ?? DEFAULT_TRAINER_PIN_HASH
      )
    : null;
  const nextSignature = newRole === "trainer" ? existingRow.trainer_signature_data_url ?? null : null;

  if (newEmail !== existing.email) {
    const dup = appDatabase.queryOne<EmployeeRow>(
      `SELECT id FROM employees WHERE lower(email) = lower(?) AND id != ?;`,
      [newEmail, id]
    );
    if (dup) throw new Error("An employee with this e-mail already exists.");
  }

  await appDatabase.run(
    `
      UPDATE employees
      SET first_name = ?,
          last_name = ?,
          name = ?,
          email = ?,
          role = ?,
          team = ?,
          trainer_pin_hash = ?,
          trainer_signature_data_url = ?
      WHERE id = ?;
    `,
    [normalizedName.firstName, normalizedName.lastName, normalizedName.name, newEmail, newRole, newTeam, nextPinHash, nextSignature, id]
  );

  return {
    ...existing,
    firstName: normalizedName.firstName,
    lastName: normalizedName.lastName,
    name: normalizedName.name,
    email: newEmail,
    role: newRole as EmployeeProfile["role"],
    team: newTeam,
    hasPin: newRole === "trainer" && Boolean(nextPinHash),
    mustChangePin: newRole === "trainer" && nextPinHash === DEFAULT_TRAINER_PIN_HASH
  };
}

export async function deleteEmployee(id: string): Promise<void> {
  const existing = getEmployeeById(id);
  if (!existing) {
    throw new Error("Employee not found.");
  }

  await appDatabase.run(`DELETE FROM employees WHERE id = ?;`, [id]);
}

export async function bulkCreateEmployees(
  items: Array<{ firstName?: string; lastName?: string; name?: string; email: string; role?: string; team?: string }>
): Promise<{ created: number; skipped: number; employees: EmployeeProfile[] }> {
  let created = 0;
  let skipped = 0;
  const results: EmployeeProfile[] = [];

  for (const item of items) {
    const normalizedName = normalizeNameInput(item);
    const trimmedEmail = item.email?.trim()?.toLowerCase();
    if (!normalizedName.name || !trimmedEmail) {
      skipped++;
      continue;
    }

    const existing = appDatabase.queryOne<EmployeeRow>(
      `SELECT id, first_name, last_name, name, email, COALESCE(role, 'employee') as role, team, trainer_pin_hash, created_at FROM employees WHERE lower(email) = lower(?);`,
      [trimmedEmail]
    );

    if (existing) {
      skipped++;
      results.push(mapEmployee(existing));
      continue;
    }

    const employee: EmployeeProfile = {
      id: randomUUID(),
      firstName: normalizedName.firstName,
      lastName: normalizedName.lastName,
      name: normalizedName.name,
      email: trimmedEmail,
      role: item.role === "trainer" ? "trainer" : "employee",
      team: normalizeEmployeeTeam(item.team),
      hasPin: item.role === "trainer",
      mustChangePin: item.role === "trainer",
      createdAt: new Date().toISOString()
    };

    const trainerPinHash = employee.role === "trainer" ? DEFAULT_TRAINER_PIN_HASH : null;

    await appDatabase.run(
      `INSERT INTO employees (id, first_name, last_name, name, email, role, team, trainer_pin_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [employee.id, employee.firstName, employee.lastName, employee.name, employee.email, employee.role, employee.team, trainerPinHash, employee.createdAt]
    );

    created++;
    results.push(employee);
  }

  return { created, skipped, employees: results };
}

export async function authenticateTrainer(input: { identifier: string; pin: string }): Promise<TrainerSession> {
  const trainer = getTrainerRowByIdentifier(input.identifier);
  if (!trainer) {
    throw new Error("Trainer not found.");
  }

  const pinHash = hashTrainerPin(input.pin);

  if (!trainer.trainer_pin_hash || trainer.trainer_pin_hash !== pinHash) {
    throw new Error("Invalid PIN.");
  }

  return mapTrainer(trainer);
}

export async function authenticateTrainerByPin(pin: string): Promise<TrainerSession> {
  const pinHash = hashTrainerPin(pin);
  const matches = getTrainerRowsByPinHash(pinHash);

  if (matches.length === 0) {
    throw new Error("Invalid PIN.");
  }

  if (matches.length > 1) {
    throw new Error("PIN is not unique. Please set a unique trainer PIN.");
  }

  return mapTrainer(matches[0]);
}

export async function updateTrainerProfile(
  id: string,
  input: { pin?: string; signatureDataUrl?: string }
): Promise<TrainerSession> {
  const trainer = getTrainerRowById(id);
  if (!trainer) {
    throw new Error("Trainer not found.");
  }

  if (input.pin) {
    assertTrainerPinAvailable(input.pin, id);
  }

  const nextPinHash = input.pin ? hashTrainerPin(input.pin) : trainer.trainer_pin_hash ?? null;
  const nextSignature = input.signatureDataUrl === undefined
    ? trainer.trainer_signature_data_url ?? null
    : input.signatureDataUrl || null;

  await appDatabase.run(
    `
      UPDATE employees
      SET trainer_pin_hash = ?,
          trainer_signature_data_url = ?
      WHERE id = ?;
    `,
    [nextPinHash, nextSignature, id]
  );

  return mapTrainer({
    ...trainer,
    trainer_pin_hash: nextPinHash,
    trainer_signature_data_url: nextSignature
  });
}
