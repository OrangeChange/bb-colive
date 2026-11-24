import { uiText } from "../i18n/index.ts";
import type { ArchiveQuality, ArchiveRecordingStatus, ArchiveSessionStatus, ArchiveSessionSort, ArchiveSortDirection, ReviewOwnerEventQuery } from "./archiveTypes.ts";

export function formatArchiveSortDirection(direction: ArchiveSortDirection, field: ArchiveSessionSort | ReviewOwnerEventQuery["sort"]): string {
  const time = field === "startedAt" || field === "latestMatch" || field === "sessionStartedAt";
  return direction === "asc" ? (time ? uiText("archiveDisplay.formatArchiveSortDirection") : uiText("archiveDisplay.formatArchiveSortDirection2")) : (time ? uiText("archiveDisplay.formatArchiveSortDirection3") : uiText("archiveDisplay.formatArchiveSortDirection4"));
}

export function formatArchiveSessionStatus(status: ArchiveSessionStatus | null | undefined): string {
  return status === "active" ? uiText("archiveDisplay.formatArchiveSessionStatus") : status === "ended" ? uiText("archiveDisplay.formatArchiveSessionStatus2") : uiText("archiveDisplay.formatArchiveSessionStatus3");
}

export function formatArchiveRecordingStatus(status: ArchiveRecordingStatus | null | undefined): string {
  return status === "recording" ? uiText("archiveDisplay.formatArchiveRecordingStatus") : status === "reconnecting" ? uiText("archiveDisplay.formatArchiveRecordingStatus2") : uiText("archiveDisplay.formatArchiveRecordingStatus3");
}

export function formatArchiveQuality(quality: ArchiveQuality | null | undefined): string {
  return quality === "complete" ? uiText("archiveDisplay.formatArchiveQuality") : quality === "incomplete" ? uiText("archiveDisplay.formatArchiveQuality2") : uiText("archiveDisplay.formatArchiveQuality3");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 回看界面统一使用本地时间，并明确显示到分钟。 */
export function formatArchiveDateTime(timestamp: number | null | undefined): string {
  if (!Number.isFinite(timestamp)) return uiText("archiveDisplay.formatArchiveDateTime");
  const date = new Date(timestamp as number);
  if (!Number.isFinite(date.getTime())) return uiText("archiveDisplay.formatArchiveDateTime");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 没有结束时间不等于进行中；只有 active 才能显示进行中。 */
export function formatArchiveSessionDuration(
  durationMs: number | null,
  status: ArchiveSessionStatus,
): string {
  if (durationMs === null) return status === "active" ? uiText("archiveDisplay.formatArchiveSessionDuration") : uiText("archiveDisplay.formatArchiveSessionDuration2");
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? uiText("archiveDisplay.formatArchiveSessionDuration3", { hours: hours, minutes: minutes }) : uiText("archiveDisplay.formatArchiveSessionDuration4", { minutes: minutes });
}
