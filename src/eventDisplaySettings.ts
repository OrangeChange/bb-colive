import { uiText } from "./i18n/index.ts";
import { MsgType, type DanmakuEvent, type EmoticonInfo, type FanMedalInfo } from "./protocol/types.ts";

export const DEFAULT_EVENT_SPACING = 6;
export const MIN_EVENT_SPACING = 0;
export const MAX_EVENT_SPACING = 16;

export const DEFAULT_EVENT_PADDING = 8;
export const MIN_EVENT_PADDING = 0;
export const MAX_EVENT_PADDING = 16;

export type EventAnimationPreset = "none" | "fade" | "lift" | "scale" | "slide";
export type HonorLevelDisplayMode = "icon" | "text";
export type GuardIdentityDisplayMode = "icon" | "text";
export type RoleIdentityDisplayMode = "icon" | "text";

export const EVENT_ANIMATION_PRESET_OPTIONS: readonly { value: EventAnimationPreset; label: string }[] = [
  { value: "none", label: uiText("eventDisplaySettings.EVENT_ANIMATION_PRESET_OPTIONS.label") },
  { value: "fade", label: uiText("eventDisplaySettings.EVENT_ANIMATION_PRESET_OPTIONS.label2") },
  { value: "lift", label: uiText("eventDisplaySettings.EVENT_ANIMATION_PRESET_OPTIONS.label3") },
  { value: "scale", label: uiText("eventDisplaySettings.EVENT_ANIMATION_PRESET_OPTIONS.label4") },
  { value: "slide", label: uiText("eventDisplaySettings.EVENT_ANIMATION_PRESET_OPTIONS.label5") },
];

export const DEFAULT_EVENT_ANIMATION_PRESET: EventAnimationPreset = "fade";

export const DEFAULT_EVENT_ANIMATION_DURATION_MS = 200;
/** 仅用于数字输入框的上下箭头步进；手动输入不受此步进约束。 */
export const EVENT_ANIMATION_DURATION_STEP_MS = 50;

/** 动画时长不设上限，但负数没有有效的 CSS 动画语义，因此归零。 */
export function normalizeEventAnimationDuration(duration: number): number {
  if (!Number.isFinite(duration)) return DEFAULT_EVENT_ANIMATION_DURATION_MS;
  return Math.max(0, duration);
}

export function getEventAnimationDuration(
  preset: EventAnimationPreset,
  duration = DEFAULT_EVENT_ANIMATION_DURATION_MS,
): number {
  return preset === "none" ? 0 : normalizeEventAnimationDuration(duration);
}

export function getEventAnimationExitDuration(
  preset: EventAnimationPreset,
  duration = DEFAULT_EVENT_ANIMATION_DURATION_MS,
): number {
  return getEventAnimationDuration(preset, duration);
}

/** 事件视觉偏好：主现场、弹幕窗和礼物窗共享的渲染开关。 */
export type EventDisplayPreferences = {
  showAutoDanmaku: boolean;
  showPhoneNotVerified: boolean;
  /** 事件行之间的外部间距；不改变事件行内部留白。 */
  eventSpacing: number;
  /** 事件行四边的内部留白；与外部间距分开控制。 */
  eventPadding: number;
  /** 事件进入列表及定时移除时使用成对的过渡效果。 */
  eventAnimationPreset: EventAnimationPreset;
  /** 事件进入和退出动画的持续时间；不设上限。 */
  eventAnimationDurationMs: number;
  showAvatar: boolean;
  showAvatarFrame: boolean;
  showGuardIdentity: boolean;
  /** 大航海身份标记优先显示原始图标，缺图时显示身份文字。 */
  guardIdentityDisplayMode: GuardIdentityDisplayMode;
  showAdminIdentity: boolean;
  showAnchorIdentity: boolean;
  adminIdentityDisplayMode: RoleIdentityDisplayMode;
  anchorIdentityDisplayMode: RoleIdentityDisplayMode;
  showFanMedal: boolean;
  showHonorLevel: boolean;
  /** 用户当前贡献榜名次；显示为 B 站风格的“榜 N”徽标。 */
  showCurrentRank: boolean;
  /** 荣耀等级以本地徽章图标或 LvN 文字呈现；缺少旧配置时默认使用图标。 */
  honorLevelDisplayMode: HonorLevelDisplayMode;
  onlyAnchorFanMedal: boolean;
  hideUnlitFanMedal: boolean;
  showGiftImage: boolean;
  showEventIcon: boolean;
  /** 仅保留大航海用户的普通进房事件；关注、点赞等其他互动不受影响。 */
  onlyGuardEntry: boolean;
};

