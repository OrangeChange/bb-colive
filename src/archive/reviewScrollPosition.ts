export type ReviewScrollRouteLevel = "home" | "owner" | "session";

export function reviewScrollContextKey(routeKey: string, routeLevel: ReviewScrollRouteLevel, showManagement: boolean): string {
  return `${routeKey}|${routeLevel}|${showManagement ? "management" : "content"}`;
}

export function resolveReviewScrollTop({
  contextKey,
  lastContextKey,
  routeLevel,
  showManagement,
  ready,
  savedScrollTop,
}: {
  contextKey: string;
  lastContextKey: string | null;
  routeLevel: ReviewScrollRouteLevel;
  showManagement: boolean;
  ready: boolean;
  savedScrollTop: number;
}): number | null {
  if (!ready || routeLevel === "session" || contextKey === lastContextKey) return null;
  return routeLevel === "owner" && showManagement ? 0 : savedScrollTop;
}
