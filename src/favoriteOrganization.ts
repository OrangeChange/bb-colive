import type { ArchiveFavoriteTag } from "./archive/archiveTypes.ts";

/** 合并异步刷新的标签词库，保留编辑器内刚创建但尚未重新查询到的标签。 */
export function mergeFavoriteTags(
  current: readonly ArchiveFavoriteTag[],
  incoming: readonly ArchiveFavoriteTag[],
): ArchiveFavoriteTag[] {
  const merged = [...current];
  for (const tag of incoming) {
    if (!merged.some((item) => item.name === tag.name)) merged.push(tag);
  }
  return merged;
}

/** 切换一条收藏当前使用的标签。 */
export function toggleFavoriteTag(selected: readonly string[], name: string): string[] {
  return selected.includes(name)
    ? selected.filter((value) => value !== name)
    : [...selected, name];
}
