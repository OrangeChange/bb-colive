import { EVENT_STYLE_ROLES, EVENT_STYLE_TYPES, NATIVE_DEFAULT_FONT_FAMILY_CSS, eventFontFamilyCss, type EventStyleSettings } from "./eventStyleSettings.ts";
import { resolveEventRowStyle } from "./eventRowStyles.ts";
import type { DanmakuUser } from "./protocol/types";
import { FAN_MEDAL_PALETTES, UNLIT_FAN_MEDAL_PALETTE } from "./components/fanMedal.ts";

export type EventAreaStyleInput = {
  settings: EventStyleSettings;
  layout: "live" | "review" | "default" | "window";
  fontSize: number;
  padding: number;
  spacing: number;
};

export function createEventAreaConfigCss(scope: string, input: EventAreaStyleInput): string {
  const { settings, layout, fontSize, padding, spacing } = input;
  const selector = `[data-event-style-scope="${scope}"]`;
  const live = layout === "live" || layout === "window";
  const reference = live ? 16 : 14;
  const common = `${selector}{--event-font-size:${fontSize}px;--native-base-size:${fontSize}px;--event-config-avatar-scale:${(live ? settings.avatarSize : settings.reviewAvatarSize) / reference};--event-config-padding-scale:${padding / reference};--event-config-spacing-scale:${spacing / reference};--event-font-family:${live && settings.fontFamily === "MiSans" ? NATIVE_DEFAULT_FONT_FAMILY_CSS : eventFontFamilyCss(settings.fontFamily)};--event-font-weight:${live ? settings.fontWeight : 400};--event-stroke-scale:${settings.textStroke.enabled ? settings.textStroke.width / reference : 0};}`;
  const sticky = `${selector}.sticky-area{--event-config-spacing-scale:0.25;}`;
  const identityColors: Record<string,string> = {captain:"--name-captain",admiral:"--name-admiral",viceroy:"--name-governor",anchor:"--name-anchor",admin:"--name-admin"};
  const rules = EVENT_STYLE_ROLES.flatMap(role => {
    const user: DanmakuUser = { uid: "", uname: "", guardLevel: role === "captain" ? 1 : role === "admiral" ? 2 : role === "viceroy" ? 3 : 0, isAnchor: role === "anchor", isAdmin: role === "admin" };
    return EVENT_STYLE_TYPES.map(type => {
      const resolved = resolveEventRowStyle(settings, user, type);
      const background = resolved.backgroundColor ?? "initial";
      return `${selector} .event[data-event-role="${role}"][data-event-style-type="${type}"]{--resolved-username-color:${resolved.usernameColor ?? (identityColors[role] ? `var(${identityColors[role]})` : "initial")};--resolved-message-color:${resolved.contentColor ?? "initial"};--event-config-background:${background};--resolved-stroke-color:${resolved.strokeColor ?? "transparent"};}`;
    });
  });
  const medals = [...FAN_MEDAL_PALETTES.map((item, index) => ({ key: index, palette: item.palette })), { key: "unlit", palette: UNLIT_FAN_MEDAL_PALETTE }].map(({ key, palette }) => `${selector} [data-event-medal-palette="${key}"]{--medal-gradient:linear-gradient(90deg, ${palette.backgroundStart}, ${palette.backgroundEnd});--medal-text:${palette.text};}`);
  return `@layer config {\n${common}\n${sticky}\n${rules.join("\n")}\n${medals.join("\n")}\n}`;
}
