import type { ArchiveQuality, ArchiveRecordingStatus, ArchiveSessionStatus, ArchiveSessionSort, ArchiveSortDirection, ReviewOwnerEventQuery } from "./archiveTypes.ts";

export function formatArchiveSortDirection(direction: ArchiveSortDirection, field: ArchiveSessionSort | ReviewOwnerEventQuery["sort"]): string {
  const time = field === "startedAt" || field === "latestMatch" || field === "sessionStartedAt";
  return direction === "asc" ? (time ? "顺序排列" : "升序排列") : (time ? "倒序排列" : "降序排列");
}

export function formatArchiveSessionStatus(status: ArchiveSessionStatus | null | undefined): string {
  return status === "active" ? "进行中" : status === "ended" ? "已结束" : "状态未知";
}

export function formatArchiveRecordingStatus(status: ArchiveRecordingStatus | null | undefined): string {
  return status === "recording" ? "记录中" : status === "reconnecting" ? "重连中" : "已停止";
}

export function formatArchiveQuality(quality: ArchiveQuality | null | undefined): string {
  return quality === "complete" ? "完整" : quality === "incomplete" ? "不完整" : "待确认";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 回看界面统一使用本地时间，并明确显示到分钟。 */
export function formatArchiveDateTime(timestamp: number | null | undefined): string {
  if (!Number.isFinite(timestamp)) return "时间未知";
  const date = new Date(timestamp as number);
  if (!Number.isFinite(date.getTime())) return "时间未知";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 没有结束时间不等于进行中；只有 active 才能显示进行中。 */
export function formatArchiveSessionDuration(
  durationMs: number | null,
  status: ArchiveSessionStatus,
): string {
  if (durationMs === null) return status === "active" ? "进行中" : "时长未知";
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}小时${minutes}分` : `${minutes}分钟`;
}
