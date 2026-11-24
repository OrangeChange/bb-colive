import type { ReviewOwnerMode } from "../archive/archiveTypes.ts";

export function ReviewOwnerToolbar({
  mode,
  onModeChange,
}: {
  mode: ReviewOwnerMode;
  onModeChange: (mode: ReviewOwnerMode) => void;
}) {
  const buttonClass = "inline-flex h-7 items-center rounded border border-transparent px-3 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

  return (
    <div role="group" aria-label="主播档案查看方式" className="review-owner-toolbar inline-flex w-fit flex-wrap items-center rounded-md border border-line bg-bg p-0.5">
      <button
        type="button"
        aria-pressed={mode === "sessions"}
        className={`${buttonClass} ${mode === "sessions" ? "border-accent bg-accent-subtle text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`}
        onClick={() => onModeChange("sessions")}
      >场次</button>
      <button
        type="button"
        aria-pressed={mode === "events"}
        className={`${buttonClass} ${mode === "events" ? "border-accent bg-accent-subtle text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`}
        onClick={() => onModeChange("events")}
      >事件检索</button>
    </div>
  );
}
