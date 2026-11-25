import { localized, uiText } from "../i18n/index.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import { DEFAULT_EVENT_STYLE_ROLE_PRIORITY, EVENT_STYLE_ROLES, type EventStyleRole } from "../eventStyleSettings.ts";
import {
  DEFAULT_EVENT_DISPLAY_PREFERENCES,
  DEFAULT_EVENT_FONT_SIZE,
  type GuardIdentityDisplayMode,
  type RoleIdentityDisplayMode,
  type HonorLevelDisplayMode,
} from "../eventDisplaySettings.ts";
import type { NativeSemanticPartId } from "./nativeSemanticSelectors.ts";

export const NATIVE_COMPONENT_PARTS = [
  "event", "identity", "avatar", "avatarFrame", "username", "medal", "guardBadge",
  "message", "translation", "giftImage", "eventIcon", "sticky",
] as const;

export type NativeComponentPart = (typeof NATIVE_COMPONENT_PARTS)[number];

export const NATIVE_COMPONENT_LABELS: Record<NativeComponentPart, string> = localized(() => ({
  event: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.event"), identity: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.identity"), avatar: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.avatar"), avatarFrame: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.avatarFrame"),
  username: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.username"), medal: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.medal"), guardBadge: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.guardBadge"), message: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.message"),
  translation: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.translation"), giftImage: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.giftImage"), eventIcon: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.eventIcon"), sticky: uiText("nativeComponentAppearance.NATIVE_COMPONENT_LABELS.sticky"),
}));

export interface NativeComponentStyle {
  visible?: boolean;
  color?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
  paddingX?: number;
  paddingY?: number;
  marginX?: number;
  marginY?: number;
  gap?: number;
  width?: number;
  height?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
}

export type NativeComponentAppearance = Record<NativeComponentPart, NativeComponentStyle>;

export type NativeVisualSource = "inherit" | "theme" | "custom";
export type NativeVisualProperty = "visible" | "color" | "background" | "borderImage" | "fontFamily" | "fontWeight" | "fontSize" | "lineHeight" | "paddingX" | "paddingY" | "marginX" | "marginY" | "gap" | "width" | "height" | "borderWidth" | "borderColor" | "borderRadius";
export type NativeVisualScheme = "common" | "light" | "dark";
export type NativeVisualLength = { mode: "fixed"; value: number } | { mode: "base-relative"; ratio: number };
export type NativeVisualValue = string | number | boolean | NativeVisualLength | import("../components/themeImageValue.ts").ImageBackgroundDraft;
export type NativeVisualSetting = { source: "inherit" } | { source: "theme" | "custom"; value: NativeVisualValue };
export interface NativeVisualTarget { event: string; identity: string; part: NativeSemanticPartId }
export type NativeVisualLayer = Record<string, Partial<Record<NativeVisualProperty, NativeVisualSetting>>>;
export interface NativeVisualModel { common: NativeVisualLayer; light: NativeVisualLayer; dark: NativeVisualLayer }
export type NativeVisualModelInput = NativeVisualModel | NativeVisualLayer;
export interface NativeEventVisibility {
  categories: Record<string, boolean>;
  children: Record<string, boolean>;
  legacyLiveStatusConflict?: boolean;
}

export function nativeVisualTargetKey(target: NativeVisualTarget): string {
  return `${target.event}|${target.identity}|${target.part}`;
}

export function fixedNativeLength(value: number): NativeVisualLength { return { mode: "fixed", value }; }
export function baseRelativeNativeLength(ratio: number): NativeVisualLength { return { mode: "base-relative", ratio }; }
export function toBaseRelativeNativeLength(value: number, baseSize: number): NativeVisualLength {
  return baseRelativeNativeLength(value / (Number.isFinite(baseSize) && baseSize > 0 ? baseSize : DEFAULT_EVENT_FONT_SIZE));
}
export function resolveNativeLength(value: NativeVisualValue, baseSize: number): number {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return 0;
  if (!("mode" in value)) return 0;
  return value.mode === "base-relative" ? value.ratio * baseSize : value.value;
}

function isLayeredNativeVisualModel(value: unknown): value is NativeVisualModel {
  return Boolean(value && typeof value === "object" && "common" in value && "light" in value && "dark" in value);
}

export function normalizeNativeVisualModel(value: unknown): NativeVisualModel {
  if (!value || typeof value !== "object") return createDefaultNativeVisualModel();
  if (!isLayeredNativeVisualModel(value)) return { common: structuredClone(value as NativeVisualLayer), light: {}, dark: {} };
  return {
    common: value.common && typeof value.common === "object" ? structuredClone(value.common) : {},
    light: value.light && typeof value.light === "object" ? structuredClone(value.light) : {},
    dark: value.dark && typeof value.dark === "object" ? structuredClone(value.dark) : {},
  };
}

