import { useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type OverlayRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};
export function intersectOverlayRects(
  a: OverlayRect,
  b: OverlayRect,
): OverlayRect {
  const left = Math.max(a.left, b.left),
    top = Math.max(a.top, b.top);
  const right = Math.max(left, Math.min(a.right, b.right)),
    bottom = Math.max(top, Math.min(a.bottom, b.bottom));
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  };
}
export function eventOverlayBoundary(
  trigger: HTMLElement | null,
  area?: HTMLElement | null,
): { rect: OverlayRect; region: HTMLElement | null; elements: HTMLElement[] } {
  const viewport = {
    left: 0,
    top: 0,
    right: window.innerWidth,
    bottom: window.innerHeight,
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const region =
    area ??
    trigger?.closest<HTMLElement>("[data-event-overlay-region]") ??
    trigger?.closest<HTMLElement>(".event-area") ??
    null;
  const elements: HTMLElement[] = region ? [region] : [];
  let rect = region
    ? intersectOverlayRects(region.getBoundingClientRect(), viewport)
    : viewport;
  for (
    let parent = region?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent),
      box = parent.getBoundingClientRect();
    const clipX = /(auto|scroll|hidden|clip)/.test(style.overflowX),
      clipY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
    if (clipX || clipY) elements.push(parent);
    if (clipX || clipY)
      rect = intersectOverlayRects(rect, {
        left: clipX ? box.left : rect.left,
        right: clipX ? box.right : rect.right,
        top: clipY ? box.top : rect.top,
        bottom: clipY ? box.bottom : rect.bottom,
        width: box.width,
        height: box.height,
      });
  }
  return { rect, region, elements };
}
function visibleTrigger(
  trigger: HTMLElement | null,
  anchor: OverlayRect,
  boundary: OverlayRect,
): boolean {
  if (trigger && !trigger.isConnected) return false;
  let visible = intersectOverlayRects(anchor, boundary);
  for (
    let parent = trigger?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    const style = getComputedStyle(parent),
      box = parent.getBoundingClientRect();
    const clipX = /(auto|scroll|hidden|clip)/.test(style.overflowX),
      clipY = /(auto|scroll|hidden|clip)/.test(style.overflowY);
    if (clipX || clipY)
      visible = intersectOverlayRects(visible, {
        left: clipX ? box.left : visible.left,
        right: clipX ? box.right : visible.right,
        top: clipY ? box.top : visible.top,
        bottom: clipY ? box.bottom : visible.bottom,
        width: box.width,
        height: box.height,
      });
  }
  return visible.width > 0 && visible.height > 0;
}
export function placeEventOverlay(
  anchor: OverlayRect,
  width: number,
  height: number,
  bounds: OverlayRect,
  point?: { left: number; top: number },
) {
  const minLeft = bounds.left + 8,
    minTop = bounds.top + 8;
  const maxWidth = Math.max(1, bounds.width - 16),
    maxHeight = Math.max(1, bounds.height - 16);
  const w = Math.min(width, maxWidth),
    h = Math.min(height, maxHeight);
  const below = point?.top ?? anchor.bottom + 8,
    above = anchor.top - h - 8;
  const preferredTop =
    below + h <= bounds.bottom - 8 ? below : above >= minTop ? above : below;
  return {
    left: Math.max(
      minLeft,
      Math.min(point?.left ?? anchor.right - w, bounds.right - 8 - w),
    ),
    top: Math.max(minTop, Math.min(preferredTop, bounds.bottom - 8 - h)),
    maxWidth,
    maxHeight,
  };
}

/** 浮层打开期间跟踪实际布局，包含虚拟列表位移与工作台宽度变化。 */
export function useEventOverlayGeometry(
  open: boolean,
  trigger: RefObject<HTMLElement | null>,
  options: {
    area?: RefObject<HTMLElement | null>;
    getAnchorRect?: () => OverlayRect | null;
    onDetach: () => void;
  },
) {
  const latest = useRef(options);
  latest.current = options;
  const [geometry, setGeometry] = useState<{
    anchor: OverlayRect;
    boundary: OverlayRect;
    region: HTMLElement | null;
    elements: HTMLElement[];
  } | null>(null);
  useLayoutEffect(() => {
    if (!open) {
      setGeometry(null);
      return;
    }
    let frame = 0,
      previous = "";
    const update = () => {
      const node = trigger.current;
      const raw = latest.current.getAnchorRect
        ? latest.current.getAnchorRect()
        : node?.getBoundingClientRect();
      const {
        rect: boundary,
        region,
        elements,
      } = eventOverlayBoundary(node, latest.current.area?.current);
      if (!raw || !visibleTrigger(node, raw, boundary)) {
        latest.current.onDetach();
        return;
      }
      const anchor = {
        left: raw.left,
        top: raw.top,
        right: raw.right,
        bottom: raw.bottom,
        width: raw.width,
        height: raw.height,
      };
      const key = [...Object.values(anchor), ...Object.values(boundary)].join(
        ",",
      );
      if (key !== previous) {
        previous = key;
        setGeometry({ anchor, boundary, region, elements });
      }
      frame = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(frame);
  }, [open, trigger]);
  return geometry;
}
