import { unzipSync } from "fflate";
import type { ThemeDocument } from "./themeTypes.ts";
import { THEME_MODE_VALUES } from "./themeTypes.ts";

const decoder = new TextDecoder();

export type DecodedThemePackage = {
  document: ThemeDocument;
  assets: Record<string, Uint8Array>;
};

export function decodeThemePackage(bytes: Uint8Array): DecodedThemePackage {
  const files = unzipSync(bytes);
  const raw = files["theme.json"];
  const settingsRaw = files["settings.json"];
  if (!raw || !settingsRaw) throw new Error("missing");
  const manifest = JSON.parse(decoder.decode(raw)) as Omit<ThemeDocument, "settings" | "styles">;
  const document: ThemeDocument = {
    ...manifest,
    settings: JSON.parse(decoder.decode(settingsRaw)),
    styles: {
      baseCss: files["base.css"] ? decoder.decode(files["base.css"]) : "",
      visualCss: files["visual.css"] ? decoder.decode(files["visual.css"]) : "",
      customCss: files["custom.css"] ? decoder.decode(files["custom.css"]) : "",
    },
  };
  if (!document || typeof document.themeId !== "string" || !THEME_MODE_VALUES.includes(document.mode) || typeof document.metadata?.name !== "string") throw new Error("shape");
  const assetList = Array.isArray(document.assets) ? document.assets : [];
  for (const asset of assetList) if (!files[asset.path]) throw new Error(`主题素材缺失：${asset.name}`);
  return {
    document: { ...document, assets: assetList.map(({sharedResourceId,cacheResourceId,resourceFileName,...asset}) => asset) },
    assets: Object.fromEntries(assetList.flatMap(asset => files[asset.path] ? [[asset.path, files[asset.path]]] : [])),
  };
}

export interface ThemeImportEntry { name: string; value?: DecodedThemePackage; error?: string }

export function decodeThemeImport(bytes: Uint8Array): ThemeImportEntry[] {

  const files = unzipSync(bytes);

  if (files["theme.json"]) return [{ name: "", value: decodeThemePackage(bytes) }];

  const entries = Object.entries(files).filter(([name]) => /\.zip$/i.test(name));

  if (!entries.length) throw new Error("主题文件无效");

  return entries.map(([name, content]) => {

    try { return { name, value: decodeThemePackage(content) }; }

    catch (error) { return { name, error: themePackageError(error) }; }

  });

}

export function themePackageError(error: unknown): string {
  return error instanceof Error && error.message.startsWith("主题素材缺失：") ? `${error.message}，请重新导出完整主题包` : "主题文件无效，请检查文件后重试";
}
