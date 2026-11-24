export const contractVersion = '0.3' as const;
export const serializationVersion = 'bb-json-utf8-v1' as const;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Limits {
  chunk_max_bytes: number; prefetch_chunks: number; catalog_page_max_bytes: number;
  catalog_fanout: number; root_max_bytes: number; object_max_bytes: number;
  envelope_decode_max_bytes: number; snapshot_decode_max_bytes: number;
  job_max_bytes: number; global_max_bytes: number; job_ttl_seconds: number;
  build_timeout_seconds: number; freeze_timeout_ms: number; active_builds_per_room: number;
  workers: number; retained_jobs_max: number; cut_ttl_seconds: number; cut_max_records: number;
}
export const defaultLimits: Readonly<Limits> = {
  chunk_max_bytes: 2 * 1024 * 1024, prefetch_chunks: 2,
  catalog_page_max_bytes: 256 * 1024, catalog_fanout: 64,
  root_max_bytes: 16 * 1024, object_max_bytes: 256 * 1024 * 1024,
  envelope_decode_max_bytes: 16 * 1024 * 1024, snapshot_decode_max_bytes: 16 * 1024 * 1024,
  job_max_bytes: 1024 * 1024 * 1024, global_max_bytes: 2 * 1024 * 1024 * 1024,
  job_ttl_seconds: 3600, build_timeout_seconds: 300, freeze_timeout_ms: 5000,
  active_builds_per_room: 1, workers: 1, retained_jobs_max: 64,
  cut_ttl_seconds: 30 * 86400, cut_max_records: 100000,
};
export interface Cut {
  cut_id: string; server_id: string; room_id: string; event_head: string;
  revision_head: string; issued_at: string; expires_at: string; selection: CloudRecoverySelection;
}
export type CloudRecoverySelection =
  | { scope: 'all'; include_danmaku: boolean; include_interactions: boolean }
  | { scope: 'sessions'; session_ids: string[]; include_danmaku: boolean; include_interactions: boolean }
  | { scope: 'time'; started_at: string; ended_at: string; include_danmaku: boolean; include_interactions: boolean };
export interface CreateJob {
  request_id: string; mode: 'baseline' | 'delta'; expected_server_id: string; from_cut_id?: string;
  selection: CloudRecoverySelection;
}
export interface Chunk { index: number; byte_size: number; sha256: string }
export interface CatalogRef {
  object_id: string; kind: 'catalog_index' | 'catalog_leaf'; level: number;
  byte_size: string; sha256: string; chunk_count: 1;
}
export interface ObjectEntry {
  type: 'object'; object_id: string; kind: 'facts' | 'baseline' | 'effects' | 'snapshot';
  stream_id: string; stream_ordinal: number; media_type: 'application/json' | 'application/x-ndjson';
  byte_size: string; sha256: string; chunk_count: number; chunks: Chunk[];
}
export interface SnapshotRef {
  type: 'snapshot_ref'; server_id: string; room_id: string; snapshot_id: string;
  availability: 'available' | 'expired' | 'missing'; result: 'success' | 'failed' | null;
  object_id: string | null; sha256: string | null; reason: string | null;
}
export type CatalogEntry = ObjectEntry | SnapshotRef;
export type Catalog = { kind: 'catalog_index'; level: number; children: CatalogRef[] }
  | { kind: 'catalog_leaf'; level: 0; entries: CatalogEntry[] };
