import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildCloudRecoverySelection,
  createCloudRecoverySelectionDraft,
  type CloudRecoveryScope,
  type CloudRecoverySelectionDraft,
} from '../cloudSync/cloudRecoverySelection.ts';
import type { CloudRecoverySelection } from '../cloudSync/recoveryContract.ts';
import {
  createRecoveryTransport,
  type CloudRecoverySessionItem,
} from '../cloudSync/recoveryTransport.ts';
import { accentSolidButtonClass } from './actionButtonStyles.ts';
import { recoveryTimestamp } from '../cloudSync/recoverySessionMetadata.ts';
import { readRecoverySessionPages } from '../cloudSync/recoverySessionPages.ts';
import { ArchiveCoverThumbnail } from './ArchiveCoverThumbnail';

const scopeOptions: Array<{ value: CloudRecoveryScope; label: string; description: string }> = [
  { value: 'all', label: '全部场次', description: '恢复云端保存的全部记录' },
  { value: 'sessions', label: '选择场次', description: '只恢复勾选的直播场次' },
  { value: 'time', label: '指定时间', description: '恢复与时间范围有交集的场次' },
];

const dateLabel = (value?: string | null) => {
  if (!value) return '时间未知';
  const time = new Date(recoveryTimestamp(value) ?? NaN);
  return Number.isFinite(time.getTime())
    ? time.toLocaleString('zh-CN', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '时间未知';
};

const sessionStatus = (session: CloudRecoverySessionItem) => {
  if (session.live_status === 'ongoing') return '直播中';
  if (session.live_status === 'ended') return '已结束';
  return '状态未知';
};

const qualityLabel = (quality?: CloudRecoverySessionItem['quality']) => {
  if (quality === 'complete') return '完整';
  if (quality === 'incomplete') return '不完整';
  return '待确认';
};

export function CloudRecoveryDialog({
  roomId,
  ownerName,
  onClose,
  onOpenSettings,
  onStart,
}: {
  roomId: string;
  ownerName: string;
  onClose: () => void;
  onOpenSettings: () => void;
  onStart: (selection: CloudRecoverySelection) => Promise<'started' | 'binding-required' | 'busy'>;
}) {
  const [draft, setDraft] = useState<CloudRecoverySelectionDraft>(createCloudRecoverySelectionDraft);
  const [sessions, setSessions] = useState<CloudRecoverySessionItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestGeneration = useRef(0);
  const [loadError, setLoadError] = useState('');
  const [validationError, setValidationError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const transport = useRef(createRecoveryTransport()).current;

  const load = async (cursor?: string) => {
    const generation = ++requestGeneration.current;
    const active = () => requestGeneration.current === generation;
    setLoading(true);
    setLoadError('');
    try {
      await readRecoverySessionPages(value => transport.listSessions(roomId, value), page => {
        setSessions(current => [...new Map([...current, ...page.items].map(item => [item.session_id, item])).values()]);
        setNextCursor(page.hasMore ? page.nextCursor : null);
      }, active, cursor);
    } catch {
      if (active()) setLoadError('无法读取全部云端场次，请检查服务器连接后重试');
    } finally {
      if (active()) setLoading(false);
    }
  };

  useEffect(() => { void load(); return () => { requestGeneration.current++; }; }, []);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, [onClose, submitting]);

  const toggleSession = (sessionId: string) => {
    setValidationError('');
    setDraft(current => ({
      ...current,
      sessionIds: current.sessionIds.includes(sessionId)
        ? current.sessionIds.filter(value => value !== sessionId)
        : [...current.sessionIds, sessionId],
    }));
  };

  const submit = async () => {
    if (submitting || loading || loadError || nextCursor) return;
    const built = buildCloudRecoverySelection(draft);
    if (!built.selection) {
      setValidationError(built.error ?? '请检查恢复范围');
      return;
    }
    setSubmitting(true);
    setValidationError('');
    try {
      const result = await onStart(built.selection);
      if (result === 'binding-required') {
        onClose();
        onOpenSettings();
        return;
      }
      if (result === 'busy') {
        setValidationError('已有恢复任务正在运行');
        return;
      }
      onClose();
    } catch {
      setValidationError('恢复任务未能开始，请检查服务器连接后重试');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 z-[100] flex items-center justify-center p-3" role="presentation">
      <button type="button" aria-label="关闭恢复窗口" disabled={submitting}
        className="absolute inset-0 h-full w-full border-0 bg-black/45"
        onClick={onClose} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}
        className="ui-modal-surface relative z-10 flex max-h-[min(760px,calc(100vh-24px))] w-[min(680px,calc(100vw-24px))] flex-col overflow-hidden rounded-lg border border-line bg-surface shadow-2xl shadow-black/35">
        <header className="shrink-0 border-b border-line px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 id={titleId} className="ui-type-page-title truncate text-t1">从云端恢复 · {ownerName}</h2>
              <p id={descriptionId} className="mt-1 ui-type-control text-t3">选择恢复范围和内容，开始后可在右下角查看进度。</p>
            </div>
            <button ref={closeRef} type="button" disabled={submitting} onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-line text-t2 transition-colors enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="关闭恢复窗口">×</button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && <div className="mb-3 min-h-9 rounded-md border border-line bg-bg px-3 py-2 ui-type-control text-t3">正在读取云端场次…</div>}
          {!loading && loadError && <div className="mb-3 flex min-h-9 flex-wrap items-center justify-between gap-2 rounded-md border border-danger/40 bg-bg px-3 py-2">
            <p role="alert" className="ui-type-control text-danger">{loadError}</p>
            <button type="button" className="h-8 rounded-md border border-line px-3 ui-type-control text-t2 hover:bg-raised" onClick={() => void load(nextCursor ?? undefined)}>重试</button>
          </div>}
          <fieldset>
            <legend className="ui-type-section-title text-t1">恢复范围</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {scopeOptions.map(option => <label key={option.value}
                className={`cursor-pointer rounded-md border px-3 py-2 transition-colors ${draft.scope === option.value ? 'border-accent bg-accent-subtle' : 'border-line bg-bg hover:border-accent/50 hover:bg-raised'}`}>
                <span className="flex items-center gap-2 ui-type-control text-t1">
                  <input type="radio" name="cloud-recovery-scope" value={option.value}
                    checked={draft.scope === option.value}
                    onChange={() => { setValidationError(''); setDraft(current => ({ ...current, scope: option.value })); }} />
                  {option.label}
                </span>
                <span className="mt-1 block ui-type-micro text-t3">{option.description}</span>
              </label>)}
            </div>
          </fieldset>

          {draft.scope === 'sessions' && <section className="mt-4" aria-labelledby="cloud-session-heading">
            <div className="flex items-center justify-between gap-3">
              <h3 id="cloud-session-heading" className="ui-type-section-title text-t1">云端场次</h3>
              <span className="ui-type-meta text-t3">已选 {draft.sessionIds.length} 场</span>
            </div>
            <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-line bg-bg">
              {!loading && !loadError && sessions.length === 0 && <div className="grid min-h-24 place-items-center ui-type-control text-t3">云端没有可恢复的场次</div>}
              {sessions.map(session => <div key={session.session_id}
                className="flex items-start gap-3 border-b border-line px-3 py-2 last:border-b-0 hover:bg-raised">
                <ArchiveCoverThumbnail cloudSessionId={session.session_id} alt={`${session.title || '场次'}封面`} size="session-list" previewEnabled={false} />
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                <input className="mt-1" type="checkbox" checked={draft.sessionIds.includes(session.session_id)}
                  onChange={() => toggleSession(session.session_id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate ui-type-control text-t1">{session.title || '未命名场次'}</span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 ui-type-micro text-t3">
                    <span>{dateLabel(recoveryTimestamp(session.source_live_started_at) ? session.source_live_started_at : session.capture_started_at)}</span>
                    <span>{sessionStatus(session)}</span>
                    <span>{qualityLabel(session.quality)}</span>
                    <span>{session.event_count ?? '0'} 个事件</span>
                  </span>
                </span>
                </label>
              </div>)}
            </div>
          </section>}

          {draft.scope === 'time' && <fieldset className="mt-4">
            <legend className="ui-type-section-title text-t1">时间范围</legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 ui-type-control text-t2">开始时间
                <input type="datetime-local" value={draft.startedAt}
                  onChange={event => { setValidationError(''); setDraft(current => ({ ...current, startedAt: event.target.value })); }}
                  className="h-9 rounded-md border border-line bg-bg px-2 text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
              </label>
              <label className="grid gap-1 ui-type-control text-t2">结束时间
                <input type="datetime-local" value={draft.endedAt}
                  onChange={event => { setValidationError(''); setDraft(current => ({ ...current, endedAt: event.target.value })); }}
                  className="h-9 rounded-md border border-line bg-bg px-2 text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
              </label>
            </div>
          </fieldset>}

          <fieldset className="mt-4">
            <legend className="ui-type-section-title text-t1">恢复内容</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {([
                ['includeDanmaku', '弹幕'],
                ['includeInteractions', '互动事件'],
              ] as const).map(([key, label]) => <label key={key} className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-line bg-bg px-3 py-2 ui-type-control text-t1 hover:bg-raised">
                <input type="checkbox" checked={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.checked }))} />
                {label}
              </label>)}
            </div>
            <p className="mt-2 ui-type-micro text-t3">礼物、醒目留言、大航海、场次资料和记录质量始终恢复。</p>
          </fieldset>

          {validationError && <p role="alert" className="mt-3 ui-type-control text-danger">{validationError}</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line px-4 py-3">
          <button type="button" onClick={onOpenSettings} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">服务器设置</button>
          <div className="flex gap-2">
            <button type="button" disabled={submitting} onClick={onClose}
              className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 enabled:hover:bg-raised enabled:hover:text-t1 disabled:cursor-not-allowed disabled:opacity-50">取消</button>
            <button type="button" disabled={submitting || loading || Boolean(loadError) || Boolean(nextCursor)} onClick={() => void submit()}
              className={accentSolidButtonClass}>{submitting ? '正在开始…' : '开始恢复'}</button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
