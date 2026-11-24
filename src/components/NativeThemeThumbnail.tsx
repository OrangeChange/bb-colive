import { IsolatedPreviewFrame } from "./IsolatedPreviewFrame.tsx";
import { useMemo, useRef } from "react";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import { normalizeNativeThemeDisplaySettings, type NativeThemeSettings } from "../themes/nativeComponentAppearance.ts";
import { tryComposeNativePreviewCss } from "../themes/nativeThemeCascade.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import { createStylePreviewEvents } from "./stylePreviewEvents.ts";
import { StylePreviewArea } from "./StylePreviewArea.tsx";
import type { StylePreviewContext } from "./stylePreviewContext.ts";
import { ThemeThumbnailShell, useThemeThumbnailDocument } from "./ThemeThumbnailShell.tsx";

export function NativeThemeThumbnail({ themeId, revision, displayPreferences, load, full = false, displayScale = 1, context = "live" }: {
  themeId: string;
  revision: number;
  displayPreferences: EventDisplayPreferences;
  load: (themeId: string) => Promise<ThemeDocument>;
  full?: boolean;
  displayScale?: number;
  context?: StylePreviewContext;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { document, failed } = useThemeThumbnailDocument({ root, themeId, revision, load });
  const previewCss = useMemo(
    () => document ? tryComposeNativePreviewCss(document, `[data-theme-id="${themeId}"]`).css : "",
    [document, themeId],
  );
  if (!document) return <ThemeThumbnailShell root={root} failed={failed} ready={false} full={full} />;
  const settings = document.settings as NativeThemeSettings;
  const display = normalizeNativeThemeDisplaySettings(settings.display);
  const content = <div className="theme-library-thumbnail-canvas" data-theme-id={themeId} style={full ? { zoom: displayScale } : undefined}><StylePreviewArea context={context} mode="all" events={full ? createStylePreviewEvents("混合流") : createStylePreviewEvents("混合流").slice(0, 2)} eventStyleSettings={settings as EventStyleSettings} displayPreferences={{ ...displayPreferences, ...display }} eventFontSize={full ? display.baseFontSize : Math.min(display.baseFontSize, 14)} windowEventFontSize={display.baseFontSize} /></div>;
  return <ThemeThumbnailShell root={root} failed={false} ready full={full}>
    {/@font-face\b/i.test(previewCss)
      ? <IsolatedPreviewFrame title="主题缩略图" previewCss={previewCss}>{content}</IsolatedPreviewFrame>
      : <><style>{previewCss}</style>{content}</>}
  </ThemeThumbnailShell>;
}
