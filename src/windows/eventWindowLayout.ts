import type { EventWindowKind } from './eventWindowChannels';

/** 弹幕窗默认逻辑尺寸。 */
export const EVENT_WINDOW_DEFAULT_SIZE = {
  width: 360,
  height: 360,
} as const;

/** 默认布局在工作区右侧和顶部保留的逻辑像素边距。 */
export const EVENT_WINDOW_DEFAULT_MARGIN = 10;

const REVENUE_WINDOW_GAP = 8;

/** 原生创建与恢复几何共用的逻辑像素下限。 */
export function getEventWindowMinSize(kind: EventWindowKind): { width: number; height: number } {
  if (kind === 'display' || kind === 'gift') return { width: 320, height: 320 };
  return { width: 240, height: kind === 'guard' ? 120 : 160 };
}

export type MonitorWorkArea = {
  /** Monitor API 返回的物理像素坐标和尺寸。 */
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor?: number;
};

export type WindowPlacement = {
  width: number;
  height: number;
  x: number;
  y: number;
  center: false;
};

export type DefaultWindowPairPlacement = {
  display: WindowPlacement;
  gift: WindowPlacement;
};

export type PersistedWindowGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  /** 礼物窗只有用户手动移动或缩放后才会变为自定义布局。 */
  custom?: boolean;
};

/** 所有窗口恢复有效的已保存几何；默认排放仅用于首次创建与显式恢复布局。 */
export function shouldRestoreWindowGeometry(
  _kind: "display" | "gift" | "gift-only" | "superchat" | "guard",
  geometry: PersistedWindowGeometry | null,
): boolean {
  return geometry !== null;
}

/** 收益子窗在当前工作区内一次排放，之后独立移动和缩放。 */
export function createRevenueWindowLayout(workArea: MonitorWorkArea | null, displayGeometry?: PersistedWindowGeometry | null): Record<'gift' | 'superchat' | 'guard', WindowPlacement> {
  const factor = Number.isFinite(workArea?.scaleFactor) && (workArea?.scaleFactor ?? 0) > 0 ? workArea!.scaleFactor! : 1;
  const area = workArea ? { x: workArea.x/factor, y: workArea.y/factor, width: workArea.width/factor, height: workArea.height/factor }
    : { x: 0, y: 0, width: 1920, height: 1080 };
  const margin = EVENT_WINDOW_DEFAULT_MARGIN;
  const kinds = ['gift', 'superchat', 'guard'] as const;
  const defaults = [240, 200, 160];
  const minimums = kinds.map(kind => getEventWindowMinSize(kind === 'gift' ? 'gift-only' : kind).height);
  const availableHeight = Math.floor(area.height - margin * 2 - REVENUE_WINDOW_GAP * 2);
  const minimumHeight = minimums.reduce((sum, height) => sum + height, 0);
  const extraHeight = Math.max(0, Math.min(160, availableHeight - minimumHeight));
  const heights = minimums.map((height, index) => height + Math.floor((defaults[index] - height) * extraHeight / 160));
  let width = Math.max(240, Math.min(300, Math.floor(area.width - margin * 2 - EVENT_WINDOW_DEFAULT_SIZE.width - REVENUE_WINDOW_GAP)));
  const display = displayGeometry
    ? { x: displayGeometry.x/factor, width: displayGeometry.width/factor }
    : { x: area.x + area.width - margin - EVENT_WINDOW_DEFAULT_SIZE.width, width: EVENT_WINDOW_DEFAULT_SIZE.width };
  const leftSpace = Math.floor(display.x - REVENUE_WINDOW_GAP - area.x - margin);
  const rightSpace = Math.floor(area.x + area.width - margin - display.x - display.width - REVENUE_WINDOW_GAP);
  if (leftSpace >= 240) width = Math.min(width,leftSpace);
  else if (rightSpace >= 240) width = Math.min(width,rightSpace);
  const left = display.x - REVENUE_WINDOW_GAP - width;
  const right = display.x + display.width + REVENUE_WINDOW_GAP;
  const x = Math.round(left >= area.x + margin ? Math.min(left, area.x + area.width - margin - width)
    : right + width <= area.x + area.width - margin ? Math.max(right, area.x + margin) : area.x + margin);
  let y = Math.round(area.y + margin);
  const placement = (index: number): WindowPlacement => {
    const windowY = Math.max(Math.round(area.y + margin), Math.min(y, Math.floor(area.y + area.height - margin - heights[index])));
    const result = { width, height: heights[index], x, y: windowY, center: false as const };
    y += heights[index] + REVENUE_WINDOW_GAP;
    return result;
  };
  return { gift: placement(0), superchat: placement(1), guard: placement(2) };
}

/**
 * 以显示器的物理工作区为基准，一次性生成 Tauri 创建窗口所需的逻辑坐标。
 *
 * 两个窗口使用固定尺寸，不读取另一个窗口的实例状态、保存位置或当前尺寸。
 * 默认锚点是工作区右上角，右侧和顶部保留 10 个逻辑像素。两个窗口始终上下贴合且绝不重叠。
 */
export function createDefaultWindowPair(workArea: MonitorWorkArea | null): DefaultWindowPairPlacement {
  const { width, height } = EVENT_WINDOW_DEFAULT_SIZE;
  if (!workArea) {
    return {
      display: { width, height, x: 0, y: 0, center: false },
      gift: { width, height, x: 0, y: height, center: false },
    };
  }

  const scaleFactor = Number.isFinite(workArea.scaleFactor) && (workArea.scaleFactor ?? 0) > 0
    ? workArea.scaleFactor!
    : 1;
  const logicalX = workArea.x / scaleFactor;
  const logicalY = workArea.y / scaleFactor;
  const logicalWidth = workArea.width / scaleFactor;
  const x = Math.round(logicalX + Math.max(0, logicalWidth - width - EVENT_WINDOW_DEFAULT_MARGIN));
  const displayY = Math.round(logicalY + EVENT_WINDOW_DEFAULT_MARGIN);
  const giftY = displayY + height;

  return {
    display: {
      width,
      height,
      x,
      y: displayY,
      center: false,
    },
    gift: {
      width,
      height,
      x,
      y: giftY,
      center: false,
    },
  };
}

/** Tauri 的运行时 PhysicalPosition/PhysicalSize 接口使用物理像素。 */
export function toPhysicalWindowPlacement(
  placement: WindowPlacement,
  scaleFactor = 1,
): WindowPlacement {
  const factor = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  return {
    ...placement,
    x: Math.round(placement.x * factor),
    y: Math.round(placement.y * factor),
    width: Math.round(placement.width * factor),
    height: Math.round(placement.height * factor),
  };
}

export type WindowResizeDirection =
  | "East"
  | "North"
  | "NorthEast"
  | "NorthWest"
  | "South"
  | "SouthEast"
  | "SouthWest"
  | "West";
