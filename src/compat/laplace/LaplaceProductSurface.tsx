import { flowGeometry } from "./renderer/flowGeometry";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { laplaceRoomGuardContext } from "./roomGuardContext.ts";
import type { RoomGuardProfile, DanmakuEvent } from "../../protocol/types.ts";
import type { CompatibleListSurfaceDescriptor } from "../CompatibleEventRenderer.tsx";
import type { CompatibleLiveAction } from "../compatibleLiveBridge.ts";
import { stableCompatibleEventId } from "../compatibleLiveBridge.ts";
import { mountBlivechatFallbackRoot, readBlivechatFallbackPresentation, type BlivechatFallbackStyle } from "../blivechat/blivechatFallbackSurface.ts";
import type { BlivechatSourceAnimation, BlivechatSourceControl, BlivechatScrollState, BlivechatStickyItem } from "../blivechat/BlivechatSourceSurface.tsx";
import { RendererHost, type LaplaceRendererControl } from "./RendererHost.tsx";
import type { LaplaceCssSources } from "./styles.ts";
import type { LaplaceSettings } from "./settings.ts";
import type { LaplaceEvent } from "./types.ts";
import { useRetainedFeedWindow } from "../../events/useLocalFeedReading.ts";
import { isFollowingLatest } from "../../events/feedScroll.ts";
export { bindLaplaceStableEventRoots } from "./renderer/stableRoots.ts";

const EMPTY_STICKY_ITEMS: readonly BlivechatStickyItem[] = [];
const EMPTY_REMOVING_EVENT_IDS: ReadonlySet<string> = new Set();
const DEFAULT_PRODUCT_ELEMENTS = { classicScope: false };
const renderEvent = () => "render" as const;

export interface LaplaceProductSurfaceProps {
  roomGuardProfile?: RoomGuardProfile; descriptor: CompatibleListSurfaceDescriptor; events: readonly DanmakuEvent[];
  viewKey?: string;
  eventDecision?: (event: DanmakuEvent) => "render" | "omit" | "fallback";
  dispatch?: (eventId: string, action: CompatibleLiveAction) => boolean;
  scale?: number; tickerEnabled?: boolean; stickyItems?: readonly BlivechatStickyItem[];
  contentAlignment?: "top" | "bottom";
  direction?: "top" | "bottom"; fallbackRenderer?: (event: DanmakuEvent) => ReactNode;
  tickerPosition?: "top" | "bottom"; rate?: number; renderMode?: "dashboard" | "obs";
  enableBilibiliVideoLinks?: boolean; onPointerDown?: () => void;
  fallbackStyle?: BlivechatFallbackStyle;
  onScrollState?: (state: BlivechatScrollState) => void;
  onContextMenu?: (request: { eventId: string; x: number; y: number }) => void;
  initialScrollState?: Pick<BlivechatScrollState, "followingLatest" | "scrollTop"> & Partial<Pick<BlivechatScrollState, "anchorId" | "anchorOffset">>;
  animation?: BlivechatSourceAnimation; removingEventIds?: ReadonlySet<string>;
}

export function advanceLaplaceProductWindow(options: { start: number; end: number; total: number; direction: "forward" | "backward"; size?: number }): number {
  const size = Math.max(20, Math.floor(options.size ?? 80));
  const step = Math.max(1, Math.floor(size / 2));
  return options.direction === "forward" ? Math.min(Math.max(0, options.total - size), options.start + step) : Math.max(0, options.start - step);
}

export function isLaplaceGlobalLatest(options: { direction: "top" | "bottom"; start: number; end: number; total: number; sourceFollowing: boolean }): boolean {
  return options.sourceFollowing && (options.direction === "top" ? options.start === 0 : options.end === options.total);
}

export function planLaplaceProductWindow<T extends { id: string; reactKey?: string }>(events: readonly T[], options: { direction: "top" | "bottom"; followingLatest: boolean; targetId?: string; start?: number; size?: number }) {
  const size = Math.max(20, Math.floor(options.size ?? 80));
  if (events.length <= size) return { events: [...events], start: 0, end: events.length };
  const targetIndex = options.targetId ? events.findIndex(event => (event.reactKey ?? event.id) === options.targetId) : -1;
  let start = targetIndex >= 0 ? Math.max(0, Math.min(events.length - size, targetIndex - Math.floor(size / 2)))
    : Number.isFinite(options.start) ? Math.max(0, Math.min(events.length - size, Math.floor(options.start!)))
      : options.direction === "top" ? 0 : events.length - size;
  if (options.followingLatest) start = options.direction === "top" ? 0 : events.length - size;
  return { events: events.slice(start, start + size), start, end: start + size };
}

