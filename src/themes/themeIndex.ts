import type { ThemeDocument, ThemeSummary } from "./themeTypes.ts";
import { THEME_MODE_VALUES, toThemeSummary } from "./themeTypes.ts";
import { BUILTIN_THEME_CATALOG } from "./builtinThemeCatalog.ts";

const officialOrder = ["native-default", "native-card", "native-bubble", "blivechat-default", "blivechat-open-default", "laplace-default", ...BUILTIN_THEME_CATALOG.map(entry=>entry.id)];
export function compareThemes(left: Pick<ThemeSummary,"themeId"|"mode"|"origin"|"name">, right: Pick<ThemeSummary,"themeId"|"mode"|"origin"|"name">): number {
  const mode = THEME_MODE_VALUES.indexOf(left.mode)-THEME_MODE_VALUES.indexOf(right.mode);
  if(mode)return mode;
  const rank=(item:typeof left)=>item.origin==='builtin'?(officialOrder.indexOf(item.themeId)<0?officialOrder.length:officialOrder.indexOf(item.themeId)):officialOrder.length+1;
  return rank(left)-rank(right)||left.name.localeCompare(right.name,"zh-CN");
}
export function mergeThemeIndex(builtins: ThemeDocument[], custom: ThemeSummary[]): ThemeSummary[] {
  return [...builtins.map(toThemeSummary),...custom].filter(item=>item.origin!=="builtin"||item.themeId!=="blivechat-open-yt").sort(compareThemes);
}
