import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DanmakuEvent } from "./protocol/types.ts";
import { recordFeatureDiagnostic } from "./diagnostics/featureDiagnostics.ts";
import type { ArchiveEventRecord, ArchiveRepositoryContract } from "./archive/archiveTypes.ts";
import type { FavoriteActionChange } from "./archive/favoriteActions.ts";

export const LEGACY_EVENT_ANNOTATIONS_STORAGE_KEY = "danmu-event-annotations";
export const LEGACY_FAVORITES_MIGRATION_STORAGE_KEY = "danmu-event-annotations.archive-migration-v1";
export const HISTORICAL_UNKNOWN_FAVORITE_LABEL = "历史收藏（场次未知）";
const FAVORITES_MIGRATION_VERSION = "1";

export interface FavoriteEventRecord {
  key: string;
  roomId: number;
  eventId: string;
  event: DanmakuEvent;
  favoritedAt: number;
  archiveEventKey?: string;
}

export type RegionMarks = Record<string, string>;

export interface MigrationResult {
  migrated: number;
  skipped: number;
  unmatched: number;
  unmatchedFavorites: FavoriteEventRecord[];
  unmatchedLabel: string;
  alreadyMigrated: boolean;
}

type FavoriteRepository = Pick<ArchiveRepositoryContract, "setFavorite">
  & Pick<ArchiveRepositoryContract, "saveHistoricalFavorite">
  & Partial<Pick<ArchiveRepositoryContract, "queryEvents">>;

import { getEventBookmarkKey, getEventMarkKey } from "./events/eventIdentity.ts";
export { getEventBookmarkKey, getEventMarkKey, getArchiveEventKey } from "./events/eventIdentity.ts";

function matchesFavoriteIdentity(favorite: FavoriteEventRecord, event: DanmakuEvent): boolean {
  return favorite.roomId === event.roomId
    && (getEventBookmarkKey(favorite.event) === getEventBookmarkKey(event)
      || (event.dedupe !== undefined && favorite.event.dedupe === event.dedupe));
}

export function isEventFavorited(
  favorites: readonly FavoriteEventRecord[], event: DanmakuEvent, archiveEventKey?: string,
): boolean {
  return favorites.some((favorite) => archiveEventKey && favorite.archiveEventKey
    ? favorite.archiveEventKey === archiveEventKey
    : (archiveEventKey !== undefined && favorite.key === archiveEventKey) || matchesFavoriteIdentity(favorite, event));
}

export function toggleFavoriteEvent(
  favorites: readonly FavoriteEventRecord[],
  event: DanmakuEvent,
  favoritedAt: number,
): { favorites: FavoriteEventRecord[]; favorited: boolean } {
  const existing = isEventFavorited(favorites, event);
  return {
    favorites: setFavoriteEvent(favorites, event, !existing, favoritedAt),
    favorited: !existing,
  };
}

export function setFavoriteEvent(
  favorites: readonly FavoriteEventRecord[],
  event: DanmakuEvent,
  favorited: boolean,
  favoritedAt: number,
): FavoriteEventRecord[] {
  const key = getEventBookmarkKey(event);
  const next = favorites.filter((favorite) => getEventBookmarkKey(favorite.event) !== key);
  if (!favorited) return next;
  if (isEventFavorited(favorites, event)) return [...favorites];
  return [
    ...next,
    { key, roomId: event.roomId, eventId: event.id, event, favoritedAt },
  ];
}

export function setRegionMark(marks: RegionMarks, regionKey: string, event: DanmakuEvent): RegionMarks {
  return { ...marks, [regionKey]: getEventMarkKey(event) };
}

