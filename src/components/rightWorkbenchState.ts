export const RIGHT_WORKBENCH_COLLAPSED_WIDTH = 64;
/** 展开宽度包含面板内外留白；收起轨道与展开面板的几何增量为336px。 */
export const RIGHT_WORKBENCH_DEFAULT_WIDTH = 400;
export const RIGHT_WORKBENCH_EXPANDED_WIDTH = RIGHT_WORKBENCH_DEFAULT_WIDTH;
export const RIGHT_WORKBENCH_MIN_WIDTH = 320;
export const RIGHT_WORKBENCH_MAX_WIDTH = 560;
export const STYLE_PREVIEW_WORKBENCH_MAX_WIDTH = 960;
export const STYLE_PREVIEW_WORKBENCH_MIN_WIDTH = 260;
export const RIGHT_WORKBENCH_PANEL_DELTA = RIGHT_WORKBENCH_EXPANDED_WIDTH - RIGHT_WORKBENCH_COLLAPSED_WIDTH;

export function clampRightWorkbenchWidth(width: number, maximum = RIGHT_WORKBENCH_MAX_WIDTH, minimum = RIGHT_WORKBENCH_MIN_WIDTH): number {
  if (!Number.isFinite(width)) return RIGHT_WORKBENCH_DEFAULT_WIDTH;
  return Math.min(maximum, Math.max(minimum, Math.round(width)));
}

export function rightWorkbenchPanelDelta(width = RIGHT_WORKBENCH_DEFAULT_WIDTH, maximum = RIGHT_WORKBENCH_MAX_WIDTH, minimum = RIGHT_WORKBENCH_MIN_WIDTH): number {
  return clampRightWorkbenchWidth(width, maximum, minimum) - RIGHT_WORKBENCH_COLLAPSED_WIDTH;
}

export function rightWorkbenchWidth(expanded: boolean, expandedWidth = RIGHT_WORKBENCH_DEFAULT_WIDTH, maximum = RIGHT_WORKBENCH_MAX_WIDTH, minimum = RIGHT_WORKBENCH_MIN_WIDTH): number {
  return expanded ? clampRightWorkbenchWidth(expandedWidth, maximum, minimum) : RIGHT_WORKBENCH_COLLAPSED_WIDTH;
}

export function rightWorkbenchToggleLabel(expanded: boolean): string {
  return expanded ? "收起功能面板" : "展开功能面板";
}
