import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { StylePreviewContext } from "../components/stylePreviewContext.ts";

type PreviewWindow = StylePreviewContext | "windows";
export const usePreviewWindowPreference = create<{ window: PreviewWindow; setWindow(value: PreviewWindow): void }>()(
  persist(set => ({ window: "live", setWindow: window => set({ window }) }), { name: "style-preview-window" }),
);
export function nativePreviewWindow(): StylePreviewContext {
  const value = usePreviewWindowPreference.getState().window;
  return value === "windows" ? "window-chat" : value;
}
export function compatiblePreviewWindow(): "live" | "windows" | "obs" {
  const value = usePreviewWindowPreference.getState().window;
  return value === "live" || value === "obs" ? value : value === "review" ? "live" : "windows";
}
