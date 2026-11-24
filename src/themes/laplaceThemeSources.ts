import { formatThemeTimestamp } from "./themeDate.ts";
import catalogMetadata from "./laplaceCatalogMetadata.json" with { type: "json" };
import { parseLaplaceCssMetadata } from "../compat/laplace/styles.ts";
import { createDefaultCompatibleThemeSettings } from "./compatThemeSettings.ts";
import { permissionsForOrigin, type ThemeDocument, type ThemeOrigin } from "./themeTypes.ts";
import { CURATED_REMOTE_TEMPLATES, LAPLACE_TEMPLATE_HASHES, LAPLACE_TEMPLATE_OPTIONS } from "../compat/laplace/styleLoader.ts";
import type { RemoteTemplateMetadata } from "../compat/laplace/styles.ts";

export interface LaplaceThemeSource {
  id: string;
  name: string;
  author: string;
  version: string;
  updatedAt: string;
  origin: ThemeOrigin;
  sourceKind: "builtin" | "curated" | "url";
  url?: string;
}

function sourceMetadata(id: string): { author?: string; version?: string; updated?: string } {
  return (catalogMetadata as Record<string, { author?: string; version?: string; updated?: string }>)[id] ?? {};
}

export const LAPLACE_BUILTIN_THEME_SOURCES: readonly LaplaceThemeSource[] = LAPLACE_TEMPLATE_OPTIONS
  .filter(option => option.value !== "")
  .map(option => ({
    id: `laplace-builtin-${option.value}`,
    name: option.label,
    author: sourceMetadata(`laplace-builtin-${option.value}`).author ?? "",
    version: sourceMetadata(`laplace-builtin-${option.value}`).version ?? "",
    updatedAt: sourceMetadata(`laplace-builtin-${option.value}`).updated ?? "",
    origin: "builtin" as const,
    sourceKind: "builtin" as const,
  }));

export const LAPLACE_BUILTIN_RESOURCE_NAMES = Object.freeze(Object.keys(LAPLACE_TEMPLATE_HASHES));

export const LAPLACE_CURATED_THEME_SOURCES: readonly LaplaceThemeSource[] = CURATED_REMOTE_TEMPLATES.map((item, index) => ({
  id: `laplace-curated-${index + 1}`,
  name: item.title,
  author: sourceMetadata(`laplace-curated-${index + 1}`).author ?? "",
  version: sourceMetadata(`laplace-curated-${index + 1}`).version ?? "",
  updatedAt: sourceMetadata(`laplace-curated-${index + 1}`).updated ?? "",
  origin: "builtin",
  sourceKind: "curated",
  url: item.url,
}));

export function createLaplaceCatalogTheme(source: LaplaceThemeSource, css: string, _fetchedAt: string): ThemeDocument {
  return {
    themeId: source.id,
    mode: "laplace",
    origin: "builtin",
    metadata: { name: source.name, author: source.author, version: source.version, updatedAt: source.updatedAt, ...(source.url ? { sourceUrl: source.url } : {}) },
    permissions: permissionsForOrigin("builtin"),
    settings: createDefaultCompatibleThemeSettings("laplace"),
    styles: { baseCss: css, visualCss: "", customCss: "" },
    assets: [],
    revision: 1,
  };
}

export function createLaplaceSavedCopy(source: ThemeDocument, themeId = crypto.randomUUID()): ThemeDocument {
  return { ...structuredClone(source), themeId, origin: "custom", permissions: permissionsForOrigin("custom"), revision: 1 };
}

function absoluteCssUrl(value: string, sourceUrl: string): string {
  const input = value.trim();
  if (!input || input.startsWith("#") || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(input)) return input;
  return new URL(input, sourceUrl).href;
}

export function resolveLaplaceRemoteCssUrls(css: string, sourceUrl: string): string {
  const imports = css.replace(/(@import\s+)(["'])([^"']+)\2/gi, (_match, prefix: string, quote: string, value: string) =>
    `${prefix}${quote}${absoluteCssUrl(value, sourceUrl)}${quote}`);
  return imports.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, _quote: string, value: string) => {
    const resolved = absoluteCssUrl(value, sourceUrl);
    return resolved === value.trim() && value.trim().startsWith("#") ? `url(${resolved})` : `url("${resolved}")`;
  });
}

