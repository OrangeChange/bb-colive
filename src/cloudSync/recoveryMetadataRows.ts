import type { BaselineRow, Effect } from './recoveryContract.ts';
import type { RecoverySessionMetadata } from './recoveryArchiveSink.ts';
import type { ArchiveCloudMetadata } from '../archive/archiveCloudMetadata.ts';

export function mergeRows<T>(previous: readonly T[], incoming: readonly T[], key: (row: T) => string): T[] {
  const values = new Map(previous.map(row => [key(row), row]));
  for (const row of incoming) values.set(key(row), { ...values.get(key(row)), ...row });
  return [...values.values()];
}
export function mergeRecoveryMetadata(previous: ArchiveCloudMetadata | null | undefined, next: ArchiveCloudMetadata): ArchiveCloudMetadata {
  if (!previous || previous.serverId !== next.serverId || previous.roomId !== next.roomId) return next;
  return { ...previous, ...next, identity: next.identity ?? previous.identity,
    connections: mergeRows(previous.connections, next.connections, x => x.connection_id),
    quality: mergeRows(previous.quality, next.quality, x => x.issue_id),
    missingRanges: mergeRows(previous.missingRanges, next.missingRanges, x => `${x.kind}:${x.from_sequence}:${x.through_sequence}`),
    covers: mergeRows(previous.covers, next.covers, x => x.resource_id),
    sourceAvailability: mergeRows(previous.sourceAvailability, next.sourceAvailability, x => `${x.from_sequence}:${x.through_sequence}`) };
}
export function attachRecoveryMetadata(sessions: Map<string, RecoverySessionMetadata>, rows: readonly (BaselineRow | Effect)[], source: { serverId: string; roomId: string }): void {
  for (const session of sessions.values()) {
    if (!session.state) continue;
    const next: ArchiveCloudMetadata = { ...source, state: session.state, connections: [], quality: [], missingRanges: [], covers: [], sourceAvailability: [] };
    const intersects = (from: string, through: string) => session.state!.min_sequence !== null && session.state!.max_sequence !== null
      && BigInt(from) <= BigInt(session.state!.max_sequence!) && BigInt(through) >= BigInt(session.state!.min_sequence!);
    for (const row of rows) {
      if (row.type === 'session_identity' && row.server_session_id === session.serverSessionId) next.identity = row;
      if (row.type === 'session_tombstone' && row.server_session_id === session.serverSessionId) next.state = { ...next.state, availability: row.availability };
      const connection = row.type === 'connection' ? row : row.type === 'connection_upsert' ? { type: 'connection' as const, ...row.connection } : null;
      if (connection?.server_session_ids.includes(session.serverSessionId)) next.connections.push(connection);
      const cover = row.type === 'cover_metadata' ? row : row.type === 'cover_upsert' ? { type: 'cover_metadata' as const, ...row.cover } : null;
      if (cover?.server_session_id === session.serverSessionId) next.covers.push(cover);
      if (row.type === 'missing_range' && intersects(row.from_sequence, row.through_sequence)) next.missingRanges.push(row);
      if (row.type === 'source_availability' && intersects(row.from_sequence, row.through_sequence)) next.sourceAvailability.push(row);
    }
    const connectionIds = new Set([...next.connections, ...(session.cloudMetadata?.connections ?? [])].map(x => x.connection_id));
    for (const row of rows) {
      const quality = row.type === 'quality' ? row : row.type === 'quality_upsert' ? { type: 'quality' as const, ...row.quality } : null;
      if (quality && (quality.server_session_id === session.serverSessionId || quality.server_session_id === null && quality.connection_id && connectionIds.has(quality.connection_id))) next.quality.push(quality);
    }
    session.cloudMetadata = mergeRecoveryMetadata(session.cloudMetadata, next);
    session.state = next.state;
  }
}
