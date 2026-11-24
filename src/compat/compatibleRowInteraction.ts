export interface CompatibleRowBounds { eventId: string; left: number; top: number; width: number; height: number; actionsRightInset?: number }

/** Same-origin hosts expose row geometry without changing source markup. */
export function compatibleRowBounds(frame: HTMLIFrameElement, row: HTMLElement): CompatibleRowBounds | null {
  if (!row.isConnected || row.hasAttribute('data-compatible-fallback-id')) return null;
  const eventId = row.dataset.compatibleEventId ?? row.dataset.eventId;
  if (!eventId) return null;
  const rect = row.getBoundingClientRect(), host = frame.getBoundingClientRect();
  const scale = frame.clientWidth ? host.width / frame.clientWidth : 1;
  const viewport = frame.contentWindow;
  const top = Math.max(0, rect.top), bottom = Math.min(viewport?.innerHeight ?? rect.bottom, rect.bottom);
  if (bottom <= top || rect.width <= 0) return null;
  const giftIcon = row.matches('.event--gift') ? [...row.querySelectorAll<HTMLElement>('.gift-icon-wrap')].map(icon => icon.getBoundingClientRect()).find(box => box.width > 0 && box.left >= rect.left + rect.width / 2) : undefined;
  return { eventId, left: host.left + Math.max(0, rect.left) * scale, top: host.top + top * scale, width: Math.min(rect.width, (viewport?.innerWidth ?? rect.right) - Math.max(0, rect.left)) * scale, height: (bottom - top) * scale,
    ...(giftIcon ? { actionsRightInset: Math.max(0, rect.right - giftIcon.left) * scale } : {}) };
}

export function observeCompatibleRows(frame: HTMLIFrameElement, publish: (row: CompatibleRowBounds | null) => void): () => void {
  const doc = frame.contentDocument, view = frame.ownerDocument.defaultView;
  if (!doc || !view) return () => {};
  let active: HTMLElement | null = null, pointer: { x: number; y: number } | null = null, animation = 0, previous = '';
  const emit = (value: CompatibleRowBounds | null) => { const key = JSON.stringify(value); if (key !== previous) { previous = key; publish(value); } };
  const refresh = () => {
    animation = 0;
    if (pointer && doc.elementFromPoint) {
      active = doc.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('[data-compatible-event-id],[data-event-id]') ?? null;
      if (active?.hasAttribute('data-compatible-fallback-id')) active = null;
    }
    const bounds = active ? compatibleRowBounds(frame, active) : null;
    emit(bounds);
    if (pointer) animation = view.requestAnimationFrame(refresh); else active = null;
  };
  const move = (event: Event) => {
    const position = event as PointerEvent; pointer = { x: position.clientX, y: position.clientY };
    const target = event.target as Element | null;
    active = target?.closest<HTMLElement>('[data-compatible-event-id],[data-event-id]') ?? null;
    if (active?.hasAttribute('data-compatible-fallback-id')) active = null;
    if (animation) view.cancelAnimationFrame(animation);
    refresh();
  };
  const leave = (event: Event) => {
    if (!pointer) return;
    const host = frame.getBoundingClientRect(), position = event as PointerEvent;
    if (position.clientX < host.left || position.clientX > host.right || position.clientY < host.top || position.clientY > host.bottom) { pointer = null; active = null; refresh(); }
  };
  const clear = () => { pointer = null; active = null; emit(null); };
  doc.addEventListener('pointermove', move);
  frame.ownerDocument.addEventListener('pointermove', leave);
  frame.ownerDocument.documentElement.addEventListener('pointerleave', clear);
  return () => { if (animation) view.cancelAnimationFrame(animation); doc.removeEventListener('pointermove', move); frame.ownerDocument.removeEventListener('pointermove', leave); frame.ownerDocument.documentElement.removeEventListener('pointerleave', clear); };
}
