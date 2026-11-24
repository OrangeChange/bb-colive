import type { ThemeEditorDraft } from "./themeDraftStore.ts";
import { formatThemeTimestamp } from "./themeDate.ts";
import { restoreThemeAdjustments } from "./themeAdjustments.ts";
import type { ThemeDocument } from "./themeTypes.ts";
import { permissionsForOrigin } from "./themeTypes.ts";
import { toThemeSummary } from "./themeTypes.ts";

function documentContentKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter(key => {
    const item = value[key];
    if (item === undefined) return false;
    if ((key === "visualModel" || key === "visualAuthored") && item && typeof item === "object") {
      return Object.values(item).some(layer => layer && Object.keys(layer).length > 0);
    }
    return true;
  });
}

function sameDocumentValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameDocumentValue(value, right[index]));
  }
  const a = left as Record<string, unknown>, b = right as Record<string, unknown>;
  const keys = documentContentKeys(a);
  return keys.length === documentContentKeys(b).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameDocumentValue(a[key], b[key]));
}

interface SessionRepository {
  loadThemeDocument(themeId: string): Promise<ThemeDocument>;
  saveThemeDocument(document: ThemeDocument, options?: ThemeSaveOptions): Promise<void>;
}

export type ThemeAssetChanges = Record<string, Uint8Array | null>;
export interface ThemeCssControlledField { scheme: "common" | "light" | "dark"; targetKey: string; property: string }
export interface ThemeSaveOptions {
  replaceDefaults?: boolean;
  updateSource?: boolean;
  assetChanges?: ThemeAssetChanges;
  sourceThemeId?: string;
}
interface ThemeDraftSnapshot {
  document: ThemeDocument;
  assetChanges: ThemeAssetChanges;
  visualCssDraft: string;
  visualCssValid: string;
  visualCssError: string;
  visualCssDiagnostics: string[];
  visualCssControlled: ThemeCssControlledField[];
  customCssDraft: string;
  customCssValid: string;
  customCssError: string;
}
export interface ThemeEditorSession {
  themeId: string;
  saved: ThemeDocument;
  document: ThemeDocument;
  dirty: boolean;
  assetChanges: ThemeAssetChanges;
  undo: ThemeDraftSnapshot[];
  redo: ThemeDraftSnapshot[];
  visualCssDraft: string;
  visualCssValid: string;
  visualCssError: string;
  visualCssDiagnostics: string[];
  visualCssControlled: ThemeCssControlledField[];
  historyGroup?: "visual-css";
  visualCssInitialized: boolean;
  customCssDraft: string;
  customCssValid: string;
  customCssError: string;
  externalDocument?: ThemeDocument;
  persisted: boolean;
  sourceThemeId?: string;
}

interface ThemeVisualCssUpdateResult {
  document?: ThemeDocument;
  error?: string;
  diagnostics?: string[];
  cssControlled?: ThemeCssControlledField[];
}

interface SessionHostOptions {
  createId?: () => string;
  now?: () => string;
}

export const THEME_EDIT_HISTORY_LIMIT = 100;

export function subscribeThemeRepositoryChanges(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  listener: () => void,
): () => void {
  target.addEventListener("focus", listener);
  return () => target.removeEventListener("focus", listener);
}

function pushHistory(history: ThemeDraftSnapshot[], value: ThemeDraftSnapshot): void {
  history.push(value);
  if (history.length > THEME_EDIT_HISTORY_LIMIT) history.splice(0, history.length - THEME_EDIT_HISTORY_LIMIT);
}

function cloneEditableDocument(document: ThemeDocument): ThemeDocument {
  return structuredClone(document);
}

function cloneDraftDocument(document: ThemeDocument): ThemeDocument {
  return { ...structuredClone(document), assets: document.assets };
}

