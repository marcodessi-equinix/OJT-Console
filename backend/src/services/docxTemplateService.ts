import { access, copyFile, mkdir, readdir, readFile } from "node:fs/promises";
import { basename, extname, isAbsolute, resolve } from "node:path";
import JSZip from "jszip";
import { PDFParse } from "pdf-parse";
import WordExtractor from "word-extractor";
import { XMLParser } from "fast-xml-parser";
import { env } from "../config/env";
import { documentsRoot, workspaceRoot } from "../config/paths";
import { getTemplateById, upsertTemplate } from "../repositories/templateRepository";
import type { TemplateLanguage, TemplateTeam, TrainingSection, TrainingTemplate } from "../types/training";
import { normalizeWhitespace, slugify } from "../utils/text";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: false
});

const wordExtractor = new WordExtractor();
const supportedTemplateExtensions = new Set([".doc", ".docx", ".pdf", ".txt"]);

type SupportedTemplateExtension = ".doc" | ".docx" | ".pdf" | ".txt";

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function extractText(node: unknown): string {
  if (node === null || node === undefined) {
    return "";
  }

  if (typeof node === "string" || typeof node === "number") {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map((item) => extractText(item)).filter(Boolean).join(" ");
  }

  if (typeof node !== "object") {
    return "";
  }

  const values = Object.entries(node as Record<string, unknown>)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, value]) => extractText(value))
    .filter(Boolean);

  return values.join(" ");
}

function extractParagraphs(cell: Record<string, unknown>): string[] {
  return toArray(cell.p)
    .map((paragraph) => normalizeWhitespace(extractText(paragraph)))
    .filter(Boolean);
}

function cleanupTitle(fileName: string): string {
  return basename(fileName, extname(fileName))
    .replace(/\s+-\s+On the Job Training Guide.*$/i, "")
    .replace(/\s+\(\d+\)$/i, "")
    .replace(/\s*(?:[-_–—]\s*|\(\s*|\[\s*)?(english|german|englisch|deutsch)(?:\s*[)\]])?\s*$/i, "")
    .trim();
}

function decodeWindows1252Byte(value: number): string {
  try {
    return new TextDecoder("windows-1252").decode(Uint8Array.from([value]));
  } catch {
    return Buffer.from([value]).toString("latin1");
  }
}

function looksLikeRtf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("ascii").startsWith("{\\rtf");
}

