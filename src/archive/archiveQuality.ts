import { localized, uiText } from "../i18n/index.ts";
import type { ArchiveIdentityEvidence, ArchiveTitleSource } from "./archiveTypes.ts";
import type { ArchiveSessionStateInput } from "./archiveSessionState.ts";

export type ArchiveNoticeKind = "quality" | "metadata";
export type ArchiveNoticeTone = "warning" | "info";

export interface ArchiveRecordNotice {
  kind: ArchiveNoticeKind;
  code: string;
  label: string;
  message: string;
  tone: ArchiveNoticeTone;
}

/** 平台开播时间按秒提供，允许少量传输和时间精度误差，但不掩盖真实晚连接。 */
export const ARCHIVE_START_TIME_TOLERANCE_MS = 5_000;

const QUALITY_REASON_LABELS: Record<string, string> = localized(() => ({
  "previous-runtime": uiText("archiveQuality.QUALITY_REASON_LABELS.previousruntime"),
  "connection-error": uiText("archiveQuality.QUALITY_REASON_LABELS.connectionerror"),
  "connection-closed": uiText("archiveQuality.QUALITY_REASON_LABELS.connectionclosed"),
  "manual-disconnect": uiText("archiveQuality.QUALITY_REASON_LABELS.manualdisconnect"),
  "connection-switched": uiText("archiveQuality.QUALITY_REASON_LABELS.connectionswitched"),
  "live-identity-changed": uiText("archiveQuality.QUALITY_REASON_LABELS.liveidentitychanged"),
  "live-start-not-captured": uiText("archiveQuality.QUALITY_REASON_LABELS.livestartnotcaptured"),
  "start-time-unknown": uiText("archiveQuality.QUALITY_REASON_LABELS.starttimeunknown"),
  "disconnect-before-end": uiText("archiveQuality.QUALITY_REASON_LABELS.disconnectbeforeend"),
}));

export function formatArchiveQualityReason(reason: string | null | undefined): string {
  if (!reason) return "";
  return QUALITY_REASON_LABELS[reason] ?? uiText("archiveQuality.formatArchiveQualityReason");
}

const INTERRUPTION_REASONS = new Set([
  "connection-error", "connection-closed", "connection-switched", "manual-disconnect",
  "app-exit", "disconnect-before-end", "recovered-after-interruption", "live-identity-changed",
]);

export function getArchiveRecordNotices(session: Partial<ArchiveSessionStateInput> & {
  titleSource?: ArchiveTitleSource;
  identityEvidence?: ArchiveIdentityEvidence | null;
}): ArchiveRecordNotice[] {
  const notices: ArchiveRecordNotice[] = [];
  const reasons = [...new Set(session.qualityReasons ?? [])]
    .filter(reason => reason === "live-start-not-captured" || INTERRUPTION_REASONS.has(reason)).sort();
  if (session.quality === "incomplete" && reasons.length > 0) {
    const messages: string[] = [];
    if (reasons.includes("live-start-not-captured")) messages.push(uiText("archiveQuality.getArchiveRecordNotices"));
    if (reasons.some(reason => INTERRUPTION_REASONS.has(reason))) {
      messages.push(session.recordingStatus === "recording" ? uiText("archiveQuality.getArchiveRecordNotices2") : uiText("archiveQuality.getArchiveRecordNotices3"));
    }
    notices.push({
      kind: "quality",
      code: `quality:${reasons.join(",")}`,
      label: uiText("archiveQuality.getArchiveRecordNotices.label"),
      message: messages.join(""),
      tone: "warning",
    });
  }
  if (session.recordingStatus === "stopped" && session.status !== "ended") {
    notices.push({
      kind: "metadata", code: `recording-stopped:${session.stopReason ?? "unknown"}`,
      label: uiText("archiveQuality.getArchiveRecordNotices.label2"), message: uiText("archiveQuality.getArchiveRecordNotices.message"), tone: "info",
    });
  }
  if (session.titleSource === "time") {
    notices.push({
      kind: "metadata",
      code: "title-fallback",
      label: uiText("archiveQuality.getArchiveRecordNotices.label3"),
      message: uiText("archiveQuality.getArchiveRecordNotices.message2"),
      tone: "info",
    });
  }
  if (session.identityEvidence !== undefined && session.identityEvidence !== "source-live-time") {
    notices.push({
      kind: "metadata",
      code: "identity-unavailable",
      label: uiText("archiveQuality.getArchiveRecordNotices.label4"),
      message: uiText("archiveQuality.getArchiveRecordNotices.message3"),
      tone: "info",
    });
  }
  return notices;
}