/** The source iframe owns the single list root, sticky bar, FLIP, ScrollArea and style lifecycle. */
export const LaplaceProductSurface = forwardRef<BlivechatSourceControl, LaplaceProductSurfaceProps>(function LaplaceProductSurface({
  descriptor, events, roomGuardProfile, viewKey = "", eventDecision = descriptor.eventDecision ?? renderEvent, dispatch, scale = 1,
  tickerEnabled = true, stickyItems = EMPTY_STICKY_ITEMS, direction = "bottom", contentAlignment = "top", tickerPosition = "top", rate = 0, renderMode = "obs", enableBilibiliVideoLinks = false,
  fallbackRenderer, fallbackStyle, onScrollState, onContextMenu, onPointerDown, initialScrollState, animation, removingEventIds = EMPTY_REMOVING_EVENT_IDS,
}, ref) {
  const dashboardLiveGuards = useMemo(() => laplaceRoomGuardContext(roomGuardProfile, events[0]?.roomId), [roomGuardProfile, events[0]?.roomId]);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const frameControl = useRef<LaplaceRendererControl>(null);
  const [frameState, setFrameState] = useState<{ document: Document | null; revision: number }>({ document: null, revision: 0 });
  const pendingLocate = useRef<string | undefined>(undefined);
  const pendingLatest = useRef(false);
  const pendingRestore = useRef<{ eventId?: string; scrollTop?: number; anchorOffset?: number; followingLatest?: boolean } | undefined>(initialScrollState ? { eventId: initialScrollState.anchorId, scrollTop: initialScrollState.scrollTop, anchorOffset: initialScrollState.anchorOffset, followingLatest: initialScrollState.followingLatest } : undefined);
  const originIndexes = useRef(new Map<string, number>());
  const nextOriginIndex = useRef(1);
  const originIndex = (event: DanmakuEvent) => { const id = stableCompatibleEventId(event); const existing = originIndexes.current.get(id); if (existing !== undefined) return existing; const next = nextOriginIndex.current++; originIndexes.current.set(id, next); return next; };
  const visibleFacts = useMemo(() => events.filter(event => eventDecision(event) !== "omit"), [events, eventDecision]);
  const [followingLatest, setFollowingLatest] = useState(initialScrollState?.followingLatest ?? true);
  const followingRef = useRef(initialScrollState?.followingLatest ?? true);
  const [windowStart, setWindowStart] = useState(() => planLaplaceProductWindow(visibleFacts, { direction, followingLatest: initialScrollState?.followingLatest ?? true, targetId: initialScrollState?.anchorId }).start);
  const retainedStart = useRetainedFeedWindow(visibleFacts, windowStart, 80, followingRef, setWindowStart, stableCompatibleEventId, `${viewKey}:${direction}`);
  const eventWindow = useMemo(() => planLaplaceProductWindow(visibleFacts, { direction, followingLatest, start: retainedStart }), [visibleFacts, direction, followingLatest, retainedStart]);
  const sourceRows = useMemo(() => eventWindow.events.flatMap((event, index) => {
    if (eventDecision(event) !== "render") return [];
    const projected = descriptor.project(event, eventWindow.start + index + 1) as LaplaceEvent | null;
    return projected ? [{ ...projected, id: stableCompatibleEventId(event), originIdx: originIndex(event) }] : [];
  }), [eventWindow, eventDecision, descriptor]);
  const renderedRows = useRef<typeof sourceRows | null>(null);
  const stickyRows = useMemo(() => tickerEnabled ? stickyItems.flatMap((item, index) => {
    if (eventDecision(item.event) !== "render") return [];
    const projected = descriptor.project(item.event, index + 1) as LaplaceEvent | null;
    return projected ? [{ ...projected, id: stableCompatibleEventId(item.event), originIdx: originIndex(item.event) }] : [];
  }) : [], [stickyItems, tickerEnabled, eventDecision, descriptor]);
  const fallbackRows = useMemo(() => eventWindow.events.filter(event => eventDecision(event) === "fallback"), [eventWindow.events, eventDecision]);
  const sourceIds = useMemo(() => new Set(sourceRows.map(event => event.id)), [sourceRows]);
  useEffect(() => {
    const doc = frameState.document;
    if (!doc) return;
    let keyboardScrollPending = false;
    const onKeyDown = (event: KeyboardEvent) => {
      const viewport = doc.querySelector<HTMLElement>(".scroll-area");
      if (viewport && event.target && viewport.contains(event.target as Node)
        && ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(event.key)) keyboardScrollPending = true;
      if (event.key !== (direction === "top" ? "Home" : "End")) return;
      event.preventDefault();
      event.stopPropagation();
      keyboardScrollPending = false;
      followingRef.current = true;
      pendingLatest.current = true;
      pendingRestore.current = undefined;
      pendingLocate.current = undefined;
      setFollowingLatest(true);
      setWindowStart(direction === "top" ? 0 : Math.max(0, visibleFacts.length - 80));
      frameControl.current?.scrollToLatest();
    };
    const onScrollEnd = (event: Event) => {
      if (!keyboardScrollPending) return;
      keyboardScrollPending = false;
      const viewport = event.target;
      if (!(viewport instanceof doc.defaultView!.HTMLElement) || !viewport.matches(".scroll-area")) return;
      const reachesLatestWindow = direction === "top" ? eventWindow.start === 0 : eventWindow.end === visibleFacts.length;
      if (!reachesLatestWindow || !isFollowingLatest(direction, flowGeometry(viewport).position, flowGeometry(viewport).extent, flowGeometry(viewport).viewport)) return;
      followingRef.current = true;
      pendingLatest.current = true;
      pendingRestore.current = undefined;
      pendingLocate.current = undefined;
      setFollowingLatest(true);
      frameControl.current?.scrollToLatest();
    };
    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("scrollend", onScrollEnd, true);
    return () => { doc.removeEventListener("keydown", onKeyDown, true); doc.removeEventListener("scrollend", onScrollEnd, true); };
  }, [frameState.document, direction, eventWindow.start, eventWindow.end, visibleFacts.length]);
  const layout = useMemo<Array<{ kind: "source" | "fallback"; eventId: string }>>(() => eventWindow.events.reduce<Array<{ kind: "source" | "fallback"; eventId: string }>>((items, event) => {
    const eventId = stableCompatibleEventId(event);
    if (eventDecision(event) === "fallback" && fallbackRenderer) items.push({ kind: "fallback", eventId });
    else if (sourceIds.has(eventId)) items.push({ kind: "source", eventId });
    return items;
  }, []), [eventWindow.events, eventDecision, fallbackRenderer, sourceIds]);
  useImperativeHandle(ref, () => ({
    restoreScroll(state) {
      followingRef.current = state.followingLatest;
      pendingLatest.current = false;
      pendingLocate.current = undefined;
      const next = planLaplaceProductWindow(visibleFacts, { direction, followingLatest: state.followingLatest, targetId: state.anchorId });
      const restore = { eventId: state.anchorId, scrollTop: state.scrollTop, anchorOffset: state.anchorOffset, followingLatest: state.followingLatest };
      pendingRestore.current = restore;
      setFollowingLatest(state.followingLatest);
      if (next.start !== eventWindow.start) setWindowStart(next.start);
      else if (renderedRows.current === sourceRows) {
        frameControl.current?.restoreScroll(restore);
        pendingRestore.current = undefined;
      }
    },
    scrollToLatest() {
      followingRef.current = true;
      pendingLatest.current = true; pendingRestore.current = undefined; pendingLocate.current = undefined;
      setFollowingLatest(true); setWindowStart(direction === "top" ? 0 : Math.max(0, visibleFacts.length - 80));
      frameControl.current?.scrollToLatest();
    },
    locate(eventId: string) {
      followingRef.current = false;
      pendingLatest.current = false; pendingRestore.current = undefined;
      const index = visibleFacts.findIndex(event => stableCompatibleEventId(event) === eventId);
      if (index >= 0 && !eventWindow.events.some(event => stableCompatibleEventId(event) === eventId)) {
        setFollowingLatest(false); setWindowStart(Math.max(0, Math.min(Math.max(0, visibleFacts.length - 80), index - 40)));
        pendingLocate.current = eventId;
      } else if (index >= 0) {
        if (followingLatest) setWindowStart(direction === "top" ? 0 : Math.max(0, visibleFacts.length - 80));
        setFollowingLatest(false);
        pendingLocate.current = eventId;
        if (renderedRows.current === sourceRows) { frameControl.current?.locate(eventId); pendingLocate.current = undefined; }
      }
    },
  }), [direction, visibleFacts, eventWindow.events]);
  const css = useMemo(() => descriptor.cssSources ?? { cloud: "", remote: "", custom: descriptor.css }, [descriptor.cssSources, descriptor.css]);
  const recalledIds = useMemo(() => eventWindow.events.filter(event => event.danmuDeleted).map(stableCompatibleEventId), [eventWindow.events]);
  const removingIds = useMemo(() => [...removingEventIds], [removingEventIds]);
  const fallbackPresentation=fallbackRenderer&&fallbackRows.length&&surfaceRef.current?readBlivechatFallbackPresentation(document,surfaceRef.current):undefined;
  const fallbackPortals = fallbackRenderer && frameState.document && surfaceRef.current ? fallbackRows.flatMap(event => {
    const eventId = stableCompatibleEventId(event);
    const slot = [...frameState.document!.querySelectorAll<HTMLElement>("[data-compatible-fallback-id]")].find(element => element.dataset.compatibleFallbackId === eventId);
    return slot ? [createPortal(<div className="theme-surface" data-event-style-scope={fallbackStyle?.scope}>{fallbackRenderer(event)}</div>, mountBlivechatFallbackRoot(slot, document, surfaceRef.current!, fallbackStyle,fallbackPresentation), eventId)] : [];
  }) : [];
  return <div ref={surfaceRef} className="laplace-product-surface" style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
    <div style={{ width: `${100 / scale}%`, height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: direction === "top" ? "top left" : "bottom left" }}>
      <RendererHost dashboardLiveGuards={dashboardLiveGuards} ref={frameControl} variant="product" direction={direction} contentAlignment={contentAlignment} tickerPosition={tickerPosition} rate={rate} renderMode={renderMode} enableBilibiliVideoLinks={enableBilibiliVideoLinks} coordinateScale={scale} layout={layout} productElements={descriptor.productElements ?? DEFAULT_PRODUCT_ELEMENTS} settings={descriptor.config as LaplaceSettings} css={css as LaplaceCssSources} events={sourceRows} stickyEvents={stickyRows} scrollable animation={animation} removingEventIds={removingIds} recalledEventIds={recalledIds}
        onAction={dispatch ? (eventId, action) => dispatch(eventId, action as CompatibleLiveAction) : undefined}
        onContextMenu={(eventId, x, y) => onContextMenu?.({ eventId, x, y })}
        onFrameDocument={frameDocument => setFrameState(previous => ({ document: frameDocument, revision: previous.revision + 1 }))}
        onPointerDown={onPointerDown}
        onRendered={() => {
          renderedRows.current = sourceRows;
          if (pendingLatest.current) { frameControl.current?.scrollToLatest(); return; }
          if (pendingRestore.current) { frameControl.current?.restoreScroll(pendingRestore.current); pendingRestore.current = undefined; }
          if (pendingLocate.current) { frameControl.current?.locate(pendingLocate.current); pendingLocate.current = undefined; }
        }}
        onFollowingChange={(next, state) => {
          if (!state?.userInitiated && next !== followingRef.current) return;
          if (pendingLatest.current) {
            const reachesLatest = direction === "top" ? eventWindow.start === 0 : eventWindow.end === visibleFacts.length;
            if (state?.userInitiated) pendingLatest.current = false;
            else if (renderedRows.current !== sourceRows || !next || !reachesLatest) return;
            else pendingLatest.current = false;
          }
          let nextStart = eventWindow.start;
          if (state?.userInitiated && state.nearStart && eventWindow.start > 0) nextStart = advanceLaplaceProductWindow({ start: eventWindow.start, end: eventWindow.end, total: visibleFacts.length, direction: "backward" });
          else if (state?.userInitiated && state.nearEnd && eventWindow.end < visibleFacts.length) nextStart = advanceLaplaceProductWindow({ start: eventWindow.start, end: eventWindow.end, total: visibleFacts.length, direction: "forward" });
          const shiftedToLatest = direction === "top" ? nextStart === 0 : nextStart + 80 >= visibleFacts.length;
          if (nextStart !== eventWindow.start && state?.userInitiated && shiftedToLatest && isFollowingLatest(direction, state.scrollTop ?? 0, state.scrollHeight, state.clientHeight)) {
            followingRef.current = true;
            pendingLatest.current = true;
            pendingRestore.current = undefined;
            setFollowingLatest(true);
            setWindowStart(nextStart);
            return;
          }
          if (nextStart !== eventWindow.start) {
            pendingRestore.current = { eventId: state?.anchorId, scrollTop: state?.scrollTop, anchorOffset: state?.anchorOffset, followingLatest: false };
            setWindowStart(nextStart);
          }
          const globalFollowing = nextStart === eventWindow.start && isLaplaceGlobalLatest({ direction, start: eventWindow.start, end: eventWindow.end, total: visibleFacts.length, sourceFollowing: next });
          if (globalFollowing && state?.userInitiated) { pendingRestore.current = undefined; pendingLocate.current = undefined; }
          if (followingRef.current && !globalFollowing) setWindowStart(nextStart);
          followingRef.current = globalFollowing;
          setFollowingLatest(globalFollowing);
          onScrollState?.({ followingLatest: globalFollowing, scrollTop: state?.scrollTop ?? 0, scrollHeight: state?.scrollHeight ?? 0, clientHeight: state?.clientHeight ?? 0, anchorId: state?.anchorId, anchorOffset: state?.anchorOffset, nearStart: state?.nearStart, nearEnd: state?.nearEnd, userInitiated: state?.userInitiated });
        }} />
    </div>
    {fallbackPortals}
  </div>;
});
