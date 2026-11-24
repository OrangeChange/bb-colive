const EXPORT_ID_STORAGE_KEY = "bb-colive:diagnostic-export-id";
const EXPORT_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const EXPORT_ID_PATTERN = /^[A-Z2-9]{5}$/;

type ExportIdStorage = Pick<Storage, "getItem" | "setItem">;

function getBrowserStorage(): ExportIdStorage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function generateDiagnosticExportId(random: () => number = Math.random): string {
  let result = "";
  for (let index = 0; index < 5; index += 1) {
    const sampled = random();
    const value = Number.isFinite(sampled) ? sampled : 0;
    const offset = Math.min(EXPORT_ID_ALPHABET.length - 1, Math.max(0, Math.floor(value * EXPORT_ID_ALPHABET.length)));
    result += EXPORT_ID_ALPHABET[offset];
  }
  return result;
}

/** 获取本机固定的导出短标识；不读取系统用户名、主播名或房间号。 */
export function getDiagnosticExportId(
  storage: ExportIdStorage | undefined = getBrowserStorage(),
  random: () => number = Math.random,
): string {
  try {
    const stored = storage?.getItem(EXPORT_ID_STORAGE_KEY);
    if (stored && EXPORT_ID_PATTERN.test(stored)) return stored;
  } catch {
    // 存储不可用时退化为本次运行生成，不影响导出。
  }
  const generated = generateDiagnosticExportId(random);
  try {
    storage?.setItem(EXPORT_ID_STORAGE_KEY, generated);
  } catch {
    // 存储不可用时只失去跨启动稳定性，不影响导出。
  }
  return generated;
}

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDiagnosticExportTimestamp(date: Date): string {
  return `${twoDigits(date.getFullYear() % 100)}${twoDigits(date.getMonth() + 1)}${twoDigits(date.getDate())}-${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}`;
}

export function buildDiagnosticExportFileName(
  mode: "24h" | "full",
  exportId: string,
  date: Date = new Date(),
): string {
  const safeId = EXPORT_ID_PATTERN.test(exportId) ? exportId : "XXXXX";
  return `bb-colive-${mode === "full" ? "full" : "24h"}-${safeId}-${formatDiagnosticExportTimestamp(date)}.zip`;
}
