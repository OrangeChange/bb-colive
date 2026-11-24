import { uiText } from "../i18n/index.ts";
import { parseThemeCssMetadata } from "./themeCssMetadata.ts";
import type { ThemeAssetChanges, ThemeSaveOptions } from "./themeEditorSession.ts";
import { saveThemeDocument } from "./themeReferences.ts";
import type { ThemeDocument } from "./themeTypes.ts";
import { createCustomThemeDocument, permissionsForOrigin, type ThemeMode } from "./themeTypes.ts";
import { createInitialThemeSettings } from "./themeInitialSettings.ts";
import postcss from "postcss";

export interface ImportedThemePackage {
  document: ThemeDocument;
  assets: Record<string, Uint8Array>;
}

export function createThemeFromCss(input: {
  themeId: string;
  mode: ThemeMode;
  name: string;
  css: string;
  importedAt: string;
}): ThemeDocument {
  postcss.parse(input.css);
  const metadata = parseThemeCssMetadata(input.css);
  const document = createCustomThemeDocument({
    themeId: input.themeId,
    mode: input.mode,
    name: input.name,
    author: metadata.author ?? "",
    version: metadata.version ?? "",
    updatedAt: metadata.updated ?? "",
  });
  document.metadata.importedAt = input.importedAt;
  document.metadata.localModifiedAt = input.importedAt;
  document.settings = createInitialThemeSettings(input.mode);
  document.styles = {
    ...document.styles,
    baseCss: input.css,
  };
  return document;
}

export interface ThemeImportDependencies {
  load(themeId: string): Promise<ThemeDocument>;
  save(document: ThemeDocument, options: ThemeSaveOptions): Promise<void>;
  discardSession(themeId: string): void;
  createId?: () => string;
}

export type ThemeImportConflictAction = "update" | "copy" | "skip";

export async function installImportedThemePackage(
  importedPackage: ImportedThemePackage,
  dependencies: ThemeImportDependencies,
  action: ThemeImportConflictAction = "update",
): Promise<{ document: ThemeDocument; skipped?: boolean }> {
  if (action === "skip") return { document: importedPackage.document, skipped: true };
  let existing: ThemeDocument | undefined;
  try { existing = await dependencies.load(importedPackage.document.themeId); }
  catch { /* 首次导入没有本地主题。 */ }

  if (action === "update" && existing?.origin === "builtin") {
    throw new Error(uiText("themeImport.installImportedThemePackage"));
  }

  const document = {
    ...importedPackage.document,
    ...(action === "copy" ? {
      themeId: (dependencies.createId ?? (() => crypto.randomUUID()))(),
      origin: "custom" as const,
      permissions: permissionsForOrigin("custom"),
    } : {}),
    revision: action === "copy" ? 1 : existing ? existing.revision + 1 : 1,
  };
  const assetChanges: ThemeAssetChanges = Object.fromEntries(
    Object.entries(importedPackage.assets).map(([path, bytes]) => [path, bytes]),
  );
  await saveThemeDocument(document, async savedDocument => {
    await dependencies.save(savedDocument, { assetChanges, replaceDefaults: true });
    return savedDocument;
  });
  dependencies.discardSession(document.themeId);
  return { document };
}
