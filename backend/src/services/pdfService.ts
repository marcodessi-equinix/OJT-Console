import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { workspaceRoot } from "../config/paths";
import type { StoredSubmission, TrainingTemplate } from "../types/training";

const pageSize: [number, number] = [595.28, 841.89];
const margin = 42;
const lineHeight = 14;
const contentWidth = pageSize[0] - margin * 2;
const contentRight = pageSize[0] - margin;
const regularFontPath = require.resolve("open-sans-fonts/open-sans/Regular/OpenSans-Regular.ttf");
const boldFontPath = require.resolve("open-sans-fonts/open-sans/Semibold/OpenSans-Semibold.ttf");
const academyLogoPath = resolve(workspaceRoot, "frontend", "public", "Equninx Gloabal Acadaemy.svg");
const customerOpsBadgePath = resolve(workspaceRoot, "frontend", "public", "eqx_digital-learning-badges_CustomerOps_Bronze.png");
const criticalFacilitiesBadgePath = resolve(workspaceRoot, "frontend", "public", "eqx_digital-learning-badges_CriticalFacilities_Bronze.png");
const instructorBadgePath = resolve(workspaceRoot, "frontend", "public", "eqx_digital-learning-badges_Instructor_SME.png");

const pageBackgroundFill = rgb(1, 1, 1);
const whiteColor = rgb(1, 1, 1);
const pageTextColor = rgb(0.102, 0.082, 0.063);
const secondaryTextColor = rgb(0.361, 0.31, 0.239);
const mutedTextColor = rgb(0.604, 0.557, 0.494);
const primaryColor = rgb(0.69, 0.49, 0.231);
const primaryHoverColor = rgb(0.604, 0.42, 0.184);
const accentColor = rgb(0.769, 0.396, 0.165);
const surfaceAltFill = rgb(0.98, 0.973, 0.961);
const subtleFill = rgb(0.961, 0.953, 0.941);
const borderColor = rgb(0.898, 0.867, 0.827);
const borderLightColor = rgb(0.941, 0.922, 0.894);
const signatureFill = rgb(0.99, 0.985, 0.978);
const successColor = rgb(0.063, 0.725, 0.506);

let regularFontBytesPromise: Promise<Buffer> | undefined;
let boldFontBytesPromise: Promise<Buffer> | undefined;
let academyLogoBytesPromise: Promise<Buffer | undefined> | undefined;
let customerOpsBadgeBytesPromise: Promise<Buffer | undefined> | undefined;
let criticalFacilitiesBadgeBytesPromise: Promise<Buffer | undefined> | undefined;
let instructorBadgeBytesPromise: Promise<Buffer | undefined> | undefined;

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

function getCustomerOpsBadgeBytes(): Promise<Buffer | undefined> {
  if (!customerOpsBadgeBytesPromise) {
    customerOpsBadgeBytesPromise = readFile(customerOpsBadgePath).catch(() => undefined);
  }

  return customerOpsBadgeBytesPromise;
}

function getCriticalFacilitiesBadgeBytes(): Promise<Buffer | undefined> {
  if (!criticalFacilitiesBadgeBytesPromise) {
    criticalFacilitiesBadgeBytesPromise = readFile(criticalFacilitiesBadgePath).catch(() => undefined);
  }

  return criticalFacilitiesBadgeBytesPromise;
}

function getInstructorBadgeBytes(): Promise<Buffer | undefined> {
  if (!instructorBadgeBytesPromise) {
    instructorBadgeBytesPromise = readFile(instructorBadgePath).catch(() => undefined);
  }

  return instructorBadgeBytesPromise;
}

function getEmployeeBadgeBytes(team: TrainingTemplate["team"]): Promise<Buffer | undefined> {
  return team === "F-OPS" ? getCriticalFacilitiesBadgeBytes() : getCustomerOpsBadgeBytes();
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
    date: new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }).format(timestamp),
    time: new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(timestamp)
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

function drawRightAlignedText(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  rightX: number,
  y: number,
  color = pageTextColor
): void {
  const safeText = toPdfSafeText(text);
  page.drawText(safeText, {
    x: rightX - font.widthOfTextAtSize(safeText, size),
    y,
    font,
    size,
    color
  });
}

