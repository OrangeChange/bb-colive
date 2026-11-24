import {stripThemeImageDecorations} from "./themeImageDecorations.ts";
import { themePriceGradient } from './nativePriceGradient.ts';
import { composeNativeThemeCss } from "./nativeThemeCascade.ts";
import { normalizeEventStyleSettings } from "../eventStyleSettings.ts";
import { renderManagedNativeCss } from "./nativeManagedCss.ts";
import type { NativeThemeSettings } from "./nativeComponentAppearance.ts";
import type { ThemeDocument } from "./themeTypes.ts";

export type NativeThemeCssExportScope = "complete" | "base-visual" | "visual" | "custom";

const layer = (name: string, css: string) => `/* ${name} */${css.trim() ? `\n${css.trim()}` : ""}`;

export function buildNativeThemeCssExport(document: ThemeDocument, scope: NativeThemeCssExportScope): string {
  if (scope === "custom") return document.styles.customCss;
  if (scope === "complete") return composeNativeThemeCss(document);
  if (scope === "base-visual") return composeNativeThemeCss({ ...document, styles: { ...document.styles, customCss: "" } });
  const settings = { ...document.settings, ...normalizeEventStyleSettings(document.settings) } as NativeThemeSettings;
  settings.priceGradient = themePriceGradient(settings.priceGradient, document.styles.baseCss);
  const visual = [stripThemeImageDecorations(document.styles.visualCss), renderManagedNativeCss(settings)].filter(Boolean).join("\n\n");
  return layer("可视化层", visual);
}
