import type { CompatibleThemeCapabilityMap, CompatiblePlacement } from "../themes/compatThemeCapabilities.ts";
export function compatibleEventOptions(
  capability: CompatibleThemeCapabilityMap,
  placement: CompatiblePlacement,
) {
  const selectors =
    capability.eventSelectorsByPlacement?.[placement] ??
    capability.eventSelectors ??
    {};
  return [
    { value: "all", label: "全部事件" },
    ...Object.keys(selectors)
      .filter((value) => value !== "all")
      .map((value) => ({
        value,
        label: capability.eventLabels?.[value] ?? value,
      })),
  ];
}
