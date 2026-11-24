export interface OwnerEventResultsCache<T> {
  ownerId: string;
  queryKey: string;
  page: T;
}

export function shouldShowOwnerEventSearchLoading<T>(
  cache: OwnerEventResultsCache<T> | null,
  ownerId: string,
  queryKey: string,
): boolean {
  return !(cache && cache.ownerId === ownerId && cache.queryKey === queryKey);
}

export function getOwnerEventDisplayPage<T>(
  cache: OwnerEventResultsCache<T> | null,
  ownerId: string,
  hasConditions: boolean,
): T | null {
  if (!cache || !hasConditions || cache.ownerId !== ownerId) return null;
  return cache.page;
}
