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
  ["common", "通用配色"], ["light", "浅色配色"], ["dark", "深色配色"],
  ["all", "全部"],
  ...NATIVE_EVENT_SCOPES.flatMap(item => [[item.id, item.label] as const, ...(item.children ?? []).map(child => [child.id, child.label] as const)]),
  ...NATIVE_IDENTITY_SCOPES.map(item => [item.id, item.label] as const),
  ...NATIVE_SEMANTIC_PARTS.map(item => [item.id, item.label] as const),
]);

export function nativeMonacoHoverDescription(line: string): string | undefined {
  const match = line.match(/\/\*\s*visual:([a-z]+)\|([A-Za-z]+)\|([A-Za-z]+)\|([A-Za-z]+)\s*\*\//);
  if (!match) return undefined;
  const labels = match.slice(1).map(value => labelMap.get(value) ?? value);
  return `可视化样式：${labels.join(" · ")}`;
}

