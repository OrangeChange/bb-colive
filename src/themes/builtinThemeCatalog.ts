import {resolveThemeResourceSource} from './themeRemoteCss.ts';
import laplaceCatalogMetadata from "./laplaceCatalogMetadata.json" with { type: "json" };
import { createDefaultCompatibleThemeSettings, type CompatibleThemeMode } from "./compatThemeSettings.ts";
import { permissionsForOrigin, type ThemeDocument } from "./themeTypes.ts";
import { LAPLACE_BUILTIN_THEME_SOURCES, LAPLACE_CURATED_THEME_SOURCES } from "./laplaceThemeSources.ts";
import { resolveThemeAssetUrls } from "./themeAssets.ts";
import { obsServiceStatus } from "../obs/obsService.ts";

export interface BuiltinThemeEntry {
  id: string;
  mode: CompatibleThemeMode;
  name: string;
  author: string;
  sourceUrl?: string;
  file?: string;
}

export const BUILTIN_THEME_CATALOG: readonly BuiltinThemeEntry[] = [
  ...(["blivechat", "blivechat-open"] as const).flatMap(mode => [
    { id: `${mode}-classic`, mode, name: "经典", author: "", file: `${mode}-classic` },
    { id: `${mode}-wechat`, mode, name: "仿微信", author: "", file: `${mode}-wechat` },
  ]),
  ...[
    ["bubble", "基础气泡", "兔宝的神奇口袋", "openlivechat.css"],
    ["candy", "糖果色", "兔宝的神奇口袋", "1125-candy-game-all-in.css"],
    ["bride-light", "魔女花嫁-昼", "槐夏虫眠", "A45%E9%AD%94%E5%A5%B3%E8%8A%B1%E5%AB%81light.css"],
    ["bride-dark", "魔女花嫁-夜", "槐夏虫眠", "A45%E9%AD%94%E5%A5%B3%E8%8A%B1%E5%AB%81night.css"],
  ].map(([key, name, author, source]) => ({ id: `blivechat-open-${key}`, mode: "blivechat-open" as const, name, author, file: `openlive-${key}`, sourceUrl: `https://i1.xuehusang.cn/openlivechat-css/${source}` })),
  ...[...LAPLACE_BUILTIN_THEME_SOURCES, ...LAPLACE_CURATED_THEME_SOURCES].map(source => ({ id: source.id, mode: "laplace" as const, name: source.name, author: source.author, sourceUrl: source.url })),
];

function catalogMetadata(id: string): { author?: string; version?: string; updated?: string } {
  return (laplaceCatalogMetadata as Record<string, { author?: string; version?: string; updated?: string }>)[id] ?? {};
}
export function createCatalogThemes(): ThemeDocument[] {
  return BUILTIN_THEME_CATALOG.map(entry => {
    const source = catalogMetadata(entry.id);
    const author = source.author ?? (entry.author || (entry.mode.startsWith("blivechat") ? "default" : ""));
    return {
      themeId: entry.id, mode: entry.mode, origin: "builtin", permissions: permissionsForOrigin("builtin"),
      metadata: {
        name: entry.name,
        author,
        version: source.version ?? "",
        updatedAt: source.updated ?? "",
        ...(entry.sourceUrl ? { sourceUrl: entry.sourceUrl } : entry.id.startsWith('laplace-builtin-') ? { sourceUrl: `https://rsrc.laplace.cn/assets/${entry.id.slice('laplace-builtin-'.length)}.css` } : {}),
      },
      settings: createDefaultCompatibleThemeSettings(entry.mode),
      styles: { baseCss: "", visualCss: "", customCss: "" }, assets: [], revision: 1,
    };
  });
}

export async function resolveCatalogRuntimeAssets(document: ThemeDocument, changes: Record<string, Uint8Array | null>, read: (path: string) => Promise<Uint8Array>): Promise<Map<string, string>> {
  const served = document.assets.filter(asset => !Object.prototype.hasOwnProperty.call(changes, asset.path));
  const urls = await resolveThemeAssetUrls({ ...document, assets: document.assets.filter(asset => !served.includes(asset)) }, read);
  
  const status = await obsServiceStatus().catch(() => null);
  const origin = status?.running ? `http://127.0.0.1:${status.port}` : location.origin;
  for (const asset of served) {
    const resourceId = asset.sharedResourceId ?? asset.cacheResourceId;
    const path = asset.sourceUrl && /^https?:/i.test(asset.sourceUrl) && !resourceId ? `/theme-remote?url=${encodeURIComponent(resolveThemeResourceSource(asset.sourceUrl))}` : resourceId ? `/theme-resources/${asset.sharedResourceId ? "shared" : "remote"}/${encodeURIComponent(resourceId)}/${encodeURIComponent(asset.resourceFileName ?? asset.path.split("/").pop()!)}` : `/theme-assets/${encodeURIComponent(document.themeId)}/${encodeURIComponent(asset.path.split("/").pop()!)}`;
    urls.set(asset.path, `${origin}${path}${resourceId || asset.sourceUrl && /^https?:/i.test(asset.sourceUrl) ? "" : `?revision=${document.revision}`}`);
  }
  return urls;
}
