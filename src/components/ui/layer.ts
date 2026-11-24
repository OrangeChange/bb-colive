function hasUiOverlayMarker(value: unknown): boolean {
  if (!value || (typeof value !== "object" && typeof value !== "function")) return false;
  const candidate = value as {
    hasAttribute?: (name: string) => boolean;
    closest?: (selector: string) => unknown;
  };
  if (typeof candidate.hasAttribute === "function" && candidate.hasAttribute("data-ui-overlay")) return true;
  return typeof candidate.closest === "function" && Boolean(candidate.closest("[data-ui-overlay]"));
}

export function isUiOverlayPointerEvent(event: PointerEvent): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  if (path.some(hasUiOverlayMarker)) return true;
  return hasUiOverlayMarker(event.target);
}

export function bindUiDismissableLayer(
  surface: HTMLElement,
  onClose: () => void,
  options: { trigger?: HTMLElement | null; canClose?: () => boolean; modal?: boolean } = {},
): () => void {
  const previousFocus = options.trigger ?? document.activeElement as HTMLElement | null;
  const childEscapeEvents = new WeakSet<KeyboardEvent>();
  const childOpen = () => Boolean(document.querySelector('.ui-select-content[data-state="open"], [data-ui-overlay][data-state="open"]'));
  const canClose = () => options.canClose?.() ?? true;
  const captureKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && childOpen()) childEscapeEvents.add(event);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing || childEscapeEvents.has(event)) return;
    if (event.key === "Escape" && canClose()) {
      event.preventDefault();
      onClose();
    }
    if (event.key !== "Tab" || !options.modal || childOpen()) return;
    const controls = Array.from(surface.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); surface.focus(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === surface)) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === surface)) {
      event.preventDefault(); first.focus();
    }
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!canClose() || childOpen() || isUiOverlayPointerEvent(event)) return;
    if (surface.contains(event.target as Node) || options.trigger?.contains(event.target as Node)) return;
    onClose();
  };
  surface.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')?.focus({ preventScroll: true });
  document.addEventListener("keydown", captureKey, true);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onPointerDown, true);
  return () => {
    document.removeEventListener("keydown", captureKey, true);
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onPointerDown, true);
    previousFocus?.focus({ preventScroll: true });
  };
}
