import type { ArchiveFavoriteOrganizationTarget, ArchiveRepositoryContract } from "./archiveTypes.ts";

export interface FavoriteActionDependencies {
  repository: Pick<ArchiveRepositoryContract, "setFavorite" | "removeFavoriteItem" | "removeFavorites">;
  onCommitted: (change: FavoriteActionChange) => Promise<void> | void;
}
export type FavoriteActionChange =
  | { kind: "set"; eventKey: string; favorited: boolean }
  | { kind: "remove"; targets: readonly ArchiveFavoriteOrganizationTarget[] };
export interface FavoriteActionResult { refresh: "complete" | "failed" }

export function createFavoriteActions({ repository, onCommitted }: FavoriteActionDependencies) {
  async function committed(change: FavoriteActionChange): Promise<FavoriteActionResult> {
    try {
      await onCommitted(change);
      return { refresh: "complete" };
    } catch {
      return { refresh: "failed" };
    }
  }
  return {
    async set(eventKey: string, favorited: boolean): Promise<FavoriteActionResult> {
      await repository.setFavorite(eventKey, favorited);
      return committed({ kind: "set", eventKey, favorited });
    },
    async remove(targets: readonly ArchiveFavoriteOrganizationTarget[]): Promise<FavoriteActionResult> {
      if (targets.length === 0) return { refresh: "complete" };
      if (targets.length === 1) await repository.removeFavoriteItem(targets[0]);
      else await repository.removeFavorites(targets);
      return committed({ kind: "remove", targets });
    },
  };
}
