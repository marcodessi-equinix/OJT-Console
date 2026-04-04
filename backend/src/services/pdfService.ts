import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { StoredSubmission, TrainingTemplate } from "../types/training";

const pageSize: [number, number] = [595.28, 841.89];
const margin = 42;
const bodySize = 10;
const lineHeight = 14;
const contentWidth = pageSize[0] - margin * 2;
const regularFontPath = require.resolve("open-sans-fonts/open-sans/Regular/OpenSans-Regular.ttf");
const boldFontPath = require.resolve("open-sans-fonts/open-sans/Semibold/OpenSans-Semibold.ttf");

let regularFontBytesPromise: Promise<Buffer> | undefined;
let boldFontBytesPromise: Promise<Buffer> | undefined;

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

function createPage(pdfDoc: PDFDocument): { page: PDFPage; y: number } {
  return {
    page: pdfDoc.addPage(pageSize),
    y: pageSize[1] - margin
  };
}

function drawLines(
  page: PDFPage,
  lines: string[],
  font: PDFFont,
  size: number,
  y: number,
  color = rgb(0.12, 0.16, 0.22)
): number {
  let currentY = y;

  lines.forEach((line) => {
    page.drawText(toPdfSafeText(line), {
      x: margin,
      y: currentY,
      font,
      size,
      color
    });
    currentY -= lineHeight;
  });

  return currentY;
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

  let { page, y } = createPage(pdfDoc);

  const ensureSpace = (requiredHeight: number): void => {
    if (y - requiredHeight > margin) {
      return;
    }

    const next = createPage(pdfDoc);
    page = next.page;
    y = next.y;
  };

  const drawBlock = (label: string, value: string): void => {
    const labelLines = wrapText(label, boldFont, 12, contentWidth);
    const valueLines = wrapText(value, regularFont, bodySize, contentWidth);
    ensureSpace((labelLines.length + valueLines.length + 2) * lineHeight);
    y = drawLines(page, labelLines, boldFont, 12, y, rgb(0.05, 0.29, 0.42));
    y -= 2;
    y = drawLines(page, valueLines, regularFont, bodySize, y);
    y -= 8;
  };

  y = drawLines(page, wrapText("OJT Completion Record", boldFont, 18, contentWidth), boldFont, 18, y, rgb(0.02, 0.22, 0.35));
  y -= 8;

  drawBlock("Training Template", `${template.title} (${template.language})`);
  drawBlock("Employee", `${submission.employeeName} <${submission.employeeEmail}>`);
  drawBlock("Trainer", `${submission.trainerName} <${submission.trainerEmail}>`);
  drawBlock("Primary Recipient", submission.primaryRecipient);
  drawBlock("CC", submission.ccRecipients.join(", ") || "None");

  if (submission.supervisorEmail) {
    drawBlock("Supervisor", submission.supervisorEmail);
  }

  if (submission.notes) {
    drawBlock("Completion Notes", submission.notes);
  }

  for (const section of template.sections) {
    const review = submission.sectionReviews.find((item) => item.sectionId === section.id);
    const status = review?.acknowledged ? "Confirmed" : "Open";
    const note = review?.note ? `\nSection Note: ${review.note}` : "";
    drawBlock(`${section.title} (${status})`, `${section.content}${note}`);
  }

  ensureSpace(250);
  y = drawLines(page, wrapText("OJT Signoff", boldFont, 12, contentWidth), boldFont, 12, y, rgb(0.05, 0.29, 0.42));
  y -= 6;
  y = drawLines(
    page,
    wrapText(
      "The learner has attended and acquired knowledge and skills to advance to the next phase of qualification.",
      regularFont,
      bodySize,
      contentWidth
    ),
    regularFont,
    bodySize,
    y
  );
  y -= 14;

  const signatureBlocks = [
    {
      label: "Learner",
      value: submission.employeeSignatureDataUrl,
      signer: submission.employeeName,
      signedAt: formatSealTimestamp(submission.createdAt)
    },
    {
      label: "Instructor",
      value: submission.trainerSignatureDataUrl,
      signer: submission.trainerName,
      signedAt: formatSealTimestamp(submission.createdAt)
    },
    {
      label: "Training Manager",
      value: undefined,
      signer: "",
      signedAt: undefined
    }
  ];

  const blockWidth = 150;
  const blockHeight = 90;
  const gap = 18;
  const topY = y;

  for (const [index, block] of signatureBlocks.entries()) {
    const x = margin + index * (blockWidth + gap);
    page.drawRectangle({
      x,
      y: topY - blockHeight,
      width: blockWidth,
      height: blockHeight,
      borderColor: rgb(0.72, 0.78, 0.84),
      borderWidth: 1,
      color: rgb(0.97, 0.98, 0.99)
    });

    if (block.value) {
      const signatureBytes = Buffer.from(block.value.split(",")[1] ?? "", "base64");
      const signatureImage = await pdfDoc.embedPng(signatureBytes);
      const maxSignatureWidth = blockWidth - 22;
      const maxSignatureHeight = 48;
      const scale = Math.min(maxSignatureWidth / signatureImage.width, maxSignatureHeight / signatureImage.height);
      const scaledWidth = signatureImage.width * scale;
      const scaledHeight = signatureImage.height * scale;
      page.drawImage(signatureImage, {
        x: x + 6,
        y: topY - 62 + (maxSignatureHeight - scaledHeight) / 2,
        width: scaledWidth,
        height: scaledHeight
      });

      drawDigitalSeal(page, x + blockWidth - 74, topY - 42, boldFont, regularFont, submission.createdAt);
    }

    page.drawLine({
      start: { x, y: topY - blockHeight - 14 },
      end: { x: x + blockWidth, y: topY - blockHeight - 14 },
      thickness: 1,
      color: rgb(0.62, 0.68, 0.74)
    });
    page.drawText(toPdfSafeText(block.label), {
      x,
      y: topY - blockHeight - 28,
      font: boldFont,
      size: 10,
      color: rgb(0.05, 0.29, 0.42)
    });
    if (block.signer) {
      page.drawText(toPdfSafeText(block.signer), {
        x,
        y: topY - blockHeight - 42,
        font: regularFont,
        size: 9,
        color: rgb(0.12, 0.16, 0.22)
      });
    }

    if (block.signedAt) {
      page.drawText(toPdfSafeText(`${block.signedAt.date} ${block.signedAt.time}`), {
        x,
        y: topY - blockHeight - 56,
        font: regularFont,
        size: 9,
        color: rgb(0.12, 0.16, 0.22)
      });
    }
  }

  y = topY - blockHeight - 74;

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await pdfDoc.save());
}
