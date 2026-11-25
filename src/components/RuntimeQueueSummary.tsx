import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
export interface RuntimeQueueSummaryProps {
  current: string | null;
  pendingCount: number;
  discardedCount: number;
  failedCount: number;
  emptyText?: string;
}

export function RuntimeQueueStatus({ text, state }: { text: string; state: string }) {
  useUiLanguage();
  return <span className="runtime-queue-status ui-type-meta" data-state={state}><span aria-hidden="true" />{text}</span>;
}

export function RuntimeQueueSummary({ current, pendingCount, discardedCount, failedCount, emptyText = uiText("runtimeQueueSummary.RuntimeQueueSummary") }: RuntimeQueueSummaryProps) {
  useUiLanguage();
  return (
    <>
      <p aria-label={uiText("runtimeQueueSummary.aria_label")} className={`runtime-queue-current ui-type-control ${current ? "text-t1" : "text-t3"}`}>{current ?? emptyText}</p>
      <dl className="runtime-queue-summary mt-2">
        <div><dt>{uiText("runtimeQueueSummary.RuntimeQueueSummary2")}</dt><dd>{pendingCount}</dd></div>
        <div><dt>{uiText("runtimeQueueSummary.RuntimeQueueSummary3")}</dt><dd>{discardedCount}</dd></div>
        <div><dt>{uiText("runtimeQueueSummary.RuntimeQueueSummary4")}</dt><dd className={failedCount > 0 ? "text-danger" : undefined}>{failedCount}</dd></div>
      </dl>
    </>
  );
}
