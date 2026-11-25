import { ToggleGroup, ToggleGroupItem } from "./shadcn/toggle-group";
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
  return (
    <ToggleGroup
      type="single"
      spacing={0}
      value={mode}
      onValueChange={(value) => {
        if (value === "sessions" || value === "events") onModeChange(value);
      }}
      aria-label={uiText("reviewOwnerToolbar.aria_label")}
      className="review-owner-toolbar ui-segmented ui-type-control"
    >
      <ToggleGroupItem value="sessions" className="ui-segmented-item">
        {uiText("reviewOwnerToolbar.ReviewOwnerToolbar")}
      </ToggleGroupItem>
      <ToggleGroupItem value="events" className="ui-segmented-item">
        {uiText("reviewOwnerToolbar.ReviewOwnerToolbar2")}
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
