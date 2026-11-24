import { emit } from "@tauri-apps/api/event";
import type { ThemeDocument } from "../themes/themeTypes.ts";

export interface CompatibleRuntimeSnapshot {
  document: ThemeDocument;
  context: { targetId: string };
}

const eventByMode = {
  blivechat: "compatible-theme-publication:blivechat",
  "blivechat-open": "compatible-theme-publication:openlive",
  laplace: "compatible-theme-publication:laplace",
} as const;

export type CompatibleRuntimeMode = keyof typeof eventByMode;

export const compatibleRuntimePublicationEvent = (mode: CompatibleRuntimeMode) => eventByMode[mode];

export const publishCompatibleRuntimeSnapshot = (snapshot: CompatibleRuntimeSnapshot) =>
  emit(compatibleRuntimePublicationEvent(snapshot.document.mode as CompatibleRuntimeMode), snapshot);

export const removeCompatibleRuntimeOutput = (mode: keyof typeof eventByMode, targetId: string) =>
  emit(eventByMode[mode], { type: "remove", targetId });
