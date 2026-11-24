function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isArchiveResourceUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

export function collectArchiveResourceUrls(
  value: unknown,
  urls = new Set<string>(),
): Set<string> {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (isArchiveResourceUrl(trimmed)) {
      urls.add(trimmed);
      return urls;
    }
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        collectArchiveResourceUrls(JSON.parse(trimmed) as unknown, urls);
      } catch {
        // Raw text is allowed in event payload fields; it is not a resource manifest.
      }
    }
    return urls;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectArchiveResourceUrls(item, urls));
    return urls;
  }
  if (isRecord(value)) {
    Object.values(value).forEach((item) => collectArchiveResourceUrls(item, urls));
  }
  return urls;
}

export function archiveResourceUrls(value: unknown): string[] {
  return [...collectArchiveResourceUrls(value)].sort();
}
