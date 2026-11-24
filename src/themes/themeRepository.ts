import { invoke } from "@tauri-apps/api/core";
import { mergeThemeIndex } from "./themeIndex.ts";
import { permissionsForOrigin, type ThemeDocument, type ThemeSummary } from "./themeTypes.ts";
import type { ThemeSaveOptions } from "./themeEditorSession.ts";
import { createInitialThemeSettings } from "./themeInitialSettings.ts";

export interface ThemeStoragePort {
  list(): Promise<ThemeSummary[]>;
  read(themeId: string): Promise<ThemeDocument | undefined>;
  write(document: ThemeDocument, options?: ThemeSaveOptions): Promise<void>;
  remove(themeId: string): Promise<void>;
}

export interface ThemeRepository {
  listThemeSummaries(): Promise<ThemeSummary[]>;
  loadThemeDocument(themeId: string): Promise<ThemeDocument>;
  saveThemeDocument(document: ThemeDocument, options?: ThemeSaveOptions): Promise<void>;
  deleteCustomTheme(themeId: string): Promise<void>;
  readThemeAsset(themeId: string, path: string): Promise<Uint8Array>;
  writeThemeAsset(themeId: string, mode: string, path: string, bytes: Uint8Array): Promise<void>;
  deleteThemeAsset(themeId: string, mode: string, path: string): Promise<void>;
}

export function createThemeRepository(port: ThemeStoragePort, builtins: ThemeDocument[]): ThemeRepository {
  const builtinById = new Map(builtins.map(theme => [theme.themeId, theme]));
  return {
    async listThemeSummaries() {
      const stored = await port.list();
      return mergeThemeIndex([], stored);
    },
    async loadThemeDocument(themeId) {
      const document = await port.read(themeId);
      if (document) return { ...document, permissions: permissionsForOrigin(document.origin), settings: Object.keys(document.settings).length === 0 ? createInitialThemeSettings(document.mode) : document.settings };
      throw new Error("主题不存在或已被移除，请恢复主题文件或重新导入");
    },
    async saveThemeDocument(document, options) {
      await port.write(document, options);
    },
    async deleteCustomTheme(themeId) {
      if (builtinById.has(themeId)) throw new Error("内置主题不能删除");
      await port.remove(themeId);
    },
    readThemeAsset: async (themeId, path) => {
      return invoke<string>("read_theme_asset_bytes", { themeId, path }).then(value => Uint8Array.from(atob(value), character => character.charCodeAt(0)));
    },
    writeThemeAsset: (themeId, mode, path, bytes) => invoke("write_theme_asset_bytes", { themeId, mode, path, contentsBase64: btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join("")) }),
    deleteThemeAsset: (themeId, mode, path) => invoke("delete_theme_asset", { themeId, mode, path }),
  };
}

export const tauriThemeStoragePort: ThemeStoragePort = {
  list: () => invoke<ThemeSummary[]>("list_theme_summaries"),
  read: themeId => invoke<ThemeDocument | undefined>("read_theme_document", { themeId }),
  write: async (document, options) => {
    const {localizeThemeResources,themeDependencyLoader}=await import("./themeResourceDependencies.ts");
    const prepared=structuredClone(document);
    const localChanges={...options?.assetChanges};
    for(const asset of prepared.assets){
      const bytes=localChanges[asset.path];
      if(!bytes || !asset.sourceUrl || !/^https?:/i.test(asset.sourceUrl))continue;
      let binary="";for(let n=0;n<bytes.length;n+=0x8000)binary+=String.fromCharCode(...bytes.subarray(n,n+0x8000));
      const entry=await invoke<{id:string;name:string}>("cache_theme_resource",{url:asset.sourceUrl,contentsBase64:btoa(binary),mediaType:asset.mediaType});
      asset.cacheResourceId=entry.id;asset.resourceFileName=entry.name;delete asset.sharedResourceId;
      delete localChanges[asset.path];
    }
    const localized=await localizeThemeResources(prepared,document.metadata.resourceBaseUrl||document.metadata.sourceUrl||"file:///theme.css",themeDependencyLoader(),"preserve");
    const changes={...localized.assets,...localChanges};
    localized.document.assetOverrides = document.revision > 1 && !options?.replaceDefaults
      ? [...new Set([...(document.assetOverrides ?? []), ...Object.entries(changes).filter(([,bytes])=>bytes!==null).map(([path])=>path)])].filter(path=>localized.document.assets.some(asset=>asset.path===path))
      : [];
    await invoke("write_theme_document", {
      document:localized.document,sourceThemeId:options?.sourceThemeId,replaceDefaults:options?.replaceDefaults,updateSource:options?.updateSource,
      assetChanges:Object.keys(changes).length ? Object.fromEntries(Object.entries(changes).map(([path,bytes])=>[path,bytes===null?null:btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(""))])) : undefined,
    });
    Object.assign(document,localized.document);
  },
  remove: themeId => invoke("delete_theme_document", { themeId }),
};
