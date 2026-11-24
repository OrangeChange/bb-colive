import type * as Monaco from "monaco-editor/esm/vs/editor/editor.api";

export type NativeMonacoThemeColors = {
  dark: boolean;
  background: string;
  raised: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accentSubtle: string;
};

export function buildNativeMonacoTheme(colors: NativeMonacoThemeColors): Monaco.editor.IStandaloneThemeData {
  return {
    base: colors.dark ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": colors.background,
      "editor.foreground": colors.text,
      "editorLineNumber.foreground": colors.muted,
      "editorLineNumber.activeForeground": colors.text,
      "editorCursor.foreground": colors.accent,
      "editor.selectionBackground": colors.accentSubtle,
      "editor.inactiveSelectionBackground": colors.accentSubtle,
      "editor.lineHighlightBackground": colors.accentSubtle,
      "editorWidget.background": colors.raised,
      "editorWidget.border": colors.border,
      "editorSuggestWidget.background": colors.raised,
      "editorSuggestWidget.border": colors.border,
      "editorSuggestWidget.foreground": colors.text,
      "editorSuggestWidget.selectedBackground": colors.accentSubtle,
      "editorHoverWidget.background": colors.raised,
      "editorHoverWidget.border": colors.border,
      "input.background": colors.background,
      "input.border": colors.border,
      "input.foreground": colors.text,
      "focusBorder": colors.accent,
      "menu.background": colors.raised,
      "menu.foreground": colors.text,
      "menu.selectionBackground": colors.accentSubtle,
      "menu.separatorBackground": colors.border,
    },
  };
}

export function resolveNativeMonacoColor(root: HTMLElement, value: string, fallback: string): string {
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.position = "fixed";
  probe.style.visibility = "hidden";
  root.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const channels = resolved.match(/[\d.]+/g)?.map(Number);
  if (!channels || channels.length < 3) return fallback;
  const [red, green, blue, alpha = 1] = channels;
  const hex = [red, green, blue, Math.round(alpha * 255)].map(channel => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, "0"));
  return `#${hex.slice(0, 3).join("")}${alpha < 1 ? hex[3] : ""}`;
}

export function applyNativeMonacoTheme(monaco: typeof Monaco, root: HTMLElement): void {
  const style = getComputedStyle(root);
  const value = (name: string, fallback: string) => resolveNativeMonacoColor(root, style.getPropertyValue(name).trim() || fallback, fallback);
  monaco.editor.defineTheme("danmu-ui", buildNativeMonacoTheme({
    dark: root.classList.contains("dark"),
    background: value("--color-bg", "#141a18"),
    raised: value("--color-raised", "#1b2220"),
    border: value("--color-line", "#33413d"),
    text: value("--color-t1", "#ecefed"),
    muted: value("--color-t3", "#79837f"),
    accent: value("--color-accent", "#4c9a8d"),
    accentSubtle: value("--color-accent-subtle", "#203c37"),
  }));
  monaco.editor.setTheme("danmu-ui");
}
