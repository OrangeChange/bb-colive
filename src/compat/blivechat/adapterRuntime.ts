import type { CompatibleThemeRenderer } from "../../themes/themeModeAdapters.ts";

let activeRenderer: CompatibleThemeRenderer | undefined;

export function installBlivechatThemeRenderer(renderer: CompatibleThemeRenderer): () => void {
  activeRenderer = renderer;
  return () => {
    if (activeRenderer === renderer) activeRenderer = undefined;
  };
}

function renderer(): CompatibleThemeRenderer {
  if (!activeRenderer) throw new Error("BLC 原版渲染器尚未注册");
  return activeRenderer;
}

export const blivechatThemeRenderer: CompatibleThemeRenderer = {
  publish: (...args) => renderer().publish(...args),
  remove: (...args) => renderer().remove(...args),
  updateScale: (...args) => renderer().updateScale(...args),
};