function extractRtfText(buffer: Buffer): string {
  const input = buffer.toString("latin1");
  const output: string[] = [];
  const stateStack: Array<{ skip: boolean; ucSkip: number }> = [{ skip: false, ucSkip: 1 }];
  const skipDestinations = new Set([
    "fonttbl",
    "colortbl",
    "stylesheet",
    "info",
    "pict",
    "object",
    "header",
    "headerl",
    "headerr",
    "footer",
    "footerl",
    "footerr",
    "listtable",
    "listoverridetable",
    "filetbl",
    "generator",
    "themedata",
    "xmlnstbl"
  ]);

  let index = 0;
  let pendingSkip = 0;

  const currentState = () => stateStack[stateStack.length - 1];

  while (index < input.length) {
    const char = input[index];

    if (pendingSkip > 0) {
      pendingSkip -= 1;
      index += 1;
      continue;
    }

    if (char === "{") {
      stateStack.push({ ...currentState() });
      index += 1;
      continue;
    }

    if (char === "}") {
      if (stateStack.length > 1) {
        stateStack.pop();
      }
      index += 1;
      continue;
    }

    if (char !== "\\") {
      if (!currentState().skip) {
        output.push(char);
      }
      index += 1;
      continue;
    }

    index += 1;
    const next = input[index];

    if (!next) {
      break;
    }

    if (next === "\\" || next === "{" || next === "}") {
      if (!currentState().skip) {
        output.push(next);
      }
      index += 1;
      continue;
    }

    if (next === "'") {
      const hex = input.slice(index + 1, index + 3);
      if (!currentState().skip && /^[0-9a-fA-F]{2}$/.test(hex)) {
        output.push(decodeWindows1252Byte(Number.parseInt(hex, 16)));
      }
      index += 3;
      continue;
    }

    if (next === "*") {
      currentState().skip = true;
      index += 1;
      continue;
    }

    if (!/[a-zA-Z]/.test(next)) {
      if (!currentState().skip) {
        if (next === "~") output.push(" ");
        if (next === "_") output.push("-");
        if (next === "-") output.push(String.fromCharCode(0x00ad));
      }
      index += 1;
      continue;
    }

    let word = "";
    while (index < input.length && /[a-zA-Z]/.test(input[index])) {
      word += input[index];
      index += 1;
    }

    let sign = 1;
    if (input[index] === "-") {
      sign = -1;
      index += 1;
    }

    let parameter = "";
    while (index < input.length && /\d/.test(input[index])) {
      parameter += input[index];
      index += 1;
    }

    const numericParameter = parameter ? sign * Number.parseInt(parameter, 10) : undefined;

    if (input[index] === " ") {
      index += 1;
    }

    if (skipDestinations.has(word)) {
      currentState().skip = true;
      continue;
    }

    if (word === "uc" && numericParameter !== undefined) {
      currentState().ucSkip = numericParameter;
      continue;
    }

    if (currentState().skip) {
      continue;
    }

    if (word === "u" && numericParameter !== undefined) {
      const codePoint = numericParameter < 0 ? numericParameter + 65536 : numericParameter;
      output.push(String.fromCharCode(codePoint));
      pendingSkip = currentState().ucSkip;
      continue;
    }

    if (word === "par" || word === "line") {
      output.push("\n");
      continue;
    }

    if (word === "tab") {
      output.push("\t");
      continue;
    }

    if (word === "emdash") {
      output.push("-");
      continue;
    }

    if (word === "endash") {
      output.push("-");
      continue;
    }

    if (word === "bullet") {
      output.push("- ");
    }
  }

  return output.join("");
}

function getSupportedTemplateExtension(fileName: string): SupportedTemplateExtension {
  const extension = extname(fileName).toLowerCase();

  if (!supportedTemplateExtensions.has(extension as SupportedTemplateExtension)) {
    throw new Error("Unsupported document type. Allowed: DOC, DOCX, PDF, TXT.");
  }

  return extension as SupportedTemplateExtension;
}

export function isSupportedTemplateFile(fileName: string): boolean {
  return supportedTemplateExtensions.has(extname(fileName).toLowerCase() as SupportedTemplateExtension);
}

export function getStoredTemplateFilePath(templateId: string, sourceFile: string): string {
  const safeId = templateId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return resolve(documentsRoot, `${safeId}${getSupportedTemplateExtension(sourceFile)}`);
}

export function getTemplateMimeType(sourceFile: string): string {
  switch (getSupportedTemplateExtension(sourceFile)) {
    case ".doc":
      return "application/msword";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case ".pdf":
      return "application/pdf";
    case ".txt":
      return "text/plain; charset=utf-8";
  }
}

function createTemplate(
  language: TemplateLanguage,
  team: TemplateTeam,
  fileName: string,
  sections: TrainingSection[]
): TrainingTemplate {
  const title = cleanupTitle(fileName);
  const id = slugify(`${language}-${title}`);

  return {
    id,
    slug: slugify(title),
    title,
    language,
    team,
    sourceFile: fileName,
    importedAt: new Date().toISOString(),
    sectionCount: sections.length,
    sections
  };
}

