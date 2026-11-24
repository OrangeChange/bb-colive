import { uiText } from "../i18n/index.ts";
import type { SessionState } from './recoveryContract.ts';
import type { RecoverySessionMetadata } from './recoveryArchiveSink.ts';

export function recoveryTimestamp(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : /^\d+$/.test(value) ? Number(value) : Date.parse(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && Number.isFinite(new Date(parsed).getTime()) ? parsed : null;
}
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
export function recoverySessionMetadata(row: SessionState): RecoverySessionMetadata {
  const raw = object(row.broadcaster_snapshot), room = object(raw.room_info), anchor = object(raw.anchor_info);
  const base = object(anchor.base_info ?? raw.base ?? raw);
  const text = (value: unknown) => value === null || value === undefined || value === '' ? null : String(value);
  const captureStartedAt = recoveryTimestamp(row.capture_started_at);
  if (captureStartedAt === null) throw new Error(uiText("recoverySessionMetadata.recoverySessionMetadata"));
  return { serverSessionId: row.server_session_id, title: row.title, captureStartedAt,
    sourceLiveStartedAt: recoveryTimestamp(row.source_live_started_at), endedAt: recoveryTimestamp(row.ended_at),
    liveStatus: row.live_status, quality: row.quality, qualityReasons: [...row.quality_reasons],
    broadcaster: { uid: text(raw.uid ?? raw.mid ?? room.uid), name: text(base.uname ?? base.name), face: text(base.face) },
    state: structuredClone(row) };
}
