export const THEME_MODE_VALUES = ["native", "blivechat", "blivechat-open", "laplace"] as const;

export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ThemeOrigin = "builtin" | "custom";
export type ThemeTarget = "live" | "windows" | "obs";

export interface ThemeMetadata {
  name: string;
  author: string;
  version: string;
  updatedAt: string;
  localModifiedAt?: string;
  importedAt?: string;
  sourceUrl?: string;
  resourceBaseUrl?: string;
  externalHtml?: {
    url: string;
    sdk: "blivechat-1.0.1";
    verified: boolean;
  };
}

export interface ThemePermissions {
  update: boolean;
  saveAs: boolean;
  delete: boolean;
}

export interface ThemeStyles {
  baseCss: string;
  visualCss: string;
  customCss: string;
}

export interface ThemeAssetReference {
  id: string;
  name: string;
  path: string;
  mediaType: string;
  size?: number;
  sharedResourceId?: string;
  cacheResourceId?: string;
  resourceFileName?: string;
  sourceUrl?: string;
}

export interface ThemeDocument<TSettings = Record<string, unknown>> {
  themeId: string;
  mode: ThemeMode;
  origin: ThemeOrigin;
  metadata: ThemeMetadata;
  permissions: ThemePermissions;
  settings: TSettings;
  styles: ThemeStyles;
  assets: ThemeAssetReference[];
  assetOverrides?: string[];
  revision: number;
}

export interface ThemeSummary {
  adjusted?: boolean;
  themeId: string;
  mode: ThemeMode;
  origin: ThemeOrigin;
  name: string;
  author: string;
  version: string;
  updatedAt: string;
  revision: number;
  externalHtml?: boolean;
  sourceUrl?: string;
}

export function permissionsForOrigin(origin: ThemeOrigin): ThemePermissions {
  return origin === "builtin"
    ? { update: false, saveAs: true, delete: false }
    : { update: true, saveAs: true, delete: true };
}

export function createCustomThemeDocument(input: {
  themeId: string;
  mode: ThemeMode;
  name: string;
  author?: string;
  version?: string;
  updatedAt?: string;
}): ThemeDocument {
  return {
    themeId: input.themeId,
    mode: input.mode,
    origin: "custom",
    metadata: {
      name: input.name,
      author: input.author ?? "",
      version: input.version ?? "",
      updatedAt: input.updatedAt ?? "",
    },
    permissions: permissionsForOrigin("custom"),
    settings: {},
    styles: { baseCss: "", visualCss: "", customCss: "" },
    assets: [],
    revision: 1,
  };
}

export function toThemeSummary(document: ThemeDocument): ThemeSummary {
  return {
    themeId: document.themeId,
    mode: document.mode,
    origin: document.origin,
    name: document.metadata.name,
    author: document.metadata.author,
    version: document.metadata.version,
    updatedAt: document.metadata.updatedAt,
    revision: document.revision,
    ...(document.metadata.externalHtml?.verified === true ? { externalHtml: true } : {}),
    ...(document.metadata.sourceUrl ? { sourceUrl: document.metadata.sourceUrl } : {}),
  };
}
