import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { workspaceRoot } from "../config/paths";
import type { StoredSubmission, TrainingTemplate } from "../types/training";

const pageSize: [number, number] = [595.28, 841.89];
const margin = 42;
const bodySize = 10;
const lineHeight = 14;
const contentWidth = pageSize[0] - margin * 2;
const regularFontPath = require.resolve("open-sans-fonts/open-sans/Regular/OpenSans-Regular.ttf");
const boldFontPath = require.resolve("open-sans-fonts/open-sans/Semibold/OpenSans-Semibold.ttf");
const academyLogoPath = resolve(workspaceRoot, "frontend", "public", "Equninx Gloabal Acadaemy.svg");
const pageTextColor = rgb(0.12, 0.16, 0.22);
const accentColor = rgb(0.03, 0.26, 0.38);
const mutedTextColor = rgb(0.37, 0.43, 0.5);
const borderColor = rgb(0.8, 0.84, 0.88);
const panelFill = rgb(0.97, 0.98, 0.99);
const highlightFill = rgb(0.95, 0.98, 1);
const signatureFill = rgb(0.985, 0.99, 0.995);

let regularFontBytesPromise: Promise<Buffer> | undefined;
let boldFontBytesPromise: Promise<Buffer> | undefined;
let academyLogoBytesPromise: Promise<Buffer | undefined> | undefined;

function getRegularFontBytes(): Promise<Buffer> {
  if (!regularFontBytesPromise) {
    regularFontBytesPromise = readFile(regularFontPath);
  }

  return regularFontBytesPromise;
}

function getBoldFontBytes(): Promise<Buffer> {
  if (!boldFontBytesPromise) {
    boldFontBytesPromise = readFile(boldFontPath);
  }

  return boldFontBytesPromise;
}

function getAcademyLogoBytes(): Promise<Buffer | undefined> {
  if (!academyLogoBytesPromise) {
    academyLogoBytesPromise = readFile(academyLogoPath, "utf-8")
      .then((svgContent) => {
        const match = svgContent.match(/xlink:href="data:image\/png;base64,([^"]+)"/i);
        if (!match?.[1]) {
          return undefined;
        }

        return Buffer.from(match[1], "base64");
      })
      .catch(() => undefined);
  }

  return academyLogoBytesPromise;
}

function toPdfSafeText(value: string): string {
  return value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2022\u25cf\u25aa]/g, "- ")
    .replace(/[\u2190-\u21ff\u27f0-\u27ff\u2900-\u297f\u2b00-\u2bff]/g, "->")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSealTimestamp(value: string): { date: string; time: string } {
  const timestamp = new Date(value);

  return {
    date: new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(timestamp),
    time: new Intl.DateTimeFormat("en-GB", { timeStyle: "short" }).format(timestamp)
  };
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = toPdfSafeText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    const candidateWidth = font.widthOfTextAtSize(candidate, size);

    if (candidateWidth <= width) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }

    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function drawLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  size: number,
  x: number,
  y: number,
  color = pageTextColor,
  customLineHeight = lineHeight
): number {
  let currentY = y;

  lines.forEach((line) => {
    page.drawText(toPdfSafeText(line), {
      x,
      y: currentY,
      font,
      size,
      color
    });
    currentY -= customLineHeight;
  });

  return currentY;
}

function drawCard(page: PDFPage, x: number, top: number, width: number, height: number, fill = panelFill): void {
  page.drawRectangle({
    x,
    y: top - height,
    width,
    height,
    borderColor,
    borderWidth: 1,
    color: fill
  });
}

function drawCardLabel(page: PDFPage, label: string, font: PDFFont, x: number, top: number): void {
  page.drawText(toPdfSafeText(label.toUpperCase()), {
    x,
    y: top,
    font,
    size: 9,
    color: mutedTextColor
  });
}

