/** 红包元组的公开用户资料位于第九项；第三项是 bag_id。 */
export function redPocketWinnerAvatar(winner: any): string | undefined {
  const face = Array.isArray(winner)
    ? winner[8]?.base?.face
    : winner?.face ?? winner?.avatar;
  return typeof face === "string" && face ? face : undefined;
}
