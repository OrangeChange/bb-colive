import { useCallback, useLayoutEffect, useRef } from "react";
import {
  activatePreview,
  publishPreview,
  clearPreview,
  getPreview,
} from "./stylePreviewSession.ts";
import type { PreviewFrame, StylePreviewDraft } from "./stylePreviewState.ts";
import { ensureNativeStylePreviewSync } from "../windows/nativeStylePreviewBridge.ts";
export function useStylePreviewPublisher(
  state: StylePreviewDraft | null,
  active = true,
) {
  const owner = useRef(crypto.randomUUID());
  const immediate = useRef<StylePreviewDraft | null>(null);
  const latest = useRef({ state, active }); latest.current = { state, active };
  const publishFrame = useCallback((frame: PreviewFrame) => {
    const { state: current, active: enabled } = latest.current;
    if (!enabled || !current || getPreview()?.ownerId !== owner.current) return;
    if (current.kind === "compatible" && frame.restart !== undefined && frame.restart !== current.content.previewRestartKey) return;
    const next = { ...current, frame: { ...frame, scroll: current.frame.scroll, playing: current.frame.playing, restart: current.frame.restart } };
    immediate.current = next;
    publishPreview(owner.current, next);
  }, []);
  useLayoutEffect(() => {
    if (!active) return;
    ensureNativeStylePreviewSync();
    activatePreview(owner.current);
    return () => clearPreview(owner.current);
  }, [active]);
  useLayoutEffect(() => {
    const sent = immediate.current;
    immediate.current = null;
    if (active && !(state && sent && JSON.stringify(state) === JSON.stringify(sent))) publishPreview(owner.current, state);
  }, [state, active]);
  return publishFrame;
}
