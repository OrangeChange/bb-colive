import { mountBlivechatFallbackRoot, readBlivechatFallbackPresentation, type BlivechatFallbackStyle } from "./blivechatFallbackSurface.ts";
import { projectCallbackNames } from "../../events/displayNameProjection.ts";
import { StylePreviewFallbacks } from '../../components/StylePreviewFallbacks.tsx';
import { DEFAULT_STYLE_PREVIEW_POLICY, admitsStylePreviewEvent, projectSourcePreviewFact, scopeStylePreviewSample } from '../../preview/stylePreviewPolicy.ts';
import { useSourcePreviewPlayback } from '../../preview/useSourcePreviewPlayback.ts';
import { resolveFeedContentAlignment } from "../../events/feedScroll.ts";
import { useSourcePreviewPolicy } from "../../preview/useSourcePreviewPolicy.ts";
import type { PreviewFrame } from "../../preview/stylePreviewState.ts";
import { CompatibleFrameStatus, useCompatibleFrameLoad } from "../../components/CompatibleFrameStatus.tsx";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { DanmakuEvent } from "../../protocol/types.ts";
import type { CompatibleListSurfaceDescriptor } from "../CompatibleEventRenderer.tsx";
import type { CompatibleLiveAction } from "../compatibleLiveBridge.ts";
import { stableCompatibleEventId } from "../compatibleLiveBridge.ts";
import { createBlivechatFixedPreviewRecords, filterBlivechatPreviewRecords } from "./previewRecords.mjs";
import { applyCompatibleThumbnailFramePresentation } from "../thumbnailFramePresentation.ts";
import type { FeedReadingPosition } from "../../events/feedScroll.ts";
import { useRetainedFeedWindow } from "../../events/useLocalFeedReading.ts";

export { blivechatPreviewMethodForEvent, filterBlivechatPreviewRecords, prepareBlivechatPreviewRecord, prepareBlivechatPreviewRecords } from "./previewRecords.mjs";

type SourceMessage = { type: string; command: string; data?: unknown };
type SourcePayload = { id?: unknown; translation?: unknown; [key: string]: unknown };
type SourceRecord = { method?: unknown; payload?: SourcePayload; data?: SourcePayload; [key: string]: unknown };
export interface BlivechatScrollState { userInitiated?: boolean; followingLatest: boolean; scrollTop: number; scrollHeight: number; clientHeight: number; anchorId?: string; anchorOffset?: number; nearStart?: boolean; nearEnd?: boolean }
export interface BlivechatSourceControl { scrollToLatest(): void; locate(eventId: string): void; restoreScroll(state: FeedReadingPosition): void }
export interface BlivechatContextRequest { eventId: string; x: number; y: number }
export type BlivechatFlowDirection = "top" | "bottom";
export interface BlivechatEventWindow { events: DanmakuEvent[]; start: number; end: number }
export interface BlivechatStickyItem { event: DanmakuEvent; startedAt: number; expiresAt: number }
export interface BlivechatSourceAnimation { preset: "none" | "fade" | "lift" | "scale" | "slide"; durationMs: number }

export function buildBlivechatPresentationLayout(events: readonly DanmakuEvent[], eventDecision: (event: DanmakuEvent) => "render" | "omit" | "fallback", removingEventIds: ReadonlySet<string>) {
  return events.map(event => {
    const eventId = stableCompatibleEventId(event);
    return { eventId, kind: eventDecision(event) === "render" ? "source" as const : "fallback" as const, removing: removingEventIds.has(eventId), ...(event.danmuDeleted ? { recalled: true } : {}) };
  });
}

export function advanceBlivechatEventWindow(options: { start: number; end: number; total: number; direction: "forward" | "backward"; size?: number; anchorIndex?: number }): number {
  const size = Math.max(20, Math.floor(options.size ?? 60));
  const step = Math.max(1, Math.floor(size / 2));
  const next = options.direction === "forward"
    ? Math.min(Math.max(0, options.total - size), options.start + step)
    : Math.max(0, options.start - step);
  if (options.anchorIndex === undefined || options.anchorIndex < 0) return next;
  return Math.max(options.anchorIndex - size + 1, Math.min(options.anchorIndex, next));
}

