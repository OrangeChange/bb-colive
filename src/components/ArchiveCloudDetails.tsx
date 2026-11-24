import type { ArchiveCloudMetadata } from '../archive/archiveCloudMetadata';
import { formatArchiveDateTime, formatArchiveRecordingStatus } from '../archive/archiveDisplay';
import { recoveryTimestamp } from '../cloudSync/recoverySessionMetadata';
import { recoveryCoverReference } from '../cloudSync/recoveryCovers';
import { ArchiveCoverThumbnail } from './ArchiveCoverThumbnail';

const date = (value: string | null) => formatArchiveDateTime(recoveryTimestamp(value));
const reasons: Record<string, string> = {
  late_join: '开播后开始记录', capture_interrupted: '记录中断', websocket_disconnected: '连接断开',
  heartbeat_timeout: '连接超时', login_invalid: '登录失效', account_changed: '账号切换',
  opening_boundary_unknown: '未确认开播边界', closing_boundary_unknown: '未确认下播边界',
  source_time_unknown: '开播时间未知', capture_gap_unconfirmed: '记录中断待确认',
  pending_writes: '记录尚未写完', state_query_unavailable: '直播状态查询失败',
  login_validity_unconfirmed: '登录状态待确认', session_assignment_unconfirmed: '事件所属场次待确认',
  database_write_failure: '记录保存失败', queue_overflow: '记录队列已满', connection_prepare_failed: '连接准备失败',
};

export function ArchiveCloudDetails({ metadata }: { metadata: ArchiveCloudMetadata }) {
  const state = metadata.state;
  return <details className="shrink-0 border-b border-line px-3 py-2 ui-type-control text-t2">
    <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">云端场次资料</summary>
    <div className="mt-2 max-h-60 overflow-y-auto space-y-2">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt>分区</dt><dd>{state.area || '未知'}</dd>
        <dt>开始记录</dt><dd>{date(state.capture_started_at)}</dd>
        <dt>结束时间</dt><dd>{date(state.ended_at)}</dd>
        {state.ended_discovered_at && <><dt>发现结束</dt><dd>{date(state.ended_discovered_at)}（不是准确结束时间）</dd></>}
        <dt>云端记录</dt><dd>{formatArchiveRecordingStatus(state.recording_status)}</dd>
        <dt>云端来源</dt><dd>{state.availability === 'available' ? '可用' : state.availability === 'expired' ? '已过期，本地记录保留' : '已删除，本地记录保留'}</dd>
      </dl>
      {state.quality_reasons.length > 0 && <p>记录情况：{state.quality_reasons.map(value => reasons[value] ?? '记录异常').join('、')}</p>}
      {Array.isArray(state.pending_evidence) && state.pending_evidence.length > 0 && <p>待确认：{state.pending_evidence.map(value => reasons[String(value)] ?? '记录状态待确认').join('、')}</p>}
      {metadata.connections.length > 0 && <div><h3 className="ui-type-section-title">连接记录</h3>{metadata.connections.map(item => <p key={item.connection_id}>
        {date(item.started_at)} — {item.ended_at ? date(item.ended_at) : '未记录结束时间'} · {item.login_status === 'valid' ? '登录有效' : item.login_status === 'invalid' ? '登录失效' : '登录待确认'}
        {item.gap_start && <> · 缺口 {date(item.gap_start)} — {date(item.gap_end)}</>}
      </p>)}</div>}
      {metadata.quality.length > 0 && <div><h3 className="ui-type-section-title">质量记录</h3>{metadata.quality.map(item => <p key={item.issue_id}>
        {date(item.occurred_at)} · {reasons[item.category] ?? '记录异常'} · {item.quality_impact === 'confirmed' ? '已确认缺口' : item.quality_impact === 'pending' ? '待确认' : '无已确认缺口'}
        {item.gap_start && <> · {date(item.gap_start)} — {date(item.gap_end)}</>}
      </p>)}</div>}
      {metadata.missingRanges.length > 0 && <p>缺失记录：{metadata.missingRanges.map(item => `${item.kind === 'cleared' ? '已清理' : item.kind === 'loss' ? '记录丢失' : '缺口待确认'} ${item.from_sequence}–${item.through_sequence}`).join('；')}</p>}
      {metadata.covers.length > 0 && <div><h3 className="ui-type-section-title">历史封面</h3><div className="mt-1 flex flex-wrap gap-3">{metadata.covers.map(cover => <div key={cover.resource_id}>
        <ArchiveCoverThumbnail url={cover.localUrl ?? (cover.result === 'success' && cover.mime_type && cover.availability === 'available' ? recoveryCoverReference(metadata.serverId, cover.resource_id, cover.mime_type) : null)} alt="历史封面" size="session-list" />
        <p className="ui-type-micro text-t3">{date(cover.discovered_at)}</p>
      </div>)}</div></div>}
    </div>
  </details>;
}
