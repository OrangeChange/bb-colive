import { uiText } from "../i18n/index.ts";
import type { Root } from './recoveryContract.ts';
import type { HistoryRecordDraft } from './cloudHistoryTypes.ts';
import type { RecoveryArchiveBatch, RecoveryArchiveSource, RecoveryArchiveState,
  RecoverySessionMetadata } from './recoveryArchiveSink.ts';

export interface CloudRecoveryProgress {
  version: 1
  serverId: string
  roomId: string
  cutId: string | null
  archiveState: RecoveryArchiveState
  contextJson?: string
}

export function createRecoveryProgress(serverId: string, roomId: string): CloudRecoveryProgress {
  return { version: 1, serverId, roomId, cutId: null,
    archiveState: { lastSequence: '0', lastOutputIndex: -1, eventKeysByPlatformId: {} } };
}

interface RecoveryRootIdentity extends Pick<Root, 'mode' | 'server_id' | 'room_id'> {
  cut: Pick<Root['cut'], 'cut_id'>
  from_cut: Pick<Root['cut'], 'cut_id'> | null
}

interface RecoveryBatchInput {
  root: RecoveryRootIdentity
  sessions: readonly RecoverySessionMetadata[]
  records: readonly HistoryRecordDraft[]
}

interface ArchiveSink {
  writeBatch(batch: RecoveryArchiveBatch, previous?: RecoveryArchiveState):
    Promise<{ insertedEvents: number; state: RecoveryArchiveState }>
}

export async function applyRecoveryBatch(input: RecoveryBatchInput, previous: CloudRecoveryProgress,
  sink: ArchiveSink, save?: (progress: CloudRecoveryProgress) => Promise<void> | void): Promise<CloudRecoveryProgress> {
  const { root } = input;
  if (previous.version !== 1 || root.server_id !== previous.serverId || root.room_id !== previous.roomId) {
    throw new Error(uiText("cloudRecoveryProgress.applyRecoveryBatch"));
  }
  if (root.mode === 'baseline') {
    if (root.from_cut !== null) throw new Error(uiText("cloudRecoveryProgress.applyRecoveryBatch2"));
  } else if (!previous.cutId || root.from_cut?.cut_id !== previous.cutId) {
    throw new Error(uiText("cloudRecoveryProgress.applyRecoveryBatch3"));
  }

  let archiveState = previous.archiveState;
  if (input.records.length > 0) {
    const source: RecoveryArchiveSource = { serverId: root.server_id, roomId: root.room_id, cutId: root.cut.cut_id };
    archiveState = (await sink.writeBatch({ source, sessions: input.sessions, records: input.records }, archiveState)).state;
  }
  const next: CloudRecoveryProgress = { ...previous, cutId: root.cut.cut_id,
    archiveState: { lastSequence: archiveState.lastSequence,
      lastOutputIndex: archiveState.lastOutputIndex,
      eventKeysByPlatformId: { ...archiveState.eventKeysByPlatformId } } };
  await save?.(next);
  return next;
}
