import { clampRightWorkbenchWidth, RIGHT_WORKBENCH_DEFAULT_WIDTH } from "./rightWorkbenchState.ts";

/** 工作台展开后仍需保留的最低现场宽度；不是主窗口的默认宽度。 */
export const RIGHT_WORKBENCH_MIN_SCENE_WIDTH = 872;
export type WindowGeometry = { x: number; y: number; width: number; height: number };
/** 原生窗口收起使用减速曲线；终点采用目标值，避免累计取整误差。 */
export function workbenchResizeFrame(from: WindowGeometry, to: WindowGeometry, progress: number): WindowGeometry {
  const t = 1 - Math.pow(1 - Math.max(0, Math.min(1, progress)), 3);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}
/** 只保存在当前 WebView 会话中，组件热更新/重挂载不会丢失。 */
export type WorkbenchWindowState = {
  expanded: boolean;
  baseline: WindowGeometry | null;
  adjusted: WindowGeometry | null;
  width: number;
};
const WINDOW_STATE_KEY = "right-workbench-window";
const defaultWorkbenchWindowState = (): WorkbenchWindowState => ({ expanded: false, baseline: null, adjusted: null, width: RIGHT_WORKBENCH_DEFAULT_WIDTH });
export function loadWorkbenchWindowState(storage: Pick<Storage, "getItem"> = sessionStorage): WorkbenchWindowState {
  const saved = storage.getItem(WINDOW_STATE_KEY);
  if (!saved) return defaultWorkbenchWindowState();
  const parsed = JSON.parse(saved) as Partial<WorkbenchWindowState>;
  return {
    expanded: Boolean(parsed.expanded),
    baseline: parsed.baseline ?? null,
    adjusted: parsed.adjusted ?? null,
    width: clampRightWorkbenchWidth(typeof parsed.width === "number" ? parsed.width : RIGHT_WORKBENCH_DEFAULT_WIDTH),
  };
}
export function saveWorkbenchWindowState(state: WorkbenchWindowState, storage: Pick<Storage, "setItem"> = sessionStorage): void {
  storage.setItem(WINDOW_STATE_KEY, JSON.stringify(state));
}
/** 主窗口恢复布局时，同时清掉工作台快照并恢复功能区默认宽度。 */
export function resetWorkbenchWindowState(_state: WorkbenchWindowState): WorkbenchWindowState {
  return {
    expanded: false,
    baseline: null,
    adjusted: null,
    width: RIGHT_WORKBENCH_DEFAULT_WIDTH,
  };
}
export function workbenchCloseTarget(state: WorkbenchWindowState, current: WindowGeometry): WindowGeometry | null {
  return state.baseline && state.adjusted && sameWindowGeometry(current, state.adjusted) ? state.baseline : null;
}
/**
 * 关闭工作台时，即使最大化/还原让当前几何偏离 adjusted，也恢复本次展开前的主窗口几何。
 * 该兜底只用于关闭路径；展开路径仍需使用 workbenchCloseTarget 判断是否已经完成扩宽。
 */
export function workbenchCloseFallbackTarget(state: WorkbenchWindowState): WindowGeometry | null {
  return state.baseline && state.adjusted ? state.baseline : null;
}
export function sameWindowGeometry(a: WindowGeometry, b: WindowGeometry): boolean {
  return (["x", "y", "width", "height"] as const).every(key => Math.abs(a[key] - b[key]) <= 1);
}
/** 使用 Tauri 原生逻辑像素轮询窗口几何，避免 CSS 视口和缩放比例造成误判。 */
export async function waitForWindowGeometry(
  read: () => Promise<WindowGeometry>,
  target: WindowGeometry,
  wait: () => Promise<void>,
  timeoutMs = 1000,
): Promise<boolean> {
  let current = await read();
  const deadline = performance.now() + timeoutMs;
  while (!sameWindowGeometry(current, target) && performance.now() < deadline) {
    await wait();
    current = await read();
  }
  return sameWindowGeometry(current, target);
}
/**
 * 收起状态下原生窗口仍保留着上一次的扩宽结果时，展开只复用当前几何。
 * 这会覆盖旧版本留下的“已收起但 adjusted 丢失”的状态，避免重复追加面板宽度。
 */
export function shouldReuseWorkbenchGeometry(
  state: WorkbenchWindowState,
  current: WindowGeometry,
  sceneWidth: number,
  minSceneWidth: number,
): boolean {
  return !state.expanded
    && !state.adjusted
    && Boolean(state.baseline)
    && sameWindowGeometry(state.baseline!, current)
    && sceneWidth >= minSceneWidth;
}
/** 窗口几何为逻辑像素，现场和面板尺寸为 CSS 像素；sceneWidth 在展开前测量。 */
export function planWorkbenchWindowResize(input: {
  maximized: boolean; windowWidth: number; windowX: number;
  sceneWidth: number; minSceneWidth: number; panelDelta: number;
  workX: number; workWidth: number; frameWidth: number;
  contentScale?: number;
}): { width: number; x: number } {
  const { maximized, windowWidth, windowX, sceneWidth, minSceneWidth,
    panelDelta, workX, workWidth, frameWidth } = input;
  const contentScale = input.contentScale ?? 1;
  if (maximized || sceneWidth - panelDelta >= minSceneWidth)
    return { width: windowWidth, x: windowX };
  const width = Math.max(windowWidth, Math.min(windowWidth + panelDelta * contentScale, workWidth - frameWidth));
  const x = Math.max(workX, Math.min(windowX, workX + workWidth - width - frameWidth));
  return { width, x };
}
