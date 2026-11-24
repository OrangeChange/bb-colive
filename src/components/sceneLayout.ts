export type SceneRegionId = "danmu" | "interact" | "gift" | "superChat" | "guard";
export type SceneLayoutMode = "dual" | "partition";

export const PARTITION_LEFT: readonly SceneRegionId[] = ["danmu", "interact"];
export const PARTITION_RIGHT: readonly SceneRegionId[] = ["gift", "superChat", "guard"];

/** 根据筛选开关决定分区模式中实际占用空间的区域。 */
export function getPartitionColumns(active: readonly SceneRegionId[]): {
  left: SceneRegionId[];
  right: SceneRegionId[];
} {
  const activeSet = new Set(active);
  return {
    left: PARTITION_LEFT.filter((id) => activeSet.has(id)),
    right: PARTITION_RIGHT.filter((id) => activeSet.has(id)),
  };
}

function formatFraction(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/** 生成 CSS grid 行模板；隐藏区域不传入 count，因此不会留下空占位。 */
export function buildRowsTemplate(count: number, boundaries: readonly number[]): string {
  if (count <= 1) return "minmax(0, 1fr)";

  const points = boundaries
    .slice(0, count - 1)
    .map((value, index) => (Number.isFinite(value) ? value : (index + 1) / count))
    .sort((a, b) => a - b);
  while (points.length < count - 1) points.push(points.length === 0 ? 1 / count : (points[points.length - 1] + 1) / 2);

  const sizes: number[] = [];
  let previous = 0;
  for (const point of points) {
    sizes.push(Math.max(0, point - previous));
    previous = point;
  }
  sizes.push(Math.max(0, 1 - previous));

  return sizes.map((size) => `minmax(0, ${formatFraction(size)}fr)`).join(" 4px ");
}

/** 将拖动位置限制在相邻区域都可读的范围内。 */
export function clampBoundary(
  value: number,
  minimum = 0.18,
  previousBoundary = 0,
  nextBoundary = 1,
): number {
  const lower = previousBoundary + minimum;
  const upper = nextBoundary - minimum;
  return Math.min(upper, Math.max(lower, value));
}