export function bindFavoriteEvent(
  favorites: readonly FavoriteEventRecord[], event: DanmakuEvent,
  archiveEventKey: string, favorited: boolean, favoritedAt = Date.now(),
): FavoriteEventRecord[] {
  const associated = favorites.find((favorite) => favorite.archiveEventKey === archiveEventKey);
  const target = associated?.event ?? event;
  const scope = favorites.filter((favorite) => !favorite.archiveEventKey || favorite.archiveEventKey === archiveEventKey);
  const next = setFavoriteEvent(scope, target, favorited, favoritedAt);
  return [
    ...favorites.filter((favorite) => favorite.archiveEventKey && favorite.archiveEventKey !== archiveEventKey),
    ...next.map((favorite) => getEventBookmarkKey(favorite.event) === getEventBookmarkKey(target)
      ? { ...favorite, archiveEventKey } : favorite),
  ];
}

export async function refreshFavoriteProjection(
  repository: Pick<ArchiveRepositoryContract, "getEvent">,
  favorites: readonly FavoriteEventRecord[] | (() => readonly FavoriteEventRecord[]),
  change: FavoriteActionChange,
): Promise<FavoriteEventRecord[]> {
  const keys = change.kind === "set" ? [change.eventKey]
    : change.targets.filter((target) => target.sourceKind === "archive").map((target) => target.stableId);
  const relations = await Promise.all(keys.map(async (eventKey) => ({
    eventKey,
    row: await repository.getEvent(eventKey),
  })));
  let next = [...(typeof favorites === "function" ? favorites() : favorites)];
  for (const { eventKey, row } of relations) {
    const event = row ? archivePayload(row) : null;
    if (event) {
      const unmapped = next.filter((favorite) => !favorite.archiveEventKey
        && (favorite.key === eventKey || matchesFavoriteIdentity(favorite, event)));
      if (unmapped.length === 1) {
        next = next.map((favorite) => favorite === unmapped[0] ? { ...favorite, archiveEventKey: eventKey } : favorite);
      }
    }
    const associated = next.filter((favorite) => favorite.archiveEventKey === eventKey);
    if (!row?.favorited) {
      next = next.filter((favorite) => favorite.archiveEventKey !== eventKey);
    } else if (associated.length === 0 && change.kind === "set") {
      if (event) {
        // 只补充当前操作的投影，不覆盖正在等待写入的现场收藏。
        if (!next.some((favorite) => !favorite.archiveEventKey && getEventBookmarkKey(favorite.event) === getEventBookmarkKey(event))) {
          next = bindFavoriteEvent(next, event, eventKey, true);
        }
      }
    }
  }
  return next;
}

export function restoreFavoriteEvent(
  favorites: readonly FavoriteEventRecord[], event: DanmakuEvent,
  previous: readonly FavoriteEventRecord[], archiveEventKey?: string,
): FavoriteEventRecord[] {
  const associated = archiveEventKey ? previous.find((favorite) => favorite.archiveEventKey === archiveEventKey) : undefined;
  const key = getEventBookmarkKey(associated?.event ?? event);
  const matches = (favorite: FavoriteEventRecord) => archiveEventKey && favorite.archiveEventKey
    ? favorite.archiveEventKey === archiveEventKey : getEventBookmarkKey(favorite.event) === key;
  return [
    ...favorites.filter((favorite) => !matches(favorite)),
    ...previous.filter(matches),
  ];
}

export function getRegionMark(marks: RegionMarks, regionKey: string): string | null {
  return marks[regionKey] ?? null;
}

export function clearRegionMark(marks: RegionMarks, regionKey: string): RegionMarks {
  const next = { ...marks };
  delete next[regionKey];
  return next;
}

export function formatEventAge(eventTs: number, now: number): string {
  if (!Number.isFinite(eventTs) || eventTs <= 0 || !Number.isFinite(now)) return "时间未知";
  const elapsedSeconds = Math.max(0, Math.floor((now - eventTs) / 1000));
  if (elapsedSeconds < 60) return `${elapsedSeconds}秒前`;
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return `${elapsedMinutes}分钟前`;
  return `${Math.round(elapsedMinutes / 60)}小时前`;
}

interface EventAnnotationState {
  favorites: FavoriteEventRecord[];
  regionMarks: RegionMarks;
  toggleFavorite: (event: DanmakuEvent) => void;
  setFavorite: (event: DanmakuEvent, favorited: boolean) => void;
  markRegionEvent: (regionKey: string, event: DanmakuEvent) => void;
  clearRegionMark: (regionKey: string) => void;
  resetEventAnnotations: () => void;
}

