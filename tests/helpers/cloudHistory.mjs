export const source = { serverId: 'server-test', roomId: '24125' };

export function envelope(sequence, raw, extra = {}) {
  return { server_id: source.serverId, room_id: source.roomId, server_sequence: sequence,
    received_at: '2026-10-07T00:00:00.123Z', bilibili_timestamp: null,
    command: raw?.cmd ?? null, protocol_version: 1, session_id: null,
    connection_id: 'connection-test', login_account_uid: '9', snapshot_ids: [],
    raw_payload: { kind: 'json', value: raw }, upstream_event_id: null, user_uid: null,
    command_category: null, is_paid: null, business_id: null, combo_id: null,
    index_extractor_version: null, decode_status: 'unprocessed',
    duplicate_of_sequence: null, quality_flags: [], ...extra };
}

export function page(items, after = '0', next = items.at(-1)?.server_sequence ?? after, snapshots = []) {
  return { boundary: { ...source, expectedCursor: after, nextCursor: next,
    metadataRevision: '0', scanAfter: after, scanThrough: next, rangesComplete: true }, items, snapshots };
}
