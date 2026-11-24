export function normalizeEventDisplayScale(value: number): number {
  return Number.isFinite(value) ? Math.max(0.5, Math.min(3, value)) : 1;
}

export function estimateScaledEventRow({ baseSize, spacing, scale }: { baseSize: number; spacing: number; scale: number }): number {
  return (baseSize + spacing) * normalizeEventDisplayScale(scale);
}

export function measureScaledEventRow(element: Element): number {
  return element.getBoundingClientRect().height;
}
