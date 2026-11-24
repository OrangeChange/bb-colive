import type { CompatibleThemeRenderer } from "../../themes/themeModeAdapters.ts";

let activeRenderer: CompatibleThemeRenderer | undefined;
export function installOpenLiveThemeRenderer(renderer: CompatibleThemeRenderer): () => void {
  activeRenderer = renderer;
  return () => { if (activeRenderer === renderer) activeRenderer = undefined; };
}
function renderer(): CompatibleThemeRenderer {
  if (!activeRenderer) throw new Error("BLC 开放版渲染器尚未注册");
  return activeRenderer;
}
export const openLiveThemeRenderer: CompatibleThemeRenderer = {
  publish: (...args) => renderer().publish(...args),
  remove: (...args) => renderer().remove(...args),
  updateScale: (...args) => renderer().updateScale(...args),
};
