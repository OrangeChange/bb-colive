import { uiText } from "./i18n/index.ts";
import { MsgType } from "./protocol/types.ts";

export const EVENT_STYLE_ROLES = ["normal", "captain", "admiral", "viceroy", "admin", "anchor"] as const;
export type EventStyleRole = typeof EVENT_STYLE_ROLES[number];
export const DEFAULT_EVENT_STYLE_ROLE_PRIORITY: EventStyleRole[] = ["viceroy", "admiral", "captain", "anchor", "admin", "normal"];

export const EVENT_STYLE_TYPES = ["danmu", "interact", "gift", "redPocket", "lottery", "superChat", "guardCaptain", "guardAdmiral", "guardViceroy", "system"] as const;
export type EventStyleType = typeof EVENT_STYLE_TYPES[number];

export const EVENT_STYLE_TYPE_LABELS: Record<EventStyleType, string> = {
  danmu: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.danmu"),
  interact: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.interact"),
  gift: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.gift"),
  redPocket: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.redPocket"),
  lottery: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.lottery"),
  superChat: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.superChat"),
  guardCaptain: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.guardCaptain"),
  guardAdmiral: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.guardAdmiral"),
  guardViceroy: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.guardViceroy"),
  system: uiText("eventStyleSettings.EVENT_STYLE_TYPE_LABELS.system"),
};

export const EVENT_COLOR_PARTS = ["username", "content", "background", "stroke"] as const;
export type EventColorPart = typeof EVENT_COLOR_PARTS[number];

/** 字体名来自 Windows DirectWrite 的系统字体族集合，而不是项目内固定枚举。 */
export type EventFontFamily = string;
export const DEFAULT_EVENT_FONT_FAMILY: EventFontFamily = "MiSans";

export const NATIVE_DEFAULT_FONT_FAMILY_CSS = '"MiSans", "MiSans TC", "MiSans L3"';

const BUILTIN_FONT_FALLBACKS = [
  "MiSans",
  "MiSans TC",
  "MiSans L3",
  "Microsoft YaHei UI",
  "Microsoft YaHei",
] as const;

export function eventFontFamilyCss(fontFamily: EventFontFamily): string {
  const normalized = fontFamily.trim() || DEFAULT_EVENT_FONT_FAMILY;
  const families = [normalized, ...BUILTIN_FONT_FALLBACKS]
    .filter((family, index, all) => all.indexOf(family) === index);
  return `${families.map((family) => {
    const escaped = family.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }).join(", ")}, sans-serif`;
}

export type RgbaColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type HslaColor = {
  h: number;
  s: number;
  l: number;
  a: number;
};

/** null 表示沿用当前主题或当前事件的语义色；背景使用 alpha=0 表示透明。 */
export type ColorOverride = RgbaColor | null;

export type EventRoleStyle = {
  /** null 表示本身份使用自己的颜色；否则沿指定身份逐级继承。 */
  inheritFrom: EventStyleRole | null;
  username: ColorOverride;
  content: ColorOverride;
  background: ColorOverride;
  stroke: ColorOverride;
};

export type EventTypeStyle = {
  /** 事件类型只覆盖正文和背景，用户名仍由身份样式控制。 */
  content: ColorOverride;
  background: ColorOverride;
};

export type EventTextStrokeSettings = {
  enabled: boolean;
  width: number;
};

export type EventStyleSettings = {
  avatarSize: number;
  reviewAvatarSize: number;
  fontFamily: EventFontFamily;
  fontWeight: 400 | 500;
  textStroke: EventTextStrokeSettings;
  roles: Record<EventStyleRole, EventRoleStyle>;
  eventTypes: Record<EventStyleType, EventTypeStyle>;
  rolePriority: EventStyleRole[];
};

export const DEFAULT_AVATAR_SIZE = 24;
export const MIN_AVATAR_SIZE = 16;
export const MAX_AVATAR_SIZE = 40;

export const DEFAULT_TEXT_STROKE_WIDTH = 1;
export const MIN_TEXT_STROKE_WIDTH = 0.5;
export const MAX_TEXT_STROKE_WIDTH = 2;