async function drawSignatureCard(
  pdfDoc: PDFDocument,
  page: PDFPage,
  input: {
    x: number;
    top: number;
    width: number;
    height: number;
    label: string;
    signer: string;
    email?: string;
    signatureDataUrl?: string;
    signedAt?: string;
    boldFont: PDFFont;
    regularFont: PDFFont;
  }
): Promise<void> {
  const { x, top, width, height, label, signer, email, signatureDataUrl, signedAt, boldFont, regularFont } = input;
  drawCard(page, x, top, width, height);

  drawCardLabel(page, label, boldFont, x + 14, top - 18);
  let textY = top - 40;
  textY = drawLines(page, wrapText(signer || label, boldFont, 11, width - 28).slice(0, 2), boldFont, 11, x + 14, textY, accentColor, 13);

  if (email) {
    drawLines(page, wrapText(email, regularFont, 8.5, width - 28).slice(0, 2), regularFont, 8.5, x + 14, textY - 2, mutedTextColor, 10);
  }

  const signatureBoxX = x + 14;
  const signatureBoxWidth = width - 28;
  const signatureBoxHeight = 62;
  const signatureBoxTop = top - 86;

  page.drawRectangle({
    x: signatureBoxX,
    y: signatureBoxTop - signatureBoxHeight,
    width: signatureBoxWidth,
    height: signatureBoxHeight,
    borderColor,
    borderWidth: 1,
    color: signatureFill
  });

  if (signatureDataUrl) {
    const signatureBytes = Buffer.from(signatureDataUrl.split(",")[1] ?? "", "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    const scale = Math.min(
      (signatureBoxWidth - 14) / signatureImage.width,
      (signatureBoxHeight - 14) / signatureImage.height
    );
    const scaledWidth = signatureImage.width * scale;
    const scaledHeight = signatureImage.height * scale;

    page.drawImage(signatureImage, {
      x: signatureBoxX + (signatureBoxWidth - scaledWidth) / 2,
      y: signatureBoxTop - signatureBoxHeight + (signatureBoxHeight - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight
    });

    if (signedAt) {
      drawDigitalSeal(page, signatureBoxX + 8, signatureBoxTop - signatureBoxHeight - 12, boldFont, regularFont, signedAt);
    }
  }

  page.drawLine({
    start: { x: signatureBoxX, y: top - height + 34 },
    end: { x: signatureBoxX + signatureBoxWidth, y: top - height + 34 },
    thickness: 1,
    color: rgb(0.62, 0.68, 0.74)
  });

  if (signedAt) {
    const formatted = formatSealTimestamp(signedAt);
    page.drawText(toPdfSafeText(`${formatted.date} ${formatted.time}`), {
      x: signatureBoxX,
      y: top - height + 18,
      font: regularFont,
      size: 8.5,
      color: mutedTextColor
    });
  }
}

function drawDigitalSeal(page: PDFPage, x: number, y: number, boldFont: PDFFont, regularFont: PDFFont, timestamp: string): void {
  const seal = formatSealTimestamp(timestamp);
  page.drawText(toPdfSafeText("DIGITAL SIGNATURE"), {
    x,
    y: y + 14,
    font: boldFont,
    size: 6.5,
    color: rgb(0.18, 0.56, 0.5),
    opacity: 0.78
  });

  page.drawLine({
    start: { x, y: y + 11 },
    end: { x: x + 54, y: y + 11 },
    thickness: 0.8,
    color: rgb(0.74, 0.86, 0.83),
    opacity: 0.9
  });

  page.drawText(toPdfSafeText(`${seal.date}  ${seal.time}`), {
    x,
    y: y + 2,
    font: regularFont,
    size: 5.6,
    color: rgb(0.35, 0.43, 0.5),
    opacity: 0.85
  });
}

export async function generateSubmissionPdf(
  template: TrainingTemplate,
  submission: StoredSubmission,
  targetPath: string
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const regularFont = await pdfDoc.embedFont(await getRegularFontBytes());
  const boldFont = await pdfDoc.embedFont(await getBoldFontBytes());
  const page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const logoBytes = await getAcademyLogoBytes();
  if (logoBytes) {
    const logoImage = await pdfDoc.embedPng(logoBytes);
    const logoScale = Math.min(140 / logoImage.width, 30 / logoImage.height);
    const logoWidth = logoImage.width * logoScale;
    const logoHeight = logoImage.height * logoScale;
    page.drawImage(logoImage, {
      x: pageSize[0] - margin - logoWidth,
      y: y - logoHeight + 6,
      width: logoWidth,
      height: logoHeight
    });
  }

  page.drawText("OJT Signoff", {
    x: margin,
    y: y - 4,
    font: boldFont,
    size: 24,
    color: accentColor
  });

  page.drawLine({
    start: { x: margin, y: y - 18 },
    end: { x: pageSize[0] - margin, y: y - 18 },
    thickness: 1.2,
    color: borderColor
  });

  y -= 42;

  const moduleCardHeight = 92;
  drawCard(page, margin, y, contentWidth, moduleCardHeight, highlightFill);
  drawCardLabel(page, "Completed Module", boldFont, margin + 16, y - 18);
  drawLines(
    page,
    wrapText(template.title, boldFont, 18, contentWidth - 32).slice(0, 3),
    boldFont,
    18,
    margin + 16,
    y - 46,
    accentColor,
    20
  );

  y -= moduleCardHeight + 18;

  const infoCardGap = 16;
  const infoCardWidth = (contentWidth - infoCardGap) / 2;
  const infoCardHeight = 78;
  const trainerName = submission.trainerName.trim() || "Trainer pending";
  const trainerEmail = submission.trainerEmail.trim() || "";

  drawCard(page, margin, y, infoCardWidth, infoCardHeight);
  drawCardLabel(page, "Completed By", boldFont, margin + 14, y - 18);
  let nextY = drawLines(
    page,
    wrapText(submission.employeeName, boldFont, 13, infoCardWidth - 28).slice(0, 2),
    boldFont,
    13,
    margin + 14,
    y - 40,
    accentColor,
    15
  );
  drawLines(
    page,
    wrapText(submission.employeeEmail, regularFont, 9, infoCardWidth - 28).slice(0, 2),
    regularFont,
    9,
    margin + 14,
    nextY - 2,
    mutedTextColor,
    11
  );

  const trainerCardX = margin + infoCardWidth + infoCardGap;
  drawCard(page, trainerCardX, y, infoCardWidth, infoCardHeight);
  drawCardLabel(page, "Trainer", boldFont, trainerCardX + 14, y - 18);
  nextY = drawLines(
    page,
    wrapText(trainerName, boldFont, 13, infoCardWidth - 28).slice(0, 2),
    boldFont,
    13,
    trainerCardX + 14,
    y - 40,
    accentColor,
    15
  );
  if (trainerEmail) {
    drawLines(
      page,
      wrapText(trainerEmail, regularFont, 9, infoCardWidth - 28).slice(0, 2),
      regularFont,
      9,
      trainerCardX + 14,
      nextY - 2,
      mutedTextColor,
      11
    );
  }

  y -= infoCardHeight + 20;

  const statementHeight = 82;
  drawCard(page, margin, y, contentWidth, statementHeight);
  drawCardLabel(page, "Qualification Statement", boldFont, margin + 16, y - 18);
  drawLines(
    page,
    wrapText(
      "The learner has attended and acquired knowledge and skills to advance to the next phase of qualification.",
      regularFont,
      11,
      contentWidth - 32
    ),
    regularFont,
    11,
    margin + 16,
    y - 42,
    pageTextColor,
    15
  );

  y -= statementHeight + 24;

  page.drawText("Signatures", {
    x: margin,
    y: y,
    font: boldFont,
    size: 12,
    color: accentColor
  });

  y -= 16;

  const signatureGap = 16;
  const signatureCardWidth = (contentWidth - signatureGap * 2) / 3;
  const signatureCardHeight = 178;
  const signatureTop = y;

  await drawSignatureCard(pdfDoc, page, {
    x: margin,
    top: signatureTop,
    width: signatureCardWidth,
    height: signatureCardHeight,
    label: "Employee",
    signer: submission.employeeName,
    email: submission.employeeEmail,
    signatureDataUrl: submission.employeeSignatureDataUrl,
    signedAt: submission.employeeSignatureDataUrl ? submission.createdAt : undefined,
    boldFont,
    regularFont
  });

  await drawSignatureCard(pdfDoc, page, {
    x: margin + signatureCardWidth + signatureGap,
    top: signatureTop,
    width: signatureCardWidth,
    height: signatureCardHeight,
    label: "Trainer",
    signer: trainerName,
    email: trainerEmail,
    signatureDataUrl: submission.trainerSignatureDataUrl,
    signedAt: submission.trainerSignatureDataUrl ? submission.createdAt : undefined,
    boldFont,
    regularFont
  });

  await drawSignatureCard(pdfDoc, page, {
    x: margin + (signatureCardWidth + signatureGap) * 2,
    top: signatureTop,
    width: signatureCardWidth,
    height: signatureCardHeight,
    label: "Training Manager",
    signer: "Manual sign-off",
    boldFont,
    regularFont
  });

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await pdfDoc.save());
}