function drawCard(page: PDFPage, x: number, top: number, width: number, height: number, fill = whiteColor): void {
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

function drawHorizontalRule(page: PDFPage, x: number, y: number, width: number, color = borderColor, thickness = 1): void {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness,
    color
  });
}

function drawCardLabel(page: PDFPage, label: string, font: PDFFont, x: number, top: number): void {
  page.drawText(toPdfSafeText(label.toUpperCase()), {
    x,
    y: top,
    font,
    size: 8.8,
    color: mutedTextColor
  });
}

function drawInfoCard(
  page: PDFPage,
  input: {
    x: number;
    top: number;
    width: number;
    height: number;
    label: string;
    title: string;
    subtitle?: string;
    boldFont: PDFFont;
    regularFont: PDFFont;
  }
): void {
  const { x, top, width, height, label, title, subtitle, boldFont, regularFont } = input;
  const accent = label === "Trainer" ? accentColor : primaryColor;
  drawCard(page, x, top, width, height, whiteColor);

  page.drawRectangle({
    x,
    y: top - height,
    width: 8,
    height,
    color: accent
  });

  drawCardLabel(page, label, boldFont, x + 20, top - 18);
  const titleY = drawLines(
    page,
    wrapText(title, boldFont, 13, width - 40).slice(0, 2),
    boldFont,
    13,
    x + 20,
    top - 40,
    pageTextColor,
    15
  );

  if (subtitle) {
    drawLines(
      page,
      wrapText(subtitle, regularFont, 9.2, width - 40).slice(0, 2),
      regularFont,
      9.2,
      x + 20,
      titleY - 2,
      secondaryTextColor,
      11
    );
  }
}

function drawDigitalSignatureFooter(
  page: PDFPage,
  x: number,
  y: number,
  boldFont: PDFFont,
  signedAt?: string
): void {
  const safeText = "DIGITAL SIGNATURE";
  page.drawText(safeText, {
    x,
    y: y + 2,
    font: boldFont,
    size: 7.2,
    color: successColor,
    opacity: signedAt ? 0.9 : 0.45
  });
}

