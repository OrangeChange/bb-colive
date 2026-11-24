import type { CompatibleThemeRenderer } from "../../themes/themeModeAdapters.ts";
import type { ThemeDocument } from "../../themes/themeTypes.ts";
let active: CompatibleThemeRenderer | undefined;
let activeCssComposer: ((document: ThemeDocument) => string) | undefined;
export function installLaplaceThemeRenderer(value: CompatibleThemeRenderer) { active = value; return () => { if (active === value) active = undefined; }; }
export function installLaplaceThemeCssComposer(value: (document: ThemeDocument) => string) { activeCssComposer = value; return () => { if (activeCssComposer === value) activeCssComposer = undefined; }; }
export function composeRegisteredLaplaceThemeCss(document: ThemeDocument): string {
  if (!activeCssComposer) throw new Error("LAPLACE 样式组合器尚未注册");
  return activeCssComposer(document);
}
function renderer() { if (!active) throw new Error("LAPLACE 渲染器尚未注册"); return active; }
export const laplaceThemeRenderer: CompatibleThemeRenderer = { publish: (...args) => renderer().publish(...args), remove: (...args) => renderer().remove(...args), updateScale: (...args) => renderer().updateScale(...args) };
