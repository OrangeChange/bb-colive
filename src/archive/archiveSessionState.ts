import type { ArchiveQuality, ArchiveRecordingStatus, ArchiveSessionStatus } from './archiveTypes.ts';
import { ARCHIVE_START_TIME_TOLERANCE_MS } from './archiveQuality.ts';

export interface ArchiveSessionStateInput {
  status: ArchiveSessionStatus;
  quality: ArchiveQuality;
  qualityReason?: string | null;
  recordingStatus?: ArchiveRecordingStatus;
  stopReason?: string | null;
  qualityReasons?: string[];
  startedAt?: number;
  sourceLiveStartedAt?: number | null;
}

export const ARCHIVE_LEGACY_LATE_START_SQL =
  `source_live_started_at IS NOT NULL AND source_live_started_at < started_at - ${ARCHIVE_START_TIME_TOLERANCE_MS}`;

export function hasArchiveLateStartEvidence(input: Pick<ArchiveSessionStateInput, 'startedAt' | 'sourceLiveStartedAt'>): boolean {
  return input.startedAt !== undefined && input.sourceLiveStartedAt != null
    && input.sourceLiveStartedAt < input.startedAt - ARCHIVE_START_TIME_TOLERANCE_MS;
}

export const ARCHIVE_LEGACY_GAP_REASONS = [
  'live-start-not-captured', 'connection-switched', 'connection-error',
  'manual-disconnect', 'recovered-after-interruption',
] as const;

export const ARCHIVE_LEGACY_STOP_REASONS = [
  'connection-switched', 'connection-error', 'manual-disconnect',
  'previous-runtime', 'app-exit', 'live-identity-changed',
] as const;

export function normalizeArchiveSessionState<T extends ArchiveSessionStateInput>(input: T): T & {
  recordingStatus: ArchiveRecordingStatus;
  stopReason: string | null;
  qualityReasons: string[];
} {
  const legacy = input.recordingStatus === undefined;
  const reason = input.qualityReason ?? null;
  const qualityReasons = input.qualityReasons !== undefined
    ? [...new Set(input.qualityReasons)]
    : [...new Set([
      ...(legacy && hasArchiveLateStartEvidence(input) ? ['live-start-not-captured'] : []),
      ...(reason && ARCHIVE_LEGACY_GAP_REASONS.some(value => value === reason) ? [reason] : []),
    ])];
  return {
    ...input,
    status: legacy && input.status === 'active' ? 'unclean' : input.status,
    quality: qualityReasons.length > 0 ? 'incomplete'
      : legacy && input.quality === 'incomplete' ? 'in-progress' : input.quality,
    recordingStatus: input.recordingStatus ?? 'stopped',
    stopReason: input.stopReason !== undefined ? input.stopReason
      : legacy && reason && ARCHIVE_LEGACY_STOP_REASONS.some(value => value === reason) ? reason : null,
    qualityReasons,
  };
}

export function isArchiveSessionRecording(input: { recordingStatus?: ArchiveRecordingStatus }): boolean {
  return input.recordingStatus === 'recording' || input.recordingStatus === 'reconnecting';
}