function buildSectionsFromText(text: string, fileName: string): TrainingSection[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n+/)
    .map((block) => block.split("\n").map((line) => normalizeWhitespace(line)).filter(Boolean))
    .filter((lines) => lines.length > 0);

  const sections: TrainingSection[] = [];
  let sectionIndex = 0;
  let currentContext = cleanupTitle(fileName);

  blocks.forEach((lines, blockIndex) => {
    if (lines.length === 1 && lines[0].length < 100) {
      currentContext = lines[0];
      return;
    }

    const heading = lines[0] ?? (currentContext || `Section ${sectionIndex + 1}`);
    const hasShortHeading = lines.length > 1 && heading.length < 100;
    const title = hasShortHeading ? heading : currentContext || `Section ${sectionIndex + 1}`;
    const content = normalizeWhitespace((hasShortHeading ? lines.slice(1) : lines).join("\n\n"));

    if (!content) {
      currentContext = heading;
      return;
    }

    currentContext = title;
    sectionIndex += 1;
    sections.push({
      id: `${slugify(fileName)}-section-${sectionIndex}`,
      title,
      content,
      tableIndex: 0,
      rowIndex: blockIndex
    });
  });

  if (!sections.length) {
    const fallbackContent = normalizeWhitespace(text);

    if (fallbackContent) {
      sections.push({
        id: `${slugify(fileName)}-section-1`,
        title: cleanupTitle(fileName) || "Section 1",
        content: fallbackContent,
        tableIndex: 0,
        rowIndex: 0
      });
    }
  }

  return sections;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function extractDocText(buffer: Buffer): Promise<string> {
  if (looksLikeRtf(buffer)) {
    return extractRtfText(buffer);
  }

  // Some .doc files are actually zipped DOCX files with a .doc extension
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const docXml = await zip.file("word/document.xml")?.async("string");
      if (docXml) {
        const parsed = xmlParser.parse(docXml) as {
          document?: { body?: { tbl?: unknown | unknown[]; p?: unknown | unknown[] } };
        };
        const paragraphs = toArray(parsed.document?.body?.p as Record<string, unknown> | Record<string, unknown>[] | undefined);
        const text = paragraphs.map((p) => normalizeWhitespace(extractText(p))).filter(Boolean).join("\n\n");
        if (text) return text;
      }
    } catch {
      // Not a valid zip — fall through
    }
  }

  // Standard OLE2 .doc parsing via word-extractor
  try {
    const document = await wordExtractor.extract(buffer);
    return document.getBody();
  } catch {
    // word-extractor failed — extract readable text runs from the binary as last resort
    const runs: string[] = [];
    let current = "";
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      // Printable ASCII + common whitespace
      if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x0a || byte === 0x0d || byte === 0x09) {
        current += String.fromCharCode(byte);
      } else {
        if (current.trim().length >= 8) {
          runs.push(current.trim());
        }
        current = "";
      }
    }
    if (current.trim().length >= 8) {
      runs.push(current.trim());
    }
    const extracted = runs.join("\n\n");
    if (extracted.length > 100) {
      return extracted;
    }
    throw new Error("Could not extract text from this .doc file. Try converting it to .docx or .pdf first.");
  }
}

function parseTextTemplate(
  text: string,
  language: TemplateLanguage,
  team: TemplateTeam,
  fileName: string
): TrainingTemplate {
  return createTemplate(language, team, fileName, buildSectionsFromText(text, fileName));
}

