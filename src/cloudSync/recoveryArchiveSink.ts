import { uiText } from "../i18n/index.ts";
import type {
  ArchiveOwnerInput,
  ArchiveRepositoryContract,
  ArchiveSessionInput,
} from '../archive/archiveTypes.ts';
import { toArchiveEventInput, toArchiveMutations } from '../archive/archiveEventMutations.ts';
import { MsgType } from '../protocol/eventTypeCodes.ts';
import type { HistoryRecordDraft } from './cloudHistoryTypes.ts';
import type { SessionState } from './recoveryContract.ts';
import type { ArchiveCloudMetadata } from '../archive/archiveCloudMetadata.ts';
import { mergeRecoveryMetadata } from './recoveryMetadataRows.ts';
import { recoveryCoverReference } from './recoveryCovers.ts';

export interface RecoveryArchiveSource {
  serverId: string
  roomId: string
  cutId: string
  recoveryRunId?: string
}

export interface RecoverySessionMetadata {
  state?: SessionState
  cloudMetadata?: ArchiveCloudMetadata
  serverSessionId: string
  title: string | null
  captureStartedAt: number
  sourceLiveStartedAt: number | null
  endedAt: number | null
  liveStatus: 'ongoing' | 'ended' | 'unknown'
  quality: 'pending' | 'complete' | 'incomplete'
  qualityReasons: string[]
  broadcaster?: { uid?: string | null; name?: string | null; face?: string | null } | null
}

export interface RecoveryArchiveState {
  lastSequence: string
  lastOutputIndex: number
  eventKeysByPlatformId: Record<string, string>
}

export interface RecoveryArchiveBatch {
  source: RecoveryArchiveSource
  sessions: readonly RecoverySessionMetadata[]
  records: readonly HistoryRecordDraft[]
}

type RecoveryRepository = Pick<ArchiveRepositoryContract,
  'upsertOwner' | 'getSession' | 'upsertSession' | 'updateSession' | 'getNextEventOrdinal'
  | 'appendEvents' | 'updateEvent' | 'reassignSourceEventRange' | 'recomputePaidTotals' | 'recomputeEventCounts'>;

export function cloudSessionId(source: Pick<RecoveryArchiveSource, 'serverId' | 'roomId'>, serverSessionId: string): string {
  return JSON.stringify(['cloud-session', source.serverId, source.roomId, serverSessionId]);
}

export function cloudEventKey(source: Pick<RecoveryArchiveSource, 'serverId' | 'roomId'>, sequence: string, outputIndex: number): string {
  return JSON.stringify(['cloud-event', source.serverId, source.roomId, sequence, outputIndex]);
}

