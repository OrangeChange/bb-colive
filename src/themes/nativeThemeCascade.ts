import {resolveNativeIdentityCss} from "./nativeIdentityCss.ts";
import {normalizeNativeThemeDisplaySettings} from "./nativeComponentAppearance.ts";
import {stripThemeImageDecorations} from "./themeImageDecorations.ts";
import { scopeThemeCss } from "./themeCssScope.ts";
import safeParse from "postcss-safe-parser";
import postcss from "postcss";
import type { ThemeDocument } from "./themeTypes.ts";
import type { NativeThemeSettings } from "./nativeComponentAppearance.ts";
import { renderManagedNativeCss, renderNativeGroupCss } from "./nativeManagedCss.ts";
import { tryScopeNativePreviewCss } from "./nativeManagedCss.ts";
import { normalizeEventStyleSettings } from "../eventStyleSettings.ts";
import { themePriceGradient } from './nativePriceGradient.ts';

export const NATIVE_LAYER_ORDER = "@layer theme, utilities, base, default, config, custom;";

/** Assign ordinary theme rules without changing explicitly authored layers. */
export function assignNativeCssLayer(source: string, name: "default" | "config" | "custom"): string {
  if (!source.trim()) return "";
  const root = safeParse(source) as postcss.Root;
  const transform = (container: postcss.Container) => {
    for (const node of [...(container.nodes ?? [])]) {
      if (node.type === "atrule" && node.name.toLowerCase() === "layer") continue;
      if (node.type === "atrule" && node.name.toLowerCase() === "import") {
        const tokens = postcss.list.space(node.params);
        if (!tokens.slice(1).some(token => token.toLowerCase() === "layer" || token.toLowerCase().startsWith("layer("))) {
          const url = tokens[0];
          if (url) node.params = `${url} layer(${name})${node.params.slice(node.params.indexOf(url) + url.length)}`;
        }
        continue;
      }
      if (node.type === "atrule" && ["media", "supports", "container", "document", "scope"].includes(node.name.toLowerCase())) {
        transform(node);
        continue;
      }
      if (node.type !== "rule") continue;
      const layer = postcss.atRule({ name: "layer", params: name });
      node.replaceWith(layer);
      layer.append(node);
    }
  };
  transform(root);
  return root.toString();
}

export function composeNativeThemeCss(document: ThemeDocument): string {
  const settings = { ...document.settings, ...normalizeEventStyleSettings(document.settings) } as NativeThemeSettings;
  settings.priceGradient = themePriceGradient(settings.priceGradient, document.styles.baseCss);
  const priority = normalizeNativeThemeDisplaySettings(settings.display).identityPriority;
  const authored = (source: string, layer: "default" | "config" | "custom") => assignNativeCssLayer(resolveNativeIdentityCss(source, priority), layer);
  const sources = [
    authored(document.styles.baseCss, "default"),
    authored(stripThemeImageDecorations(document.styles.visualCss), "config"),
    authored(renderManagedNativeCss(settings), "config"),
    assignNativeCssLayer(renderNativeGroupCss(settings), "config"),
    authored(document.styles.customCss, "custom"),
  ].filter(Boolean);
  const imports: string[] = [];
  const rules = sources.map(source => {
    const root = safeParse(source) as postcss.Root;
    for (const node of [...root.nodes]) {
      if (node.type === "atrule" && node.name.toLowerCase() === "import") {
        imports.push(`${node.toString()};`);
        node.remove();
      }
    }
    return root.toString();
  });
  return resolveNativeIdentityCss([NATIVE_LAYER_ORDER, ...imports, ...rules].filter(Boolean).join("\n\n"), normalizeNativeThemeDisplaySettings(settings.display).identityPriority);
}

export function tryComposeNativePreviewCss(document: ThemeDocument, scope: string): { css: string; error: string | null } {
  try {
    return tryScopeNativePreviewCss(scopeThemeCss(composeNativeThemeCss(document), ".theme-surface"), scope);
  } catch (error) {
    return { css: "", error: error instanceof Error ? error.message : String(error) };
  }
}