async function parseDocxTemplateBuffer(
  buffer: Buffer,
  language: TemplateLanguage,
  team: TemplateTeam,
  fileName: string
): Promise<TrainingTemplate> {
  const zip = await JSZip.loadAsync(buffer);
  const documentXml = await zip.file("word/document.xml")?.async("string");

  if (!documentXml) {
    throw new Error(`Missing document.xml in ${fileName}`);
  }

  const parsed = xmlParser.parse(documentXml) as {
    document?: { body?: { tbl?: unknown | unknown[] } };
  };

  const tables = toArray(parsed.document?.body?.tbl as Record<string, unknown> | Record<string, unknown>[] | undefined);
  const sections: TrainingSection[] = [];
  let sectionIndex = 0;
  let currentContext = cleanupTitle(fileName);

  tables.forEach((table, tableIndex) => {
    const rows = toArray((table as Record<string, unknown>).tr as Record<string, unknown> | Record<string, unknown>[] | undefined);

    rows.forEach((row, rowIndex) => {
      const cells = toArray((row as Record<string, unknown>).tc as Record<string, unknown> | Record<string, unknown>[] | undefined);
      const cellTexts = cells
        .map((cell) => extractParagraphs(cell))
        .map((paragraphs) => normalizeWhitespace(paragraphs.join("\n")))
        .filter((value) => value.length > 0);

      if (!cellTexts.length) {
        return;
      }

      if (cellTexts.length === 1) {
        if (cellTexts[0].length < 100) {
          currentContext = cellTexts[0];
          return;
        }

        sectionIndex += 1;
        sections.push({
          id: `${slugify(fileName)}-section-${sectionIndex}`,
          title: currentContext || `Section ${sectionIndex}`,
          content: cellTexts[0],
          tableIndex,
          rowIndex
        });
        return;
      }

      const title = normalizeWhitespace(cellTexts[0]) || currentContext || `Section ${sectionIndex + 1}`;
      const content = normalizeWhitespace(cellTexts.slice(1).join("\n\n"));

      if (!content) {
        currentContext = title;
        return;
      }

      currentContext = title;
      sectionIndex += 1;
      sections.push({
        id: `${slugify(fileName)}-section-${sectionIndex}`,
        title,
        content,
        tableIndex,
        rowIndex
      });
    });
  });

  return createTemplate(language, team, fileName, sections);
}

async function loadTemplateFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSupportedTemplateFile(entry.name))
    .map((entry) => `${directory}/${entry.name}`.replace(/\\/g, "/"));
}

function resolveConfiguredPath(value: string): string {
  return isAbsolute(value) ? value : resolve(workspaceRoot, value);
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    await access(directory);
    return true;
  } catch {
    return false;
  }
}

