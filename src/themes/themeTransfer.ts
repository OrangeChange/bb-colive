import { uiText, UiMessageError } from "../i18n/index.ts";
import { zipSync } from "fflate";
import type { ThemeDocument } from "./themeTypes.ts";
import { permissionsForOrigin } from "./themeTypes.ts";
import { decodeThemeImport, type ThemeImportEntry, decodeThemePackage, type DecodedThemePackage, themePackageError } from "./themePackageCodec.ts";

const encoder = new TextEncoder();

export function exportThemeDocumentBytes(document: ThemeDocument, assets: Record<string, Uint8Array> = {}): Uint8Array {
  const { settings, styles, ...manifest } = document;
  for (const asset of document.assets) if (!assets[asset.path]) throw new UiMessageError("themeTransfer.exportThemeDocumentBytes", { name: asset.name });
  manifest.assets = document.assets.map(({sharedResourceId,cacheResourceId,resourceFileName,sourceUrl,...asset}) => ({...asset,...(sourceUrl && /^https?:/i.test(sourceUrl)?{sourceUrl}:{})}));
  return zipSync({
    "theme.json": encoder.encode(JSON.stringify(manifest, null, 2)),
    "settings.json": encoder.encode(JSON.stringify(settings, null, 2)),
    "base.css": encoder.encode(styles.baseCss),
    "visual.css": encoder.encode(styles.visualCss),
    "custom.css": encoder.encode(styles.customCss),
    ...Object.fromEntries(document.assets.flatMap(asset => assets[asset.path] ? [[asset.path, assets[asset.path]]] : [])),
  }, { level: 6 });
}

export function importThemePackageBytes(bytes: Uint8Array): { document: ThemeDocument; assets: Record<string, Uint8Array> } {
  try {
    return normalizeImportedPackage(decodeThemePackage(bytes));
  } catch (error) {
    throw new Error(themePackageError(error));
  }
}

function normalizeImportedPackage(value: DecodedThemePackage): DecodedThemePackage {
  return {
    ...value,
    document: { ...value.document, origin: "custom", permissions: permissionsForOrigin("custom") },
  };
}

export function importThemePackageBytesAsync(bytes: Uint8Array): Promise<DecodedThemePackage> {
  if (typeof Worker === "undefined") return Promise.resolve(importThemePackageBytes(bytes));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./themeTransferWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => {
      worker.terminate();
      const result = event.data as { ok: true; value: DecodedThemePackage } | { ok: false; error?: string };
      if (!result.ok) reject(new Error(result.error ?? uiText("themeTransfer.importThemePackageBytesAsync")));
      else resolve(normalizeImportedPackage(result.value));
    };
    worker.onerror = () => { worker.terminate(); reject(new UiMessageError("themeTransfer.importThemePackageBytesAsync")); };
    const transferable = bytes.slice();
    worker.postMessage({ kind: "import", bytes: transferable }, [transferable.buffer]);
  });
}

export function importThemeDocumentBytes(bytes: Uint8Array): ThemeDocument {
  return importThemePackageBytes(bytes).document;
}

export function zipEntriesBytesAsync(entries: Record<string, Uint8Array>, level = 6): Promise<Uint8Array> {
  if (typeof Worker === "undefined") return Promise.resolve(zipSync(entries, { level: level as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./themeTransferWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => { worker.terminate(); resolve(new Uint8Array(event.data)); };
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.postMessage({ kind: "zip", entries, level });
  });
}

export function exportThemeDocumentBytesAsync(document: ThemeDocument, assets: Record<string, Uint8Array> = {}): Promise<Uint8Array> {
  const { settings, styles, ...manifest } = document;
  for (const asset of document.assets) if (!assets[asset.path]) throw new UiMessageError("themeTransfer.exportThemeDocumentBytesAsync", { name: asset.name });
  manifest.assets = document.assets.map(({sharedResourceId,cacheResourceId,resourceFileName,sourceUrl,...asset}) => ({...asset,...(sourceUrl && /^https?:/i.test(sourceUrl)?{sourceUrl}:{})}));
  return zipEntriesBytesAsync({
    "theme.json": encoder.encode(JSON.stringify(manifest, null, 2)),
    "settings.json": encoder.encode(JSON.stringify(settings, null, 2)),
    "base.css": encoder.encode(styles.baseCss),
    "visual.css": encoder.encode(styles.visualCss),
    "custom.css": encoder.encode(styles.customCss),
    ...Object.fromEntries(document.assets.flatMap(asset => assets[asset.path] ? [[asset.path, assets[asset.path]]] : [])),
  });
}

export async function importThemeEntriesBytesAsync(bytes: Uint8Array): Promise<ThemeImportEntry[]> {
  const normalize = (entries: ThemeImportEntry[]) => entries.map(entry => entry.value ? { ...entry, value: normalizeImportedPackage(entry.value) } : entry);
  if (typeof Worker === "undefined") return normalize(decodeThemeImport(bytes));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./themeTransferWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = event => { worker.terminate(); event.data.ok ? resolve(normalize(event.data.value)) : reject(new Error(event.data.error ?? uiText("themeTransfer.importThemeEntriesBytesAsync"))); };
    worker.onerror = () => { worker.terminate(); reject(new UiMessageError("themeTransfer.importThemeEntriesBytesAsync")); };
    const transferable = bytes.slice();
    worker.postMessage({ kind: "import-many", bytes: transferable }, [transferable.buffer]);
  });
}