export function planBlivechatEventWindow(events: readonly DanmakuEvent[], options: { direction: BlivechatFlowDirection; followingLatest: boolean; targetId?: string; anchorId?: string; start?: number; size?: number }): BlivechatEventWindow {
  const size = Math.max(20, Math.floor(options.size ?? 60));
  if (events.length <= size) return { events: [...events], start: 0, end: events.length };
  const idOf = (event: DanmakuEvent) => stableCompatibleEventId(event);
  let center = options.targetId ? events.findIndex(event => idOf(event) === options.targetId) : -1;
  if (center < 0 && !options.followingLatest && options.anchorId) center = events.findIndex(event => idOf(event) === options.anchorId);
  let start: number;
  if (center >= 0) start = Math.max(0, Math.min(events.length - size, center - Math.floor(size / 2)));
  else if (Number.isFinite(options.start)) start = Math.max(0, Math.min(events.length - size, Math.floor(options.start!)));
  else if (options.followingLatest) start = options.direction === "top" ? 0 : events.length - size;
  else start = options.direction === "top" ? 0 : events.length - size;
  return { events: events.slice(start, start + size), start, end: start + size };
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export function planBlivechatSourceSync(previous: readonly SourceRecord[], next: readonly SourceRecord[]): { command: "append" | "hydrate"; records: SourceRecord[] } {
  const same = (left: SourceRecord, right: SourceRecord) => {
    // The host window index is not the renderer's delivery sequence.
    const { sequence: _leftIndex, ...leftRecord } = left;
    const { sequence: _rightIndex, ...rightRecord } = right;
    return left.method === right.method && left.payload?.id === right.payload?.id && JSON.stringify(leftRecord) === JSON.stringify(rightRecord);
  };
  if (previous.length <= next.length && previous.every((record, index) => same(record, next[index]))) return previous.length === 0
    ? { command: "hydrate", records: [...next] }
    : { command: "append", records: next.slice(previous.length) };
  for (let start = 1; start < previous.length; start += 1) {
    const overlap = previous.length - start;
    if (overlap > next.length || !next.slice(0, overlap).every((record, index) => same(previous[start + index], record))) continue;
    const appended = next.slice(overlap);
    if (appended.some(record => previous.some(prior => prior.payload?.id === record.payload?.id))) continue;
    return { command: "append", records: appended };
  }
  if (previous.length === next.length) {
    const updates: SourceRecord[] = [];
    for (let index = 0; index < next.length; index += 1) {
      const left = previous[index], right = next[index];
      if (same(left, right)) continue;
      const { translation: leftTranslation, ...leftPayload } = left.payload ?? {};
      const { translation: rightTranslation, ...rightPayload } = right.payload ?? {};
      if (left.method !== right.method || left.payload?.id !== right.payload?.id || JSON.stringify(leftPayload) !== JSON.stringify(rightPayload)) return { command: "hydrate", records: [...next] };
      updates.push({ method: "onUpdateTranslation", payload: { id: right.payload?.id, translation: rightTranslation ?? "" } });
    }
    if (updates.length) return { command: "append", records: updates };
  }
  return { command: "hydrate", records: [...next] };
}

export function projectBlivechatCallbackBatch(events: readonly DanmakuEvent[], project: CompatibleListSurfaceDescriptor["project"]): SourceRecord[] {
  const stableByRaw = new Map(events.map(event => [event.id, stableCompatibleEventId(event)]));
  return events.map((event, index) => {
    const record = project(event, index + 1) as SourceRecord | null;
    if (record?.method === "onDelSuperChat" && Array.isArray((record.payload as { ids?: unknown[] })?.ids)) {
      return { ...record, payload: { ...record.payload, ids: (record.payload as { ids: unknown[] }).ids.map(id => stableByRaw.get(String(id)) ?? String(id)) } };
    }
    return record;
  }).filter((record): record is SourceRecord => record !== null);
}

export const BlivechatSourceSurface = forwardRef<BlivechatSourceControl, {
  userNicknames?: Record<string, string>;
  descriptor: CompatibleListSurfaceDescriptor;
  events: readonly DanmakuEvent[];
  viewKey?: string;
  eventDecision?: (event: DanmakuEvent) => "render" | "omit" | "fallback";
  dispatch?: (eventId: string, action: CompatibleLiveAction) => boolean;
  scale?: number;
  tickerEnabled?: boolean;
  stickyItems?: readonly BlivechatStickyItem[];
  tickerPosition?: "top" | "bottom";
  direction?: BlivechatFlowDirection;
  contentAlignment?: "top" | "bottom";
  fallbackRenderer?: (event: DanmakuEvent) => ReactNode;
  fallbackStyle?: BlivechatFallbackStyle;
  enableBilibiliVideoLinks?: boolean;
  onScrollState?: (state: BlivechatScrollState) => void;
  renderMode?: "dashboard" | "output";
  onContextMenu?: (request: BlivechatContextRequest) => void;
  onPointerDown?: () => void;
  initialScrollState?: Pick<BlivechatScrollState, "followingLatest" | "scrollTop"> & Partial<Pick<BlivechatScrollState, "anchorId" | "anchorOffset">>;
  removingEventIds?: ReadonlySet<string>;
  animation?: BlivechatSourceAnimation;
}>(({ descriptor, events, viewKey, eventDecision = descriptor.eventDecision ?? (event => descriptor.project(event, 1) ? "render" : "fallback"), dispatch, scale = 1, tickerEnabled = true, stickyItems = [], tickerPosition = "top", direction = "bottom", contentAlignment: savedContentAlignment, fallbackRenderer, fallbackStyle, enableBilibiliVideoLinks = false, onScrollState, onContextMenu, renderMode = "output", onPointerDown, initialScrollState, removingEventIds = new Set<string>(), animation = { preset: "none", durationMs: 0 } }, ref) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const contentAlignment = resolveFeedContentAlignment(descriptor.protocol === "bb-openlive" ? "blivechat-open" : descriptor.renderer === "laplace" ? "laplace" : "blivechat", direction, savedContentAlignment);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const followingRef = useRef(initialScrollState?.followingLatest ?? true);
  const displayEvents = useMemo(() => events.filter(event => eventDecision(event) !== "omit"), [events, eventDecision]);
  const [windowStart, setWindowStart] = useState(() => planBlivechatEventWindow(displayEvents, { direction, followingLatest: initialScrollState?.followingLatest ?? true, anchorId: initialScrollState?.anchorId }).start);
  const configKey = stableValue(descriptor.config);
  const retainedStart = useRetainedFeedWindow(displayEvents, windowStart, 60, followingRef, setWindowStart, stableCompatibleEventId, `${viewKey}:${direction}`);
  const eventWindow = useMemo(() => planBlivechatEventWindow(displayEvents, { direction, followingLatest: false, start: retainedStart }), [displayEvents, direction, retainedStart]);
  const callbacks = useMemo(() => projectBlivechatCallbackBatch(eventWindow.events.filter(event => eventDecision(event) === "render"), descriptor.project), [eventWindow.events, eventDecision, descriptor.project]);
  const stickyRecords = useMemo(() => stickyItems.flatMap((item, index) => {
    const record = eventDecision(item.event) === "render" ? descriptor.project(item.event, index + 1) as SourceRecord | null : null;
    return record ? [{ record, startedAt: item.startedAt, expiresAt: item.expiresAt }] : [];
  }), [stickyItems, eventDecision, descriptor.project]);
  const removingKey = [...removingEventIds].sort().join("\n");
  const layout = useMemo(() => buildBlivechatPresentationLayout(eventWindow.events, eventDecision, removingEventIds), [eventWindow.events, eventDecision, removingKey]);
  const presentation = useMemo(() => ({ layout, stickyRecords, position: tickerPosition, direction, contentAlignment, animation }), [layout, stickyRecords, tickerPosition, direction, contentAlignment, animation.preset, animation.durationMs]);
  const presentationKey = stableValue(presentation);
  const sentRef = useRef<SourceRecord[]>([]);
  const refillingRef = useRef(false);
  const syncedViewKeyRef = useRef(viewKey);
  const hydratedRef = useRef(false);
  const sentPresentationRef = useRef("");
  const restoredRef = useRef(false);
  const pendingRestoreRef = useRef(initialScrollState);
  const latestScrollRef = useRef<BlivechatScrollState | undefined>(undefined);
  const pendingLocateRef = useRef<string | undefined>(undefined);
  const locateFeedbackRef = useRef(false);
  const pendingLatestRef = useRef(false);
  const [slotRevision, setSlotRevision] = useState(0);
  const post = (command: string, data?: unknown) => frameRef.current?.contentWindow?.postMessage({ type: descriptor.protocol, command, data }, window.location.origin);
  const syncFrameColorScheme = () => {
    const frame = frameRef.current;
    const root = frame?.contentDocument?.documentElement;
    if (frame && root) frame.style.colorScheme = frame.contentWindow?.getComputedStyle(root).colorScheme || "normal";
  };
  const requestLatest = () => {
    followingRef.current = true;
    pendingLatestRef.current = true;
    pendingRestoreRef.current = undefined;
    pendingLocateRef.current = undefined;
    locateFeedbackRef.current = false;
    const latestStart = direction === "top" ? 0 : Math.max(0, displayEvents.length - 60);
    if (latestStart === eventWindow.start) post("scroll-latest"); else setWindowStart(latestStart);
  };

  useEffect(() => {
    const receive = (event: MessageEvent<SourceMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin || event.data?.type !== descriptor.protocol) return;
      if (event.data.command === "ready") setReady(true);
      if (event.data.command === "ready" || event.data.command === "status" || event.data.command === "presented") syncFrameColorScheme();
      if (event.data.command === "scroll-latest-request") requestLatest();
      if (event.data.command === "error") {
        const data = event.data.data as { message?: unknown } | undefined;
        setError(typeof data?.message === "string" ? data.message : "来源渲染器无法应用当前设置");
      }
      if (event.data.command === "action") {
        const data = event.data.data as { eventId?: unknown; action?: unknown } | undefined;
        if (typeof data?.eventId === "string" && (typeof data.action === "string" || typeof data.action === "object")) dispatch?.(data.eventId, data.action as CompatibleLiveAction);
      }
      if (event.data.command === "context-menu") {
        const data = event.data.data as Partial<BlivechatContextRequest> | undefined;
        if (typeof data?.eventId === "string" && typeof data.x === "number" && typeof data.y === "number") {
          const bounds = frameRef.current?.getBoundingClientRect();
          onContextMenu?.({ eventId: data.eventId, x: data.x + (bounds?.left ?? 0), y: data.y + (bounds?.top ?? 0) });
        }
      }
      if (event.data.command === "scroll-state") {
        const data = event.data.data as Partial<BlivechatScrollState> | undefined;
        if (typeof data?.followingLatest === "boolean" && [data.scrollTop, data.scrollHeight, data.clientHeight].every(Number.isFinite)) {
          const state = data as BlivechatScrollState;
          if (!restoredRef.current && pendingRestoreRef.current && !state.userInitiated) return;
          const reachesFullLatest = direction === "top" ? eventWindow.start === 0 : eventWindow.end === displayEvents.length;
          if (!state.userInitiated && followingRef.current && (!state.followingLatest || !reachesFullLatest)) return;
          if (!pendingLatestRef.current && !followingRef.current && !state.userInitiated && !locateFeedbackRef.current) return;
          if (state.userInitiated || (locateFeedbackRef.current && state.anchorId)) locateFeedbackRef.current = false;
          if (pendingLatestRef.current && state.userInitiated) pendingLatestRef.current = false;
          if (pendingLatestRef.current && !(state.followingLatest && reachesFullLatest)) return;
          if (pendingLatestRef.current) pendingLatestRef.current = false;
          const globalState = { ...state, followingLatest: state.followingLatest && reachesFullLatest };
          if (state.userInitiated || followingRef.current || !latestScrollRef.current) latestScrollRef.current = globalState;
          followingRef.current = globalState.followingLatest;
          let nextStart = eventWindow.start;
          const anchorIndex = state.anchorId ? displayEvents.findIndex(event => stableCompatibleEventId(event) === state.anchorId) : -1;
          if (state.userInitiated === true && state.nearStart && eventWindow.start > 0) nextStart = advanceBlivechatEventWindow({ start: eventWindow.start, end: eventWindow.end, total: displayEvents.length, direction: "backward", anchorIndex });
          else if (state.userInitiated === true && state.nearEnd && eventWindow.end < displayEvents.length) nextStart = advanceBlivechatEventWindow({ start: eventWindow.start, end: eventWindow.end, total: displayEvents.length, direction: "forward", anchorIndex });
          if (state.anchorId && nextStart !== eventWindow.start) {
            const reachesLatest = direction === "top" ? nextStart === 0 : nextStart + 60 >= displayEvents.length;
            if (state.userInitiated && state.followingLatest && reachesLatest) {
              globalState.followingLatest = true;
              followingRef.current = true;
              pendingLatestRef.current = true;
              pendingRestoreRef.current = undefined;
            } else {
              pendingRestoreRef.current = { followingLatest: false, scrollTop: state.scrollTop, anchorId: state.anchorId, anchorOffset: state.anchorOffset };
            }
            restoredRef.current = false;
            setWindowStart(nextStart);
          }
          onScrollState?.(globalState);
        }
      }
      if (event.data.command === "hydrated") {
        hydratedRef.current = true;
        if (sentPresentationRef.current !== presentationKey) {
          post("presentation", JSON.parse(presentationKey));
          sentPresentationRef.current = presentationKey;
          return;
        }
      }
      if (event.data.command === "presented" || event.data.command === "hydrated") {
        if (pendingLatestRef.current || followingRef.current) post("scroll-latest");
        if (!hydratedRef.current) return;
        if (!restoredRef.current && pendingRestoreRef.current) {
          post("restore-scroll", pendingRestoreRef.current);
          restoredRef.current = true;
        }
        if (pendingLocateRef.current) { locateFeedbackRef.current = true; post("locate", { eventId: pendingLocateRef.current }); pendingLocateRef.current = undefined; }
      }
      if (event.data.command === "fallback-slots-ready") setSlotRevision(value => value + 1);
      if (event.data.command === "pointer-down") onPointerDown?.();
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [descriptor.protocol, dispatch, onContextMenu, onScrollState, onPointerDown, presentationKey, direction, eventWindow.start, eventWindow.end, displayEvents.length]);

  useImperativeHandle(ref, () => ({
    restoreScroll: state => {
      pendingLatestRef.current = false;
      followingRef.current = state.followingLatest;
      pendingRestoreRef.current = state;
      restoredRef.current = false;
      latestScrollRef.current = { ...state, scrollHeight: 0, clientHeight: 0 };
      const next = planBlivechatEventWindow(displayEvents, { direction, followingLatest: state.followingLatest, anchorId: state.anchorId });
      if (next.start !== eventWindow.start) setWindowStart(next.start);
      else if (hydratedRef.current) post("presentation", JSON.parse(presentationKey));
    },
    scrollToLatest: () => {
      requestLatest();
    },
    locate: eventId => {
      pendingLatestRef.current = false;
      followingRef.current = false;
      pendingRestoreRef.current = undefined;
      restoredRef.current = true;
      const index = displayEvents.findIndex(event => stableCompatibleEventId(event) === eventId);
      if (index >= 0 && !eventWindow.events.some(event => stableCompatibleEventId(event) === eventId)) {
        pendingLocateRef.current = eventId;
        setWindowStart(Math.max(0, Math.min(Math.max(0, displayEvents.length - 60), index - 30)));
      } else if (!hydratedRef.current) {
        pendingLocateRef.current = eventId;
      } else { locateFeedbackRef.current = true; post("locate", { eventId }); }
    },
  }));

  useEffect(() => {
    if (!ready) return;
    post("config", JSON.parse(configKey));
  }, [ready, configKey]);

  useEffect(() => {
    if (!ready) return;
    post("css", { css: descriptor.css, appearanceCss: descriptor.appearanceCss });
  }, [ready, descriptor.css, descriptor.appearanceCss]);

  useEffect(() => {
    if (!ready) return;
    post("host", { scale, tickerEnabled, enableBilibiliVideoLinks, direction, managed: true, renderMode });
  }, [ready, scale, tickerEnabled, enableBilibiliVideoLinks, direction, renderMode]);

  useEffect(() => {
    if (!ready) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== (direction === "top" ? "Home" : "End")) return;
      event.preventDefault();
      event.stopPropagation();
      requestLatest();
    };
    const onWheel = (event: WheelEvent) => {
      const scroller = doc.querySelector<HTMLElement>("#item-scroller");
      if (!scroller || !scroller.contains(event.target as Node)) return;
      if (!event.deltaY) return;
      const towardStart = event.deltaY < 0;
      const reachesEdge = towardStart ? scroller.scrollTop + event.deltaY <= 0 : scroller.scrollTop + event.deltaY >= scroller.scrollHeight - scroller.clientHeight;
      if (!reachesEdge) return;
      const hasMore = towardStart ? eventWindow.start > 0 : eventWindow.end < displayEvents.length;
      const towardLatest = direction === "top" ? towardStart : !towardStart;
      if (!hasMore && !towardLatest) return;
      const atEdge = towardStart ? scroller.scrollTop <= 4 : scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 4;
      if (hasMore && !atEdge) return;
      event.preventDefault();
      if (!hasMore && atEdge) {
        if (followingRef.current) event.stopPropagation();
        else requestLatest();
        return;
      }
      if (!hasMore) { requestLatest(); return; }
      event.stopPropagation();
      const viewportTop = scroller.getBoundingClientRect().top;
      const anchor = [...scroller.querySelectorAll<HTMLElement>("[data-compatible-event-id],[data-event-id]")].find(row => row.getBoundingClientRect().bottom > viewportTop);
      const anchorId = anchor?.dataset.compatibleEventId ?? anchor?.dataset.eventId;
      if (!anchor || !anchorId) return;
      followingRef.current = false;
      pendingLatestRef.current = false;
      pendingRestoreRef.current = { followingLatest: false, scrollTop: scroller.scrollTop, anchorId, anchorOffset: anchor.getBoundingClientRect().top - viewportTop };
      restoredRef.current = false;
      const anchorIndex = displayEvents.findIndex(event => stableCompatibleEventId(event) === anchorId);
      setWindowStart(advanceBlivechatEventWindow({ start: eventWindow.start, end: eventWindow.end, total: displayEvents.length, direction: towardStart ? "backward" : "forward", anchorIndex }));
    };
    doc.addEventListener("keydown", onKeyDown, true);
    doc.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => { doc.removeEventListener("keydown", onKeyDown, true); doc.removeEventListener("wheel", onWheel, true); };
  }, [ready, direction, displayEvents.length, eventWindow.start, eventWindow.end]);

  useEffect(() => {
    if (!ready) return;
    pendingRestoreRef.current = initialScrollState;
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    const viewChanged = syncedViewKeyRef.current !== viewKey;
    syncedViewKeyRef.current = viewKey;
    if (viewChanged || followingRef.current) refillingRef.current = false;
    else if (callbacks.length === 0) refillingRef.current = true;
    const scroller = frameRef.current?.contentDocument?.querySelector<HTMLElement>("#item-scroller");
    if (refillingRef.current && callbacks.length > 0 && hydratedRef.current && scroller && scroller.scrollHeight > scroller.clientHeight + 1) refillingRef.current = false;
    let plan = viewChanged ? { command: "hydrate" as const, records: callbacks } : planBlivechatSourceSync(sentRef.current, callbacks);
    if (refillingRef.current && plan.command === "append" && plan.records.length > 0) plan = { command: "hydrate", records: callbacks };
    if (plan.command === "hydrate") {
      hydratedRef.current = false;
      if (!followingRef.current && latestScrollRef.current) {
        const { followingLatest, scrollTop, anchorId, anchorOffset } = latestScrollRef.current;
        pendingRestoreRef.current = { followingLatest, scrollTop, anchorId, anchorOffset };
        restoredRef.current = false;
      }
      post("hydrate", { records: plan.records, presentation: JSON.parse(presentationKey) });
      sentPresentationRef.current = presentationKey;
    }
    else if (plan.records.length) {
      post("event-batch", { records: plan.records, presentation: JSON.parse(presentationKey) });
      sentPresentationRef.current = presentationKey;
    }
    sentRef.current = callbacks;
  }, [ready, callbacks, viewKey]);

  useEffect(() => {
    if (!ready || !hydratedRef.current || sentPresentationRef.current === presentationKey) return;
    post("presentation", JSON.parse(presentationKey));
    sentPresentationRef.current = presentationKey;
  }, [ready, presentationKey]);

  useEffect(() => {
    if (!followingRef.current) return;
    setWindowStart(direction === "top" ? 0 : Math.max(0, displayEvents.length - 60));
  }, [displayEvents.length, direction]);

  const fallbackSurface=frameRef.current?.closest<HTMLElement>(".event-area")??frameRef.current?.parentElement;
  const fallbackPresentation=fallbackRenderer&&fallbackSurface&&layout.some(item=>item.kind==='fallback')?readBlivechatFallbackPresentation(document,fallbackSurface):undefined;
  const slots = slotRevision >= 0 && fallbackRenderer ? layout.flatMap(item => {
    if (item.kind !== "fallback") return [];
    const event = eventWindow.events.find(value => stableCompatibleEventId(value) === item.eventId);
    const slot = [...(frameRef.current?.contentDocument?.querySelectorAll<HTMLElement>("[data-compatible-fallback-id]") ?? [])].find(value => value.dataset.compatibleFallbackId === item.eventId);
    const surface = frameRef.current?.closest<HTMLElement>(".event-area") ?? frameRef.current?.parentElement;
    return event && slot && surface ? [createPortal(<div className={surface.className.split(/\s+/).filter(name => ["event-area", "theme-surface", "live", "review", "window", "window-chat", "window-pay", "obs", "preview"].includes(name) || name.startsWith("theme-target-")).join(" ")} data-style-api="1" data-event-style-scope={fallbackStyle?.scope}>{fallbackRenderer(event)}</div>, mountBlivechatFallbackRoot(slot, document, surface, fallbackStyle,fallbackPresentation), item.eventId)] : [];
  }) : [];
  return <div className="blivechat-source-surface" style={{ position: "relative", width: "100%", height: "100%" }}><iframe ref={frameRef} className="blivechat-source-document" title={descriptor.title ?? "兼容样式事件列表"} src={descriptor.url} sandbox="allow-scripts allow-same-origin" onLoad={() => { sentRef.current = []; hydratedRef.current = false; restoredRef.current = false; setReady(true); setError(null); }} style={{ display: "block", width: "100%", height: "100%", border: 0, background: "transparent", colorScheme: "normal", pointerEvents: "auto" }} />{slots}{error && <div role="alert" className="absolute inset-x-2 bottom-2 rounded-md border border-danger/50 bg-surface px-2 py-1 ui-type-meta text-danger">{error}</div>}</div>;
});