export function createLaplaceRemoteTheme(input: {
  id: string;
  url: string;
  css: string;
  baseUrl?: string;
  metadata: RemoteTemplateMetadata | null;
  fetchedAt: string;
  curated?: boolean;
}): ThemeDocument {
  input = { ...input, metadata: { ...parseLaplaceCssMetadata(input.css), ...input.metadata } };
  const origin: ThemeOrigin = input.curated ? "builtin" : "custom";
  return {
    themeId: input.id,
    mode: "laplace",
    origin,
    metadata: {
      name: typeof input.metadata?.title === "string" && input.metadata.title.trim() ? input.metadata.title.trim() : "网址主题",
      author: typeof input.metadata?.author === "string" ? input.metadata.author.trim() : "",
      version: typeof input.metadata?.version === "string" ? input.metadata.version.trim() : "",
      updatedAt: typeof input.metadata?.updated === "string" ? input.metadata.updated.trim() : "",
      importedAt: input.fetchedAt,
      sourceUrl: input.url,
      ...(input.baseUrl && input.baseUrl !== input.url ? { resourceBaseUrl: input.baseUrl } : {}),
    },
    permissions: permissionsForOrigin(origin),
    settings: createDefaultCompatibleThemeSettings("laplace"),
    styles: { baseCss: input.css, visualCss: "", customCss: "" },
    assets: [],
    revision: 1,
  };
}

export async function confirmLaplaceRemoteTheme(
  document: ThemeDocument,
  repository: { saveThemeDocument(document: ThemeDocument): Promise<void> },
): Promise<void> {
  await repository.saveThemeDocument(document);
}

export async function updateLaplaceRemoteTheme(
  current: ThemeDocument,
  load: (url: string) => Promise<{ css: string; metadata: RemoteTemplateMetadata | null; finalUrl?:string }>,
  options: { id?: string; fetchedAt?: string } = {},
): Promise<{ document: ThemeDocument; error: string }> {
  const url = current.metadata.sourceUrl;
  if (!url) return { document: current, error: "主题没有可更新的网址" };
  try {
    const result = await load(url);
    const builtin = current.origin === "builtin";
    const remote = createLaplaceRemoteTheme({
      id: builtin ? options.id ?? crypto.randomUUID() : current.themeId,
      url,
      css: result.css,
      baseUrl: result.finalUrl,
      metadata: result.metadata,
      fetchedAt: options.fetchedAt ?? formatThemeTimestamp(),
    });
    const document: ThemeDocument = {
      ...current,
      themeId: builtin ? options.id ?? remote.themeId : current.themeId,
      origin: "custom",
      permissions: permissionsForOrigin("custom"),
      metadata: { ...current.metadata, ...remote.metadata },
      styles: { ...current.styles, baseCss: remote.styles.baseCss },
      settings: structuredClone(current.settings),
      assets: structuredClone(current.assets),
      revision: builtin ? 1 : current.revision + 1,
    };
    return { document, error: "" };
  } catch (cause) {
    return { document: current, error: cause instanceof Error ? cause.message : "远程主题更新失败" };
  }
}

export function createLaplaceRemoteSourceCoordinator(
  load: (url: string) => Promise<{ css: string; metadata: RemoteTemplateMetadata | null; finalUrl?:string }>,
) {
  let generation = 0;
  let snapshot = { url: "", css: "", metadata: null as RemoteTemplateMetadata | null, loading: false, error: "" };
  return {
    getSnapshot: () => snapshot,
    async preview(url: string) {
      const current = ++generation;
      snapshot = { ...snapshot, url, loading: true, error: "" };
      try {
        const result = await load(url);
        if (current === generation) snapshot = { url, css: result.css, metadata: result.metadata, loading: false, error: "" };
      } catch (cause) {
        if (current === generation) snapshot = { ...snapshot, loading: false, error: cause instanceof Error ? cause.message : "远程主题载入失败" };
      }
      return snapshot;
    },
    cancel() { generation += 1; snapshot = { url: "", css: "", metadata: null, loading: false, error: "" }; },
  };
}
