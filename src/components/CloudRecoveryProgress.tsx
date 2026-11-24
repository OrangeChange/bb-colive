import { uiText } from "../i18n/index.ts";
import { CloudDownload as LucideCloudDownload, ChevronDown as LucideChevronDown } from "lucide-react";
import { useState, useSyncExternalStore } from 'react';
import type { CloudRecoveryRunProgress } from '../cloudSync/cloudRecoveryRunner.ts';
import { cloudRecoveryTask } from '../cloudSync/cloudRecoveryRuntime.ts';
import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

const STAGES = [
  { phase: 'preparing', label: uiText("cloudRecoveryProgress.STAGES.label") },
  { phase: 'downloading', label: uiText("cloudRecoveryProgress.STAGES.label2") },
  { phase: 'restoring', label: uiText("cloudRecoveryProgress.STAGES.label3") },
  { phase: 'finalizing', label: uiText("cloudRecoveryProgress.STAGES.label4") },
] as const;

const percent = (progress: CloudRecoveryRunProgress | null) => progress && progress.total > 0
  ? Math.min(100, Math.round(progress.current / progress.total * 100)) : 0;

const phaseLabel = (progress: CloudRecoveryRunProgress | null) => {
  const stage = STAGES.find(value => value.phase === progress?.phase);
  return stage?.label ?? (progress?.phase === 'complete' ? uiText("cloudRecoveryProgress.phaseLabel") : uiText("cloudRecoveryProgress.phaseLabel2"));
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
  const summary = snapshot.status === 'complete' ? uiText("cloudRecoveryProgress.CloudRecoveryProgress.summary")
    : snapshot.status === 'paused' ? uiText("cloudRecoveryProgress.CloudRecoveryProgress.summary2")
    : snapshot.status === 'failed' ? uiText("cloudRecoveryProgress.CloudRecoveryProgress.summary3")
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

  return <aside className="absolute bottom-12 right-4 z-40 w-[min(312px,calc(100%-2rem))]" aria-label={uiText("cloudRecoveryProgress.aria_label")}>
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/25">
      <button type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}
        className="flex min-h-10 w-full cursor-pointer items-center gap-2 px-3 py-2 text-left hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ring">
        <span className={running ? 'text-accent-text' : snapshot.status === 'failed' ? 'text-danger' : 'text-success'}><CloudDownloadIcon /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate ui-type-control font-medium text-t1">{snapshot.ownerName || uiText("cloudRecoveryProgress.CloudRecoveryProgress", { roomId: snapshot.roomId })}</span>
          <span className="block ui-type-micro text-t3">{summary}</span>
        </span>
        <LucideChevronDown aria-hidden="true" className={`size-4 shrink-0 text-t3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {running && <div className="h-0.5 bg-line" aria-hidden="true"><div className="h-full origin-left bg-accent transition-transform duration-[180ms] motion-reduce:transition-none" style={{ transform: `scaleX(${(snapshot.progress?.phase === 'preparing' ? 8 : snapshot.progress?.phase === 'finalizing' ? 96 : value) / 100})` }} /></div>}
      {expanded && <div role="status" className="border-t border-line px-3 py-3">
        <ol className="grid grid-cols-4 gap-1" aria-label={uiText("cloudRecoveryProgress.aria_label2")}>
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
          {running && <button type="button" onClick={pause} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("cloudRecoveryProgress.CloudRecoveryProgress2")}</button>}
          {snapshot.status === 'failed' && snapshot.canRestartFully && <button type="button" onClick={restartFully} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("cloudRecoveryProgress.CloudRecoveryProgress3")}</button>}
          {(snapshot.status === 'paused' || snapshot.status === 'failed') && <button type="button" onClick={retry} className="h-8 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover active:bg-accent-solid-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("common.retry")}</button>}
          {snapshot.status !== 'complete' && <button type="button" onClick={() => setConfirmCancel(true)} className="h-8 rounded-md px-2 ui-type-control text-danger hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger">{uiText("cloudRecoveryProgress.CloudRecoveryProgress4")}</button>}
          {!running && <button type="button" onClick={() => cloudRecoveryTask.dismiss()} className="h-8 rounded-md px-2 ui-type-control text-t3 hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("common.close")}</button>}
        </div>
      </div>}
    </div>
    {confirmCancel && <ConfirmDialog title={uiText("cloudRecoveryProgress.title")} description={uiText("cloudRecoveryProgress.description")} confirmLabel={uiText("cloudRecoveryProgress.confirmLabel")} confirmTone="danger" errorMessage={uiText("cloudRecoveryProgress.errorMessage")} onCancel={() => setConfirmCancel(false)} onConfirm={cancelRecovery} />}
  </aside>;
}
