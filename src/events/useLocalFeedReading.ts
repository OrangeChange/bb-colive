import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { getLatestScrollTop, getRetainedFeedWindowStart, type LiveScrollDirection } from "./feedScroll.ts";

export function useRetainedFeedWindow<T>(events: readonly T[], start: number, size: number, following: RefObject<boolean>, setStart: (start: number) => void, idOf: (event: T) => string, viewKey: string) {
  const previous = useRef<{ events: readonly T[]; ids: string[]; start: number; viewKey: string } | null>(null);
  const prior = previous.current;
  const retainedStart = prior && prior.events !== events && prior.start === start && prior.viewKey === viewKey && !following.current
    ? getRetainedFeedWindowStart(prior.ids, events.map(idOf), size) ?? start
    : start;
  useLayoutEffect(() => {
    previous.current = { events, ids: events.slice(retainedStart, retainedStart + size).map(idOf), start: retainedStart, viewKey };
    if (retainedStart !== start) setStart(retainedStart);
  }, [events, retainedStart, start, size, setStart, idOf, viewKey]);
  return retainedStart;
}

export function useCompatibleFeedNode(container: HTMLElement | null, enabled: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!container || !enabled) { setNode(null); return; }
    let doc: Document | null = null;
    let inner: MutationObserver | undefined;
    const locate = () => {
      const next = container.querySelector("iframe")?.contentDocument ?? null;
      if (next !== doc) {
        inner?.disconnect();
        doc = next;
        if (doc) {
          inner = new MutationObserver(locate);
          inner.observe(doc, { childList: true, subtree: true });
        }
      }
      const scroller = doc?.querySelector<HTMLElement>("#item-scroller,.scroll-area") ?? null;
      setNode(scroller);
    };
    const outer = new MutationObserver(locate);
    outer.observe(container, { childList: true, subtree: true });
    container.addEventListener("load", locate, true);
    locate();
    return () => { outer.disconnect(); inner?.disconnect(); container.removeEventListener("load", locate, true); };
  }, [container, enabled]);
  return node;
}

export type LocalFeedReadingState = { direction: LiveScrollDirection; resetKey?: string | number; following: boolean; anchorId?: string; offset: number; previousIds: string[]; scrollTop: number };