export function createDefaultNativeVisualModel(): NativeVisualModel { return { common: {}, light: {}, dark: {} }; }

export function readNativeVisualProperty(model: NativeVisualModelInput | undefined, target: NativeVisualTarget, property: NativeVisualProperty, scheme: NativeVisualScheme = "common"): NativeVisualSetting {
  return normalizeNativeVisualModel(model)[scheme][nativeVisualTargetKey(target)]?.[property] ?? { source: "inherit" };
}

export function setNativeVisualProperty(model: NativeVisualModelInput | undefined, target: NativeVisualTarget, property: NativeVisualProperty, setting: NativeVisualSetting, scheme: NativeVisualScheme = "common"): NativeVisualModel {
  const next = normalizeNativeVisualModel(model);
  const layer = next[scheme];
  const key = nativeVisualTargetKey(target);
  if (setting.source === "inherit") {
    if (layer[key]) {
      delete layer[key][property];
      if (Object.keys(layer[key]).length === 0) delete layer[key];
    }
    return next;
  }
  layer[key] = { ...(layer[key] ?? {}), [property]: setting };
  return next;
}

export function clearNativeVisualTarget(model: NativeVisualModelInput | undefined, target: NativeVisualTarget, scheme: NativeVisualScheme = "common"): NativeVisualModel {
  const next = normalizeNativeVisualModel(model);
  delete next[scheme][nativeVisualTargetKey(target)];
  return next;
}
export interface NativeThemeDisplaySettings {
  usePriceGradient: boolean;
  identityPriority: EventStyleRole[];
  showUsername: boolean;
  showTimestamp: boolean;
  maskUsername: boolean;
  showAvatar: boolean;
  showAvatarFrame: boolean;
  showGuardIdentity: boolean;
  guardIdentityDisplayMode: GuardIdentityDisplayMode;
  showAdminIdentity: boolean;
  showAnchorIdentity: boolean;
  adminIdentityDisplayMode: RoleIdentityDisplayMode;
  anchorIdentityDisplayMode: RoleIdentityDisplayMode;
  showFanMedal: boolean;
  showHonorLevel: boolean;
  showCurrentRank: boolean;
  honorLevelDisplayMode: HonorLevelDisplayMode;
  onlyAnchorFanMedal: boolean;
  hideUnlitFanMedal: boolean;
  showGiftImage: boolean;
  showEventIcon: boolean;
  eventSpacing: number;
  eventPadding: number;
  baseFontSize: number;
}

export type NativeThemeSettings = EventStyleSettings & {
  imageDecorations?: import("./themeImageDecorations.ts").ThemeImageDecorations;
  priceGradient?: import('./nativePriceGradient.ts').NativePriceGradient;
  display: NativeThemeDisplaySettings;
  componentAppearance: NativeComponentAppearance;
  visualModel?: NativeVisualModel;
  eventVisibility?: NativeEventVisibility;
};

export function createDefaultNativeEventVisibility(): NativeEventVisibility {
  return {
    categories: Object.fromEntries(["danmaku", "interaction", "gift", "superchat", "guard", "system"].map(key => [key, key !== "interaction"])),
    children: Object.fromEntries(["enter", "follow", "share", "specialFollow", "mutualFollow", "like", "free", "normal", "blind", "redpocket", "lottery", "liveStatus", "userMute", "roomMute", "admin", "roomChange", "warning"].map(key => [key, true])),
  };
}

export function createAllNativeEventVisibility(): NativeEventVisibility {
  const visibility = createDefaultNativeEventVisibility();
  visibility.categories.interaction = true;
  return visibility;
}

export function normalizeNativeEventVisibility(value: unknown): NativeEventVisibility {
  const defaults = createDefaultNativeEventVisibility();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Partial<NativeEventVisibility>;
  const sourceChildren = source.children ?? {};
  const hasUnified = typeof sourceChildren.liveStatus === "boolean";
  const legacyStart = sourceChildren.liveStart;
  const legacyEnd = sourceChildren.liveEnd;
  const legacyConflict = !hasUnified && typeof legacyStart === "boolean" && typeof legacyEnd === "boolean" && legacyStart !== legacyEnd;
  const liveStatus = hasUnified ? sourceChildren.liveStatus : legacyConflict ? true
    : typeof legacyStart === "boolean" ? legacyStart
      : typeof legacyEnd === "boolean" ? legacyEnd : true;
  const children: Record<string, boolean> = { ...defaults.children, ...sourceChildren, liveStatus };
  delete children.liveStart;
  delete children.liveEnd;
  delete children.coverAudit;
  return {
    categories: { ...defaults.categories, ...(source.categories ?? {}) },
    children,
    ...(legacyConflict ? { legacyLiveStatusConflict: true } : {}),
  };
}

