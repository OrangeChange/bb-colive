import { createDefaultCompatibleThemeSettings, type CompatibleThemeMode } from './compatThemeSettings.ts';
import { permissionsForOrigin, type ThemeDocument } from './themeTypes.ts';
import { BLIVECHAT_SOURCE_CSS } from '../compat/blivechat/source.ts';
import { OPENLIVE_SOURCE_CSS } from '../compat/openlive/source.ts';

export function rendererProvidedBaseCss(mode: ThemeDocument['mode']): string | undefined {
  if (mode === 'blivechat') return BLIVECHAT_SOURCE_CSS;
  if (mode === 'blivechat-open') return OPENLIVE_SOURCE_CSS;
}

export function isRendererProvidedBaseCss(document: Pick<ThemeDocument, 'mode' | 'styles'>): boolean {
  const source = rendererProvidedBaseCss(document.mode);
  return source !== undefined && document.styles.baseCss === source;
}

export const builtinDetails: Record<CompatibleThemeMode, { themeId: string; name: string; author: string; version: string; updatedAt: string }> = {
  blivechat: { themeId: "blivechat-default", name: "BLC 原版默认", author: "default", version: "1.10.4", updatedAt: "2026-08-19T15:44:30.000Z" },
  "blivechat-open": { themeId: "blivechat-open-default", name: "BLC 开放版默认", author: "default", version: "", updatedAt: "" },
  laplace: { themeId: "laplace-default", name: "LAPLACE 默认", author: "LAPLACE Chat", version: "2.0.7", updatedAt: "2026-03-21T02:01:40.000Z" },
};

export function createBuiltinCompatibleTheme(mode: CompatibleThemeMode): ThemeDocument {
  const details = builtinDetails[mode];
  return {
    themeId: details.themeId,
    mode,
    origin: "builtin",
    metadata: {
      name: details.name,
      author: details.author,
      version: details.version,
      updatedAt: details.updatedAt,
    },
    permissions: permissionsForOrigin("builtin"),
    settings: createDefaultCompatibleThemeSettings(mode),
    styles: { baseCss: mode === "blivechat" ? BLIVECHAT_SOURCE_CSS : mode === "blivechat-open" ? OPENLIVE_SOURCE_CSS : "", visualCss: "", customCss: "" },
    assets: [],
    revision: 1,
  };
}

