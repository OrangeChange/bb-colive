import type { Connection, Cover, Effect, MissingRange, Quality, SessionIdentity, SessionState } from '../cloudSync/recoveryContract.ts';

export interface ArchiveCloudCover extends Cover {
  localUrl?: string | null;
  downloadError?: string | null;
}
export interface ArchiveCloudMetadata {
  serverId: string;
  roomId: string;
  identity?: SessionIdentity;
  state: SessionState;
  connections: Connection[];
  quality: Quality[];
  missingRanges: MissingRange[];
  covers: ArchiveCloudCover[];
  sourceAvailability: Extract<Effect, { type: 'source_availability' }>[];
}
export function readArchiveCloudMetadata(value: unknown): ArchiveCloudMetadata | null {
  if (value == null) return null;
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== 'object' || typeof parsed.serverId !== 'string' || typeof parsed.roomId !== 'string'
    || !parsed.state || typeof parsed.state.server_session_id !== 'string'
    || !['connections', 'quality', 'missingRanges', 'covers', 'sourceAvailability'].every(key => Array.isArray(parsed[key]))) {
    throw new Error('档案中的云端场次资料无效');
  }
  return parsed as ArchiveCloudMetadata;
}
