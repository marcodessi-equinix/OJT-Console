import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import initSqlJs, { type BindParams, type Database, type SqlJsStatic } from "sql.js";
import { databaseFile } from "../config/paths";

interface TableInfoRow {
  name: string;
}

export class AppDatabase {
  private sqlModule?: SqlJsStatic;
  private db?: Database;

  async initialize(): Promise<void> {
    if (this.db) {
      return;
    }

    await mkdir(dirname(databaseFile), { recursive: true });
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    this.sqlModule = await initSqlJs({
      locateFile: () => wasmPath
    });

    try {
      const existing = await readFile(databaseFile);
      this.db = new this.sqlModule.Database(existing);
    } catch {
      this.db = new this.sqlModule.Database();
    }

    this.migrate();
    await this.persist();
  }

  private get instance(): Database {
    if (!this.db) {
      throw new Error("Database has not been initialized.");
    }

    return this.db;
  }

  private migrate(): void {
    this.instance.exec(`
      CREATE TABLE IF NOT EXISTS templates (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL,
        language TEXT NOT NULL,
        team TEXT NOT NULL DEFAULT 'C-OPS',
        source_file TEXT NOT NULL,
        imported_at TEXT NOT NULL,
        sections_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT 'employee',
        team TEXT NOT NULL DEFAULT 'C-OPS',
        trainer_pin_hash TEXT,
        trainer_signature_data_url TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        training_session_id TEXT,
        employee_id TEXT,
        template_id TEXT NOT NULL,
        template_title TEXT NOT NULL,
        language TEXT NOT NULL,
        employee_name TEXT NOT NULL,
        employee_email TEXT NOT NULL,
        trainer_name TEXT NOT NULL,
        trainer_email TEXT NOT NULL,
        supervisor_email TEXT,
        recipient_email TEXT NOT NULL,
        cc_json TEXT NOT NULL,
        notes TEXT,
        signature_data_url TEXT NOT NULL,
        employee_signature_data_url TEXT,
        trainer_signature_data_url TEXT,
        section_reviews_json TEXT NOT NULL,
        pdf_path TEXT NOT NULL,
        email_delivered INTEGER NOT NULL,
        email_message TEXT NOT NULL,
        send_status TEXT NOT NULL DEFAULT 'draft',
        completed_at TEXT,
        sent_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS training_sessions (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        trainer_id TEXT NOT NULL,
        trainer_name TEXT NOT NULL,
        trainer_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_progress',
        delivery_status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT NOT NULL,
        last_activity_at TEXT NOT NULL,
        completed_at TEXT,
        delivery_updated_at TEXT,
        current_index INTEGER NOT NULL DEFAULT 0,
        section_reviews_json TEXT NOT NULL,
        notes TEXT,
        primary_recipient TEXT NOT NULL DEFAULT '',
        cc_json TEXT NOT NULL,
        employee_signature_data_url TEXT NOT NULL DEFAULT '',
        trainer_signature_data_url TEXT NOT NULL DEFAULT '',
        submission_id TEXT
      );

      CREATE TABLE IF NOT EXISTS module_registrations (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL,
        template_id TEXT NOT NULL,
        module_key TEXT NOT NULL,
        module_title TEXT NOT NULL,
        team TEXT NOT NULL DEFAULT 'C-OPS',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.ensureColumn("templates", "team", "TEXT NOT NULL DEFAULT 'C-OPS'");
    this.ensureColumn("submissions", "training_session_id", "TEXT");
    this.ensureColumn("submissions", "employee_id", "TEXT");
    this.ensureColumn("submissions", "employee_signature_data_url", "TEXT");
    this.ensureColumn("submissions", "trainer_signature_data_url", "TEXT");
    this.ensureColumn("submissions", "send_status", "TEXT NOT NULL DEFAULT 'draft'");
    this.ensureColumn("submissions", "completed_at", "TEXT");
    this.ensureColumn("submissions", "sent_at", "TEXT");
    this.ensureColumn("employees", "role", "TEXT NOT NULL DEFAULT 'employee'");
    this.ensureColumn("employees", "team", "TEXT NOT NULL DEFAULT 'C-OPS'");
    this.ensureColumn("employees", "first_name", "TEXT");
    this.ensureColumn("employees", "last_name", "TEXT");
    this.ensureColumn("employees", "trainer_pin_hash", "TEXT");
    this.ensureColumn("employees", "trainer_signature_data_url", "TEXT");
    this.ensureColumn("training_sessions", "employee_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "template_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "trainer_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "trainer_name", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "trainer_email", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "status", "TEXT NOT NULL DEFAULT 'in_progress'");
    this.ensureColumn("training_sessions", "delivery_status", "TEXT NOT NULL DEFAULT 'pending'");
    this.ensureColumn("training_sessions", "started_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "last_activity_at", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "completed_at", "TEXT");
    this.ensureColumn("training_sessions", "delivery_updated_at", "TEXT");
    this.ensureColumn("training_sessions", "current_index", "INTEGER NOT NULL DEFAULT 0");
    this.ensureColumn("training_sessions", "section_reviews_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("training_sessions", "notes", "TEXT");
    this.ensureColumn("training_sessions", "primary_recipient", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "cc_json", "TEXT NOT NULL DEFAULT '[]'");
    this.ensureColumn("training_sessions", "employee_signature_data_url", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "trainer_signature_data_url", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("training_sessions", "submission_id", "TEXT");
    this.ensureColumn("module_registrations", "employee_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("module_registrations", "template_id", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("module_registrations", "module_key", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("module_registrations", "module_title", "TEXT NOT NULL DEFAULT ''");
    this.ensureColumn("module_registrations", "team", "TEXT NOT NULL DEFAULT 'C-OPS'");
    this.ensureColumn("module_registrations", "created_at", "TEXT NOT NULL DEFAULT ''");
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const existingColumns = this.queryMany<TableInfoRow>(`PRAGMA table_info(${tableName});`).map((row) => String(row.name));
    if (existingColumns.includes(columnName)) {
      return;
    }

    this.instance.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition};`);
  }

  async persist(): Promise<void> {
    const binary = this.instance.export();
    await writeFile(databaseFile, Buffer.from(binary));
  }

  async run(sql: string, params: BindParams = []): Promise<void> {
    this.instance.run(sql, params);
    await this.persist();
  }

  queryOne<T>(sql: string, params: BindParams = []): T | undefined {
    const statement = this.instance.prepare(sql, params);

    try {
      if (!statement.step()) {
        return undefined;
      }

      return statement.getAsObject() as T;
    } finally {
      statement.free();
    }
  }

  queryMany<T>(sql: string, params: BindParams = []): T[] {
    const statement = this.instance.prepare(sql, params);
    const rows: T[] = [];

    try {
      while (statement.step()) {
        rows.push(statement.getAsObject() as T);
      }

      return rows;
    } finally {
      statement.free();
    }
  }
}

export const appDatabase = new AppDatabase();
