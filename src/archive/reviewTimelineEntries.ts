import type { ArchiveQuality, ArchiveRecordingStatus, ArchiveSessionStatus } from "./archiveTypes.ts";
import type { ArchiveProjectedEvent } from "./archiveProjection.ts";

export type ReviewTimelineEntry =
  | {
    kind: "boundary";
    key: string;
    sessionId: string;
    title: string | null;
    startedAt: number | null;
    quality: ArchiveQuality | null;
    qualityReason: string | null;
    status: ArchiveSessionStatus | null;
    recordingStatus: ArchiveRecordingStatus | undefined;
    stopReason: string | null;
    qualityReasons: string[];
    hitCount: number;
  }
  | {
    kind: "event";
    key: string;
    row: ArchiveProjectedEvent;
  };

export function createReviewTimelineEntries(rows: readonly ArchiveProjectedEvent[], ownerHistory: boolean, collapsedSessions: ReadonlySet<string>): ReviewTimelineEntry[] {
  if (!ownerHistory) {
    return rows.map((row) => ({ kind: "event", key: row.eventKey, row }));
  }
  const entries: ReviewTimelineEntry[] = [];
  let previousSessionId: string | null = null;
  const hitCounts = new Map<string, number>();
  for (const row of rows) hitCounts.set(row.sessionId, (hitCounts.get(row.sessionId) ?? 0) + 1);
  for (const row of rows) {
    if (row.sessionId !== previousSessionId) {
      entries.push({
        kind: "boundary",
        key: `session-boundary:${row.eventKey}`,
        sessionId: row.sessionId,
        title: row.record.sessionTitle ?? null,
        startedAt: row.record.sessionStartedAt ?? null,
        quality: row.record.sessionQuality ?? null,
        qualityReason: row.record.sessionQualityReason ?? null,
        status: row.record.sessionStatus ?? null,
        recordingStatus: row.record.sessionRecordingStatus,
        stopReason: row.record.sessionStopReason ?? null,
        qualityReasons: row.record.sessionQualityReasons ?? [],
        hitCount: hitCounts.get(row.sessionId) ?? 0,
      });
      previousSessionId = row.sessionId;
    }
    if (!collapsedSessions.has(row.sessionId)) entries.push({ kind: "event", key: row.eventKey, row });
  }
  return entries;
}
