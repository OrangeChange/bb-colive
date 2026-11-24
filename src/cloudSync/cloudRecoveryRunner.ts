import { walkRecoveryCatalog, type RecoveryCatalogIndex } from './recoveryCatalog.ts';
import type { CatalogRef, Effect, Fact, ObjectEntry, Snapshot, SnapshotRef,
  BaselineRow, Assignment, CloudRecoverySelection } from './recoveryContract.ts';
import { decodeRecoveryLines, decodeRecoveryStream, type VerifiedRecoveryObject } from './recoveryDecoder.ts';
import { createRecoveryTransport } from './recoveryTransport.ts';
import { createHistoryContext, decodeHistoryContext, encodeHistoryContext } from './cloudHistoryContext.ts';
import { historyEvidence } from './cloudHistoryParser.ts';
import { iterateRecoveryOutputs, recoveryExpansionInput, type CapturedRecoverySnapshot } from './recoveryOutputIterator.ts';
import { RecoveryArchiveSink, type RecoveryArchiveState, type RecoverySessionMetadata } from './recoveryArchiveSink.ts';
import { recoverySessionMetadata as metadata } from './recoverySessionMetadata.ts';
import { attachRecoveryMetadata } from './recoveryMetadataRows.ts';
import { restoreRecoveryCovers } from './recoveryCovers.ts';
import type { ArchiveRepositoryContract } from '../archive/archiveTypes.ts';
import type { HistoryOutputDraft, HistoryRecordDraft, HistorySnapshotEvidence } from './cloudHistoryTypes.ts';

class MemoryCatalogIndex implements RecoveryCatalogIndex {
  readonly entries = new Map<string, CatalogRef | ObjectEntry>();
  readonly snapshotRefs = new Map<string, SnapshotRef>();
  async register(value: CatalogRef | ObjectEntry) { if (this.entries.has(value.object_id)) throw new Error('恢复目录包含重复项目'); this.entries.set(value.object_id, value); }
  async addSnapshot(value: SnapshotRef) { if (this.snapshotRefs.has(value.snapshot_id)) throw new Error('恢复目录包含重复快照'); this.snapshotRefs.set(value.snapshot_id, value); }
  async object(id: string) { return this.entries.get(id) ?? null; }
  async *objects() { for (const value of this.entries.values()) if ('type' in value && value.type === 'object') yield value; }
  async *snapshots() { yield* this.snapshotRefs.values(); }
}

export interface CloudRecoveryRunProgress { phase: 'preparing' | 'downloading' | 'restoring' | 'finalizing' | 'complete'; current: number; total: number }
export interface CloudRecoveryRunState {
  cutId: string | null
  contextJson: string
  archiveState: RecoveryArchiveState
  sessions: RecoverySessionMetadata[]
  assignments: Assignment[]
  pendingAssignments: number
}

type RecoveryTransport = ReturnType<typeof createRecoveryTransport>;

const emptyArchiveState = (): RecoveryArchiveState => ({ lastSequence: '0', lastOutputIndex: -1, eventKeysByPlatformId: {} });
function assignmentFor(sequence: string, assignments: readonly Assignment[]): string | null {
  const value = BigInt(sequence);
  const match = assignments.find(item => BigInt(item.from_sequence) <= value && value <= BigInt(item.through_sequence));
  return match?.server_session_id ?? null;
}
export function outputsAfterArchiveCursor(sequence: string, outputs: readonly HistoryOutputDraft[],
  archiveState: RecoveryArchiveState): HistoryOutputDraft[] {
  const sequenceOrder = BigInt(sequence) - BigInt(archiveState.lastSequence);
  return outputs.filter(output => sequenceOrder > 0n
    || sequenceOrder === 0n && output.outputIndex > (archiveState.lastOutputIndex ?? -1));
}
export function recoveryCheckpointState(previous: RecoveryArchiveState, current: RecoveryArchiveState,
  hasPendingAssignments: boolean): RecoveryArchiveState {
  if (!hasPendingAssignments) return current;
  return { ...previous, eventKeysByPlatformId: { ...current.eventKeysByPlatformId } };
}
function snapshotEvidence(fact: Fact, refs: Map<string, SnapshotRef>): HistorySnapshotEvidence[] {
  return fact.snapshot_ids.map(id => { const ref = refs.get(id); return { snapshotId: id, kind: null,
    availability: ref?.availability ?? 'missing', result: ref?.result ?? null, retainedProjection: false }; });
}
function streamGroups(objects: readonly ObjectEntry[], kind: ObjectEntry['kind']): ObjectEntry[][] {
  const groups = new Map<string, ObjectEntry[]>();
  for (const object of objects.filter(value => value.kind === kind)) {
    const group = groups.get(object.stream_id) ?? [];
    group.push(object); groups.set(object.stream_id, group);
  }
  return [...groups.values()].map(group => group.sort((a, b) => a.stream_ordinal - b.stream_ordinal));
}

