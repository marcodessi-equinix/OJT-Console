import { join } from "node:path";
import { submissionsRoot } from "../config/paths";
import { appDatabase } from "../db/database";
import { getSubmissionById, listSubmissions } from "../repositories/submissionRepository";
import { getTemplateById } from "../repositories/templateRepository";
import { generateSubmissionPdf } from "../services/pdfService";

async function main(): Promise<void> {
  await appDatabase.initialize();

  const latestSubmissionId = listSubmissions()[0]?.id;
  if (!latestSubmissionId) {
    throw new Error("No stored submissions found. Create one completion first, then rerun the preview generator.");
  }

  const submission = getSubmissionById(latestSubmissionId);
  if (!submission) {
    throw new Error("Latest submission could not be loaded.");
  }

  const template = getTemplateById(submission.templateId);
  if (!template) {
    throw new Error("Template for the latest submission could not be loaded.");
  }

  const previewPath = join(submissionsRoot, "preview-ojt-completion.pdf");
  await generateSubmissionPdf(template, submission, previewPath);
  console.log(previewPath);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});