function snapshot(session: ThemeEditorSession, stableVisualCss = false): ThemeDraftSnapshot {
  return {
    document: cloneDraftDocument(session.document),
    assetChanges: structuredClone(session.assetChanges),
    visualCssDraft: stableVisualCss ? session.visualCssValid : session.visualCssDraft,
    visualCssValid: session.visualCssValid,
    visualCssError: stableVisualCss ? "" : session.visualCssError,
    visualCssDiagnostics: stableVisualCss ? [] : [...session.visualCssDiagnostics],
    visualCssControlled: [...session.visualCssControlled],
    customCssDraft: session.customCssDraft,
    customCssValid: session.customCssValid,
    customCssError: session.customCssError,
  };
}

function restoreSnapshot(session: ThemeEditorSession, value: ThemeDraftSnapshot): void {
  session.document = value.document;
  session.assetChanges = value.assetChanges;
  session.visualCssDraft = value.visualCssDraft;
  session.visualCssValid = value.visualCssValid;
  session.visualCssError = value.visualCssError;
  session.visualCssDiagnostics = value.visualCssDiagnostics;
  session.visualCssControlled = value.visualCssControlled;
  session.customCssDraft = value.customCssDraft;
  session.customCssValid = value.customCssValid;
  session.customCssError = value.customCssError;
  session.historyGroup = undefined;
}

