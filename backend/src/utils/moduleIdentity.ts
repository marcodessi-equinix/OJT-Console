const moduleLanguageSuffixPattern = /\s*(?:[-_–—]\s*|\(\s*|\[\s*)?(english|german|englisch|deutsch)(?:\s*[)\]])?\s*$/i;

export function normalizeModuleTitle(title: string): string {
  return title.replace(moduleLanguageSuffixPattern, "").trim();
}

export function getModuleKey(title: string): string {
  return normalizeModuleTitle(title).toLocaleLowerCase();
}