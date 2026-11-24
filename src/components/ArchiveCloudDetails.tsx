import { uiText } from "../i18n/index.ts";
import type { ArchiveCloudMetadata } from '../archive/archiveCloudMetadata';
import { formatArchiveDateTime, formatArchiveRecordingStatus } from '../archive/archiveDisplay';
import { recoveryTimestamp } from '../cloudSync/recoverySessionMetadata';
import { recoveryCoverReference } from '../cloudSync/recoveryCovers';
import { ArchiveCoverThumbnail } from './ArchiveCoverThumbnail';

const date = (value: string | null) => formatArchiveDateTime(recoveryTimestamp(value));
const reasons: Record<string, string> = {
  late_join: uiText("archiveCloudDetails.reasons.late_join"), capture_interrupted: uiText("archiveCloudDetails.reasons.capture_interrupted"), websocket_disconnected: uiText("archiveCloudDetails.reasons.websocket_disconnected"),
  heartbeat_timeout: uiText("archiveCloudDetails.reasons.heartbeat_timeout"), login_invalid: uiText("archiveCloudDetails.reasons.login_invalid"), account_changed: uiText("archiveCloudDetails.reasons.account_changed"),
  opening_boundary_unknown: uiText("archiveCloudDetails.reasons.opening_boundary_unknown"), closing_boundary_unknown: uiText("archiveCloudDetails.reasons.closing_boundary_unknown"),
  source_time_unknown: uiText("archiveCloudDetails.reasons.source_time_unknown"), capture_gap_unconfirmed: uiText("archiveCloudDetails.reasons.capture_gap_unconfirmed"),
  pending_writes: uiText("archiveCloudDetails.reasons.pending_writes"), state_query_unavailable: uiText("archiveCloudDetails.reasons.state_query_unavailable"),
  login_validity_unconfirmed: uiText("archiveCloudDetails.reasons.login_validity_unconfirmed"), session_assignment_unconfirmed: uiText("archiveCloudDetails.reasons.session_assignment_unconfirmed"),
  database_write_failure: uiText("archiveCloudDetails.reasons.database_write_failure"), queue_overflow: uiText("archiveCloudDetails.reasons.queue_overflow"), connection_prepare_failed: uiText("archiveCloudDetails.reasons.connection_prepare_failed"),
};

export function ArchiveCloudDetails({ metadata }: { metadata: ArchiveCloudMetadata }) {
  const state = metadata.state;
  return <details className="shrink-0 border-b border-line px-3 py-2 ui-type-control text-t2">
    <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("archiveCloudDetails.ArchiveCloudDetails")}</summary>
    <div className="mt-2 max-h-60 overflow-y-auto space-y-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt>{uiText("archiveCloudDetails.ArchiveCloudDetails2")}</dt><dd>{state.area || uiText("archiveCloudDetails.ArchiveCloudDetails3")}</dd>
        <dt>{uiText("archiveCloudDetails.ArchiveCloudDetails4")}</dt><dd>{date(state.capture_started_at)}</dd>
        <dt>{uiText("archiveCloudDetails.ArchiveCloudDetails5")}</dt><dd>{date(state.ended_at)}</dd>
        {state.ended_discovered_at && <><dt>{uiText("archiveCloudDetails.ArchiveCloudDetails6")}</dt><dd>{date(state.ended_discovered_at)}{uiText("archiveCloudDetails.ArchiveCloudDetails7")}</dd></>}
        <dt>{uiText("archiveCloudDetails.ArchiveCloudDetails8")}</dt><dd>{formatArchiveRecordingStatus(state.recording_status)}</dd>
        <dt>{uiText("archiveCloudDetails.ArchiveCloudDetails9")}</dt><dd>{state.availability === 'available' ? uiText("archiveCloudDetails.ArchiveCloudDetails10") : state.availability === 'expired' ? uiText("archiveCloudDetails.ArchiveCloudDetails11") : uiText("archiveCloudDetails.ArchiveCloudDetails12")}</dd>
      </dl>
      {state.quality_reasons.length > 0 && <p>{uiText("archiveCloudDetails.ArchiveCloudDetails13")}{state.quality_reasons.map(value => reasons[value] ?? uiText("archiveCloudDetails.ArchiveCloudDetails14")).join('、')}</p>}
      {Array.isArray(state.pending_evidence) && state.pending_evidence.length > 0 && <p>{uiText("archiveCloudDetails.ArchiveCloudDetails15")}{state.pending_evidence.map(value => reasons[String(value)] ?? uiText("archiveCloudDetails.ArchiveCloudDetails16")).join('、')}</p>}
      {metadata.connections.length > 0 && <div><h3 className="ui-type-section-title">{uiText("archiveCloudDetails.ArchiveCloudDetails17")}</h3>{metadata.connections.map(item => <p key={item.connection_id}>
        {date(item.started_at)} — {item.ended_at ? date(item.ended_at) : uiText("archiveCloudDetails.ArchiveCloudDetails18")} · {item.login_status === 'valid' ? uiText("archiveCloudDetails.ArchiveCloudDetails19") : item.login_status === 'invalid' ? uiText("archiveCloudDetails.ArchiveCloudDetails20") : uiText("archiveCloudDetails.ArchiveCloudDetails21")}
        {item.gap_start && <> {uiText("archiveCloudDetails.ArchiveCloudDetails22")}{date(item.gap_start)} — {date(item.gap_end)}</>}
      </p>)}</div>}
      {metadata.quality.length > 0 && <div><h3 className="ui-type-section-title">{uiText("archiveCloudDetails.ArchiveCloudDetails23")}</h3>{metadata.quality.map(item => <p key={item.issue_id}>
        {date(item.occurred_at)} · {reasons[item.category] ?? uiText("archiveCloudDetails.ArchiveCloudDetails14")} · {item.quality_impact === 'confirmed' ? uiText("archiveCloudDetails.ArchiveCloudDetails24") : item.quality_impact === 'pending' ? uiText("archiveCloudDetails.ArchiveCloudDetails25") : uiText("archiveCloudDetails.ArchiveCloudDetails26")}
        {item.gap_start && <> · {date(item.gap_start)} — {date(item.gap_end)}</>}
      </p>)}</div>}
      {metadata.missingRanges.length > 0 && <p>{uiText("archiveCloudDetails.ArchiveCloudDetails27")}{metadata.missingRanges.map(item => `${item.kind === 'cleared' ? uiText("archiveCloudDetails.ArchiveCloudDetails28") : item.kind === 'loss' ? uiText("archiveCloudDetails.ArchiveCloudDetails29") : uiText("archiveCloudDetails.ArchiveCloudDetails30")} ${item.from_sequence}–${item.through_sequence}`).join('；')}</p>}
      {metadata.covers.length > 0 && <div><h3 className="ui-type-section-title">{uiText("archiveCloudDetails.ArchiveCloudDetails31")}</h3><div className="mt-1 flex flex-wrap gap-3">{metadata.covers.map(cover => <div key={cover.resource_id}>
        <ArchiveCoverThumbnail url={cover.localUrl ?? (cover.result === 'success' && cover.mime_type && cover.availability === 'available' ? recoveryCoverReference(metadata.serverId, cover.resource_id, cover.mime_type) : null)} alt={uiText("archiveCloudDetails.alt")} size="session-list" />
        <p className="ui-type-micro text-t3">{date(cover.discovered_at)}</p>
      </div>)}</div></div>}
    </div>
  </details>;
}