export const DEFAULT_EVENT_DISPLAY_PREFERENCES: EventDisplayPreferences = {
  showAutoDanmaku: true,
  showPhoneNotVerified: false,
  eventSpacing: DEFAULT_EVENT_SPACING,
  eventPadding: DEFAULT_EVENT_PADDING,
  eventAnimationPreset: DEFAULT_EVENT_ANIMATION_PRESET,
  eventAnimationDurationMs: DEFAULT_EVENT_ANIMATION_DURATION_MS,
  showAvatar: true,
  showAvatarFrame: true,
  showGuardIdentity: true,
  guardIdentityDisplayMode: "icon",
  showAdminIdentity: true,
  showAnchorIdentity: true,
  adminIdentityDisplayMode: "icon",
  anchorIdentityDisplayMode: "icon",
  showFanMedal: true,
  showHonorLevel: false,
  showCurrentRank: false,
  honorLevelDisplayMode: "icon",
  onlyAnchorFanMedal: false,
  hideUnlitFanMedal: false,
  showGiftImage: true,
  showEventIcon: true,
  onlyGuardEntry: false,
};

export const DEFAULT_EVENT_FONT_SIZE = 16;
export const MIN_EVENT_FONT_SIZE = 14;
export const MAX_EVENT_FONT_SIZE = 24;

export function clampEventFontSize(size: number): number {
  return Math.min(MAX_EVENT_FONT_SIZE, Math.max(MIN_EVENT_FONT_SIZE, size));
}

export function clampEventSpacing(spacing: number): number {
  if (!Number.isFinite(spacing)) return DEFAULT_EVENT_SPACING;
  return Math.min(MAX_EVENT_SPACING, Math.max(MIN_EVENT_SPACING, spacing));
}

export function clampEventPadding(padding: number): number {
  if (!Number.isFinite(padding)) return DEFAULT_EVENT_PADDING;
  return Math.min(MAX_EVENT_PADDING, Math.max(MIN_EVENT_PADDING, padding));
}

function isEventAnimationPreset(value: unknown): value is EventAnimationPreset {
  return typeof value === "string" && EVENT_ANIMATION_PRESET_OPTIONS.some((item) => item.value === value);
}

