import { CloudDownload as LucideCloudDownload, ChevronDown as LucideChevronDown } from "lucide-react";
import { useState, useSyncExternalStore } from 'react';
import type { CloudRecoveryRunProgress } from '../cloudSync/cloudRecoveryRunner.ts';
import { cloudRecoveryTask } from '../cloudSync/cloudRecoveryRuntime.ts';
import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

const STAGES = [
  { phase: 'preparing', label: '准备记录' },
  { phase: 'downloading', label: '下载' },
  { phase: 'restoring', label: '写入档案' },
  { phase: 'finalizing', label: '整理档案' },
] as const;

const percent = (progress: CloudRecoveryRunProgress | null) => progress && progress.total > 0
  ? Math.min(100, Math.round(progress.current / progress.total * 100)) : 0;

const phaseLabel = (progress: CloudRecoveryRunProgress | null) => {
  const stage = STAGES.find(value => value.phase === progress?.phase);
  return stage?.label ?? (progress?.phase === 'complete' ? '恢复完成' : '准备记录');
};

function CloudDownloadIcon() {
  return <LucideCloudDownload aria-hidden="true" className="size-4 shrink-0" />;
}

export function CloudRecoveryProgress() {
  const snapshot = useSyncExternalStore(cloudRecoveryTask.subscribe, cloudRecoveryTask.getSnapshot, cloudRecoveryTask.getSnapshot);
  const [expanded, setExpanded] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  if (snapshot.status === 'idle') return null;
  const running = snapshot.status === 'starting' || snapshot.status === 'running';
  const value = percent(snapshot.progress);
  const activeStage = STAGES.findIndex(stage => stage.phase === snapshot.progress?.phase);
  const summary = snapshot.status === 'complete' ? '恢复完成'
    : snapshot.status === 'paused' ? '已暂停'
    : snapshot.status === 'failed' ? '恢复失败'
    : `${phaseLabel(snapshot.progress)}${snapshot.progress?.phase === 'finalizing' || snapshot.progress?.phase === 'preparing' ? '' : ` ${value}%`}`;
  const pause = () => {
    cloudRecoveryTask.pause();
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'cancel', action: 'restore', outcome: 'paused' });
  };
  const retry = () => {
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'request', action: 'restore-retry', outcome: 'started' });
    void cloudRecoveryTask.retry();
  };
  const restartFully = () => {
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'request', action: 'restore-full-restart', outcome: 'started' });
    void cloudRecoveryTask.restartFully();
  };
  const cancelRecovery = async () => {
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'cancel', action: 'restore', outcome: 'discarded' });
    await cloudRecoveryTask.cancelRecovery();
  };

  return <aside className="absolute bottom-12 right-4 z-40 w-[min(312px,calc(100%-2rem))]" aria-label="云端恢复进度">
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/25">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ring">
        <span className={running ? 'text-accent-text' : snapshot.status === 'failed' ? 'text-danger' : 'text-success'}><CloudDownloadIcon /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate ui-type-control font-medium text-t1">{snapshot.ownerName || `直播间 ${snapshot.roomId}`}</span>
          <span className="block ui-type-micro text-t3">{summary}</span>
        </span>
        <LucideChevronDown aria-hidden="true" className={`size-4 shrink-0 text-t3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {running && <div className="h-0.5 bg-line" aria-hidden="true"><div className="h-full origin-left bg-accent transition-transform duration-[180ms] motion-reduce:transition-none" style={{ transform: `scaleX(${(snapshot.progress?.phase === 'preparing' ? 8 : snapshot.progress?.phase === 'finalizing' ? 96 : value) / 100})` }} /></div>}
      {expanded && <div role="status" className="border-t border-line px-3 py-3">
        <ol className="grid grid-cols-4 gap-1" aria-label="恢复阶段">
          {STAGES.map((stage, index) => {
            const complete = snapshot.status === 'complete' || activeStage > index;
            const active = running && activeStage === index;
            return <li key={stage.phase} className={`grid justify-items-center gap-1 text-center ui-type-micro ${complete || active ? 'text-accent-text' : 'text-t3'}`}>
              <span className={`size-2 rounded-full ${complete ? 'bg-success-indicator' : active ? 'bg-accent' : 'bg-line'}`} />
              <span>{stage.label}</span>
            </li>;
          })}
        </ol>
        {(snapshot.notice || snapshot.error) && <p className={`mt-3 ui-type-meta ${snapshot.error ? 'text-danger' : 'text-t2'}`}>{snapshot.error ?? snapshot.notice}</p>}
        <div className="mt-3 flex items-center justify-end gap-2">
          {running && <button type="button" onClick={pause} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">暂停</button>}
          {snapshot.status === 'failed' && snapshot.canRestartFully && <button type="button" onClick={restartFully} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">重新完整恢复</button>}
          {(snapshot.status === 'paused' || snapshot.status === 'failed') && <button type="button" onClick={retry} className="h-8 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover active:bg-accent-solid-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">重试</button>}
          {snapshot.status !== 'complete' && <button type="button" onClick={() => setConfirmCancel(true)} className="h-8 rounded-md px-2 ui-type-control text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">取消恢复</button>}
          {!running && <button type="button" onClick={() => cloudRecoveryTask.dismiss()} className="h-8 rounded-md px-2 ui-type-control text-t3 hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">关闭</button>}
        </div>
      </div>}
    </div>
    {confirmCancel && <ConfirmDialog title="确认取消恢复" description="本次恢复新增的记录将被删除，恢复进度也会清除。此前已有的档案不会受到影响。" confirmLabel="取消恢复" confirmTone="danger" errorMessage="取消恢复失败，请重试。" onCancel={() => setConfirmCancel(false)} onConfirm={cancelRecovery} />}
  </aside>;
}
