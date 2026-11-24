import { readManagedNativeEventVisibility } from "../themes/nativeManagedCss.ts";
import { load } from "../appData.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES, type EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import type { NativeThemeDisplaySettings } from "../themes/nativeComponentAppearance.ts";
import { projectNativeTheme, type NativeThemeProjection } from "../themes/nativeThemeProjection.ts";
import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DEFAULT_STICKY_EVENT_SETTINGS, normalizeStickyEventSettings, type StickyEventSettings } from "../windows/stickyEventModel.ts";
import type { BlivechatObsSnapshot } from "../compat/blivechat/obs.ts";
import type { OpenLiveObsSnapshot } from "../compat/openlive/obs.ts";
import type { LaplaceObsSnapshot } from "../compat/laplace/obs.ts";

const OBS_THEME_STORE = "native-obs-themes.local.json";
const OBS_THEME_EVENT = "native-obs-theme-snapshot";

export interface NativeObsThemeSnapshot {
  mode?: "native";
  targetId: string;
  roomId: number | null;
  themeId: string;
  revision: number;
  settings: EventStyleSettings;
  eventVisibility?: import("../themes/nativeComponentAppearance.ts").NativeEventVisibility;
  display: NativeThemeDisplaySettings;
  displayPreferences: EventDisplayPreferences;
  eventFontSize: number;
  css: string;
  displayScale: number;
  stickyEvents: StickyEventSettings;
  savedAt: string;
}
export type ObsThemeSnapshot = NativeObsThemeSnapshot | BlivechatObsSnapshot | OpenLiveObsSnapshot | LaplaceObsSnapshot;

export async function persistObsThemeSnapshot(snapshot: ObsThemeSnapshot): Promise<void> {
  const store = await load(OBS_THEME_STORE, { autoSave: false, defaults: {} });
  await store.set(snapshot.targetId, snapshot); await store.save();
}
export async function emitObsThemeSnapshot(snapshot: ObsThemeSnapshot): Promise<void> { await emit(OBS_THEME_EVENT, snapshot); }
export async function loadObsThemeSnapshot(targetId = "default"): Promise<ObsThemeSnapshot | undefined> {
  const store = await load(OBS_THEME_STORE, { autoSave: false, defaults: {} });
  const snapshot = await store.get<ObsThemeSnapshot>(targetId);
  if (!snapshot) return undefined;
  return !snapshot.mode || snapshot.mode === 'native'
    ? { ...snapshot, eventVisibility: snapshot.eventVisibility ?? readManagedNativeEventVisibility(snapshot.css) } : snapshot;
}
export async function subscribeObsThemeSnapshot(targetId: string, listener: (snapshot: ObsThemeSnapshot) => void): Promise<UnlistenFn> {
  const snapshot = await loadObsThemeSnapshot(targetId); if (snapshot) listener(snapshot);
  return listen<ObsThemeSnapshot>(OBS_THEME_EVENT, event => { if (event.payload.targetId === targetId) listener(event.payload); });
}

export function snapshotForNativeObsTarget(targetId: string, snapshot: NativeObsThemeSnapshot | undefined): NativeObsThemeSnapshot | undefined {
  return snapshot?.targetId === targetId ? snapshot : undefined;
}

export function buildNativeObsThemeSnapshot(theme: ThemeDocument, targetId: string, projection: NativeThemeProjection, savedAt = new Date().toISOString(), stickyEvents: StickyEventSettings = DEFAULT_STICKY_EVENT_SETTINGS, roomId: string | number | null = null): NativeObsThemeSnapshot {
  const { baseFontSize, ...display } = projection.display;
  return {
    targetId, roomId: roomId == null || roomId === "" ? null : Number(roomId), themeId: theme.themeId, revision: theme.revision, settings: projection.settings,
    eventVisibility: projection.eventVisibility,
    display: projection.display,
    displayScale: projection.displayScale,
    displayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, ...display },
    eventFontSize: baseFontSize, css: projection.css,
    stickyEvents: normalizeStickyEventSettings(stickyEvents), savedAt,
  };
}

export async function createNativeObsThemeSnapshot(theme: ThemeDocument, targetId = "default", projection = projectNativeTheme(theme)): Promise<NativeObsThemeSnapshot> {
  const snapshot = buildNativeObsThemeSnapshot(theme, targetId, projection);
  await persistNativeObsThemeSnapshot(snapshot);
  await emitNativeObsThemeSnapshot(snapshot);
  return snapshot;
}

export async function persistNativeObsThemeSnapshot(snapshot: NativeObsThemeSnapshot): Promise<void> {
  await persistObsThemeSnapshot(snapshot);
}

export async function emitNativeObsThemeSnapshot(snapshot: NativeObsThemeSnapshot): Promise<void> {
  await emitObsThemeSnapshot(snapshot);
}

export async function loadNativeObsThemeSnapshot(targetId = "default"): Promise<NativeObsThemeSnapshot | undefined> {
  const store = await load(OBS_THEME_STORE, { autoSave: false, defaults: {} });
  const snapshot = await store.get<ObsThemeSnapshot>(targetId);
  if (snapshot?.mode === "blivechat" || snapshot?.mode === "blivechat-open" || snapshot?.mode === "laplace") return undefined;
  return snapshot ? { ...snapshot, roomId: snapshot.roomId ?? null, stickyEvents: normalizeStickyEventSettings(snapshot.stickyEvents) } : undefined;
}

export async function removeNativeObsThemeSnapshot(targetId: string): Promise<void> {
  const store = await load(OBS_THEME_STORE, { autoSave: false, defaults: {} });
  await store.delete(targetId);
  await store.save();
}

export async function subscribeNativeObsThemeSnapshot(targetId: string, listener: (snapshot: NativeObsThemeSnapshot) => void): Promise<UnlistenFn> {
  const snapshot = await loadNativeObsThemeSnapshot(targetId);
  if (snapshot) listener(snapshot);
  return listen<ObsThemeSnapshot>(OBS_THEME_EVENT, event => {
    if (event.payload.targetId === targetId && event.payload.mode !== "blivechat" && event.payload.mode !== "blivechat-open" && event.payload.mode !== "laplace") listener(event.payload);
  });
}
