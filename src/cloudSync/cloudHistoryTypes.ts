import type { AdapterContext, DanmakuEvent, RoomGuardProfile } from '../protocol/types.ts';
import type { GiftIconInfo } from '../protocol/gifts.ts';
import type { CloudPageBoundary } from './cloudHistoryBoundary.ts';

export interface HistorySourceIdentity { serverId: string; roomId: string }
export type HistoryRawPayload = { kind: 'json'; value: unknown }
  | { kind: 'binary'; encoding: 'base64'; value: string; outer: unknown };
export type HistorySnapshotKind = 'room_info' | 'gift_config' | 'gift_effect_config';
export interface HistoryEnvelope {
  server_id: string; room_id: string; server_sequence: string; received_at: string;
  bilibili_timestamp: string | null; command: string | null; protocol_version: number;
  session_id: string | null; connection_id: string; login_account_uid: string;
  snapshot_ids: string[]; raw_payload: HistoryRawPayload;
  upstream_event_id: string | null; user_uid: string | null; command_category: string | null;
  is_paid: boolean | null; business_id: string | null; combo_id: string | null;
  index_extractor_version: string | null; decode_status: string;
  duplicate_of_sequence: string | null; quality_flags: unknown;
}
export type HistorySnapshot = { snapshot_id: string; availability: 'expired' }
  | { snapshot_id: string; availability: 'available'; kind: string; requested_at: string;
    fetched_at: string; result: string; raw_data: unknown; failure_reason: string | null };
export interface HistorySnapshotEvidence {
  snapshotId: string; kind: string | null; availability: 'available' | 'expired' | 'missing';
  result: string | null; retainedProjection: boolean;
}
export interface HistoryEvidence {
  bilibiliTimestamp: string | null; protocolVersion: number; serverSessionId: string | null;
  connectionId: string; loginAccountUid: string; upstreamEventId: string | null;
  userUid: string | null; commandCategory: string | null; isPaid: boolean | null;
  businessId: string | null; comboId: string | null; indexExtractorVersion: string | null;
  decodeStatus: string; duplicateOfSequence: string | null; qualityFlags: unknown;
  snapshots: HistorySnapshotEvidence[];
}
export interface HistorySnapshotProjection {
  snapshotId: string; kind: HistorySnapshotKind; fetchedAt: string;
  anchorUid?: string; roomGuardProfile?: RoomGuardProfile; gifts?: Map<number, GiftIconInfo>;
}
export interface HistoryContext {
  formatVersion: 1; parserVersion: 'bb-history-adapter/1'; source: HistorySourceIdentity;
  lastSequence: string; connectionId: string | null; loginAccountUid: string | null;
  adapter: AdapterContext;
  projections: Partial<Record<HistorySnapshotKind, HistorySnapshotProjection>>;
}
export interface HistoryOutputDraft { outputIndex: number; outputKey: string; event: DanmakuEvent }
export interface HistoryRecordDraft {
  source: HistorySourceIdentity & { sequence: string }; command: string | null;
  receivedAt: string; parserVersion: string;
  parseStatus: 'parsed' | 'no-output' | 'unknown' | 'failed'; failureReason: string | null;
  outputs: HistoryOutputDraft[]; evidence: HistoryEvidence;
}
export interface HistoryPageInput {
  boundary: CloudPageBoundary; items: HistoryEnvelope[]; snapshots: HistorySnapshot[];
}
