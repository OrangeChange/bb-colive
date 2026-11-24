const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

/**
 * 将颜色值映射到实际 rail 的中心轨迹。
 * start/length 来自已经按圆点半径内缩过的 rail 真实 DOM 矩形。
 */
export function trackPosition(
  value: number,
  start: number,
  length: number,
): number {
  return start + clampUnit(value) * Math.max(0, length);
}

/** 将指针坐标按同一条中心轨迹转换为颜色比例。 */
export function pointerRatio(
  client: number,
  start: number,
  length: number,
): number {
  return clampUnit((client - start) / Math.max(1, length));
}