const TRANSPARENT: RgbaColor = { r: 0, g: 0, b: 0, a: 0 };

function roleStyle(inheritFrom: EventStyleRole | null): EventRoleStyle {
  return {
    inheritFrom,
    username: null,
    content: null,
    background: { ...TRANSPARENT },
    stroke: { r: 0, g: 0, b: 0, a: 0.72 },
  };
}

export function createDefaultEventStyleSettings(): EventStyleSettings {
  return {
    avatarSize: DEFAULT_AVATAR_SIZE,
    reviewAvatarSize: DEFAULT_AVATAR_SIZE,
    fontFamily: DEFAULT_EVENT_FONT_FAMILY,
    fontWeight: 500,
    textStroke: { enabled: false, width: DEFAULT_TEXT_STROKE_WIDTH },
    rolePriority: [...DEFAULT_EVENT_STYLE_ROLE_PRIORITY],
    roles: {
      normal: roleStyle(null),
      captain: roleStyle(null),
      admiral: roleStyle(null),
      viceroy: roleStyle(null),
      admin: roleStyle(null),
      anchor: roleStyle(null),
    },
    eventTypes: Object.fromEntries(EVENT_STYLE_TYPES.map((type) => [type, { content: null, background: null }])) as Record<EventStyleType, EventTypeStyle>,
  };
}

export const DEFAULT_EVENT_STYLE_SETTINGS = createDefaultEventStyleSettings();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeRgba(value: unknown): RgbaColor | null {
  if (value === null) return null;
  if (typeof value !== "object" || value === null) return { ...TRANSPARENT };
  const input = value as Partial<RgbaColor>;
  return {
    r: Math.round(clamp(typeof input.r === "number" ? input.r : 0, 0, 255)),
    g: Math.round(clamp(typeof input.g === "number" ? input.g : 0, 0, 255)),
    b: Math.round(clamp(typeof input.b === "number" ? input.b : 0, 0, 255)),
    a: clamp(typeof input.a === "number" ? input.a : 0, 0, 1),
  };
}

function isEventStyleRole(value: unknown): value is EventStyleRole {
  return typeof value === "string" && (EVENT_STYLE_ROLES as readonly string[]).includes(value);
}

function clearLegacyAutomaticInheritance(
  value: unknown,
  automaticParent: EventStyleRole,
): unknown {
  if (typeof value !== "object" || value === null) return value;
  const input = value as Record<string, unknown>;
  const hasLegacyParent = input.inheritFrom === automaticParent || input.inherit === true;
  return hasLegacyParent ? { ...input, inheritFrom: null, inherit: false } : value;
}

function normalizeRoleStyle(
  value: unknown,
  fallback: EventRoleStyle,
  legacyInheritTarget: EventStyleRole | null = fallback.inheritFrom,
): EventRoleStyle {
  const input = typeof value === "object" && value !== null
    ? value as Partial<EventRoleStyle> & { inherit?: unknown }
    : {};
  const inheritFrom = input.inheritFrom !== undefined
    ? (input.inheritFrom === null || isEventStyleRole(input.inheritFrom) ? input.inheritFrom : fallback.inheritFrom)
    : typeof input.inherit === "boolean"
      ? (input.inherit ? legacyInheritTarget : null)
      : fallback.inheritFrom;
  return {
    inheritFrom,
    username: input.username === undefined ? fallback.username : normalizeRgba(input.username),
    content: input.content === undefined ? fallback.content : normalizeRgba(input.content),
    background: input.background === undefined ? fallback.background : normalizeRgba(input.background),
    stroke: input.stroke === undefined ? fallback.stroke : normalizeRgba(input.stroke),
  };
}

function normalizeEventTypeStyle(value: unknown, fallback: EventTypeStyle): EventTypeStyle {
  const input = typeof value === "object" && value !== null ? value as Partial<EventTypeStyle> : {};
  return {
    content: input.content === undefined ? fallback.content : normalizeRgba(input.content),
    background: input.background === undefined ? fallback.background : normalizeRgba(input.background),
  };
}