export function createThemeSessionHost(repository: SessionRepository, options: SessionHostOptions = {}) {
  const cache = new Map<string, ThemeEditorSession>();
  const pendingSaves = new WeakMap<ThemeEditorSession, { draft: ThemeDocument; promise: Promise<void> }>();
  const createId = options.createId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => formatThemeTimestamp());

  function restoreThemeDrafts(drafts: readonly ThemeEditorDraft[]): void {
    for (const draft of drafts) {
      if (cache.has(draft.themeId)) continue;
      cache.set(draft.themeId, { ...structuredClone(draft), undo: [], redo: [] });
    }
  }

  function restoreThemeDraft(session: ThemeEditorSession, defaults: ThemeDocument, scope: string): void {
    pushHistory(session.undo, snapshot(session));
    session.document = restoreThemeAdjustments(defaults, session.document, scope);
    if (scope === "all") session.assetChanges = {};
    if (scope === "all" || scope === "visual") {
      session.visualCssDraft = session.visualCssValid = defaults.styles.visualCss;
      session.visualCssError = ""; session.visualCssDiagnostics = []; session.visualCssControlled = [];
    }
    if (scope === "all" || scope === "custom") {
      session.customCssDraft = session.customCssValid = defaults.styles.customCss;
      session.customCssError = "";
    }
    session.redo = []; session.historyGroup = undefined;
    refreshDirty(session);
  }

  async function openThemeSession(themeId: string): Promise<ThemeEditorSession> {
    const cached = cache.get(themeId);
    if (cached) return cached;
    const document = await repository.loadThemeDocument(themeId);
    const saved = structuredClone(document);
    const visualCss = saved.styles.visualCss;
    const customCss = saved.styles.customCss;
    const session: ThemeEditorSession = { themeId, saved, document: cloneEditableDocument(saved), assetChanges: {}, dirty: false, undo: [], redo: [], visualCssDraft: visualCss, visualCssValid: visualCss, visualCssError: "", visualCssDiagnostics: [], visualCssControlled: [], visualCssInitialized: false, customCssDraft: customCss, customCssValid: customCss, customCssError: "", persisted: true };
    cache.set(themeId, session);
    return session;
  }

  function createNewThemeSession(document: ThemeDocument, sourceThemeId?: string): ThemeEditorSession {
    const saved = structuredClone(document);
    const visualCss = saved.styles.visualCss;
    const customCss = saved.styles.customCss;
    const session: ThemeEditorSession = { themeId: document.themeId, saved, document: cloneEditableDocument(saved), assetChanges: {}, dirty: true, undo: [], redo: [], visualCssDraft: visualCss, visualCssValid: visualCss, visualCssError: "", visualCssDiagnostics: [], visualCssControlled: [], visualCssInitialized: false, customCssDraft: customCss, customCssValid: customCss, customCssError: "", persisted: false, sourceThemeId };
    cache.set(document.themeId, session);
    return session;
  }

  function updateThemeDraft(session: ThemeEditorSession, update: (document: ThemeDocument) => ThemeDocument): void {
    pushHistory(session.undo, snapshot(session));
    session.document = update(cloneDraftDocument(session.document));
    session.redo = [];
    refreshDirty(session);
    session.historyGroup = undefined;
  }

  function initializeThemeVisualCss(session: ThemeEditorSession, css: string): void {
    session.visualCssDraft = css;
    session.visualCssValid = css;
    session.visualCssError = "";
    session.visualCssDiagnostics = [];
    session.visualCssControlled = [];
    session.historyGroup = undefined;
    session.visualCssInitialized = true;
  }

  function updateThemeVisualCssFromControls(session: ThemeEditorSession, css: string): void {
    session.visualCssValid = css;
    if (!session.visualCssError) session.visualCssDraft = css;
    refreshDirty(session);
  }

  function refreshDirty(session: ThemeEditorSession): void {
    session.dirty = !session.persisted || !sameDocumentValue(session.document, session.saved)
      || Object.keys(session.assetChanges).length > 0
      || session.visualCssDraft !== session.visualCssValid || session.customCssDraft !== session.customCssValid;
  }

  function updateThemeVisualCssDraft(
    session: ThemeEditorSession,
    draft: string,
    update: (document: ThemeDocument) => ThemeVisualCssUpdateResult,
  ): ThemeVisualCssUpdateResult {
    const result = update(cloneDraftDocument(session.document));
    session.visualCssDraft = draft;
    if (result.error || !result.document) {
      session.dirty = true;
      session.visualCssError = result.error || "CSS 语法有误";
      session.visualCssDiagnostics = [];
      return { error: session.visualCssError };
    }
    if (session.historyGroup !== "visual-css") pushHistory(session.undo, snapshot(session, true));
    session.document = result.document;
    session.visualCssValid = draft;
    session.visualCssError = "";
    session.visualCssDiagnostics = [...(result.diagnostics ?? [])];
    session.visualCssControlled = [...(result.cssControlled ?? [])];
    session.redo = [];
    refreshDirty(session);
    session.historyGroup = "visual-css";
    return { document: session.document, diagnostics: session.visualCssDiagnostics, cssControlled: session.visualCssControlled };
  }

  function updateThemeCustomCssDraft(
    session: ThemeEditorSession,
    draft: string,
    validate: (css: string) => string | null,
  ): string {
    const error = validate(draft);
    if (error) {
      session.customCssDraft = draft;
      session.customCssError = error;
      session.dirty = true;
      return error;
    }
    pushHistory(session.undo, snapshot(session));
    session.customCssDraft = draft;
    session.customCssValid = draft;
    session.customCssError = "";
    session.document = {
      ...session.document,
      styles: { ...session.document.styles, customCss: draft },
    };
    session.redo = [];
    refreshDirty(session);
    session.historyGroup = undefined;
    return "";
  }

  async function checkThemeSessionForExternalChange(
    session: ThemeEditorSession,
  ): Promise<"unchanged" | "changed" | "reloaded" | "deleted"> {
    let disk: ThemeDocument;
    try {
      disk = await repository.loadThemeDocument(session.themeId);
    } catch (error) {
      if (error instanceof Error && /不存在|移除/.test(error.message)) return "deleted";
      throw error;
    }
    if (JSON.stringify(disk) === JSON.stringify(session.saved)) {
      session.externalDocument = undefined;
      return "unchanged";
    }
    if (session.dirty) {
      session.externalDocument = structuredClone(disk);
      return "changed";
    }
    const visualCss = disk.styles.visualCss;
    const customCss = disk.styles.customCss;
    session.saved = structuredClone(disk);
    session.document = cloneEditableDocument(disk);
    session.visualCssDraft = visualCss;
    session.visualCssValid = visualCss;
    session.visualCssError = "";
    session.visualCssDiagnostics = [];
    session.visualCssControlled = [];
    session.visualCssInitialized = false;
    session.customCssDraft = customCss;
    session.customCssValid = customCss;
    session.customCssError = "";
    session.externalDocument = undefined;
    session.undo = [];
    session.redo = [];
    return "reloaded";
  }

  function updateThemeAsset(
    session: ThemeEditorSession,
    update: (document: ThemeDocument) => ThemeDocument,
    path: string,
    bytes: Uint8Array | null,
  ): void {
    pushHistory(session.undo, snapshot(session));
    session.document = update(cloneDraftDocument(session.document));
    session.assetChanges = { ...session.assetChanges, [path]: bytes };
    session.redo = [];
    session.dirty = true;
    session.historyGroup = undefined;
  }

  function undoThemeEdit(session: ThemeEditorSession): void {
    const previous = session.undo.pop();
    if (!previous) return;
    pushHistory(session.redo, snapshot(session));
    restoreSnapshot(session, previous);
    refreshDirty(session);
  }

  function redoThemeEdit(session: ThemeEditorSession): void {
    const next = session.redo.pop();
    if (!next) return;
    pushHistory(session.undo, snapshot(session));
    restoreSnapshot(session, next);
    session.dirty = true;
  }

  async function saveThemeSession(session: ThemeEditorSession, keepDraft = false): Promise<ThemeEditorSession> {
    if (session.visualCssError) throw new Error("请先修正可视化 CSS 错误");
    if (session.customCssError) throw new Error("请先修正自定义 CSS 错误");
    const draft = session.document;
    const previous = pendingSaves.get(session);
    if (previous?.draft === draft) { await previous.promise; return session; }
    const assetChanges = session.assetChanges;
    const promise = (async () => {
      if (previous) await previous.promise;
      const latest = keepDraft ? await repository.loadThemeDocument(session.themeId) : session.saved;
      const document = { ...structuredClone(draft), revision: latest.revision + 1, metadata: { ...draft.metadata, localModifiedAt: now() } };
      await repository.saveThemeDocument(document, {
        assetChanges: Object.keys(assetChanges).length ? assetChanges : undefined,
      });
      session.saved = structuredClone(document);
      if (session.document === draft) {
        session.document = structuredClone(document);
        session.assetChanges = {};
        session.customCssDraft = document.styles.customCss;
        session.customCssValid = document.styles.customCss;
        session.visualCssDraft = document.styles.visualCss;
        session.visualCssValid = document.styles.visualCss;
        session.dirty = false;
        session.historyGroup = undefined;
      } else {
        session.assetChanges = Object.fromEntries(Object.entries(session.assetChanges).filter(([path, value]) => assetChanges[path] !== value));
      }
      session.externalDocument = undefined;
    })();
    pendingSaves.set(session, { draft, promise });
    try { await promise; } finally { if (pendingSaves.get(session)?.promise === promise) pendingSaves.delete(session); }
    return session;
  }

  async function restoreThemeSession(session: ThemeEditorSession, defaults: ThemeDocument, scope: string): Promise<ThemeEditorSession> {
    const pending = pendingSaves.get(session);
    if (pending) await pending.promise;
    const saved = restoreThemeAdjustments(defaults, session.saved, scope);
    saved.revision = session.saved.revision + 1;
    saved.metadata = { ...saved.metadata, localModifiedAt: now() };
    await repository.saveThemeDocument(saved);
    session.saved = structuredClone(saved);
    const metadata = scope === "all" ? saved.metadata : { ...session.document.metadata, localModifiedAt: saved.metadata.localModifiedAt };
    session.document = { ...restoreThemeAdjustments(defaults, session.document, scope), revision: saved.revision, metadata };
    if (scope === "all") session.assetChanges = {};
    if (scope === "all" || scope === "visual") {
      session.visualCssDraft = session.visualCssValid = defaults.styles.visualCss;
      session.visualCssError = ""; session.visualCssDiagnostics = []; session.visualCssControlled = [];
    }
    if (scope === "all" || scope === "custom") {
      session.customCssDraft = session.customCssValid = defaults.styles.customCss;
      session.customCssError = "";
    }
    session.undo = []; session.redo = []; session.historyGroup = undefined;
    refreshDirty(session);
    return session;
  }

  async function saveThemeSessionAs(session: ThemeEditorSession, metadata: { name: string; author: string; version?: string }): Promise<ThemeEditorSession> {
    if (session.visualCssError) throw new Error("请先修正可视化 CSS 错误");
    if (session.customCssError) throw new Error("请先修正自定义 CSS 错误");
    const document: ThemeDocument = {
      ...structuredClone(session.document), themeId: createId(), origin: "custom",
      permissions: permissionsForOrigin("custom"), revision: 1,
      metadata: { ...session.document.metadata, ...metadata, version: metadata.version ?? session.document.metadata.version, localModifiedAt: now() },
    };
    await repository.saveThemeDocument(document, {
      sourceThemeId: session.sourceThemeId ?? session.themeId,
      assetChanges: Object.keys(session.assetChanges).length ? session.assetChanges : undefined,
    });
    const saved: ThemeEditorSession = { themeId: document.themeId, saved: structuredClone(document), document: structuredClone(document), assetChanges: {}, dirty: false, undo: [], redo: [], visualCssDraft: document.styles.visualCss, visualCssValid: document.styles.visualCss, visualCssError: "", visualCssDiagnostics: [], visualCssControlled: [...session.visualCssControlled], visualCssInitialized: true, customCssDraft: document.styles.customCss, customCssValid: document.styles.customCss, customCssError: "", persisted: true };
    cache.set(document.themeId, saved);
    return saved;
  }

  function discardThemeSession(themeId: string, preserveDirty = false): void {
    if (!preserveDirty || !cache.get(themeId)?.dirty) cache.delete(themeId);
  }

  async function reloadThemeSession(session: ThemeEditorSession): Promise<ThemeEditorSession> {
    const document = await repository.loadThemeDocument(session.themeId);
    const saved = structuredClone(document);
    const next: ThemeEditorSession = { ...session, saved, document: cloneEditableDocument(saved), dirty: false, assetChanges: {}, undo: [], redo: [], visualCssDraft: saved.styles.visualCss, visualCssValid: saved.styles.visualCss, visualCssError: "", visualCssDiagnostics: [], visualCssControlled: [], visualCssInitialized: false, customCssDraft: saved.styles.customCss, customCssValid: saved.styles.customCss, customCssError: "", externalDocument: undefined };
    cache.set(session.themeId, next);
    return next;
  }

  function listDraftThemeSummaries() {
    return [...cache.values()].filter(session => !session.persisted).map(session => toThemeSummary(session.document));
  }

  function getDraftThemeDocument(themeId: string): ThemeDocument | undefined {
    const session = cache.get(themeId);
    return session && !session.persisted ? structuredClone(session.document) : undefined;
  }

  function getDraftThemeAssetChanges(themeId: string): ThemeAssetChanges {
    const session = cache.get(themeId);
    return session && !session.persisted ? structuredClone(session.assetChanges) : {};
  }

  return { restoreThemeDrafts, restoreThemeDraft, reloadThemeSession, getDraftThemeAssetChanges, openThemeSession, createNewThemeSession, listDraftThemeSummaries, getDraftThemeDocument, updateThemeDraft, initializeThemeVisualCss, updateThemeVisualCssDraft, updateThemeVisualCssFromControls, updateThemeCustomCssDraft, checkThemeSessionForExternalChange, updateThemeAsset, undoThemeEdit, redoThemeEdit, restoreThemeSession, saveThemeSession, saveThemeSessionAs, discardThemeSession };
}
