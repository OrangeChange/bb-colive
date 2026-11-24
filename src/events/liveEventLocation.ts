interface LiveEventLocationOptions {
  getIndex: () => number;
  scrollToIndex: (index: number) => void;
  getPosition: () => { target: number; current: number } | null;
  scrollToOffset: (offset: number) => void;
  requestFrame: (callback: () => void) => number;
  cancelFrame: (frame: number) => void;
  onLocated: () => void;
  onMissing?: () => void;
}

/** 使用当前投影和实测位置定位，连续三帧稳定后交还滚动控制。 */
export function locateLiveEvent(options: LiveEventLocationOptions): () => void {
  let frame: number | null = null;
  let cancelled = false;
  let positioned = false;
  let stableFrames = 0;
  let previousTarget: number | null = null;
  const tick = () => {
    frame = null;
    if (cancelled) return;
    const index = options.getIndex();
    if (index < 0) {
      options.onMissing?.();
      return;
    }
    const position = positioned ? options.getPosition() : null;
    if (!position) {
      options.scrollToIndex(index);
      positioned = true;
      stableFrames = 0;
    } else {
      const aligned = Math.abs(position.target - position.current) <= 0.5;
      stableFrames = aligned && previousTarget !== null && Math.abs(position.target - previousTarget) <= 0.5
        ? stableFrames + 1 : 0;
      previousTarget = position.target;
      if (!aligned) options.scrollToOffset(position.target);
      if (stableFrames >= 3) {
        options.onLocated();
        return;
      }
    }
    frame = options.requestFrame(tick);
  };
  frame = options.requestFrame(tick);
  return () => {
    cancelled = true;
    if (frame !== null) options.cancelFrame(frame);
  };
}