export function normalizeEventStyleSettings(value: unknown): EventStyleSettings {
  const input = typeof value === "object" && value !== null ? value as Partial<EventStyleSettings> : {};
  const defaults = createDefaultEventStyleSettings();
  const rolesInput = typeof input.roles === "object" && input.roles !== null
    ? input.roles as Record<string, unknown>
    : {};
  // 旧版本未保存 fontFamily/textStroke，且把默认继承链直接写入了持久化状态。
  // 新语义要求必须由用户点击才继承，因此只对这类旧状态清理自动链；新状态的显式选择不受影响。
  const legacyRolesInput = input.fontFamily === undefined && input.textStroke === undefined
    ? {
      ...rolesInput,
      captain: clearLegacyAutomaticInheritance(rolesInput.captain, "normal"),
      admiral: clearLegacyAutomaticInheritance(rolesInput.admiral, "captain"),
      viceroy: clearLegacyAutomaticInheritance(rolesInput.viceroy, "captain"),
      admin: clearLegacyAutomaticInheritance(rolesInput.admin, "normal"),
      anchor: clearLegacyAutomaticInheritance(rolesInput.anchor, "normal"),
    }
    : rolesInput;
  // 旧版本只有 guard 一个大航海角色：将它作为舰长样式的来源，避免用户已有的颜色丢失。
  const captainInput = legacyRolesInput.captain ?? legacyRolesInput.guard;
  const eventTypesInput = typeof input.eventTypes === "object" && input.eventTypes !== null
    ? input.eventTypes as Record<string, unknown>
    : {};
  // 旧版本只有 guard 一个大航海事件类型：将它作为舰长颜色的来源，避免用户已有的颜色丢失。
  const legacyGuardTypeInput = eventTypesInput.guard;
  const requestedPriority = Array.isArray(input.rolePriority) ? input.rolePriority.filter(isEventStyleRole) : [];
  const rolePriority = [...new Set([...requestedPriority, ...DEFAULT_EVENT_STYLE_ROLE_PRIORITY])];
  return {
    avatarSize: typeof input.avatarSize === "number"
      ? Math.round(clamp(input.avatarSize, MIN_AVATAR_SIZE, MAX_AVATAR_SIZE))
      : defaults.avatarSize,
    reviewAvatarSize: typeof input.reviewAvatarSize === "number"
      ? Math.round(clamp(input.reviewAvatarSize, MIN_AVATAR_SIZE, MAX_AVATAR_SIZE))
      : defaults.reviewAvatarSize,
    fontFamily: typeof input.fontFamily === "string" && input.fontFamily.trim().length > 0
      ? input.fontFamily.trim()
      : defaults.fontFamily,
    fontWeight: input.fontWeight === 500 ? 500 : defaults.fontWeight,
    textStroke: {
      enabled: typeof input.textStroke === "object" && input.textStroke !== null && (input.textStroke as EventTextStrokeSettings).enabled === true,
      width: typeof input.textStroke === "object" && input.textStroke !== null && typeof (input.textStroke as EventTextStrokeSettings).width === "number"
        ? Math.round(clamp((input.textStroke as EventTextStrokeSettings).width, MIN_TEXT_STROKE_WIDTH, MAX_TEXT_STROKE_WIDTH) * 2) / 2
        : defaults.textStroke.width,
    },
    rolePriority,
    roles: {
      normal: normalizeRoleStyle(legacyRolesInput.normal, defaults.roles.normal),
      captain: normalizeRoleStyle(captainInput, defaults.roles.captain, "normal"),
      admiral: normalizeRoleStyle(legacyRolesInput.admiral, defaults.roles.admiral, "captain"),
      viceroy: normalizeRoleStyle(legacyRolesInput.viceroy, defaults.roles.viceroy, "captain"),
      admin: normalizeRoleStyle(legacyRolesInput.admin, defaults.roles.admin, "normal"),
      anchor: normalizeRoleStyle(legacyRolesInput.anchor, defaults.roles.anchor, "normal"),
    },
    eventTypes: Object.fromEntries(EVENT_STYLE_TYPES.map((type) => [
      type,
      normalizeEventTypeStyle(
        eventTypesInput[type] ?? (type === "guardCaptain" ? legacyGuardTypeInput : undefined),
        defaults.eventTypes[type],
      ),
    ])) as Record<EventStyleType, EventTypeStyle>,
  };
}

