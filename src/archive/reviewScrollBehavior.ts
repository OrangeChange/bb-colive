export interface ReviewFilterVisibilityState {
  collapsed: boolean;
  autoCollapsed: boolean;
}

export type ReviewScrollIntent = "up" | "down";

export function isReviewFilterInteractionTarget(target: unknown): boolean {
  if (!target || (typeof target !== "object" && typeof target !== "function")) return false;
  const candidate = target as { closest?: (selector: string) => unknown };
  if (typeof candidate.closest !== "function") return false;
  return Boolean(candidate.closest("[data-review-filter-shell], .review-filter-advanced-panel, [data-ui-overlay]"));
}

export function reduceReviewFilterVisibility(
  state: ReviewFilterVisibilityState,
  intent: ReviewScrollIntent,
  atTimelineTop: boolean,
): ReviewFilterVisibilityState {
  if (intent === "down" && !state.collapsed) {
    return { collapsed: true, autoCollapsed: true };
  }
  if (intent === "up" && atTimelineTop && state.autoCollapsed) {
    return { collapsed: false, autoCollapsed: false };
  }
  return state;
}