function finiteTime(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function ownerInput(source: RecoveryArchiveSource, session: RecoverySessionMetadata, now: number): ArchiveOwnerInput {
  return { ownerId: `room:${source.roomId}`, roomId: Number(source.roomId), uid: session.broadcaster?.uid ?? null,
    name: session.broadcaster?.name ?? null, avatarUrl: session.broadcaster?.face ?? null, createdAt: now, updatedAt: now };
}

function sessionInput(source: RecoveryArchiveSource, session: RecoverySessionMetadata, now: number): ArchiveSessionInput {
  const startedAt = finiteTime(session.sourceLiveStartedAt, finiteTime(session.captureStartedAt, now));
  const status = session.liveStatus === 'ongoing' ? 'active' : session.liveStatus === 'ended' ? 'ended' : 'unclean';
  const quality = session.quality === 'complete' ? 'complete' : session.quality === 'incomplete' ? 'incomplete' : 'in-progress';
  return { sessionId: cloudSessionId(source, session.serverSessionId), ownerId: `room:${source.roomId}`,
    roomId: Number(source.roomId), title: session.title, latestTitle: session.title,
    titleSource: session.title ? 'bilibili' : 'time', sourceLiveStartedAt: session.sourceLiveStartedAt,
    identityEvidence: session.sourceLiveStartedAt ? 'source-live-time' : 'unavailable', startedAt,
    endedAt: session.endedAt, status, quality, qualityReason: session.qualityReasons[0] ?? null,
    recordingStatus: 'stopped', stopReason: null, qualityReasons: [...session.qualityReasons], createdAt: now, updatedAt: now };
}

function compareSequence(a: string, b: string): number {
  const left = BigInt(a), right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export class RecoveryArchiveSink {
  constructor(private readonly repository: RecoveryRepository,
    private readonly saveState?: (state: RecoveryArchiveState) => Promise<void> | void,
    private readonly onSessionCreated?: (sessionId: string) => Promise<void> | void) {}

  async syncSessions(source: RecoveryArchiveSource, values: readonly RecoverySessionMetadata[]): Promise<void> {
    const roomId = Number(source.roomId);
    if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error(uiText("recoveryArchiveSink.syncSessions"));
    const now = Date.now();
    for (const session of values) {
      const next = sessionInput(source, session, now);
      const existing = await this.repository.getSession(next.sessionId);
      if (!existing && session.state && session.state.availability !== 'available') continue;
      await this.repository.upsertOwner(ownerInput(source, session, now));
      if (session.cloudMetadata) next.cloudMetadata = mergeRecoveryMetadata(existing?.cloudMetadata, session.cloudMetadata);
      session.cloudMetadata = next.cloudMetadata ?? undefined;
      const covers = [...(next.cloudMetadata?.covers ?? [])].sort((a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at));
      const savedCover = covers.find(cover => cover.localUrl);
      const retryCover = covers.find(cover => cover.availability === 'available' && cover.result === 'success' && cover.mime_type);
      next.coverUrl = savedCover?.localUrl ?? existing?.coverUrl ?? (retryCover
        ? recoveryCoverReference(source.serverId, retryCover.resource_id, retryCover.mime_type!) : null);
      if (existing) await this.repository.updateSession({ sessionId: next.sessionId, title: next.title || existing.title,
        latestTitle: next.latestTitle || existing.latestTitle, titleSource: next.title ? next.titleSource : existing.titleSource,
        startedAt: next.sourceLiveStartedAt ? next.startedAt : existing.startedAt,
        cloudMetadata: next.cloudMetadata,
        coverUrl: next.coverUrl,
        sourceLiveStartedAt: next.sourceLiveStartedAt ?? existing.sourceLiveStartedAt,
        identityEvidence: next.sourceLiveStartedAt ? next.identityEvidence : existing.identityEvidence,
        endedAt: next.endedAt ?? existing.endedAt, status: next.status, quality: next.quality,
        qualityReason: next.qualityReason, recordingStatus: next.recordingStatus, stopReason: next.stopReason,
        qualityReasons: next.qualityReasons, updatedAt: next.updatedAt });
      else {
        await this.repository.upsertSession(next);
        await this.onSessionCreated?.(next.sessionId);
      }
    }
  }

  async writeRecords(source: RecoveryArchiveSource, records: readonly HistoryRecordDraft[],
    previous: RecoveryArchiveState = { lastSequence: '0', lastOutputIndex: -1, eventKeysByPlatformId: {} }):
  Promise<{ insertedEvents: number; state: RecoveryArchiveState }> {
    const batch: RecoveryArchiveBatch = { source, sessions: [], records };
    const roomId = Number(batch.source.roomId);
    if (!Number.isSafeInteger(roomId) || roomId <= 0) throw new Error(uiText("recoveryArchiveSink.writeRecords"));
    const state: RecoveryArchiveState = { lastSequence: previous.lastSequence, lastOutputIndex: previous.lastOutputIndex ?? -1,
      eventKeysByPlatformId: { ...previous.eventKeysByPlatformId } };
    const ordinals = new Map<string, number>();
    const inputs = [];
    const updates = [];
    const liveEndTimes = new Map<string, number>();
    const ordered = [...batch.records].sort((a, b) => compareSequence(a.source.sequence, b.source.sequence));
    for (const record of ordered) {
      if (record.source.serverId !== batch.source.serverId || record.source.roomId !== batch.source.roomId) {
        throw new Error(uiText("recoveryArchiveSink.writeRecords2"));
      }
      const serverSessionId = record.evidence.serverSessionId;
      if (!serverSessionId) continue;
      const sessionId = cloudSessionId(batch.source, serverSessionId);
      let ordinal = ordinals.get(sessionId);
      if (ordinal === undefined) ordinal = await this.repository.getNextEventOrdinal(sessionId);
      for (const output of record.outputs) {
        if (output.event.msgType === MsgType.LiveEnd && Number.isFinite(output.event.ts) && output.event.ts > 0) {
          const previous = liveEndTimes.get(sessionId);
          if (previous === undefined || output.event.ts < previous) liveEndTimes.set(sessionId, output.event.ts);
        }
        const mutations = toArchiveMutations([output.event]);
        for (const mutation of mutations) {
          if (mutation.kind === 'update') {
            for (const targetId of output.event.scDeleteIds ?? []) {
              const eventKey = state.eventKeysByPlatformId[targetId];
              if (eventKey) updates.push({ eventKey, patch: mutation.patch });
            }
            continue;
          }
          const platformKey = output.event.msgType === MsgType.SuperChat
            ? `${sessionId}:${output.event.id}` : null;
          if (platformKey && state.eventKeysByPlatformId[platformKey]) continue;
          const eventKey = cloudEventKey(batch.source, record.source.sequence, output.outputIndex);
          const input = toArchiveEventInput(mutation, { sessionId, roomId, ordinal, eventKey });
          input.sourceId = batch.source.recoveryRunId
            ? `cloud-recovery-run:${batch.source.recoveryRunId}`
            : `cloud-recovery:${batch.source.serverId}:${batch.source.roomId}`;
          inputs.push(input);
          // Only Super Chat deletions need a cross-batch source-id lookup. Keeping
          // every danmaku/gift id here would make recovery state grow with all history.
          if (platformKey) {
            state.eventKeysByPlatformId[platformKey] = eventKey;
            state.eventKeysByPlatformId[output.event.id] = eventKey;
          }
          ordinal++;
        }
      }
      ordinals.set(sessionId, ordinal);
      const lastOutputIndex = record.outputs.reduce((maximum, output) => Math.max(maximum, output.outputIndex), -1);
      const order = compareSequence(record.source.sequence, state.lastSequence);
      if (order > 0) { state.lastSequence = record.source.sequence; state.lastOutputIndex = lastOutputIndex; }
      else if (order === 0) state.lastOutputIndex = Math.max(state.lastOutputIndex, lastOutputIndex);
    }
    const insertedEvents = await this.repository.appendEvents(inputs);
    for (const update of updates) await this.repository.updateEvent(update);
    for (const [sessionId, endedAt] of liveEndTimes) {
      const session = await this.repository.getSession(sessionId);
      if (session?.status === 'ended' && session.endedAt === null && endedAt >= session.startedAt) {
        await this.repository.updateSession({ sessionId, endedAt, updatedAt: Date.now() });
      }
    }
    await this.saveState?.(state);
    return { insertedEvents, state };
  }

  async applyAssignments(source: RecoveryArchiveSource, assignments: readonly { from_sequence: string;
    through_sequence: string; server_session_id: string | null }[]): Promise<number> {
    let changed = 0;
    for (const assignment of assignments) {
      if (!assignment.server_session_id) continue;
      changed += await this.repository.reassignSourceEventRange({
      namespace: 'cloud-event', serverId: source.serverId, roomId: source.roomId,
      fromSequence: assignment.from_sequence, throughSequence: assignment.through_sequence,
      targetSessionId: cloudSessionId(source, assignment.server_session_id),
    });
    }
    return changed;
  }

  async writeBatch(batch: RecoveryArchiveBatch, previous: RecoveryArchiveState = { lastSequence: '0', lastOutputIndex: -1, eventKeysByPlatformId: {} }):
  Promise<{ insertedEvents: number; state: RecoveryArchiveState }> {
    await this.syncSessions(batch.source, batch.sessions);
    return this.writeRecords(batch.source, batch.records, previous);
  }

  async finalize(): Promise<void> {
    await this.repository.recomputeEventCounts();
    await this.repository.recomputePaidTotals();
  }
}