export function normalizeEventDisplayPreferences(value: unknown): EventDisplayPreferences {
  const input = typeof value === "object" && value !== null ? value as Partial<EventDisplayPreferences> : {};
  return {
    showAutoDanmaku: typeof input.showAutoDanmaku === "boolean" ? input.showAutoDanmaku : true,
    showPhoneNotVerified: typeof input.showPhoneNotVerified === "boolean" ? input.showPhoneNotVerified : false,
    eventSpacing: typeof input.eventSpacing === "number" ? clampEventSpacing(input.eventSpacing) : DEFAULT_EVENT_SPACING,
    eventPadding: typeof input.eventPadding === "number" ? clampEventPadding(input.eventPadding) : DEFAULT_EVENT_PADDING,
    eventAnimationPreset: isEventAnimationPreset(input.eventAnimationPreset)
      ? input.eventAnimationPreset
      : DEFAULT_EVENT_ANIMATION_PRESET,
    eventAnimationDurationMs: typeof input.eventAnimationDurationMs === "number"
      ? normalizeEventAnimationDuration(input.eventAnimationDurationMs)
      : DEFAULT_EVENT_ANIMATION_DURATION_MS,
    showAvatar: typeof input.showAvatar === "boolean" ? input.showAvatar : DEFAULT_EVENT_DISPLAY_PREFERENCES.showAvatar,
    showAvatarFrame: typeof input.showAvatarFrame === "boolean" ? input.showAvatarFrame : DEFAULT_EVENT_DISPLAY_PREFERENCES.showAvatarFrame,
    showGuardIdentity: typeof input.showGuardIdentity === "boolean" ? input.showGuardIdentity : DEFAULT_EVENT_DISPLAY_PREFERENCES.showGuardIdentity,
    guardIdentityDisplayMode: input.guardIdentityDisplayMode === "text" ? "text" : "icon",
    adminIdentityDisplayMode: input.adminIdentityDisplayMode === "text" ? "text" : "icon",
    anchorIdentityDisplayMode: input.anchorIdentityDisplayMode === "text" ? "text" : "icon",
    showAdminIdentity: typeof input.showAdminIdentity === "boolean" ? input.showAdminIdentity : DEFAULT_EVENT_DISPLAY_PREFERENCES.showAdminIdentity,
    showAnchorIdentity: typeof input.showAnchorIdentity === "boolean" ? input.showAnchorIdentity : DEFAULT_EVENT_DISPLAY_PREFERENCES.showAnchorIdentity,
    showFanMedal: typeof input.showFanMedal === "boolean" ? input.showFanMedal : DEFAULT_EVENT_DISPLAY_PREFERENCES.showFanMedal,
    showHonorLevel: typeof input.showHonorLevel === "boolean" ? input.showHonorLevel : DEFAULT_EVENT_DISPLAY_PREFERENCES.showHonorLevel,
    showCurrentRank: typeof input.showCurrentRank === "boolean" ? input.showCurrentRank : DEFAULT_EVENT_DISPLAY_PREFERENCES.showCurrentRank,
    honorLevelDisplayMode: input.honorLevelDisplayMode === "text" ? "text" : "icon",
    onlyAnchorFanMedal: typeof input.onlyAnchorFanMedal === "boolean" ? input.onlyAnchorFanMedal : DEFAULT_EVENT_DISPLAY_PREFERENCES.onlyAnchorFanMedal,
    hideUnlitFanMedal: typeof input.hideUnlitFanMedal === "boolean" ? input.hideUnlitFanMedal : DEFAULT_EVENT_DISPLAY_PREFERENCES.hideUnlitFanMedal,
    showEventIcon: typeof input.showEventIcon === "boolean" ? input.showEventIcon : DEFAULT_EVENT_DISPLAY_PREFERENCES.showEventIcon,
    showGiftImage: typeof input.showGiftImage === "boolean" ? input.showGiftImage : DEFAULT_EVENT_DISPLAY_PREFERENCES.showGiftImage,
    onlyGuardEntry: typeof input.onlyGuardEntry === "boolean" ? input.onlyGuardEntry : DEFAULT_EVENT_DISPLAY_PREFERENCES.onlyGuardEntry,
  };
}

/** 缺少原始标记的旧弹幕保持可见，不按口令内容推断。 */
export function shouldShowAutoDanmaku(event: DanmakuEvent, showAutoDanmaku: boolean): boolean {
  return showAutoDanmaku || event.msgType !== MsgType.Danmu || event.isAutoDanmaku !== true;
}

/** 仅过滤明确未验证的弹幕，其他事件与未知状态不受影响。 */
export function shouldShowPhoneNotVerified(event: DanmakuEvent, showPhoneNotVerified: boolean): boolean {
  return showPhoneNotVerified || event.msgType !== MsgType.Danmu || event.user?.phoneVerified !== false;
}

/** 大表情是独立的事件内容；缺少该字段的普通事件始终保留。 */
export function shouldShowBigEmote(emoticon: EmoticonInfo | undefined, showBigEmote: boolean): boolean {
  return showBigEmote || !emoticon;
}

/**
 * 判断粉丝牌是否允许进入事件行。
 * 没有 isLighted 时保持显示，因为缺少字段不等于未点亮。
 */
export function shouldShowFanMedal(
  medal: FanMedalInfo | undefined,
  preferences: Pick<EventDisplayPreferences, "showFanMedal" | "onlyAnchorFanMedal" | "hideUnlitFanMedal">,
): boolean {
  if (!medal?.name || !preferences.showFanMedal) return false;
  if (preferences.onlyAnchorFanMedal && medal.isCurrentRoom !== true) return false;
  if (preferences.hideUnlitFanMedal && medal.isLighted === false) return false;
  return true;
}

/** 合并主题外观与软件共享的显示行为。 */
export function resolveEventDisplayPreferences<T extends EventDisplayPreferences>(theme: T, software: EventDisplayPreferences): T {
  return {
    ...theme,
    showAutoDanmaku: software.showAutoDanmaku,
    showPhoneNotVerified: software.showPhoneNotVerified,
    onlyGuardEntry: software.onlyGuardEntry,
    eventAnimationPreset: software.eventAnimationPreset,
    eventAnimationDurationMs: software.eventAnimationDurationMs,
  };
}