export const useEventAnnotations = create<EventAnnotationState>()(
  persist(
    (set) => ({
      favorites: [],
      regionMarks: {},
      toggleFavorite: (event) => set((state) => ({ favorites: toggleFavoriteEvent(state.favorites, event, Date.now()).favorites })),
      setFavorite: (event, favorited) => set((state) => ({ favorites: setFavoriteEvent(state.favorites, event, favorited, Date.now()) })),
      markRegionEvent: (regionKey, event) => set((state) => ({ regionMarks: setRegionMark(state.regionMarks, regionKey, event) })),
      clearRegionMark: (regionKey) => set((state) => ({ regionMarks: clearRegionMark(state.regionMarks, regionKey) })),
      resetEventAnnotations: () => set({ favorites: [], regionMarks: {} }),
    }),
    {
      name: "danmu-event-annotations",
      partialize: (state) => ({ favorites: state.favorites, regionMarks: state.regionMarks }),
      merge: (persisted, current) => {
        const input = persisted as Partial<EventAnnotationState> | null;
        const favorites = Array.isArray(input?.favorites)
          ? input.favorites.filter((favorite): favorite is FavoriteEventRecord => (
            typeof favorite?.key === "string"
            && typeof favorite.roomId === "number"
            && typeof favorite.eventId === "string"
            && typeof favorite.favoritedAt === "number"
            && typeof favorite.event === "object"
            && favorite.event !== null
          ))
          : [];
        const regionMarks = input?.regionMarks && typeof input.regionMarks === "object" && !Array.isArray(input.regionMarks)
          ? Object.fromEntries(Object.entries(input.regionMarks).filter(([key, value]) => typeof key === "string" && typeof value === "string"))
          : {};
        return { ...current, favorites, regionMarks };
      },
    },
  ),
);

function getBrowserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isFavoriteEventRecord(value: unknown): value is FavoriteEventRecord {
  if (typeof value !== "object" || value === null) return false;
  const favorite = value as Partial<FavoriteEventRecord>;
  return typeof favorite.key === "string"
    && typeof favorite.roomId === "number"
    && typeof favorite.eventId === "string"
    && typeof favorite.favoritedAt === "number"
    && typeof favorite.event === "object"
    && favorite.event !== null;
}

function readLegacyFavorites(storage: Storage): FavoriteEventRecord[] {
  let raw: string | null = null;
  try {
    raw = storage.getItem(LEGACY_EVENT_ANNOTATIONS_STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const state = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as { state?: unknown }).state ?? parsed
      : null;
    if (typeof state !== "object" || state === null || Array.isArray(state)) return [];
    const favorites = (state as { favorites?: unknown }).favorites;
    return Array.isArray(favorites) ? favorites.filter(isFavoriteEventRecord) : [];
  } catch {
    return [];
  }
}

function emptyMigrationResult(alreadyMigrated = false): MigrationResult {
  return {
    migrated: 0,
    skipped: 0,
    unmatched: 0,
    unmatchedFavorites: [],
    unmatchedLabel: HISTORICAL_UNKNOWN_FAVORITE_LABEL,
    alreadyMigrated,
  };
}

function archivePayload(row: ArchiveEventRecord): DanmakuEvent | null {
  try {
    const payload: unknown = JSON.parse(row.payloadJson);
    return typeof payload === "object" && payload !== null
      ? payload as DanmakuEvent
      : null;
  } catch {
    return null;
  }
}

