import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import type { ReviewOwnerMode } from "../archive/archiveTypes.ts";

export function ReviewOwnerToolbar({
  mode,
  onModeChange,
}: {
  mode: ReviewOwnerMode;
  onModeChange: (mode: ReviewOwnerMode) => void;
}) {
  useUiLanguage();
  const buttonClass = "inline-flex h-7 items-center rounded border border-transparent px-3 ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

  return (
    <div role="group" aria-label={uiText("reviewOwnerToolbar.aria_label")} className="review-owner-toolbar inline-flex w-fit flex-wrap items-center rounded-md border border-line bg-bg p-0.5">
      <button
        type="button"
        aria-pressed={mode === "sessions"}
        className={`${buttonClass} ${mode === "sessions" ? "border-accent bg-accent-subtle text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`}
        onClick={() => onModeChange("sessions")}
      >{uiText("reviewOwnerToolbar.ReviewOwnerToolbar")}</button>
      <button
        type="button"
        aria-pressed={mode === "events"}
        className={`${buttonClass} ${mode === "events" ? "border-accent bg-accent-subtle text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`}
        onClick={() => onModeChange("events")}
      >{uiText("reviewOwnerToolbar.ReviewOwnerToolbar2")}</button>
    </div>
  );
}
