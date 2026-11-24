import { adapt } from '../protocol/adapter.ts';
import { MsgType } from '../protocol/types.ts';
import type { AdapterRuntime } from '../protocol/types.ts';
import { compareCloudCursor, validateCloudCursor } from './cloudSyncCursor.ts';
import { validateCloudPageBoundary } from './cloudHistoryBoundary.ts';
import { advanceHistoryConnection, cloneHistoryContext, HISTORY_PARSER_VERSION } from './cloudHistoryContext.ts';
import { applyHistorySnapshots, getHistoryGiftIcon, indexHistorySnapshots } from './cloudHistorySnapshots.ts';
import type { HistoryContext, HistoryEnvelope, HistoryEvidence, HistoryPageInput, HistoryRecordDraft,
  HistorySnapshotEvidence } from './cloudHistoryTypes.ts';

function invalid(): never { throw new Error('历史同步页面内容或进度不一致，请从原进度重新读取'); }
function rawCommand(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { cmd?: unknown; msg?: { cmd?: unknown } };
  const command = raw.cmd || raw.msg?.cmd;
  return typeof command === 'string' && command ? command.split(':')[0] : null;
}
export function historyEvidence(item: HistoryEnvelope, snapshots: HistorySnapshotEvidence[]): HistoryEvidence {
  return { bilibiliTimestamp: item.bilibili_timestamp, protocolVersion: item.protocol_version,
    serverSessionId: item.session_id, connectionId: item.connection_id, loginAccountUid: item.login_account_uid,
    upstreamEventId: item.upstream_event_id, userUid: item.user_uid, commandCategory: item.command_category,
    isPaid: item.is_paid, businessId: item.business_id, comboId: item.combo_id,
    indexExtractorVersion: item.index_extractor_version, decodeStatus: item.decode_status,
    duplicateOfSequence: item.duplicate_of_sequence, qualityFlags: structuredClone(item.quality_flags), snapshots };
}

export function validateHistoryPage(input: HistoryPageInput, context: HistoryContext): void {
  const { boundary, items, snapshots } = input;
  validateCloudPageBoundary(boundary);
  if (context.formatVersion !== 1 || context.parserVersion !== HISTORY_PARSER_VERSION
    || context.source.serverId !== boundary.serverId || context.source.roomId !== boundary.roomId
    || context.lastSequence !== boundary.expectedCursor) invalid();
  const index = indexHistorySnapshots(snapshots);
  let prior = boundary.expectedCursor;
  for (const item of items) {
    validateCloudCursor(item.server_sequence);
    if (item.server_id !== boundary.serverId || item.room_id !== boundary.roomId
      || compareCloudCursor(item.server_sequence, prior) <= 0
      || compareCloudCursor(item.server_sequence, boundary.nextCursor) > 0
      || typeof item.received_at !== 'string' || !Number.isFinite(Date.parse(item.received_at))
      || typeof item.connection_id !== 'string' || !item.connection_id
      || typeof item.login_account_uid !== 'string' || !item.login_account_uid
      || !Array.isArray(item.snapshot_ids) || item.snapshot_ids.some(id => typeof id !== 'string' || !id)
      || !item.raw_payload || !['json', 'binary'].includes(item.raw_payload.kind)) invalid();
    const selected = new Map<string, string>();
    for (const id of item.snapshot_ids) {
      const snapshot = index.get(id);
      if (snapshot?.availability !== 'available') continue;
      if (typeof snapshot.fetched_at !== 'string' || !Number.isFinite(Date.parse(snapshot.fetched_at))) invalid();
      if (!['room_info', 'gift_config', 'gift_effect_config'].includes(snapshot.kind)) continue;
      if (selected.has(snapshot.kind) && selected.get(snapshot.kind) !== id) invalid();
      selected.set(snapshot.kind, id);
    }
    prior = item.server_sequence;
  }

}

/** One immutable fact and its captured context, before protocol expansion. */
export function prepareHistoryExpansion(input: HistoryPageInput, context: HistoryContext) {
  validateHistoryPage(input, context);
  if (input.items.length !== 1) invalid();
  const item = input.items[0];
  const candidate = advanceHistoryConnection(context, item.connection_id, item.login_account_uid);
  const snapshotEvidence = applyHistorySnapshots(candidate, item, input.snapshots);
  let fallbackIndex = 0;
  const runtime: AdapterRuntime = { now: () => Date.parse(item.received_at),
    createId: prefix => JSON.stringify(['cloud-fallback', item.server_id, item.room_id, item.server_sequence, prefix, fallbackIndex++]),
    getGiftIcon: id => getHistoryGiftIcon(candidate, id) };
  return { item, candidate, runtime, snapshotEvidence };
}

export function parseHistoryPage(input: HistoryPageInput, context: HistoryContext): {
  records: HistoryRecordDraft[]; nextContext: HistoryContext;
} {
  validateHistoryPage(input, context);
  const { boundary, items, snapshots } = input;
  let current = cloneHistoryContext(context);
  const records: HistoryRecordDraft[] = [];
  for (const item of items) {
    const candidate = advanceHistoryConnection(current, item.connection_id, item.login_account_uid);
    const snapshotEvidence = applyHistorySnapshots(candidate, item, snapshots);
    const command = item.raw_payload.kind === 'json' ? rawCommand(item.raw_payload.value) : null;
    const record: HistoryRecordDraft = { source: { ...current.source, sequence: item.server_sequence },
      command: command ?? item.command, receivedAt: item.received_at, parserVersion: HISTORY_PARSER_VERSION,
      parseStatus: 'unknown', failureReason: null, outputs: [], evidence: historyEvidence(item, snapshotEvidence) };
    let fallbackIndex = 0;
    const runtime: AdapterRuntime = { now: () => Date.parse(item.received_at),
      createId: prefix => JSON.stringify(['cloud-fallback', item.server_id, item.room_id, item.server_sequence, prefix, fallbackIndex++]),
      getGiftIcon: id => getHistoryGiftIcon(candidate, id) };
    if (item.raw_payload.kind === 'binary') {
      record.parseStatus = 'failed'; record.failureReason = 'unsupported-binary';
    } else if (command) {
      const v2 = command === 'SEND_GIFT_V2' || command === 'INTERACT_WORD_V2';
      const raw = item.raw_payload.value as { data?: { pb?: unknown } };
      if (v2 && (typeof raw.data?.pb !== 'string' || !raw.data.pb)) {
        record.parseStatus = 'failed'; record.failureReason = 'missing-protobuf';
      } else {
        try {
          const result = adapt(structuredClone(raw), candidate.adapter, runtime);
          const events = result === null ? [] : Array.isArray(result) ? result : [result];
          record.outputs = events.map((event, outputIndex) => ({ outputIndex,
            outputKey: JSON.stringify(['cloud-output', item.server_id, item.room_id, item.server_sequence, outputIndex]), event }));
          record.parseStatus = events.length === 0 ? 'no-output'
            : events.some(event => event.msgType === MsgType.Unknown) ? 'unknown' : 'parsed';
        } catch {
          record.parseStatus = 'failed'; record.failureReason = v2 ? 'decode-failed' : 'adapter-failed';
        }
      }
    }
    if (record.parseStatus !== 'failed') current = candidate;
    records.push(record);
  }
  current.lastSequence = boundary.nextCursor;
  return { records, nextContext: current };
}
