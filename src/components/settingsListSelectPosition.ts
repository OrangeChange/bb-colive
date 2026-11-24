export type SettingsMenuPositionInput = {
  triggerTop: number;
  triggerBottom: number;
  triggerLeft: number;
  triggerWidth: number;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  gap?: number;
  viewportPadding?: number;
  maxMenuHeight?: number;
};

export type SettingsMenuPosition = {
  left: number;
  top: number;
  maxHeight: number;
  placement: "above" | "below";
};

export function resolveSettingsMenuPosition({
  triggerTop,
  triggerBottom,
  triggerLeft,
  triggerWidth,
  viewportWidth,
  viewportHeight,
  contentHeight,
  gap = 8,
  viewportPadding = 8,
  maxMenuHeight = 320,
}: SettingsMenuPositionInput): SettingsMenuPosition {
  const availableBelow = Math.max(0, viewportHeight - triggerBottom - gap - viewportPadding);
  const availableAbove = Math.max(0, triggerTop - gap - viewportPadding);
  const naturalHeight = Math.max(0, contentHeight);
  const placement: SettingsMenuPosition["placement"] = naturalHeight > availableBelow && availableAbove > availableBelow
    ? "above"
    : "below";
  const availableHeight = placement === "above" ? availableAbove : availableBelow;
  const maxHeight = Math.min(maxMenuHeight, availableHeight);
  const menuHeight = Math.min(naturalHeight || maxHeight, maxHeight);
  const top = placement === "above"
    ? Math.max(viewportPadding, triggerTop - gap - menuHeight)
    : Math.min(viewportHeight - viewportPadding - menuHeight, triggerBottom + gap);
  const left = Math.min(
    Math.max(viewportPadding, triggerLeft),
    Math.max(viewportPadding, viewportWidth - triggerWidth - viewportPadding),
  );

  return { left, top, maxHeight, placement };
}