function dedupeDirectories(items: Array<{ directory: string; team: TemplateTeam }>): Array<{ directory: string; team: TemplateTeam }> {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = `${item.team}:${item.directory.toLowerCase()}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

async function resolveDocumentDirectories(language: TemplateLanguage): Promise<Array<{ directory: string; team: TemplateTeam }>> {
  const folderName = language === "English" ? "English" : "German";
  const folderAliases = [folderName, `OJT ${folderName}`];
  const explicitPath = language === "English" ? env.ENGLISH_DOCUMENTS_ROOT : env.GERMAN_DOCUMENTS_ROOT;
  const rootCandidates = [
    workspaceRoot,
    resolve(workspaceRoot, ".."),
    resolve(workspaceRoot, "..", "..")
  ];

  const candidates: Array<{ directory: string; team: TemplateTeam }> = [
    explicitPath ? { directory: resolveConfiguredPath(explicitPath), team: "C-OPS" } : undefined,
    env.DOCUMENTS_ROOT ? { directory: resolve(resolveConfiguredPath(env.DOCUMENTS_ROOT), folderName), team: "C-OPS" } : undefined,
    env.DOCUMENTS_ROOT ? { directory: resolve(resolveConfiguredPath(env.DOCUMENTS_ROOT), `OJT ${folderName}`), team: "C-OPS" } : undefined,
    ...rootCandidates.flatMap((root) => folderAliases.map((alias) => ({ directory: resolve(root, alias), team: "C-OPS" as const }))),
    ...rootCandidates.flatMap((root) => folderAliases.map((alias) => ({ directory: resolve(root, "OJT C-OPS", alias), team: "C-OPS" as const }))),
    ...rootCandidates.flatMap((root) => folderAliases.map((alias) => ({ directory: resolve(root, "OJT F-OPS", alias), team: "F-OPS" as const })))
  ].filter((value): value is { directory: string; team: TemplateTeam } => Boolean(value));

  const resolved: Array<{ directory: string; team: TemplateTeam }> = [];

  for (const candidate of dedupeDirectories(candidates)) {
    if (await directoryExists(candidate.directory)) {
      resolved.push(candidate);
    }
  }

  if (resolved.length > 0) {
    return resolved;
  }

  throw new Error(
    `Could not find the ${folderName} documents folder. Checked: ${candidates.map((candidate) => candidate.directory).join(", ")}. ` +
      `Accepted folder names are ${folderName}/ and OJT ${folderName}/, either directly near the app or inside OJT C-OPS/ and OJT F-OPS/. You can also configure DOCUMENTS_ROOT/${folderName.toUpperCase()}_DOCUMENTS_ROOT in .env.`
  );
}

function detectActualFormat(buffer: Buffer, declaredExtension: SupportedTemplateExtension): SupportedTemplateExtension {
  // ZIP magic bytes (PK\x03\x04) → real DOCX
  if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return ".docx";
  }
  // RTF signature
  if (looksLikeRtf(buffer)) {
    return ".doc";
  }
  // OLE2 Compound Binary (D0 CF 11 E0) → real .doc
  if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
    return ".doc";
  }
  // PDF signature
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return ".pdf";
  }
  // If declared .docx but not a ZIP, treat as .doc (likely a renamed binary .doc)
  if (declaredExtension === ".docx") {
    return ".doc";
  }
  return declaredExtension;
}

export async function parseTemplateFromBuffer(
  buffer: Buffer,
  language: TemplateLanguage,
  team: TemplateTeam,
  fileName: string
): Promise<TrainingTemplate> {
  const declaredExtension = getSupportedTemplateExtension(fileName);
  const actualFormat = detectActualFormat(buffer, declaredExtension);

  switch (actualFormat) {
    case ".docx":
      return parseDocxTemplateBuffer(buffer, language, team, fileName);
    case ".doc":
      return parseTextTemplate(await extractDocText(buffer), language, team, fileName);
    case ".pdf":
      return parseTextTemplate(await extractPdfText(buffer), language, team, fileName);
    case ".txt":
      return parseTextTemplate(buffer.toString("utf-8"), language, team, fileName);
  }
}

async function parseTemplateFromFile(
  filePath: string,
  language: TemplateLanguage,
  team: TemplateTeam,
  fileName: string
): Promise<TrainingTemplate> {
  const buffer = await readFile(filePath);
  return parseTemplateFromBuffer(buffer, language, team, fileName);
}

async function saveTemplateCopy(templateId: string, sourceFilePath: string): Promise<void> {
  await mkdir(documentsRoot, { recursive: true });
  await copyFile(sourceFilePath, getStoredTemplateFilePath(templateId, sourceFilePath));
}

export async function syncTemplatesFromDocuments(): Promise<void> {
  const englishRoots = await resolveDocumentDirectories("English");
  const germanRoots = await resolveDocumentDirectories("German");

  for (const source of englishRoots) {
    const englishFiles = await loadTemplateFiles(source.directory);

    for (const filePath of englishFiles) {
      const fileName = basename(filePath);
      try {
        const template = await parseTemplateFromFile(filePath, "English", source.team, fileName);
        const existing = getTemplateById(template.id);

        if (existing) {
          template.team = existing.team;
        }

        await upsertTemplate(template);
        await saveTemplateCopy(template.id, filePath);
      } catch (err) {
        console.warn(`Skipping ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  for (const source of germanRoots) {
    const germanFiles = await loadTemplateFiles(source.directory);

    for (const filePath of germanFiles) {
      const fileName = basename(filePath);
      try {
        const template = await parseTemplateFromFile(filePath, "German", source.team, fileName);
        const existing = getTemplateById(template.id);

        if (existing) {
          template.team = existing.team;
        }

        await upsertTemplate(template);
        await saveTemplateCopy(template.id, filePath);
      } catch (err) {
        console.warn(`Skipping ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }
}