function matchLegacyFavorite(favorite: FavoriteEventRecord, rows: readonly ArchiveEventRecord[]): string | null {
  const exact = rows.filter((row) => row.eventKey === (favorite.archiveEventKey ?? favorite.key));
  if (exact.length === 1) return exact[0].eventKey;
  const candidates = rows.filter((row) => row.roomId === favorite.roomId)
    .map((row) => ({ row, event: archivePayload(row) })).filter((item) => item.event !== null);
  const dedupe = favorite.event.dedupe;
  const identified = candidates.filter(({ event }) => dedupe
    ? event!.dedupe === dedupe
    : getEventBookmarkKey(event!) === favorite.key);
  if (identified.length === 1) return identified[0].row.eventKey;
  const raw = candidates.filter(({ event }) => event!.id === favorite.eventId);
  if (raw.length === 1) return raw[0].row.eventKey;
  const snapshot = raw.filter(({ event }) => event!.ts === favorite.event.ts
    && event!.msgType === favorite.event.msgType && event!.user?.uid === favorite.event.user?.uid
    && event!.text === favorite.event.text && JSON.stringify(event!.gift) === JSON.stringify(favorite.event.gift)
    && JSON.stringify(event!.sc) === JSON.stringify(favorite.event.sc));
  return snapshot.length === 1 ? snapshot[0].row.eventKey : null;
}

async function readArchiveEvents(repository: FavoriteRepository): Promise<ArchiveEventRecord[] | null> {
  if (typeof repository.queryEvents !== "function") return null;
  const events: ArchiveEventRecord[] = [];
  let cursor: string | null = null;
  do {
    const page = await repository.queryEvents({ cursor, limit: 500 });
    events.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return events;
}

function recordMigrationDiagnostic(action: string, outcome: string, data?: Record<string, string | number | boolean | null>): void {
  recordFeatureDiagnostic({
    featureId: "review-archive",
    stage: outcome === "failed" ? "failure" : "success",
    action,
    outcome,
    data,
  });
}

/** 将旧 Zustand 收藏复制到档案关系；旧存储始终保留，便于未知历史收藏继续展示。 */
export async function migrateLegacyFavorites(repository: FavoriteRepository): Promise<MigrationResult> {
  const storage = getBrowserStorage();
  if (!storage) {
    recordMigrationDiagnostic("favorite-migration", "skipped", { reason: "storage-unavailable" });
    return emptyMigrationResult();
  }

  let marker: string | null = null;
  try {
    marker = storage.getItem(LEGACY_FAVORITES_MIGRATION_STORAGE_KEY);
  } catch {
    marker = null;
  }
  if (marker === FAVORITES_MIGRATION_VERSION) {
    recordMigrationDiagnostic("favorite-migration", "already-migrated");
    return emptyMigrationResult(true);
  }

  try {
    const favorites = readLegacyFavorites(storage);
    const archiveEvents = await readArchiveEvents(repository);
    const result: MigrationResult = emptyMigrationResult();

    for (const favorite of favorites) {
      const matched = archiveEvents === null
        ? favorite.key
        : matchLegacyFavorite(favorite, archiveEvents);
      if (!matched) {
        await repository.saveHistoricalFavorite({
          legacyKey: favorite.key,
          roomId: favorite.roomId,
          eventId: favorite.eventId,
          event: favorite.event,
          favoritedAt: favorite.favoritedAt,
          label: HISTORICAL_UNKNOWN_FAVORITE_LABEL,
        });
        result.unmatchedFavorites.push(favorite);
        continue;
      }
      await repository.setFavorite(matched, true, favorite.favoritedAt);
      useEventAnnotations.setState((state) => ({
        favorites: state.favorites.map((current) => getEventBookmarkKey(current.event) === getEventBookmarkKey(favorite.event)
          ? { ...current, archiveEventKey: matched } : current),
      }));
      result.migrated += 1;
    }

    result.unmatched = result.unmatchedFavorites.length;
    try {
      storage.setItem(LEGACY_FAVORITES_MIGRATION_STORAGE_KEY, FAVORITES_MIGRATION_VERSION);
    } catch {
      throw new Error("无法确认旧收藏迁移状态");
    }
    recordMigrationDiagnostic("favorite-migration", "migrated", {
      migrated: result.migrated,
      unmatched: result.unmatched,
    });
    return result;
  } catch (error) {
    recordMigrationDiagnostic("favorite-migration", "failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
