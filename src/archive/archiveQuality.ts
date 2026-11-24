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

const QUALITY_REASON_LABELS: Record<string, string> = {
  "previous-runtime": "程序上次没有正常关闭，这场直播没有收到下播消息。",
  "connection-error": "网络连接出错，没有收到下播消息。",
  "connection-closed": "连接已关闭，记录到断开为止。",
  "manual-disconnect": "你已断开连接，记录到断开为止。",
  "connection-switched": "你切换了直播间，当前记录到切换为止。",
  "live-identity-changed": "检测到新的直播场次，已分开记录。",
  "live-start-not-captured": "开始记录时直播已经开始。",
  "start-time-unknown": "没有获取到准确的开播时间。",
  "disconnect-before-end": "连接断开时没有收到下播消息。",
};

export function formatArchiveQualityReason(reason: string | null | undefined): string {
  if (!reason) return "";
  return QUALITY_REASON_LABELS[reason] ?? "记录原因暂时无法识别，请查看诊断日志。";
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
    if (reasons.includes("live-start-not-captured")) messages.push("开始记录时直播已经开始。");
    if (reasons.some(reason => INTERRUPTION_REASONS.has(reason))) {
      messages.push(session.recordingStatus === "recording" ? "记录曾中断，已恢复记录。" : "记录曾中断。");
    }
    notices.push({
      kind: "quality",
      code: `quality:${reasons.join(",")}`,
      label: "记录不完整",
      message: messages.join(""),
      tone: "warning",
    });
  }
  if (session.recordingStatus === "stopped" && session.status !== "ended") {
    notices.push({
      kind: "metadata", code: `recording-stopped:${session.stopReason ?? "unknown"}`,
      label: "记录状态", message: "已停止记录，未确认直播是否结束。", tone: "info",
    });
  }
  if (session.titleSource === "time") {
    notices.push({
      kind: "metadata",
      code: "title-fallback",
      label: "标题",
      message: "没有获取到直播标题，已使用时间命名。",
      tone: "info",
    });
  }
  if (session.identityEvidence !== undefined && session.identityEvidence !== "source-live-time") {
    notices.push({
      kind: "metadata",
      code: "identity-unavailable",
      label: "场次身份",
      message: "没有获取到开播时间，无法确认是否为同一场。",
      tone: "info",
    });
  }
  return notices;
}