export function useLocalFeedReading(node: HTMLElement | null, direction: LiveScrollDirection, enabled = true, resetKey?: string | number, retainedIds?: readonly string[], shared?: RefObject<LocalFeedReadingState | null>) {
  const retained = useRef<ReadonlySet<string> | undefined>(undefined);
  const localSaved = useRef<LocalFeedReadingState | null>(null);
  const saved = shared ?? localSaved;
  retained.current = retainedIds ? new Set(retainedIds) : undefined;
  useLayoutEffect(() => {
    if (!node || !enabled) return;
    const prior = saved.current?.resetKey === resetKey ? saved.current : null;
    let following = prior?.following ?? true;
    let anchorId = prior?.anchorId;
    let offset = prior?.offset ?? 0;
    let previousIds = prior?.previousIds ?? [];
    let scheduled = 0;
    let user = false;
    let userTimer = 0;
    const save = () => { saved.current = { direction, resetKey, following, anchorId, offset, previousIds, scrollTop: node.scrollTop }; };
    const observedRows = new Set<HTMLElement>();
    const rows = () => [...node.querySelectorAll<HTMLElement>("[data-event-id],[data-compatible-event-id]")];
    const idOf = (row: HTMLElement) => row.dataset.compatibleEventId ?? row.dataset.eventId;
    const capture = () => {
      const anchor = rows().find(row => row.getBoundingClientRect().bottom > node.getBoundingClientRect().top);
      if (anchor) {
        anchorId = idOf(anchor);
        offset = anchor.getBoundingClientRect().top - node.getBoundingClientRect().top;
      }
    };
    const restore = () => {
      scheduled = 0;
      const currentRows = rows();
      const currentSet = new Set(currentRows);
      for (const row of observedRows) if (!currentSet.has(row)) {
        resize.unobserve(row);
        observedRows.delete(row);
      }
      for (const row of currentRows) if (!observedRows.has(row)) {
        observedRows.add(row);
        resize.observe(row);
      }
      const byId = new Map(currentRows.map(row => [idOf(row), row]));
      if (following) node.scrollTop = getLatestScrollTop(direction, node.scrollHeight, node.clientHeight);
      else if (anchorId) {
        if (!previousIds.length && currentRows.length && !byId.has(anchorId) && !retained.current?.has(anchorId)) {
          const replacement = direction === "top" ? currentRows[currentRows.length - 1] : currentRows[0];
          anchorId = idOf(replacement) ?? anchorId;
          offset = direction === "top" ? Math.max(0, node.clientHeight - replacement.getBoundingClientRect().height) : 0;
          node.scrollTop += replacement.getBoundingClientRect().top - node.getBoundingClientRect().top - offset;
        }
        const index = previousIds.indexOf(anchorId);
        const existing = byId.get(anchorId);
        const temporarilyMissing = !existing && retained.current?.has(anchorId);
        const anchor = existing ?? (temporarilyMissing || index < 0 ? undefined :
          previousIds.slice(index + 1).map(id => byId.get(id)).find(Boolean)
          ?? previousIds.slice(0, index).reverse().map(id => byId.get(id)).find(Boolean));
        if (anchor) {
          node.scrollTop += anchor.getBoundingClientRect().top - node.getBoundingClientRect().top - offset;
          if (!existing) {
            anchorId = idOf(anchor);
            offset = anchor.getBoundingClientRect().top - node.getBoundingClientRect().top;
          }
        }
        if (temporarilyMissing) return;
      }
      previousIds = currentRows.map(idOf).filter((id): id is string => id !== undefined);
      if (following || !anchorId) capture();
      save();
    };
    const schedule = () => { if (!scheduled) scheduled = requestAnimationFrame(restore); };
    const mark = () => { user = true; clearTimeout(userTimer); userTimer = window.setTimeout(() => { user = false; }, 500); };
    const scroll = () => {
      if (!user) {
        if (!following) schedule();
        return;
      }
      following = Math.abs(node.scrollTop - getLatestScrollTop(direction, node.scrollHeight, node.clientHeight)) <= 4;
      capture();
      save();
    };
    const end = () => { user = false; };
    const wheel = (event: WheelEvent) => {
      mark();
      if (node.scrollHeight > node.clientHeight + 1 && (direction === "top" ? event.deltaY > 0 : event.deltaY < 0)) following = false;
      else if ((direction === "top" ? event.deltaY < 0 : event.deltaY > 0) && Math.abs(node.scrollTop - getLatestScrollTop(direction, node.scrollHeight, node.clientHeight)) <= 4) {
        following = true;
        capture();
        save();
        user = false;
        clearTimeout(userTimer);
      }
    };
    node.addEventListener("wheel", wheel, { passive: true });
    node.addEventListener("pointerdown", mark);
    const keyboard = (event: KeyboardEvent) => {
      if (!node.contains(node.ownerDocument.activeElement)) return;
      mark();
      if (event.key === (direction === "top" ? "Home" : "End")) following = true;
    };
    node.ownerDocument.addEventListener("keydown", keyboard, true);
    node.addEventListener("scroll", scroll);
    node.addEventListener("scrollend", end);
    const mutations = new MutationObserver(schedule);
    mutations.observe(node, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["style", "data-event-id", "data-compatible-event-id"] });
    const resize = new ResizeObserver(schedule);
    resize.observe(node);
    restore();
    return () => {
      if (!node.isConnected) previousIds = [];
      save();
      cancelAnimationFrame(scheduled); clearTimeout(userTimer); mutations.disconnect(); resize.disconnect();
      node.removeEventListener("wheel", wheel); node.removeEventListener("pointerdown", mark);
      node.ownerDocument.removeEventListener("keydown", keyboard, true); node.removeEventListener("scroll", scroll); node.removeEventListener("scrollend", end);
    };
  }, [node, direction, enabled, resetKey]);
}
