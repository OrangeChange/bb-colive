import { uiText } from "../i18n/index.ts";
import { NATIVE_EVENT_SCOPES, NATIVE_IDENTITY_SCOPES, NATIVE_SEMANTIC_PARTS } from "../themes/nativeThemeCapabilities.ts";

export const NATIVE_MONACO_OPTIONS = {
  language: "css",
  automaticLayout: true,
  contextmenu: true,
  minimap: { enabled: false },
  fontSize: 14,
  lineHeight: 20,
  lineNumbersMinChars: 3,
  folding: true,
  glyphMargin: false,
  renderWhitespace: "selection" as const,
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  tabSize: 2,
  insertSpaces: true,
  wordWrap: "off" as const,
  suggest: { showWords: false },
  quickSuggestions: { other: true, comments: false, strings: false },
  fixedOverflowWidgets: true,
  find: { addExtraSpaceOnTop: false },
  padding: { top: 8, bottom: 8 },
} as const;

export function createNativeMonacoModelUri(documentKey: string): string {
  return `inmemory://danmu-theme/${encodeURIComponent(documentKey)}.css`;
}

const labelMap = new Map<string, string>([
  ["common", uiText("nativeMonacoEditorConfig.labelMap")], ["light", uiText("nativeMonacoEditorConfig.labelMap2")], ["dark", uiText("nativeMonacoEditorConfig.labelMap3")],
  ["all", uiText("nativeMonacoEditorConfig.labelMap4")],
  ...NATIVE_EVENT_SCOPES.flatMap(item => [[item.id, item.label] as const, ...(item.children ?? []).map(child => [child.id, child.label] as const)]),
  ...NATIVE_IDENTITY_SCOPES.map(item => [item.id, item.label] as const),
  ...NATIVE_SEMANTIC_PARTS.map(item => [item.id, item.label] as const),
]);

export function nativeMonacoHoverDescription(line: string): string | undefined {
  const match = line.match(/\/\*\s*visual:([a-z]+)\|([A-Za-z]+)\|([A-Za-z]+)\|([A-Za-z]+)\s*\*\//);
  if (!match) return undefined;
  const labels = match.slice(1).map(value => labelMap.get(value) ?? value);
  return uiText("nativeMonacoEditorConfig.nativeMonacoHoverDescription", { value: labels.join(" · ") });
}