function drawDocumentFooter(page: PDFPage, boldFont: PDFFont, regularFont: PDFFont): void {
  const footerTop = 34;
  drawHorizontalRule(page, margin, footerTop + 14, contentWidth, primaryColor, 1.1);

  page.drawText("CREATED WITH OJT CONSOLE APP", {
    x: margin,
    y: footerTop,
    font: boldFont,
    size: 7.6,
    color: primaryHoverColor
  });

  drawRightAlignedText(page, "Equinix Global Academy · Qualification Record", regularFont, 7.8, contentRight, footerTop, secondaryTextColor);
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
    placeholderText?: string;
    badgeBytes?: Buffer;
    boldFont: PDFFont;
    regularFont: PDFFont;
  }
): Promise<void> {
  const { x, top, width, height, label, signer, email, signatureDataUrl, signedAt, placeholderText, badgeBytes, boldFont, regularFont } = input;
  const accent = label === "Trainer" ? accentColor : primaryColor;
  const innerX = x + 18;
  const signatureBoxWidth = 238;
  const signatureBoxHeight = 68;
  const signatureBoxX = x + width - signatureBoxWidth - 18;
  const signatureBoxTop = top - 16;
  const badgeSlotSize = 52;
  const badgeSlotX = signatureBoxX - 70;
  const badgeSlotY = top - height / 2 - badgeSlotSize / 2;
  const metaWidth = badgeSlotX - innerX - 16;
  const footerY = top - height + 10;
  const signatureBottom = signatureBoxTop - signatureBoxHeight;

  drawCard(page, x, top, width, height, whiteColor);
  page.drawRectangle({
    x,
    y: top - height,
    width: 6,
    height,
    color: accent
  });

  drawCardLabel(page, label, boldFont, innerX, top - 18);

  if (badgeBytes) {
    const badgeImage = await pdfDoc.embedPng(badgeBytes);
    const badgeScale = Math.min(badgeSlotSize / badgeImage.width, badgeSlotSize / badgeImage.height);
    const badgeWidth = badgeImage.width * badgeScale;
    const badgeHeight = badgeImage.height * badgeScale;

    page.drawImage(badgeImage, {
      x: badgeSlotX + (badgeSlotSize - badgeWidth) / 2,
      y: badgeSlotY + (badgeSlotSize - badgeHeight) / 2,
      width: badgeWidth,
      height: badgeHeight
    });
  }

  let textY = drawLines(
    page,
    wrapText(signer || label, boldFont, 12.8, metaWidth).slice(0, 2),
    boldFont,
    12.8,
    innerX,
    top - 40,
    pageTextColor,
    15
  );

  if (email) {
    textY = drawLines(
      page,
      wrapText(email, regularFont, 8.8, metaWidth).slice(0, 2),
      regularFont,
      8.8,
      innerX,
      textY - 2,
      secondaryTextColor,
      11
    );
  }

  if (!email && placeholderText) {
    drawLines(
      page,
      wrapText(placeholderText, regularFont, 8.5, metaWidth).slice(0, 2),
      regularFont,
      8.5,
      innerX,
      textY - 2,
      secondaryTextColor,
      11
    );
  }

  page.drawRectangle({
    x: signatureBoxX,
    y: signatureBoxTop - signatureBoxHeight,
    width: signatureBoxWidth,
    height: signatureBoxHeight,
    borderColor: accent,
    borderWidth: 1,
    color: signatureFill
  });

  if (signatureDataUrl) {
    const signatureBytes = Buffer.from(signatureDataUrl.split(",")[1] ?? "", "base64");
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    const scale = Math.min(
      (signatureBoxWidth - 20) / signatureImage.width,
      (signatureBoxHeight - 16) / signatureImage.height
    );
    const scaledWidth = signatureImage.width * scale;
    const scaledHeight = signatureImage.height * scale;

    page.drawImage(signatureImage, {
      x: signatureBoxX + (signatureBoxWidth - scaledWidth) / 2,
      y: signatureBoxTop - signatureBoxHeight + (signatureBoxHeight - scaledHeight) / 2,
      width: scaledWidth,
      height: scaledHeight
    });
  } else {
    page.drawLine({
      start: { x: signatureBoxX + 18, y: signatureBottom + 28 },
      end: { x: signatureBoxX + signatureBoxWidth - 18, y: signatureBottom + 28 },
      thickness: 1,
      color: borderColor
    });
  }

  if (signedAt) {
    drawDigitalSignatureFooter(page, signatureBoxX + 2, footerY, boldFont, signedAt);
    const formatted = formatSealTimestamp(signedAt);
    drawRightAlignedText(page, `${formatted.date} ${formatted.time}`, regularFont, 8.5, x + width - 18, footerY + 2, secondaryTextColor);
  }
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
  const academyLogoBytes = await getAcademyLogoBytes();
  const employeeBadgeBytes = await getEmployeeBadgeBytes(template.team);
  const trainerBadgeBytes = await getInstructorBadgeBytes();
  let y = pageSize[1] - margin;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageSize[0],
    height: pageSize[1],
    color: pageBackgroundFill
  });

  page.drawRectangle({
    x: margin,
    y: y + 4,
    width: 112,
    height: 18,
    color: primaryColor
  });

  page.drawText("OJT SIGNOFF", {
    x: margin + 12,
    y: y + 10,
    font: boldFont,
    size: 8.5,
    color: whiteColor
  });

  page.drawText("Training completion record", {
    x: margin,
    y: y - 18,
    font: boldFont,
    size: 22,
    color: pageTextColor
  });

  page.drawText("Learner, trainer and manager signoff", {
    x: margin,
    y: y - 34,
    font: regularFont,
    size: 9.5,
    color: secondaryTextColor
  });

  if (academyLogoBytes) {
    const academyLogoImage = await pdfDoc.embedPng(academyLogoBytes);
    const brandScale = Math.min(134 / academyLogoImage.width, 24 / academyLogoImage.height);
    const brandWidth = academyLogoImage.width * brandScale;
    const brandHeight = academyLogoImage.height * brandScale;

    page.drawImage(academyLogoImage, {
      x: contentRight - brandWidth,
      y: y - 16,
      width: brandWidth,
      height: brandHeight
    });
  }

  drawHorizontalRule(page, margin, y - 46, contentWidth, primaryColor, 1.2);

  y -= 64;

  const moduleCardHeight = 86;
  drawCard(page, margin, y, contentWidth, moduleCardHeight, surfaceAltFill);
  page.drawRectangle({
    x: margin,
    y: y - moduleCardHeight,
    width: 10,
    height: moduleCardHeight,
    color: primaryColor
  });
  drawCardLabel(page, "Completed Module", boldFont, margin + 22, y - 18);
  drawLines(
    page,
    wrapText(template.title, boldFont, 18, contentWidth - 34).slice(0, 3),
    boldFont,
    18,
    margin + 22,
    y - 46,
    pageTextColor,
    20
  );

  y -= moduleCardHeight + 16;

  const infoCardGap = 16;
  const infoCardWidth = (contentWidth - infoCardGap) / 2;
  const infoCardHeight = 68;
  const trainerName = submission.trainerName.trim() || "Trainer pending";
  const trainerEmail = submission.trainerEmail.trim() || "";

  drawInfoCard(page, {
    x: margin,
    top: y,
    width: infoCardWidth,
    height: infoCardHeight,
    label: "Completed By",
    title: submission.employeeName,
    subtitle: submission.employeeEmail,
    boldFont,
    regularFont
  });

  drawInfoCard(page, {
    x: margin + infoCardWidth + infoCardGap,
    top: y,
    width: infoCardWidth,
    height: infoCardHeight,
    label: "Trainer",
    title: trainerName,
    subtitle: trainerEmail,
    boldFont,
    regularFont
  });

  y -= infoCardHeight + 18;

  const statementHeight = 68;
  drawCard(page, margin, y, contentWidth, statementHeight, subtleFill);
  page.drawRectangle({
    x: margin,
    y: y - statementHeight,
    width: 10,
    height: statementHeight,
    color: accentColor
  });
  drawCardLabel(page, "Qualification Statement", boldFont, margin + 22, y - 18);
  drawLines(
    page,
    wrapText(
      "The learner has attended and acquired knowledge and skills to advance to the next phase of qualification.",
      regularFont,
      10.5,
      contentWidth - 34
    ),
    regularFont,
    10.5,
    margin + 22,
    y - 42,
    secondaryTextColor,
    14
  );

  y -= statementHeight + 16;

  page.drawText("Signatures", {
    x: margin,
    y,
    font: boldFont,
    size: 12,
    color: pageTextColor
  });

  drawHorizontalRule(page, margin + 92, y + 6, contentWidth - 92, borderColor, 1);

  y -= 14;

  const signatureGap = 10;
  const signatureCardHeight = 112;

  await drawSignatureCard(pdfDoc, page, {
    x: margin,
    top: y,
    width: contentWidth,
    height: signatureCardHeight,
    label: "Employee",
    signer: submission.employeeName,
    email: submission.employeeEmail,
    signatureDataUrl: submission.employeeSignatureDataUrl,
    signedAt: submission.employeeSignatureDataUrl ? submission.createdAt : undefined,
    badgeBytes: employeeBadgeBytes,
    boldFont,
    regularFont
  });

  y -= signatureCardHeight + signatureGap;

  await drawSignatureCard(pdfDoc, page, {
    x: margin,
    top: y,
    width: contentWidth,
    height: signatureCardHeight,
    label: "Trainer",
    signer: trainerName,
    email: trainerEmail,
    signatureDataUrl: submission.trainerSignatureDataUrl,
    signedAt: submission.trainerSignatureDataUrl ? submission.createdAt : undefined,
    badgeBytes: trainerBadgeBytes,
    boldFont,
    regularFont
  });

  y -= signatureCardHeight + signatureGap;

  await drawSignatureCard(pdfDoc, page, {
    x: margin,
    top: y,
    width: contentWidth,
    height: signatureCardHeight,
    label: "Training Manager",
    signer: "Manual sign-off",
    placeholderText: "Open field for Training Manager signature",
    boldFont,
    regularFont
  });

  drawDocumentFooter(page, boldFont, regularFont);

  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await pdfDoc.save());
}

export async function combineSubmissionPdfs(pdfPaths: string[]): Promise<Uint8Array> {
  const mergedDocument = await PDFDocument.create();

  for (const pdfPath of pdfPaths) {
    const pdfBytes = await readFile(pdfPath);
    const sourceDocument = await PDFDocument.load(pdfBytes);
    const pageIndices = sourceDocument.getPageIndices();
    const copiedPages = await mergedDocument.copyPages(sourceDocument, pageIndices);

    for (const page of copiedPages) {
      mergedDocument.addPage(page);
    }
  }

  return mergedDocument.save();
}
