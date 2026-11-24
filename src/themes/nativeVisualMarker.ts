import type { NativeVisualScheme } from "./nativeComponentAppearance.ts";

const MARKER_PATTERN = /^visual:(common|light|dark)\|([^|\s]+)\|([^|\s]+)\|([^|\s]+)$/u;

export function formatNativeVisualMarker(scheme: NativeVisualScheme, targetKey: string): string {
  return `visual:${scheme}|${targetKey}`;
}

export function parseNativeVisualMarker(text: string): { scheme: NativeVisualScheme; targetKey: string } | undefined {
  const match = text.trim().match(MARKER_PATTERN);
  return match ? { scheme: match[1] as NativeVisualScheme, targetKey: `${match[2]}|${match[3]}|${match[4]}` } : undefined;
}
