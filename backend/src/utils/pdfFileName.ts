function sanitizeFileNamePart(value: string): string {
  const sanitized = value
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");

  return sanitized || "ojt-record";
}

export function createSubmissionPdfDisplayName(input: { employeeName: string; templateTitle: string }): string {
  return `${sanitizeFileNamePart(input.employeeName)}-${sanitizeFileNamePart(input.templateTitle)}.pdf`;
}

export function createSubmissionPdfStorageName(
  input: { employeeName: string; templateTitle: string },
  submissionId: string
): string {
  return `${sanitizeFileNamePart(input.employeeName)}-${sanitizeFileNamePart(input.templateTitle)}-${submissionId}.pdf`;
}