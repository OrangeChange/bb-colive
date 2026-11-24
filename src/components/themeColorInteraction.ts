export function createThemeColorDragInteraction(options: {
  preview: (value: string) => void;
  commit: (value: string) => void;
  requestFrame?: (callback: FrameRequestCallback) => number;
  cancelFrame?: (handle: number) => void;
}) {
  const requestFrame = options.requestFrame ?? ((callback: FrameRequestCallback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle: number) => window.cancelAnimationFrame(handle));
  let frame: number | undefined;
  let latest: string | undefined;

  const cancel = () => {
    if (frame !== undefined) cancelFrame(frame);
    frame = undefined;
    latest = undefined;
  };

  return {
    move(value: string) {
      latest = value;
      if (frame !== undefined) return;
      frame = requestFrame(() => {
        frame = undefined;
        if (latest !== undefined) options.preview(latest);
      });
    },
    end(value = latest) {
      cancel();
      if (value !== undefined) options.commit(value);
      latest = undefined;
    },
    cancel,
  };
}
