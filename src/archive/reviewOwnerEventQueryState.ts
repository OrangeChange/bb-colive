import type {
  ArchiveOwnerEventGroupPage,
  ArchiveOwnerEventMatchGroup,
  ArchiveSortDirection,
  ReviewOwnerEventQuery,
} from "./archiveTypes.ts";

export function createOwnerEventQueryKey(
  ownerId: string,
  query: Pick<ReviewOwnerEventQuery, "filters" | "sort" | "direction">,
): string {
  return JSON.stringify({
    ownerId,
    filters: query.filters,
    sort: query.sort,
    direction: query.direction,
  });
}

function compareGroupValue(left: number | null | undefined, right: number | null | undefined, direction: ArchiveSortDirection): number {
  if (left == null || right == null) {
    if (left == null && right == null) return 0;
    return left == null ? (direction === "asc" ? -1 : 1) : (direction === "asc" ? 1 : -1);
  }
  const comparison = left === right ? 0 : left < right ? -1 : 1;
  return direction === "asc" ? comparison : -comparison;
}

function sortValue(group: ArchiveOwnerEventMatchGroup, sort: ReviewOwnerEventQuery["sort"]): number | null {
  switch (sort) {
    case "sessionStartedAt":
      return group.session.startedAt;
    case "matchCount":
      return group.matchCount;
    default:
      return group.latestMatchTs;
  }
}

export function mergeOwnerEventGroupPage(
  current: ArchiveOwnerEventGroupPage,
  refreshed: ArchiveOwnerEventGroupPage,
  sort: ReviewOwnerEventQuery["sort"],
  direction: ArchiveSortDirection,
): ArchiveOwnerEventGroupPage {
  const groupsBySession = new Map<string, ArchiveOwnerEventMatchGroup>();
  for (const group of current.items) groupsBySession.set(group.session.sessionId, group);
  for (const group of refreshed.items) groupsBySession.set(group.session.sessionId, group);

  const items = [...groupsBySession.values()].sort((left, right) => {
    const bySelectedValue = compareGroupValue(sortValue(left, sort), sortValue(right, sort), direction);
    return bySelectedValue || left.session.sessionId.localeCompare(right.session.sessionId);
  });
  return { items, hasMore: refreshed.hasMore, nextOffset: refreshed.nextOffset };
}
