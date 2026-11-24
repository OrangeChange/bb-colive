export type ComboboxNavigationKey = "ArrowDown" | "ArrowUp" | "Home" | "End";

export function moveComboboxHighlight(length: number, current: number, key: ComboboxNavigationKey): number {
  const maxIndex = Math.max(0, length - 1);
  if (length <= 0) return 0;
  if (key === "Home") return 0;
  if (key === "End") return maxIndex;
  if (key === "ArrowDown") return Math.min(maxIndex, Math.max(0, current) + 1);
  return Math.max(0, Math.min(maxIndex, current) - 1);
}
