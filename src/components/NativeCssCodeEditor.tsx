import { uiText } from "../i18n/index.ts";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { createNativeMonacoModelUri, NATIVE_MONACO_OPTIONS } from "./nativeMonacoEditorConfig.ts";
import { applyNativeMonacoTheme } from "./nativeMonacoTheme.ts";

const sharedModels = new Map<string, Monaco.editor.ITextModel>();
const sharedViewStates = new Map<string, Monaco.editor.ICodeEditorViewState | null>();

export interface NativeCssCodeEditorHandle {
  insertText: (text: string) => boolean;
  focus: () => void;
  goToLine: (line: number, column?: number) => void;
  openSearch: () => void;
  selectAll: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  replaceDocument: (documentKey: string, value: string) => boolean;
}

export const NativeCssCodeEditor = forwardRef<NativeCssCodeEditorHandle, { value: string; documentKey: string; readOnly: boolean; onChange: (value: string) => void; onSave: () => void; onFormat?: () => void; onCopy?: () => void; onClear?: () => void; label: string }>(function NativeCssCodeEditor({ value, documentKey, readOnly, onChange, onSave, onFormat, onCopy, onClear, label }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const currentDocumentKey = useRef(documentKey);
  const syncing = useRef(false);
  const change = useRef(onChange);
  change.current = onChange;
  const save = useRef(onSave);
  save.current = onSave;
  const format = useRef(onFormat);
  format.current = onFormat;
  const copy = useRef(onCopy);
  copy.current = onCopy;
  const requestClear = useRef(onClear);
  requestClear.current = onClear;
  const latestValue = useRef(value);
  latestValue.current = value;
  const latestReadOnly = useRef(readOnly);
  latestReadOnly.current = readOnly;
  const latestLabel = useRef(label);
  latestLabel.current = label;
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const ensureModel = (monaco: typeof Monaco, key: string, source: string) => {
    const existing = sharedModels.get(key);
    if (existing) return existing;
    const uri = monaco.Uri.parse(createNativeMonacoModelUri(key));
    const shared = monaco.editor.getModel(uri);
    const model = shared ?? monaco.editor.createModel(source, "css", uri);
    sharedModels.set(key, model);
    return model;
  };

  useImperativeHandle(ref, () => ({
    insertText(text) {
      const editor = editorRef.current;
      const selection = editor?.getSelection();
      if (!editor || !selection || latestReadOnly.current) return false;
      editor.pushUndoStop();
      const applied = editor.executeEdits("theme-asset", [{ range: selection, text, forceMoveMarkers: true }]);
      editor.pushUndoStop();
      editor.focus();
      return applied;
    },
    focus: () => editorRef.current?.focus(),
    goToLine(line, column = 1) {
      const editor = editorRef.current;
      if (!editor) return;
      const model = editor.getModel();
      const lineNumber = Math.min(Math.max(1, line), model?.getLineCount() ?? 1);
      editor.setPosition({ lineNumber, column: Math.max(1, column) });
      editor.revealPositionInCenter({ lineNumber, column: Math.max(1, column) });
      editor.focus();
    },
    openSearch: () => { void editorRef.current?.getAction("actions.find")?.run(); },
    selectAll: () => { void editorRef.current?.getAction("editor.action.selectAll")?.run(); },
    undo: () => { editorRef.current?.trigger("theme-editor", "undo", null); },
    redo: () => { editorRef.current?.trigger("theme-editor", "redo", null); },
    clear: () => {
      const editor = editorRef.current;
      const model = editor?.getModel();
      if (!editor || !model || latestReadOnly.current) return;
      editor.pushUndoStop();
      editor.executeEdits("clear-css", [{ range: model.getFullModelRange(), text: "" }]);
      editor.pushUndoStop();
      editor.focus();
    },
    replaceDocument(documentKey, nextValue) {
      const monaco = monacoRef.current;
      if (!monaco) return false;
      const model = ensureModel(monaco, documentKey, nextValue);
      if (model.getValue() !== nextValue) {
        syncing.current = true;
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text: nextValue }], () => null);
        syncing.current = false;
      }
      return currentDocumentKey.current === documentKey;
    },
  }), []);

  useEffect(() => {
    if (!host.current) return;
    setLoadState("loading");
    let disposed = false;
    let changeSubscription: Monaco.IDisposable | undefined;
    let resizeObserver: ResizeObserver | undefined;
    let themeObserver: MutationObserver | undefined;
    const actions: Monaco.IDisposable[] = [];
    void import("./nativeMonacoLoader.ts").then(({ loadNativeMonaco }) => loadNativeMonaco()).then(monaco => {
      if (disposed || !host.current) return;
      monacoRef.current = monaco;
      applyNativeMonacoTheme(monaco, document.documentElement);
      const model = ensureModel(monaco, currentDocumentKey.current, latestValue.current);
      const editor = monaco.editor.create(host.current, {
        ...NATIVE_MONACO_OPTIONS,
        model,
        readOnly: latestReadOnly.current,
        ariaLabel: latestLabel.current,
        theme: "danmu-ui",
      });
      actions.push(editor.addAction({ id: "danmu.save-css", label: uiText("nativeCssCodeEditor.NativeCssCodeEditor.label"), precondition: "!editorReadonly", contextMenuGroupId: "3_css", contextMenuOrder: 3, keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], run: () => { save.current(); } }));
      actions.push(editor.addAction({ id: "danmu.format-css", label: uiText("nativeCssCodeEditor.NativeCssCodeEditor.label2"), precondition: "!editorReadonly", contextMenuGroupId: "3_css", contextMenuOrder: 1, keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF], run: () => { format.current?.(); } }));
      for (const [id, label, command, order] of [["undo", uiText("nativeCssCodeEditor.NativeCssCodeEditor"), "undo", 1], ["redo", uiText("nativeCssCodeEditor.NativeCssCodeEditor2"), "redo", 2], ["find", uiText("nativeCssCodeEditor.NativeCssCodeEditor3"), "actions.find", 3], ["replace", uiText("nativeCssCodeEditor.NativeCssCodeEditor4"), "editor.action.startFindReplaceAction", 4], ["select-all", uiText("common.selectAll"), "editor.action.selectAll", 5]] as const) {
        actions.push(editor.addAction({ id: `danmu.${id}`, label, contextMenuGroupId: "2_edit", contextMenuOrder: order, ...(["undo", "redo", "replace"].includes(id) ? { precondition: "!editorReadonly" } : {}), run: () => {
          const action = editor.getAction(command);
          if (action) return action.run();
          editor.trigger("context-menu", command, null);
        } }));
      }
      for (const [id, label, command, order] of [["goto-line", uiText("nativeCssCodeEditor.NativeCssCodeEditor5"), "editor.action.gotoLine", 1], ["fold-all", uiText("nativeCssCodeEditor.NativeCssCodeEditor6"), "editor.foldAll", 2], ["unfold-all", uiText("nativeCssCodeEditor.NativeCssCodeEditor7"), "editor.unfoldAll", 3], ["comment", uiText("nativeCssCodeEditor.NativeCssCodeEditor8"), "editor.action.blockComment", 4]] as const) {
        actions.push(editor.addAction({ id: `danmu.${id}`, label, contextMenuGroupId: "4_navigation", contextMenuOrder: order, ...(id === "comment" ? { precondition: "!editorReadonly" } : {}), run: () => {
          const action = editor.getAction(command);
          if (action) return action.run();
          editor.trigger("context-menu", command, null);
        } }));
      }
      actions.push(editor.addAction({ id: "danmu.copy-css", label: uiText("nativeCssCodeEditor.NativeCssCodeEditor.label3"), contextMenuGroupId: "3_css", contextMenuOrder: 2, run: () => { copy.current?.(); } }));
      actions.push(editor.addAction({ id: "danmu.clear-css", label: uiText("nativeCssCodeEditor.NativeCssCodeEditor.label4"), precondition: "!editorReadonly", contextMenuGroupId: "3_css", contextMenuOrder: 4, run: () => { requestClear.current?.(); } }));
      changeSubscription = editor.onDidChangeModelContent(() => { if (!syncing.current) change.current(editor.getValue()); });
      editorRef.current = editor;
      resizeObserver = new ResizeObserver(() => editor.layout());
      resizeObserver.observe(host.current);
      themeObserver = new MutationObserver(() => applyNativeMonacoTheme(monaco, document.documentElement));
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
      requestAnimationFrame(() => editor.layout());
      setLoadState("ready");
    }).catch((error: unknown) => {
      console.error("Monaco editor failed to load", error);
      if (!disposed) setLoadState("error");
    });
    return () => {
      disposed = true;
      for (const action of actions) action.dispose();
      changeSubscription?.dispose();
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
      editorRef.current?.dispose();
      editorRef.current = null;
      monacoRef.current = null;
    };
  }, [loadAttempt]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) {
      currentDocumentKey.current = documentKey;
      return;
    }
    if (currentDocumentKey.current === documentKey) return;
    sharedViewStates.set(currentDocumentKey.current, editor.saveViewState());
    currentDocumentKey.current = documentKey;
    editor.setModel(ensureModel(monaco, documentKey, value));
    const state = sharedViewStates.get(documentKey);
    if (state) editor.restoreViewState(state);
    editor.focus();
  }, [documentKey, value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ readOnly, ariaLabel: label });
  }, [readOnly, label, documentKey]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const model = ensureModel(monaco, documentKey, value);
    if (model.getValue() === value) return;
    syncing.current = true;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
    syncing.current = false;
  }, [documentKey, value]);

  return <div className="native-css-code-shell">
    <div ref={host} className="native-css-code" aria-label={label} />
    {loadState === "loading" && <div className="native-css-code-state" role="status">{uiText("nativeCssCodeEditor.NativeCssCodeEditor9")}</div>}
    {loadState === "error" && <div className="native-css-code-state is-error" role="alert"><span>{uiText("nativeCssCodeEditor.NativeCssCodeEditor10")}</span><button type="button" onClick={() => setLoadAttempt(current => current + 1)}>{uiText("common.retry")}</button></div>}
  </div>;
});
