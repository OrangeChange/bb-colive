import { parseThemeColor } from "./themeColorValue.ts";

export function resolvePreviewBackground(value: string): string {
  return parseThemeColor(value) ? value : "transparent";
}