export interface Root {
  contract_version: typeof contractVersion; serialization_version: typeof serializationVersion;
  job_id: string; state: 'ready'; mode: 'baseline' | 'delta'; server_id: string; room_id: string;
  created_at: string; expires_at: string; cut: Cut; from_cut: Cut | null;
  selection: CloudRecoverySelection;
  absorbed_revisions: { from: string; through: string } | null;
  counts: { facts: string; missing_ranges: string; pending_assignments: string };
  streams: { facts: 'facts'; baseline: 'baseline'; effects: 'effects' | null };
  catalog_root: CatalogRef; limits: Limits;
}
export interface Fact {
  server_id: string; room_id: string; server_sequence: string; server_session_id: string | null;
  received_at: string; bilibili_timestamp: string | null; command: string; protocol_version: number;
  raw_payload: { kind: 'json'; value: Json } | { kind: 'binary'; encoding: 'base64'; value: string; outer: Json };
  connection_id: string; login_account_uid: string; upstream_event_id: string | null;
  user_uid: string | null; command_category: string | null; is_paid: boolean | null;
  business_id: string | null; combo_id: string | null; index_extractor_version: string | null;
  decode_status: string; duplicate_of_sequence: string | null; quality_flags: string[]; snapshot_ids: string[];
}
export interface SessionIdentity {
  type: 'session_identity'; server_id: string; room_id: string; server_session_id: string;
  source_live_started_at: string | null; evidence: 'persisted_session' | null;
}
export interface SessionState {
  type: 'session_state'; server_session_id: string;
  availability: 'available' | 'expired' | 'deleted'; broadcaster_snapshot: Json;
  title: string | null; area: string | null; source_live_started_at: string | null;
  capture_started_at: string; captured_start: boolean; ended_at: string | null;
  end_evidence: string | null; ended_discovered_at: string | null;
  live_status: 'ongoing' | 'ended' | 'unknown'; recording_status: 'recording' | 'reconnecting' | 'stopped';
  stopped_at: string | null; stop_reason: string | null;
  quality: 'pending' | 'complete' | 'incomplete'; quality_reasons: string[]; pending_evidence: Json;
  min_sequence: string | null; max_sequence: string | null; event_count: string; expires_at: string | null;
}
export interface Assignment {
  type: 'assignment'; from_sequence: string; through_sequence: string; server_session_id: string | null;
}
export interface Connection {
  type: 'connection'; connection_id: string; server_session_ids: string[];
  started_at: string; ended_at: string | null; login_status: 'valid' | 'invalid' | 'unconfirmed';
  disconnect_reason: string | null; recovery_reason: string | null; recovered_at: string | null;
  gap_start: string | null; gap_end: string | null; quality_impact: 'none' | 'pending' | 'confirmed';
}
export interface Quality {
  type: 'quality'; issue_id: string; server_session_id: string | null; connection_id: string | null;
  category: string; occurred_at: string; recovered_at: string | null;
  quality_impact: 'none' | 'pending' | 'confirmed'; gap_start: string | null; gap_end: string | null;
}
export interface MissingRange {
  type: 'missing_range'; kind: 'cleared' | 'loss' | 'unknown_gap'; from_sequence: string;
  through_sequence: string; reason: string; issue_id: string | null;
}
export interface Cover {
  type: 'cover_metadata'; resource_id: string; server_session_id: string;
  source_url: string | null; mime_type: string | null; byte_size: string | null;
  fetched_at: string | null; discovered_at: string; next_discovered_at: string | null;
  source_changed_at: string | null; time_source: string; result: 'pending' | 'success' | 'failed' | 'deleting';
  failure_reason: string | null; availability: 'available' | 'expired' | 'deleted'; file_url: string | null;
}
export type BaselineRow = SessionIdentity | SessionState | Assignment | Connection | Quality | MissingRange | Cover;
export interface Snapshot {
  server_id: string; room_id: string; snapshot_id: string;
  kind: 'room_info' | 'gift_config' | 'gift_effect_config'; requested_at: string; fetched_at: string;
  result: 'success' | 'failed'; failure_reason: string | null; raw_data: Json;
}
interface EffectBase { effect_index: number; basis_event_head: string }
export type Effect = EffectBase & (
  | { type: 'session_upsert'; session: Omit<SessionState, 'type'> }
  | { type: 'assignment_replace'; from_sequence: string; through_sequence: string; server_session_id: string | null }
  | { type: 'connection_upsert'; connection: Omit<Connection, 'type'> }
  | { type: 'quality_upsert'; quality: Omit<Quality, 'type'> }
  | { type: 'source_availability'; from_sequence: string; through_sequence: string; availability: 'expired' | 'deleted'; reason: string }
  | { type: 'session_tombstone'; server_session_id: string; availability: 'expired' | 'deleted'; reason: string }
  | { type: 'snapshot_reference'; snapshot: SnapshotRef }
  | { type: 'cover_upsert'; cover: Omit<Cover, 'type'> }
);