/** 将协议消息映射成设置面板里的稳定事件类型。 */
export function getEventStyleType(msgType: MsgType, guardLevel?: number): EventStyleType {
  switch (msgType) {
    case MsgType.Danmu: return "danmu";
    case MsgType.Interact: return "interact";
    case MsgType.Gift: return "gift";
    case MsgType.SuperChat: return "superChat";
    case MsgType.GuardBuy:
    case MsgType.GuardHonor:
      return guardLevel === 3 ? "guardViceroy" : guardLevel === 2 ? "guardAdmiral" : "guardCaptain";
    case MsgType.AnchorLotStart:
    case MsgType.AnchorLotAward: return "lottery";
    case MsgType.RedPocketStart:
    case MsgType.RedPocketWinner: return "redPocket";
    default: return "system";
  }
}

export function resolveInheritedRoleStyle(settings: EventStyleSettings, role: EventStyleRole): EventRoleStyle {
  let current = role;
  const visited = new Set<EventStyleRole>();
  while (true) {
    const style = settings.roles[current];
    const parent = style.inheritFrom;
    if (!parent || parent === current || visited.has(current)) return style;
    visited.add(current);
    current = parent;
  }
}

export function rgbaToHsla(color: RgbaColor): HslaColor {
  const r = clamp(color.r, 0, 255) / 255;
  const g = clamp(color.g, 0, 255) / 255;
  const b = clamp(color.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));
    if (max === r) h = 60 * (((g - b) / delta) % 6);
    else if (max === g) h = 60 * ((b - r) / delta + 2);
    else h = 60 * ((r - g) / delta + 4);
    if (h < 0) h += 360;
  }

  return {
    h,
    s: s * 100,
    l: l * 100,
    a: clamp(color.a, 0, 1),
  };
}

export function hslaToRgba(color: HslaColor): RgbaColor {
  const h = ((color.h % 360) + 360) % 360;
  const s = clamp(color.s, 0, 100) / 100;
  const l = clamp(color.l, 0, 100) / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const x = chroma * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - chroma / 2;
  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) [r, g, b] = [chroma, x, 0];
  else if (h < 120) [r, g, b] = [x, chroma, 0];
  else if (h < 180) [r, g, b] = [0, chroma, x];
  else if (h < 240) [r, g, b] = [0, x, chroma];
  else if (h < 300) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
    a: clamp(color.a, 0, 1),
  };
}

export function rgbaToCss(color: RgbaColor): string {
  return `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${Number(color.a.toFixed(3))})`;
}

/** 将颜色的 RGB 通道转换为稳定的六位大写 HEX；透明度单独保存和编辑。 */
export function rgbaToHex(color: RgbaColor): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** 解析 #RGB/#RGBA/#RRGGBB/#RRGGBBAA，未携带透明度时使用传入的独立透明度。 */
export function hexToRgba(value: string, alpha = 1): RgbaColor | null {
  const normalized = value.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(normalized.length) || !/^[\da-f]+$/i.test(normalized)) return null;
  const expanded = normalized.length <= 4
    ? normalized.split("").map((digit) => `${digit}${digit}`).join("")
    : normalized;
  const hasEmbeddedAlpha = expanded.length === 8;
  const parsedAlpha = hasEmbeddedAlpha ? parseInt(expanded.slice(6, 8), 16) / 255 : alpha;
  return {
    r: parseInt(expanded.slice(0, 2), 16),
    g: parseInt(expanded.slice(2, 4), 16),
    b: parseInt(expanded.slice(4, 6), 16),
    a: clamp(Number.isFinite(parsedAlpha) ? parsedAlpha : 1, 0, 1),
  };
}
