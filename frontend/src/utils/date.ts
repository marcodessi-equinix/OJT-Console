type DateInput = string | null | undefined;

function parseDate(value: DateInput): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(value: DateInput, locale: string, options: Intl.DateTimeFormatOptions, fallback = "-"): string {
  const parsed = parseDate(value);
  if (!parsed) {
    return fallback;
  }

  return new Intl.DateTimeFormat(locale, options).format(parsed);
}

export function getDateTimestamp(value: DateInput): number {
  return parseDate(value)?.getTime() ?? 0;
}