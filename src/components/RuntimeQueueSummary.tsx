export interface RuntimeQueueSummaryProps {
  current: string | null;
  pendingCount: number;
  discardedCount: number;
  failedCount: number;
  emptyText?: string;
}

export function RuntimeQueueStatus({ text, state }: { text: string; state: string }) {
  return <span className="runtime-queue-status ui-type-meta" data-state={state}><span aria-hidden="true" />{text}</span>;
}

export function RuntimeQueueSummary({ current, pendingCount, discardedCount, failedCount, emptyText = "等待下一条播报" }: RuntimeQueueSummaryProps) {
  return (
    <>
      <p aria-label="当前播报" className={`runtime-queue-current ui-type-control ${current ? "text-t1" : "text-t3"}`}>{current ?? emptyText}</p>
      <dl className="runtime-queue-summary mt-2">
        <div><dt>待播</dt><dd>{pendingCount}</dd></div>
        <div><dt>已丢弃</dt><dd>{discardedCount}</dd></div>
        <div><dt>失败</dt><dd className={failedCount > 0 ? "text-danger" : undefined}>{failedCount}</dd></div>
      </dl>
    </>
  );
}
