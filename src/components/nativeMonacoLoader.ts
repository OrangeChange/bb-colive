import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import CssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import { NATIVE_PART_SELECTORS } from "../themes/nativeSemanticSelectors.ts";
import { nativeMonacoHoverDescription } from "./nativeMonacoEditorConfig.ts";

type MonacoModule = typeof import("monaco-editor/esm/vs/editor/editor.api");
let loading: Promise<MonacoModule> | undefined;
let configured = false;

export function loadNativeMonaco(): Promise<MonacoModule> {
  loading ??= (async () => {
    await import("monaco-editor/esm/nls.messages.zh-cn.js");
    (globalThis as typeof globalThis & { MonacoEnvironment?: { getWorker: (_moduleId: string, label: string) => Worker } }).MonacoEnvironment = {
      getWorker: (_moduleId, label) => label === "css" || label === "scss" || label === "less" ? new CssWorker() : new EditorWorker(),
    };
    // Standalone contributions provide editing actions, navigation and the command palette.
    // @ts-expect-error Monaco does not publish declarations for this side-effect entry.
    await import("monaco-editor/esm/vs/editor/edcore.main.js");
    const monaco = await import("monaco-editor/esm/vs/editor/editor.api");
    await import("monaco-editor/esm/vs/basic-languages/css/css.contribution.js");
    await import("monaco-editor/esm/vs/language/css/monaco.contribution");
    if (!configured) {
      configured = true;
      monaco.languages.css.cssDefaults.setOptions({ validate: true, lint: { compatibleVendorPrefixes: "ignore", vendorPrefix: "ignore" } });
      monaco.languages.registerHoverProvider("css", {
        provideHover(model, position) {
          const description = nativeMonacoHoverDescription(model.getLineContent(position.lineNumber));
          return description ? { contents: [{ value: description }] } : undefined;
        },
      });
      monaco.languages.registerCompletionItemProvider("css", {
        triggerCharacters: [".", "-"],
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: word.startColumn, endColumn: word.endColumn };
          const selectors = [...new Set(Object.values(NATIVE_PART_SELECTORS).flatMap(selector => selector.split(/\s*,\s*/u)))];
          return { suggestions: selectors.map(selector => ({ label: selector, kind: monaco.languages.CompletionItemKind.Class, insertText: selector, range, detail: "BB CoLive 语义选择器" })) };
        },
      });
    }
    return monaco;
  })();
  return loading.catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
}

