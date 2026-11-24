export interface LaplaceStableRootEvent { id: string; originIdx: number }

function bindArea(root: ParentNode, selector: string, events: readonly LaplaceStableRootEvent[]): void {
  const area = root.querySelector(selector);
  if (!area) return;
  for (const event of events) {
    const nodes = area.querySelectorAll<HTMLElement>(`.event.origin-index--${event.originIdx}`);
    const existing = [...nodes].find(node => node.dataset.eventId === event.id);
    if (existing) continue;
    const unbound = [...nodes].find(node => !node.dataset.eventId);
    if (unbound) unbound.dataset.eventId = event.id;
  }
}

/** Bind only newly created source roots. FLIP/leaving roots keep their original identity. */
export function bindLaplaceStableEventRoots(root: ParentNode, events: readonly LaplaceStableRootEvent[], stickyEvents: readonly LaplaceStableRootEvent[]): void {
  bindArea(root, ".event-list", events);
  bindArea(root, ".gift-sticky-bar", stickyEvents);
}
