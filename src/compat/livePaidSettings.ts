export interface PaidDisplayFilter {
  threshold: number;
  mode: "unit" | "cumulative";
}

export function livePaidSettings(filter?: PaidDisplayFilter) {
  return {
    hostPaidFilter: Boolean(filter),
    hostPaidThreshold: filter?.threshold ?? 0,
    hostPaidMode: filter?.mode ?? "cumulative",
  } as const;
}
