import { appDatabase } from "../db/database";
import type { TemplateTeam, TrainingSection, TrainingTemplate, TrainingTemplateSummary } from "../types/training";
import { parseJsonArray } from "../utils/json";

interface TemplateRow {
  id: string;
  slug: string;
  title: string;
  language: "English" | "German";
  team: string | null;
  source_file: string;
  imported_at: string;
  sections_json: string;
}

function normalizeTemplateTeam(team: string | null | undefined): TemplateTeam {
  return team === "F-OPS" ? "F-OPS" : "C-OPS";
}

function mapTemplate(row: TemplateRow): TrainingTemplate {
  const sections = parseJsonArray<TrainingSection>(row.sections_json);

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    language: row.language,
    team: normalizeTemplateTeam(row.team),
    sourceFile: row.source_file,
    importedAt: row.imported_at,
    sectionCount: sections.length,
    sections
  };
}

export async function upsertTemplate(template: TrainingTemplate): Promise<void> {
  await appDatabase.run(
    `
      INSERT INTO templates (id, slug, title, language, team, source_file, imported_at, sections_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        slug = excluded.slug,
        title = excluded.title,
        language = excluded.language,
        team = excluded.team,
        source_file = excluded.source_file,
        imported_at = excluded.imported_at,
        sections_json = excluded.sections_json;
    `,
    [
      template.id,
      template.slug,
      template.title,
      template.language,
      template.team,
      template.sourceFile,
      template.importedAt,
      JSON.stringify(template.sections)
    ]
  );
}

export function listTemplates(): TrainingTemplateSummary[] {
  return appDatabase
    .queryMany<TemplateRow>(
      `
        SELECT id, slug, title, language, team, source_file, imported_at, sections_json
        FROM templates
        ORDER BY language ASC, team ASC, title ASC;
      `
    )
    .map((row) => {
      const template = mapTemplate(row);
      return {
        id: template.id,
        slug: template.slug,
        title: template.title,
        language: template.language,
        team: template.team,
        sourceFile: template.sourceFile,
        importedAt: template.importedAt,
        sectionCount: template.sectionCount
      };
    });
}

export function getTemplateById(id: string): TrainingTemplate | undefined {
  const row = appDatabase.queryOne<TemplateRow>(
    `
      SELECT id, slug, title, language, team, source_file, imported_at, sections_json
      FROM templates
      WHERE id = ?;
    `,
    [id]
  );

  return row ? mapTemplate(row) : undefined;
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const existing = getTemplateById(id);
  if (!existing) return false;

  await appDatabase.run(
    `DELETE FROM templates WHERE id = ?;`,
    [id]
  );
  return true;
}

export async function updateTemplateSection(
  templateId: string,
  sectionId: string,
  updates: { title?: string; content?: string }
): Promise<TrainingTemplate | undefined> {
  const template = getTemplateById(templateId);
  if (!template) return undefined;

  const section = template.sections.find((s) => s.id === sectionId);
  if (!section) return undefined;

  if (updates.title !== undefined) section.title = updates.title;
  if (updates.content !== undefined) section.content = updates.content;

  await upsertTemplate(template);
  return template;
}

export async function updateTemplateMeta(
  templateId: string,
  updates: { title?: string; language?: "English" | "German"; team?: TemplateTeam }
): Promise<TrainingTemplate | undefined> {
  const template = getTemplateById(templateId);
  if (!template) return undefined;

  if (updates.title !== undefined) template.title = updates.title;
  if (updates.language !== undefined) template.language = updates.language;
  if (updates.team !== undefined) template.team = updates.team;

  await upsertTemplate(template);
  return template;
}