export function createCloudRecoveryState(serverId: string, roomId: string): CloudRecoveryRunState {
  return { cutId: null, contextJson: encodeHistoryContext(createHistoryContext({ serverId, roomId })),
    archiveState: emptyArchiveState(), sessions: [], assignments: [], pendingAssignments: 0 };
}

export function recoveryStartState(previous: CloudRecoveryRunState, restartFromBeginning: boolean,
  serverId: string, roomId: string): CloudRecoveryRunState {
  return restartFromBeginning ? createCloudRecoveryState(serverId, roomId) : previous;
}

export async function runCloudRecovery(input: { roomId: string; repository: ArchiveRepositoryContract;
  previous: CloudRecoveryRunState; onProgress?: (value: CloudRecoveryRunProgress) => void;
  selection?: CloudRecoverySelection;
  save: (value: CloudRecoveryRunState) => Promise<void> | void; transport?: RecoveryTransport;
  signal?: AbortSignal; recoveryRunId?: string; onSessionCreated?: (sessionId: string) => void;
  onJobStarted?: (cancel: () => Promise<void>) => void }): Promise<CloudRecoveryRunState> {
  const transport = input.transport ?? createRecoveryTransport();
  const selection = input.selection ?? { scope: 'all', include_danmaku: true, include_interactions: true };
  const mode = selection.scope === 'all' && input.previous.cutId ? 'delta' : 'baseline';
  const started = await transport.start(input.roomId, mode, mode === 'delta' ? input.previous.cutId ?? undefined : undefined, selection);
  input.onJobStarted?.(() => transport.cancel(started.localJobId));
  const active = () => { if (input.signal?.aborted) throw new DOMException('恢复已暂停', 'AbortError'); };
  input.onProgress?.({ phase: 'preparing', current: 0, total: 1 });
  let status;
  for (;;) {
    active();
    status = await transport.status(started.localJobId);
    if (status.state === 'ready') break;
    if (status.state === 'failed') throw new Error('服务器准备恢复记录失败，请稍后重试');
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  const root = status.root!;
  const hasPendingAssignments = BigInt(root.counts.pending_assignments) > 0n;
  if (root.room_id !== input.roomId || JSON.stringify(root.selection) !== JSON.stringify(selection)
    || mode === 'delta' && root.from_cut?.cut_id !== input.previous.cutId) throw new Error('服务器返回的恢复范围与本地进度不一致');
  const index = new MemoryCatalogIndex();
  await walkRecoveryCatalog(root, ref => transport.downloadCatalog(started.localJobId, ref), index);
  const objects = [...index.entries.values()].filter((value): value is ObjectEntry => 'type' in value && value.type === 'object')
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.stream_id.localeCompare(b.stream_id) || a.stream_ordinal - b.stream_ordinal);
  const downloaded = new Map<string, VerifiedRecoveryObject>();
  for (let i = 0; i < objects.length; i++) {
    active();
    input.onProgress?.({ phase: 'downloading', current: i, total: objects.length });
    downloaded.set(objects[i].object_id, await transport.downloadObject(started.localJobId, objects[i]));
  }
  input.onProgress?.({ phase: 'downloading', current: objects.length, total: objects.length });
  const read = (handle: string, offset: string, maximum: number) => transport.readSlice(started.localJobId, handle, offset, maximum);
  const sessions = new Map(input.previous.sessions.map(value => [value.serverSessionId, structuredClone(value)]));
  const updateMetadata = (value: RecoverySessionMetadata) => sessions.set(value.serverSessionId,
    { ...value, cloudMetadata: sessions.get(value.serverSessionId)?.cloudMetadata });
  let assignments = input.previous.assignments.map(value => ({ ...value }));
  const assignmentChanges: Assignment[] = [];
  const metadataRows: (BaselineRow | Effect)[] = [];
  for (const kind of ['baseline', 'effects'] as const) for (const group of streamGroups(objects, kind)) {
    const verified = async function* () { for (const object of group) yield downloaded.get(object.object_id)!; };
    for await (const row of decodeRecoveryStream(verified(), read, { serverId: root.server_id, roomId: root.room_id,
      eventThrough: kind === 'effects' ? root.cut.event_head : undefined })) {
      if (row.status !== 'validated' || !row.value) throw new Error('服务器恢复记录无法读取，请重新开始本次恢复');
      metadataRows.push(row.value as BaselineRow | Effect);
      if (kind === 'baseline') {
        const value = row.value as BaselineRow;
        if (value.type === 'session_state') updateMetadata(metadata(value));
        if (value.type === 'assignment') assignments.push(value);
      } else {
        const value = row.value as Effect;
        if (value.type === 'session_upsert') updateMetadata(metadata({ type: 'session_state', ...value.session }));
        if (value.type === 'assignment_replace') {
          assignments = assignments.filter(item => BigInt(item.through_sequence) < BigInt(value.from_sequence) || BigInt(item.from_sequence) > BigInt(value.through_sequence));
          const replacement: Assignment = { type: 'assignment', from_sequence: value.from_sequence,
            through_sequence: value.through_sequence, server_session_id: value.server_session_id };
          assignments.push(replacement); assignmentChanges.push(replacement);
        }
      }
    }
  }
  const source = { serverId: root.server_id, roomId: root.room_id, cutId: root.cut.cut_id,
    recoveryRunId: input.recoveryRunId };
  attachRecoveryMetadata(sessions, metadataRows, source);
  let context = decodeHistoryContext(input.previous.contextJson, { serverId: root.server_id, roomId: root.room_id });
  let archiveState = input.previous.archiveState;
  const sink = new RecoveryArchiveSink(input.repository, undefined, input.onSessionCreated);
  await sink.syncSessions(source, [...sessions.values()]);
  await sink.applyAssignments(source, root.mode === 'baseline' ? assignments : assignmentChanges);
  const snapshotCache = new Map<string, Snapshot>();
  const snapshotSizes = new Map<string, number>();
  let snapshotBytes = 0;
  const loadSnapshot = async (id: string): Promise<Snapshot | null> => {
    const reference = index.snapshotRefs.get(id);
    if (!reference || reference.availability !== 'available' || !reference.object_id) return null;
    const cached = snapshotCache.get(id);
    if (cached) { snapshotCache.delete(id); snapshotCache.set(id, cached); return cached; }
    const descriptor = downloaded.get(reference.object_id);
    if (!descriptor) throw new Error('服务器记录缺少所需的历史资料');
    let value: Snapshot | null = null;
    for await (const row of decodeRecoveryLines(descriptor, read, { serverId: root.server_id, roomId: root.room_id })) {
      if (row.status !== 'validated' || !row.value || value) throw new Error('服务器恢复记录无法读取，请重新开始本次恢复');
      value = row.value as Snapshot;
    }
    if (!value) throw new Error('服务器恢复记录无法读取，请重新开始本次恢复');
    snapshotCache.set(id, value);
    const bytes = new TextEncoder().encode(JSON.stringify(value)).length;
    snapshotSizes.set(id, bytes); snapshotBytes += bytes;
    while (snapshotCache.size > 32 || snapshotBytes > 32 * 1024 * 1024) {
      const oldest = snapshotCache.keys().next().value!;
      snapshotCache.delete(oldest); snapshotBytes -= snapshotSizes.get(oldest) ?? 0; snapshotSizes.delete(oldest);
    }
    return value;
  };
  const records: HistoryRecordDraft[] = [];
  const flushRecords = async () => {
    if (!records.length) return;
    archiveState = (await sink.writeRecords(source, records.splice(0), archiveState)).state;
    await input.save({ ...input.previous,
      archiveState: recoveryCheckpointState(input.previous.archiveState, archiveState, hasPendingAssignments) });
  };
  let count = 0;
  for (const group of streamGroups(objects, 'facts')) {
    const verified = async function* () { for (const object of group) yield downloaded.get(object.object_id)!; };
    for await (const decoded of decodeRecoveryStream(verified(), read, { serverId: root.server_id, roomId: root.room_id,
      eventFrom: context.lastSequence, eventThrough: root.cut.event_head })) {
      active();
      const fact = decoded.value as Fact | null;
      if (!fact || !['validated', 'unsupported'].includes(decoded.status)) throw new Error('服务器事件记录无法读取，请重新开始本次恢复');
      const assigned = fact.server_session_id ?? assignmentFor(fact.server_sequence, assignments);
      const captures: CapturedRecoverySnapshot[] = await Promise.all(fact.snapshot_ids.map(async id => {
        const reference = index.snapshotRefs.get(id);
        if (!reference) throw new Error('服务器记录缺少所需的历史资料');
        return { reference, value: await loadSnapshot(id) };
      }));
      const expansion = recoveryExpansionInput(fact, context, captures, { preserveUnsupported: true });
      const pages = iterateRecoveryOutputs(expansion, context, { maxRows: 64, maxBytes: 2_097_152 });
      for (const page of pages) {
        const remainingOutputs = outputsAfterArchiveCursor(fact.server_sequence, page.outputs, archiveState);
        const record: HistoryRecordDraft = { source: { serverId: fact.server_id, roomId: fact.room_id, sequence: fact.server_sequence },
          command: fact.command, receivedAt: fact.received_at, parserVersion: context.parserVersion,
          parseStatus: remainingOutputs.length ? 'parsed' : 'no-output', failureReason: null, outputs: remainingOutputs,
          evidence: { ...historyEvidence(expansion.items[0], snapshotEvidence(fact, index.snapshotRefs)), serverSessionId: assigned } };
        if (remainingOutputs.length && assigned) records.push(record);
        if (records.length >= 128) await flushRecords();
        if (page.terminal) context = page.contextAfter;
      }
      count++;
      input.onProgress?.({ phase: 'restoring', current: count, total: Number(root.counts.facts) });
    }
  }
  input.onProgress?.({ phase: 'finalizing', current: count, total: count });
  await flushRecords();
  for (const session of sessions.values()) {
    active();
    if (session.cloudMetadata?.covers.length) {
      session.cloudMetadata.covers = await restoreRecoveryCovers(source.serverId,
        session.cloudMetadata.covers, transport.downloadCover);
    }
  }
  await sink.syncSessions(source, [...sessions.values()]);
  await sink.finalize();
  const next: CloudRecoveryRunState = hasPendingAssignments ? { ...input.previous,
    archiveState: recoveryCheckpointState(input.previous.archiveState, archiveState, true),
    pendingAssignments: Number(root.counts.pending_assignments) } : {
    cutId: root.cut.cut_id, contextJson: encodeHistoryContext(context), archiveState,
    sessions: [...sessions.values()], assignments, pendingAssignments: 0 };
  await input.save(next);
  await transport.release?.(started.localJobId);
  input.onProgress?.({ phase: 'complete', current: count, total: count });
  return next;
}
