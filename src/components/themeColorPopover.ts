export type ThemeColorPopoverPosition = { left: number; top: number };

export function placeThemeColorPopover(
  anchor: { left: number; bottom: number },
  viewport: { width: number; height: number },
  panel: { width: number; height: number } = { width: 270, height: 430 },
): ThemeColorPopoverPosition {
  return {
    left: Math.max(6, Math.min(anchor.left, viewport.width - panel.width - 6)),
    top: Math.max(6, Math.min(anchor.bottom + 6, viewport.height - panel.height - 6)),
  };
}
