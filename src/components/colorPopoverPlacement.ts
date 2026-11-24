export type ColorPopoverPlacement = "above" | "below";

export const COLOR_POPOVER_GAP = 8;

export function getColorPopoverPlacement(
  trigger: { top: number; bottom: number },
  viewportHeight: number,
  popoverHeight: number,
): ColorPopoverPlacement {
  const belowSpace = Math.max(0, viewportHeight - trigger.bottom - COLOR_POPOVER_GAP);
  const aboveSpace = Math.max(0, trigger.top - COLOR_POPOVER_GAP);
  if (belowSpace >= popoverHeight) return "below";
  if (aboveSpace >= popoverHeight) return "above";
  return belowSpace >= aboveSpace ? "below" : "above";
}
