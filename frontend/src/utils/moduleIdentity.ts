import type { SubmissionListItem, TemplateLanguage, TrainingTemplateSummary } from "../types/training";

const moduleLanguageSuffixPattern = /\s*(?:[-_–—]\s*|\(\s*|\[\s*)?(english|german|englisch|deutsch)(?:\s*[)\]])?\s*$/i;

type ModuleSubmissionLike = Pick<SubmissionListItem, "templateTitle" | "sendStatus" | "createdAt" | "completedAt" | "sentAt">;

export function normalizeModuleTitle(title: string): string {
  return title.replace(moduleLanguageSuffixPattern, "").trim();
}

export function getModuleKey(title: string): string {
  return normalizeModuleTitle(title).toLocaleLowerCase();
}

export function countDistinctModulesByTitle(titles: Iterable<string>): number {
  const keys = new Set<string>();

  for (const title of titles) {
    keys.add(getModuleKey(title));
  }

  return keys.size;
}

export function countDistinctTemplateModules(templates: Iterable<Pick<TrainingTemplateSummary, "title">>): number {
  const keys = new Set<string>();

  for (const template of templates) {
    keys.add(getModuleKey(template.title));
  }

  return keys.size;
}

export function dedupeTemplatesByModule<T extends { title: string; language?: TemplateLanguage }>(
  templates: T[],
  preferredLanguage?: TemplateLanguage
): T[] {
  const groups = new Map<string, T[]>();

  for (const template of templates) {
    const key = getModuleKey(template.title);
    const items = groups.get(key) ?? [];
    items.push(template);
    groups.set(key, items);
  }

  return Array.from(groups.values()).map((group) => {
    if (!preferredLanguage) {
      return group[0] as T;
    }

    return group.find((template) => template.language === preferredLanguage) ?? group[0] as T;
  });
}

export function getSubmissionTimestamp(submission: Pick<SubmissionListItem, "sentAt" | "completedAt" | "createdAt">): number {
  return new Date(submission.sentAt ?? submission.completedAt ?? submission.createdAt).getTime();
}

function submissionStatusPriority(status: SubmissionListItem["sendStatus"]): number {
  switch (status) {
    case "sent":
      return 3;
    case "completed":
      return 2;
    case "send_failed":
      return 1;
    default:
      return 0;
  }
}

export function getRepresentativeSubmission<T extends ModuleSubmissionLike>(submissions: T[]): T {
  return submissions.slice().sort((left, right) => {
    const statusDelta = submissionStatusPriority(right.sendStatus) - submissionStatusPriority(left.sendStatus);
    if (statusDelta !== 0) {
      return statusDelta;
    }

    return getSubmissionTimestamp(right) - getSubmissionTimestamp(left);
  })[0] as T;
}

export function getLogicalSubmissionRepresentatives<T extends ModuleSubmissionLike>(submissions: T[]): T[] {
  const groups = new Map<string, T[]>();

  for (const submission of submissions) {
    const key = getModuleKey(submission.templateTitle);
    const items = groups.get(key) ?? [];
    items.push(submission);
    groups.set(key, items);
  }

  return Array.from(groups.values()).map((items) => getRepresentativeSubmission(items));
}