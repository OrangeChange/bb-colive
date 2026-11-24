import { zipSync } from "fflate";
import { formatArchiveSessionStatus, formatArchiveRecordingStatus, formatArchiveQuality } from "./archiveDisplay.ts";
import type {
  ArchiveDataExportBundle,
  ArchiveDataExportCategory,
  ArchiveDataExportRow,
  ArchiveDataExportSummaryBlock,
} from "./archiveDataExportTypes.ts";

const COMMON_HEADERS = ["场次ID", "事件时间", "用户UID", "用户名", "粉丝牌", "荣耀等级", "大航海身份"] as const;

export const ARCHIVE_DATA_EXPORT_HEADERS: Record<ArchiveDataExportCategory, readonly string[]> = {
  danmaku: [...COMMON_HEADERS, "内容"],
  interaction: [...COMMON_HEADERS, "内容"],
  gift: [...COMMON_HEADERS, "礼物类型", "礼物名称", "数量", "礼物价值", "实际支付金额", "盲盒名称"],
  superchat: [...COMMON_HEADERS, "内容", "金额"],
  guard: [...COMMON_HEADERS, "动作", "时长", "金额"],
};

const CATEGORY_FILENAMES: Record<ArchiveDataExportCategory, string> = {
  danmaku: "danmaku.csv",
  interaction: "interaction.csv",
  gift: "gift.csv",
  superchat: "superchat.csv",
  guard: "guard.csv",
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatSummaryTime(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined) return "";
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatSummaryDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined || !Number.isFinite(durationMs)) return "";
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function csvCell(value: unknown): string {
  const text = cellText(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowValues(headers: readonly string[], row: ArchiveDataExportRow): unknown[] {
  return headers.map((header) => row[header]);
}

export function serializeArchiveDataCsv(
  category: ArchiveDataExportCategory,
  rows: readonly ArchiveDataExportRow[],
): Uint8Array {
  const headers = ARCHIVE_DATA_EXPORT_HEADERS[category];
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => rowValues(headers, row).map(csvCell).join(",")),
  ];
  return new TextEncoder().encode(`\uFEFF${lines.join("\r\n")}\r\n`);
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number): string {
  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function xlsxCell(value: unknown, ref: string): string {
  if (value === null || value === undefined || value === "") return `<c r="${ref}"/>`;
  if (typeof value === "number" && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  const text = xmlEscape(cellText(value));
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
}

function worksheetXml(rows: readonly (readonly unknown[])[]): string {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => xlsxCell(value, `${columnName(columnIndex)}${rowIndex + 1}`)).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function summaryRows(blocks: readonly ArchiveDataExportSummaryBlock[]): (readonly unknown[])[] {
  const rows: (readonly unknown[])[] = [];
  const columns = ["统计项", "弹幕", "互动", "普通礼物", "盲盒", "红包", "醒目留言", "舰长", "提督", "总督"];
  const categories = ["danmaku", "interaction", "normalGift", "blindGift", "redPocket", "superchat", "captain", "admiral", "viceroy"] as const;
  for (const block of blocks) {
    const session = block.session;
    rows.push(["场次ID", "主播", "标题", "开始时间", "结束时间", "时长", "直播状态", "记录状态", "记录质量", "导出事件数"]);
    rows.push([
      session.sessionId,
      session.ownerName?.trim() || session.ownerId,
      session.title ?? "",
      formatSummaryTime(session.startedAt),
      formatSummaryTime(session.endedAt),
      formatSummaryDuration(session.durationMs),
      formatArchiveSessionStatus(session.status),
      formatArchiveRecordingStatus(session.recordingStatus),
      formatArchiveQuality(session.quality),
      block.exportedEventCount,
    ]);
    rows.push([]);
    rows.push(columns);
    for (const statName of ["事件数", "独立用户数", "数量", "礼物价值", "金额"]) {
      const values = categories.map((key) => {
        const stat = block.stats[key];
        if (statName === "事件数") return stat.eventCount;
        if (statName === "独立用户数") return stat.uniqueUserCount;
        if (statName === "数量") return stat.quantity;
        if (statName === "礼物价值") return stat.value;
        return stat.amount;
      });
      rows.push([statName, ...values]);
    }
    rows.push([]);
  }
  return rows;
}

function workbookXml(): string {
  const sheets = ["summary", "danmaku", "interaction", "gift", "superchat", "guard"]
    .map((name, index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelationships(): string {
  const sheets = [1, 2, 3, 4, 5, 6].map((index) => `<Relationship Id="rId${index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index}.xml"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function contentTypes(): string {
  const overrides = ["workbook", "worksheets/sheet1", "worksheets/sheet2", "worksheets/sheet3", "worksheets/sheet4", "worksheets/sheet5", "worksheets/sheet6"]
    .map((part) => `<Override PartName="/xl/${part}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.${part === "workbook" ? "sheet.main+xml" : "worksheet+xml"}"/>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
}

export function serializeArchiveDataExcel(bundle: ArchiveDataExportBundle): Uint8Array {
  const sheetRows: (readonly unknown[])[][] = [summaryRows(bundle.summary)];
  for (const category of ["danmaku", "interaction", "gift", "superchat", "guard"] as const) {
    const headers = ARCHIVE_DATA_EXPORT_HEADERS[category];
    sheetRows.push([headers, ...bundle.rowsByCategory[category].map((row) => rowValues(headers, row))]);
  }
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": new TextEncoder().encode(contentTypes()),
    "_rels/.rels": new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": new TextEncoder().encode(workbookXml()),
    "xl/_rels/workbook.xml.rels": new TextEncoder().encode(workbookRelationships()),
    "xl/styles.xml": new TextEncoder().encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>`),
  };
  sheetRows.forEach((rows, index) => {
    if (rows.length > 1_048_576) throw new Error(`Excel 工作表 ${index + 1} 超过行数上限，请缩小导出范围或选择 CSV/AI JSON`);
    files[`xl/worksheets/sheet${index + 1}.xml`] = new TextEncoder().encode(worksheetXml(rows));
  });
  return zipSync(files, { level: 6 });
}

export function serializeArchiveDataAiJson(bundle: ArchiveDataExportBundle): Uint8Array {
  const events = bundle.items.map(({ category, row }) => ({ category, ...row }));
  const summaryBySession = new Map(bundle.summary.map((block) => [block.session.sessionId, block]));
  const projectSession = (session: ArchiveDataExportBundle["sessions"][number]) => {
    const summary = summaryBySession.get(session.sessionId);
    return {
      sessionId: session.sessionId,
      ownerId: session.ownerId,
      ownerName: session.ownerName ?? null,
      roomId: session.roomId,
      title: session.title ?? "",
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      status: session.status,
      quality: session.quality,
      qualityReason: session.qualityReason ?? null,
      recordingStatus: session.recordingStatus ?? "stopped",
      stopReason: session.stopReason ?? null,
      qualityReasons: session.qualityReasons ?? [],
      statusLabel: formatArchiveSessionStatus(session.status),
      recordingStatusLabel: formatArchiveRecordingStatus(session.recordingStatus),
      qualityLabel: formatArchiveQuality(session.quality),
      durationMs: session.durationMs,
      exportedEventCount: summary?.exportedEventCount ?? 0,
    };
  };
  const scope = { ...bundle.scope, generatedAt: new Date().toISOString() };
  const sessions = bundle.sessions.map(projectSession);
  const summary = bundle.summary.map((block) => ({
    ...block,
    session: projectSession(block.session),
  }));
  return new TextEncoder().encode(JSON.stringify({ scope, sessions, summary, events }, null, 2));
}

export function zipArchiveDataCsv(files: Record<string, Uint8Array>): Uint8Array {
  return zipSync(files, { level: 6 });
}

export function archiveCsvFileName(category: ArchiveDataExportCategory): string {
  return CATEGORY_FILENAMES[category];
}
