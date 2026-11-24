export type FavoriteClickAction = "favorite" | "unfavorite" | "favorite-and-edit";

/** 根据收藏状态和偏好决定一次普通点击的下一步动作。 */
export function resolveFavoriteClickAction(favorited: boolean, editOnAdd: boolean): FavoriteClickAction {
  if (favorited) return "unfavorite";
  return editOnAdd ? "favorite-and-edit" : "favorite";
}
