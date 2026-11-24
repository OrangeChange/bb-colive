import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import type { NativeThemeProjection } from "./nativeThemeProjection.ts";

export interface NativeThemePresentation {
  eventFontSize: number;
  displayPreferences: EventDisplayPreferences;
  eventStyleSettings: EventStyleSettings;
  displayScale?: number;
}

export function resolveLiveNativeThemePresentation(
  defaults: NativeThemePresentation,
  projection: NativeThemeProjection | null,
  displayScale = projection?.displayScale ?? 1,
): NativeThemePresentation {
  const eventFontSize = projection?.display.baseFontSize ?? defaults.eventFontSize;
  if (!projection) return { ...defaults, eventFontSize, displayScale };
  return {
    eventFontSize,
    displayPreferences: { ...defaults.displayPreferences, ...projection.display },
    eventStyleSettings: projection.settings,
    displayScale,
  };
}
