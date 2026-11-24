import type { DanmakuUser } from "./protocol/types";
import {
  getEventStyleType,
  rgbaToCss,
  resolveInheritedRoleStyle,
  type EventStyleRole,
  type EventStyleSettings,
  type EventStyleType,
} from "./eventStyleSettings.ts";
export { getEventStyleType } from "./eventStyleSettings.ts";
import type { MsgType } from "./protocol/types";

/** 按主题设定的身份优先级选择唯一公共身份。 */
export function getEventStyleRole(user?: Pick<DanmakuUser, "isAnchor" | "isAdmin" | "guardLevel">, priority: EventStyleRole[] = ["viceroy", "admiral", "captain", "anchor", "admin", "normal"]): EventStyleRole {
  const roles = new Set<EventStyleRole>(["normal"]);
  if (user?.isAnchor) roles.add("anchor");
  if (user?.isAdmin) roles.add("admin");
  if (user?.guardLevel === 1) roles.add("captain");
  if (user?.guardLevel === 2) roles.add("admiral");
  if (user?.guardLevel === 3) roles.add("viceroy");
  return priority.find(role => roles.has(role)) ?? "normal";
}

export type ResolvedEventRowStyle = {
  role: EventStyleRole;
  usernameColor: string | null;
  contentColor: string | null;
  backgroundColor: string | null;
  strokeColor: string | null;
  hasBackground: boolean;
};

/** 将设置中的单个角色颜色解析为事件行可直接使用的 CSS 颜色。 */
export function resolveEventRowStyle(
  settings: EventStyleSettings,
  user?: DanmakuUser,
  msgType?: MsgType | EventStyleType,
): ResolvedEventRowStyle {
  const role = getEventStyleRole(user, settings.rolePriority);
  const style = resolveInheritedRoleStyle(settings, role);
  const eventTypeStyle = msgType === undefined ? undefined : settings.eventTypes[typeof msgType === "number" ? getEventStyleType(msgType, user?.guardLevel) : msgType];
  const background = eventTypeStyle?.background ?? style.background;
  const backgroundColor = background && background.a > 0
    ? rgbaToCss(background)
    : eventTypeStyle?.background?.a === 0 ? "transparent" : null;
  const strokeColor = style.stroke ? rgbaToCss(style.stroke) : null;
  return {
    role,
    usernameColor: style.username ? rgbaToCss(style.username) : null,
    contentColor: (eventTypeStyle?.content ?? style.content) ? rgbaToCss(eventTypeStyle?.content ?? style.content!) : null,
    backgroundColor,
    strokeColor,
    hasBackground: backgroundColor !== null,
  };
}
