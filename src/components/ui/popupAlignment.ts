export function popupAlignment(trigger: HTMLElement | null): "start" | "end" {
  if (!trigger) return "start";
  const rect = trigger.getBoundingClientRect();
  const owner = trigger.closest(
    '.settings-panel-frame, .native-property-panel, .voice-panel-frame, .theme-obs-detail, .native-scope-strip, .style-preview-toolbar, [role="dialog"], main',
  );
  const bounds = owner?.getBoundingClientRect() ?? {
    left: 0,
    width: window.innerWidth,
  };
  return rect.left + rect.width / 2 > bounds.left + bounds.width / 2
    ? "end"
    : "start";
}