export function createDefaultNativeThemeDisplaySettings(): NativeThemeDisplaySettings {
  const value = DEFAULT_EVENT_DISPLAY_PREFERENCES;
  return {
    identityPriority: [...DEFAULT_EVENT_STYLE_ROLE_PRIORITY],
    showUsername: true, showTimestamp: false, maskUsername: false, usePriceGradient: true,
    showAvatar: value.showAvatar, showAvatarFrame: true,
    showGuardIdentity: value.showGuardIdentity, guardIdentityDisplayMode: value.guardIdentityDisplayMode,
    showAdminIdentity: value.showAdminIdentity, showAnchorIdentity: value.showAnchorIdentity,
    adminIdentityDisplayMode: value.adminIdentityDisplayMode, anchorIdentityDisplayMode: value.anchorIdentityDisplayMode,
    showFanMedal: value.showFanMedal, showHonorLevel: false,
    showCurrentRank: false, honorLevelDisplayMode: value.honorLevelDisplayMode,
    onlyAnchorFanMedal: value.onlyAnchorFanMedal, hideUnlitFanMedal: value.hideUnlitFanMedal,
    showGiftImage: value.showGiftImage, showEventIcon: true, eventSpacing: 4, eventPadding: 8,
    baseFontSize: DEFAULT_EVENT_FONT_SIZE,
  };
}

export function normalizeNativeThemeDisplaySettings(value: unknown): NativeThemeDisplaySettings {
  const defaults = createDefaultNativeThemeDisplaySettings();
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const normalized = Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const candidate = source[key];
    if (key === "identityPriority") {
      const requested = Array.isArray(candidate) ? candidate.filter(item => typeof item === "string" && (EVENT_STYLE_ROLES as readonly string[]).includes(item)) as EventStyleRole[] : [];
      return [key, [...new Set([...requested, ...DEFAULT_EVENT_STYLE_ROLE_PRIORITY])]];
    }
    if (typeof fallback === "boolean") return [key, typeof candidate === "boolean" ? candidate : fallback];
    if (typeof fallback === "number") return [key, typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback];
    return [key, candidate === "text" || candidate === "icon" ? candidate : fallback];
  })) as unknown as NativeThemeDisplaySettings;
  const legacyBase = typeof source.eventFontSize === "number" && Number.isFinite(source.eventFontSize)
    ? source.eventFontSize
    : typeof source.windowEventFontSize === "number" && Number.isFinite(source.windowEventFontSize)
      ? source.windowEventFontSize
      : defaults.baseFontSize;
  normalized.baseFontSize = typeof source.baseFontSize === "number" && Number.isFinite(source.baseFontSize)
    ? source.baseFontSize
    : legacyBase;
  return normalized;
}

export function createDefaultNativeComponentAppearance(): NativeComponentAppearance {
  return Object.fromEntries(NATIVE_COMPONENT_PARTS.map(part => [part, { visible: true }])) as NativeComponentAppearance;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

export function normalizeNativeComponentAppearance(value: unknown): NativeComponentAppearance {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const defaults = createDefaultNativeComponentAppearance();
  for (const part of NATIVE_COMPONENT_PARTS) {
    const item = source[part] && typeof source[part] === "object" ? source[part] as Record<string, unknown> : {};
    defaults[part] = {
      visible: typeof item.visible === "boolean" ? item.visible : true,
      color: typeof item.color === "string" ? item.color : undefined,
      background: typeof item.background === "string" ? item.background : undefined,
      fontFamily: typeof item.fontFamily === "string" ? item.fontFamily : undefined,
      fontSize: optionalNumber(item.fontSize),
      lineHeight: optionalNumber(item.lineHeight),
      paddingX: optionalNumber(item.paddingX ?? item.padding),
      paddingY: optionalNumber(item.paddingY ?? item.padding),
      marginX: optionalNumber(item.marginX),
      marginY: optionalNumber(item.marginY),
      gap: optionalNumber(item.gap),
      width: optionalNumber(item.width),
      height: optionalNumber(item.height),
      borderWidth: optionalNumber(item.borderWidth),
      borderColor: typeof item.borderColor === "string" ? item.borderColor : undefined,
      borderRadius: optionalNumber(item.borderRadius),
    };
  }
  return defaults;
}
