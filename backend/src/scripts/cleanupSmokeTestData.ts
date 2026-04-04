import { unlink } from "node:fs/promises";
import { appDatabase } from "../db/database";

async function cleanup(): Promise<void> {
  await appDatabase.initialize();

  const testEmployees = appDatabase.queryMany<{ id: string; email: string }>(
    `
      SELECT id, email
      FROM employees
      WHERE lower(email) LIKE 'copilot-%@example.com';
    `
  );

  const employeeIds = testEmployees.map((row) => row.id);
  const testSubmissions = appDatabase.queryMany<{ id: string; pdf_path: string }>(
    `
      SELECT id, pdf_path
      FROM submissions
      WHERE lower(employee_email) LIKE 'copilot-%@example.com'
         OR lower(trainer_email) LIKE 'copilot-%@example.com';
    `
  );

  for (const submission of testSubmissions) {
    try {
      await unlink(submission.pdf_path);
    } catch {
      // Ignore missing files; the DB cleanup is the source of truth.
    }
  }

  await appDatabase.run(
    `
      DELETE FROM submissions
      WHERE lower(employee_email) LIKE 'copilot-%@example.com'
         OR lower(trainer_email) LIKE 'copilot-%@example.com';
    `
  );

  if (employeeIds.length > 0) {
    const placeholders = employeeIds.map(() => "?").join(", ");
    await appDatabase.run(
      `
        DELETE FROM training_sessions
        WHERE employee_id IN (${placeholders})
           OR trainer_id IN (${placeholders});
      `,
      [...employeeIds, ...employeeIds]
    );

    await appDatabase.run(
      `
        DELETE FROM employees
        WHERE id IN (${placeholders});
      `,
      employeeIds
    );
  }

  console.log(JSON.stringify({
    removedEmployees: employeeIds.length,
    removedSubmissions: testSubmissions.length
  }));
}

void cleanup().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});