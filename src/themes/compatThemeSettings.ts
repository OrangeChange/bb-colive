import type { ThemeMode } from "./themeTypes.ts";
import { createDefaultNativeThemeDisplaySettings } from "./nativeComponentAppearance.ts";
import type { NativeEventVisibility, NativeVisualModelInput, NativeVisualProperty, NativeVisualScheme } from "./nativeComponentAppearance.ts";

export type CompatibleThemeMode = Exclude<ThemeMode, "native">;
export function compatibleFallbackDisplay(mode: CompatibleThemeMode, settings: Record<string, unknown>) {
  return { ...createDefaultNativeThemeDisplaySettings(),
    showAvatar: settings.showAvatar !== false, showUsername: settings.showUsername !== false,
    showAnchorIdentity: settings.showAnchorBadge !== false,
    showGuardIdentity: settings.showGuardBadge !== false, showAdminIdentity: settings.showModBadge !== false,
    ...(mode === "blivechat-open" ? {showFanMedal:settings.showMedal !== false,onlyAnchorFanMedal:settings.showMedalCurrentRoomOnly===true,hideUnlitFanMedal:settings.showMedalLightenedOnly!==false} : {}),
    showTimestamp:settings.showTimestamp===true,maskUsername:settings.maskUsername===true,
  };
}
export type CompatibleVisualAuthored = Record<NativeVisualScheme, Record<string, NativeVisualProperty[]>>;

export interface CompatibleVisualSettings extends Record<string, unknown> {
  imageDecorations?: import("./themeImageDecorations.ts").ThemeImageDecorations;
  eventVisibility?: NativeEventVisibility;
  visualModel?: NativeVisualModelInput;
  visualAuthored?: CompatibleVisualAuthored;
}

export interface BlivechatThemeSettings extends CompatibleVisualSettings {
  showGiftName: boolean;
  globalScale: number;
  fontScale: number;
  showTimestamp: boolean;
  maskUsername: boolean;
  showAvatar: boolean;
  showUsername: boolean;
  showGuardBadge?: boolean;
  showModBadge?: boolean;
}

export interface BlivechatOpenThemeSettings extends CompatibleVisualSettings {
  skin: "none" | "default";
  emoticonSize: number;
  showGiftInfo: boolean;
  showTimestamp: boolean;
  maskUsername: boolean;
  showAvatar: boolean;
  showUsername: boolean;
  showMedal: boolean;
  showGuardBadge?: boolean;
  showModBadge?: boolean;
  showMedalLightenedOnly?: boolean;
  showMedalCurrentRoomOnly?: boolean;
}

export interface LaplaceThemeSettings extends CompatibleVisualSettings {
  showSpoiler: boolean;
  showGiftHighlightAbove: number;
  classicElementScope: boolean;
  showAvatar: boolean;
  showUsername: boolean;
  showMedal: boolean;
  showAvatarFrame: boolean;
  showGuardBadge: boolean;
  showMedalLightenedOnly: boolean;
  showMedalCurrentRoomOnly?: boolean;
  showWealthMedal: boolean;
  showCurrentRank: boolean;
  showModBadge: boolean;
  showAnchorBadge: boolean;
  baseFontSize: number;
  colorScheme: "light" | "dark";
  sceneName: string;
  showTimestamp: boolean;
  maskUsername: boolean;
}

export type CompatibleThemeSettings =
  | BlivechatThemeSettings
  | BlivechatOpenThemeSettings
  | LaplaceThemeSettings;

export function createDefaultCompatibleThemeSettings(mode: CompatibleThemeMode): CompatibleThemeSettings {
  if (mode === "blivechat") return { showGiftName: false, globalScale: 1, fontScale: 1, showTimestamp: false, maskUsername: false, showAvatar: true, showUsername: true, showGuardBadge: true, showModBadge: true };
  if (mode === "blivechat-open") return { skin: "none", emoticonSize: 80, showGiftInfo: true, showTimestamp: false, maskUsername: false, showAvatar: true, showUsername: true, showMedal: true, showGuardBadge: true, showModBadge: true, showMedalLightenedOnly: true, showMedalCurrentRoomOnly: false };
  return {
    showSpoiler: true,
    showGiftHighlightAbove: 30,
    classicElementScope: false,
    showAvatar: true,
    showUsername: true,
    showMedal: true,
    showAvatarFrame: true,
    showGuardBadge: true,
    showMedalLightenedOnly: true,
    showMedalCurrentRoomOnly: false,
    showWealthMedal: false,
    showCurrentRank: false,
    showModBadge: true,
    showAnchorBadge: true,
    baseFontSize: 20,
    colorScheme: "light",
    sceneName: "",
    showTimestamp: false,
    maskUsername: false,
  };
}