export function BlivechatSourcePreview({ maskUsername = false, previewDecision, previewDocument, previewPolicy, previewTarget = "windows", eventVisibility, previewFrame, onPreviewFrame, css, config, thumbnail, previewMode = "simulation", previewPlaying = true, previewSpeed = 1, previewRestartKey = 0, previewEventType, displayAll = true, scrollDirection = "bottom", contentAlignment: savedContentAlignment, editorSelection, onEditorInspection }: { maskUsername?: boolean; previewDecision?: import('../../preview/sourcePreviewGeneration.ts').PreviewEventDecision; previewDocument?: import('../../themes/themeTypes.ts').ThemeDocument; previewPolicy?: import("../../preview/stylePreviewPolicy.ts").StylePreviewPolicySettings; previewTarget?: "live" | "windows" | "obs"; eventVisibility?: unknown; previewFrame?:PreviewFrame;onPreviewFrame?:(frame:PreviewFrame)=>void;css: string; config: Record<string, unknown>; thumbnail: boolean; previewMode?: "static" | "design" | "simulation"; previewPlaying?: boolean; previewSpeed?: number; previewRestartKey?: number; previewEventType?: string; displayAll?: boolean; scrollDirection?: "top" | "bottom"; contentAlignment?: "top" | "bottom"; editorSelection?: import("../../themes/compatThemeCapabilities.ts").CompatibleEditorSelectionState; onEditorInspection?: (inspection: import("../../themes/compatThemeCapabilities.ts").CompatibleEditorInspection) => void }) {
  const contentAlignment = resolveFeedContentAlignment("blivechat", scrollDirection, savedContentAlignment);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { ready, error, setError, attempt, retry, loaded } = useCompatibleFrameLoad();
  const sampleLoadedRef = useRef(false);
  const lastRestart=useRef(previewRestartKey);
  const lastMode=useRef(previewMode);
  const fixedRecords = filterBlivechatPreviewRecords(createBlivechatFixedPreviewRecords("blivechat", previewMode), displayAll, (previewEventType ?? editorSelection?.scope.eventType)).filter(record => {
    const settings = previewPolicy ?? DEFAULT_STYLE_PREVIEW_POLICY;
    const fact = scopeStylePreviewSample(projectSourcePreviewFact(record, "blivechat"), settings.targetRoomId);
    return (!previewDecision || previewDecision(fact) === "render") && admitsStylePreviewEvent(fact, settings, { target: previewTarget, displayAll, mode: "static", now: 0 });
  });
  const projectedRecords = fixedRecords.map(record => projectCallbackNames(record, maskUsername));
  const fixedRecordsKey = JSON.stringify(projectedRecords);

  const sample = thumbnail ? "fixed-8294" : previewMode === "simulation" ? "source-simulation" : previewMode === "static" ? "static-fixed" : "design-fixed";
  const fallback = useSourcePreviewPolicy(frameRef, ready, "bb-blivechat", previewFrame, onPreviewFrame, { settings: previewPolicy, target: previewTarget, mode: previewMode, displayAll, thumbnail, visibility: eventVisibility, direction: scrollDirection, alignment: contentAlignment, restart: previewRestartKey, decision: previewDecision, maskUsername });
  const configKey = stableValue(thumbnail ? config : { ...config, maxNumber: 10000, minGiftPrice: 0, showDanmaku: true, showGift: true, hostShowSuperChat: true, hostShowGuard: true, hostShowFreeGift: true, hostShowNormalGift: true });
  const editorSelectionStructureKey = stableValue(editorSelection ? Object.fromEntries(Object.entries(editorSelection).filter(([key]) => key !== "inspectionRevision")) : null);
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: "bb-blivechat", command: "host", data: { scale: 1, tickerEnabled: !thumbnail, enableBilibiliVideoLinks: false, direction: thumbnail ? "top" : scrollDirection, contentAlignment: thumbnail ? "top" : contentAlignment, managed: true, renderMode: "output" } }, window.location.origin);
  }, [ready, thumbnail, scrollDirection, contentAlignment]);
  useEffect(() => {
    const receive = (event: MessageEvent<SourceMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin || event.data?.type !== "bb-blivechat") return;
      if (event.data.command === "ready") loaded();
      if (event.data.command === "hydrated" && thumbnail) {
        applyCompatibleThumbnailFramePresentation(frameRef.current?.contentDocument ?? null);
      }
      if (event.data.command === "error") {
        const data = event.data.data as { message?: unknown } | undefined;
        setError(typeof data?.message === "string" ? data.message : "来源预览无法应用当前设置");
      }
      if (event.data.command === "editor-inspected") {
        const data = event.data.data as import("../../themes/compatThemeCapabilities.ts").CompatibleEditorInspection | undefined;
        if (data?.scope && typeof data.scope.part === "string") onEditorInspection?.(data);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onEditorInspection]);
  useEffect(() => {
    if (!ready) return;
    const target = frameRef.current?.contentWindow; if (!target) return;
    target.postMessage({ type: "bb-blivechat", command: "config", data: JSON.parse(configKey) }, window.location.origin);
  }, [ready, configKey]);
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: "bb-blivechat", command: "css", data: { css, inspectionRevision: editorSelection?.inspectionRevision ?? 0 } }, window.location.origin);
  }, [ready, css, editorSelection?.inspectionRevision]);
  useEffect(() => {
    if (!ready) return;
    frameRef.current?.contentWindow?.postMessage({ type: "bb-blivechat", command: "editor-select", data: editorSelection ?? null }, window.location.origin);
  }, [ready, editorSelectionStructureKey]);
  useEffect(() => {
    if (!ready || sampleLoadedRef.current || previewFrame || (!thumbnail && previewMode === "simulation")) return;
    sampleLoadedRef.current = true;
    let disposed = false;
    const target = frameRef.current?.contentWindow; if (!target) return;
    const send = (command: string, data?: unknown) => target.postMessage({ type: "bb-blivechat", command, data }, window.location.origin);
    if(lastRestart.current!==previewRestartKey||(lastMode.current!==previewMode&&(lastMode.current==="simulation"||previewMode==="simulation"))){send("reset");lastRestart.current=previewRestartKey;lastMode.current=previewMode;}
    if (thumbnail || previewMode !== "simulation") {
      send("simulation", { playing: false, speed: 1, types: { text: true, emoticon: true, gift: true, member: true, superChat: true } });
      const records = projectedRecords;
      if (!disposed) send(thumbnail ? "hydrate" : "preview-window", { records: thumbnail ? records.slice(0, 6) : records });
    }
    return () => {
      disposed = true;
      if (previewMode === "simulation") send("simulation", { playing: false, speed: 1, types: { text: true, emoticon: true, gift: true, member: true, superChat: true } });
      sampleLoadedRef.current = false;
    };
  }, [fixedRecordsKey, ready, thumbnail, previewMode === "simulation", previewRestartKey]);
  useSourcePreviewPlayback(frameRef, { channel: 'bb-blivechat', enabled: ready && !thumbnail && !previewFrame && previewMode === 'simulation',
    playing: previewPlaying, speed: previewSpeed, restart: previewRestartKey, target: previewTarget, displayAll,
    visibility: eventVisibility, policy: previewPolicy, decision:previewDecision, onFallback:fallback.appendFallback, eventType: displayAll ? undefined : (previewEventType ?? editorSelection?.scope.eventType) });
  return <div className="blivechat-source-preview" data-source-sample={sample} style={{ position: "relative", width: "100%", height: "100%", display:"flex", flexDirection:"column" }}><iframe key={attempt} ref={frameRef} title="blivechat 来源预览" src="/blivechat/renderer.html" sandbox="allow-scripts allow-same-origin" onLoad={() => { sampleLoadedRef.current = false;  }} style={{ display: "block", width: "100%", height: "100%", minHeight:0, flex:1, border: 0, background: "transparent", colorScheme: "normal" }} /><StylePreviewFallbacks frameDocument={ready?frameRef.current?.contentDocument??null:null} events={fallback.events} sticky={fallback.sticky} mode="blivechat" settings={previewDocument?.settings} target={previewTarget} policy={previewPolicy??DEFAULT_STYLE_PREVIEW_POLICY} now={previewFrame?.now??Date.now()}/>
<CompatibleFrameStatus ready={ready} error={error} onRetry={retry} /></div>;
}
