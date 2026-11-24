import { uiText } from "../i18n/index.ts";
/**
 * 事件列表：贴底自动跟随（向上滚动即暂停跟随；「回到最新」完整版是 3b）
 * 现场记录完整保留，使用虚拟滚动只渲染可见行，避免直播时间变长后 DOM 无限增长。
 *
 * 诊断：MutationObserver 如实记录每行实际渲染内容（文本 + 图片 URL，
 * 头像除外）到统一 render 日志，和 source/app 记录通过事件 ID 关联。
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { filterNativeFeedIndices } from '../themes/nativeFeedVisibility.ts';
import type { NativeThemeSettings } from '../themes/nativeComponentAppearance.ts';
import type { DanmakuEvent, DanmakuUser } from "../protocol/types";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES, DEFAULT_EVENT_FONT_SIZE, getEventAnimationDuration, getEventAnimationExitDuration, type EventDisplayPreferences } from "../eventDisplaySettings";
import { DEFAULT_EVENT_STYLE_SETTINGS, getEventStyleType, type EventStyleSettings } from "../eventStyleSettings";
import { observeRenderedEventRows } from "../diagnostics/renderLogger";
import { estimateScaledEventRow, measureScaledEventRow, normalizeEventDisplayScale } from "../events/feedDisplayScale.ts";
import { EventRow } from "./EventRow";
import { EventRowSlot } from "./EventRowSlot";
import { useEventAreaStyle } from "./EventAreaStyle";
import { EventContextMenu, runEventFavoriteAction, type EventMenuHandlers } from "./EventContextMenu";
import type { GiftEffectResource } from "../protocol/giftEffects";
import { locateLiveEvent } from "../events/liveEventLocation";
import { openUrl } from "@tauri-apps/plugin-opener";
import { buildEventContentText } from "../events/eventContentText.ts";
import { CompatibleEventRenderer, compatibleListSurfaceOf, compatibleRendererSurface, type CompatibleEventRender } from "../compat/CompatibleEventRenderer.tsx";
import { type BlivechatContextRequest, type BlivechatSourceControl } from "../compat/blivechat/BlivechatSourceSurface.tsx";
import type { CompatibleRowBounds } from "../compat/compatibleRowInteraction.ts";
import { CompatibleListSurface as BlivechatSourceSurface } from "../compat/CompatibleListSurface.tsx";
import { dispatchCompatibleLiveAction, type CompatibleLiveAction } from "../compat/compatibleLiveBridge.ts";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import {
  captureFeedLayoutSnapshot,
  captureFeedScrollSession,
  FEED_FOLLOW_THRESHOLD,
  getRestoredScrollTop,
  getFeedStackAlignment,
  getTopAppendScrollTop,
  getFeedAnchorScrollTop,
  getFeedMeasurementStart,
  isFollowingLatest,
  restoreFeedLayoutSnapshot,
  shouldAdjustTopAppendAnchor,
  updateUnreadCount,
  type FeedLayoutSnapshot,
  type FeedReadingPosition,
  type FeedScrollSession,
  type LiveScrollDirection,
} from "../events/feedScroll";

/** 距最新边缘多少像素内视为"跟随最新" */
const FOLLOW_THRESHOLD = FEED_FOLLOW_THRESHOLD;

interface EventListProps {
  /** 完整现场事件源；虚拟列表只通过 visibleIndices 读取当前可见投影。 */
  roomGuardProfile?: import("../protocol/types.ts").RoomGuardProfile;
  events: DanmakuEvent[];
  visibleIndices: number[];
  /** 房间/筛选范围标识变化时，当前列表应视为一次新的视图。 */
  viewKey: string;
  queryActive?: boolean;
  /** 由现场会话提供的稳定区域标识；不随筛选条件变化。 */
  feedKey: string;
  /** 当前直播间、布局和区域对应的滚动会话。 */
  feedSession: FeedScrollSession;
  emptyLabel?: string;
  /** 现场使用固定的“元信息 + 正文”两行布局；回看省略则保持旧布局。 */
  liveLayout?: boolean;
  onUserFilter?: (user: DanmakuUser) => void;
  displayPreferences?: EventDisplayPreferences;
  eventStyleSettings?: EventStyleSettings;
  eventFontSize?: number;
  displayScale?: number;
  enableBilibiliVideoLinks?: boolean;
  eventAreaRef?: RefObject<HTMLElement | null>;
  scrollDirection?: LiveScrollDirection;
  contentAlignment?: "top" | "bottom";
  eventMenuHandlers?: Omit<EventMenuHandlers, "regionKey">;
  giftEffectResolver?: (event: DanmakuEvent) => GiftEffectResource | null;
  onPlayGiftEffect?: (event: DanmakuEvent) => void;
  compatibleEventRender?: CompatibleEventRender;
}

function getEventRowKey(event: Pick<DanmakuEvent, "id" | "reactKey">): string {
  return event.reactKey ?? event.id;
}

interface FeedReadingAnchorSnapshot {
  viewKey: string;
  eventKey: string;
  offset: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  visibleCount: number;
}

type ProgrammaticScrollIntent = "latest" | "target";

export function EventList({
  events,
  visibleIndices: inputVisibleIndices,
  viewKey: inputViewKey,
  queryActive = false,
  feedKey,
  feedSession,
  emptyLabel = uiText("eventList.EventList"),
  liveLayout = false,
  onUserFilter,
  displayPreferences,
  eventStyleSettings,
  eventFontSize,
  displayScale = 1,
  enableBilibiliVideoLinks = false,
  eventAreaRef,
  scrollDirection = "bottom",
  contentAlignment,
  eventMenuHandlers,
  giftEffectResolver,
  onPlayGiftEffect,
  roomGuardProfile,
  compatibleEventRender: suppliedCompatibleEventRender,
}: EventListProps) {
  const compatibleEventRender = liveLayout ? suppliedCompatibleEventRender : undefined;
  const rowEventMenu = useMemo(() => liveLayout && eventMenuHandlers
    ? { ...eventMenuHandlers, regionKey: feedKey } : undefined, [liveLayout, eventMenuHandlers, feedKey]);
  const nativeVisibility = (eventStyleSettings as NativeThemeSettings | undefined)?.eventVisibility;
  const visibleIndices = useMemo(() => liveLayout && !compatibleEventRender
    ? filterNativeFeedIndices(events, inputVisibleIndices, nativeVisibility, 'live')
    : inputVisibleIndices, [events, inputVisibleIndices, liveLayout, compatibleEventRender, nativeVisibility]);
  const userNicknames = useVoiceSettings((state) => state.userNicknames);
  const shortcutActions = useVoiceSettings((state) => state.shortcutActions);
  const viewKey = inputViewKey;
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(feedSession.followingLatest);
  const previousDirectionRef = useRef(scrollDirection);
  const previousViewKeyRef = useRef(viewKey);
  const previousCountRef = useRef(feedSession.visibleCount);
  const visibleCountRef = useRef(visibleIndices.length);
  const unreadCountRef = useRef(feedSession.unreadCount);
  const viewSnapshotRef = useRef<{ viewKey: string; scrollTop: number; followingLatest: boolean } | null>(null);
  const layoutSizeRef = useRef<{ width: number; height: number } | null>(null);
  const layoutSnapshotRef = useRef<FeedLayoutSnapshot | null>(null);
  const layoutGenerationRef = useRef(0);
  const layoutRafRef = useRef<number | null>(null);
  const layoutReleaseRafRef = useRef<number | null>(null);
  const readingAnchorRef = useRef<FeedReadingAnchorSnapshot | null>(null);
  const previousQueryActiveRef = useRef(queryActive || Boolean(feedSession.queryPosition));
  const pendingQueryRestoreRef = useRef<FeedReadingPosition | null>(null);
  const queryRestoreCancelRef = useRef<(() => void) | null>(null);
  // 排序反转前保留原锚点，继续复用已测量事件的恢复路径。
  if (previousDirectionRef.current !== scrollDirection) {
    previousDirectionRef.current = scrollDirection;
    pendingQueryRestoreRef.current ??= {
      scrollTop: feedSession.scrollTop,
      followingLatest: feedSession.followingLatest,
      anchorId: feedSession.anchorId,
      anchorOffset: feedSession.anchorOffset,
    };
  }
  const topPrependSettlingRef = useRef<{ viewKey: string; visibleCount: number } | null>(null);
  const programmaticScrollRef = useRef<ProgrammaticScrollIntent | null>(null);
  const programmaticScrollReleaseRafRef = useRef<number | null>(null);
  const [unreadCount, setUnreadCount] = useState(feedSession.unreadCount);
  const eventSpacing = displayPreferences?.eventSpacing ?? DEFAULT_EVENT_DISPLAY_PREFERENCES.eventSpacing;
  const eventPadding = displayPreferences?.eventPadding ?? DEFAULT_EVENT_DISPLAY_PREFERENCES.eventPadding;
  const areaStyle = useEventAreaStyle({
    settings: eventStyleSettings ?? DEFAULT_EVENT_STYLE_SETTINGS,
    layout: liveLayout ? "live" : "default",
    fontSize: liveLayout ? eventFontSize ?? DEFAULT_EVENT_FONT_SIZE : 13,
    padding: eventPadding,
    spacing: eventSpacing,
  });
  visibleCountRef.current = visibleIndices.length;
  const orderedVisibleIndices = scrollDirection === "top" ? [...visibleIndices].reverse() : visibleIndices;
  const contextLocatingRef = useRef(false);
  contextLocatingRef.current = Boolean(liveLayout && eventMenuHandlers?.contextTargetKey && eventMenuHandlers.contextTargetRegionKey === feedKey);
  const locationRowsRef = useRef({ events, orderedVisibleIndices });
  locationRowsRef.current = { events, orderedVisibleIndices };
  const markedIndex = eventMenuHandlers
    ? orderedVisibleIndices.findIndex((eventIndex) => {
      const event = events[eventIndex];
      return event ? Boolean(eventMenuHandlers.isMarked?.(feedKey, event)) : false;
    })
    : -1;
  const markedEvent = markedIndex >= 0 ? events[orderedVisibleIndices[markedIndex]] : undefined;
  const latestEdgeClass = scrollDirection === "top" ? "top-3" : "bottom-3";
  const latestArrow = scrollDirection === "top" ? "↑" : "↓";
  const [locatedMarkKey, setLocatedMarkKey] = useState<string | null>(null);
  const sourceControlRef = useRef<BlivechatSourceControl>(null);
  const [sourceHover, setSourceHover] = useState<CompatibleRowBounds | null>(null);
  const [sourceLocated, setSourceLocated] = useState<CompatibleRowBounds | null>(null);
  const [sourceDismissRevision, setSourceDismissRevision] = useState(0);
  const [sourceMenuEventId, setSourceMenuEventId] = useState<string | null>(null);
  const [sourceMenu, setSourceMenu] = useState<(BlivechatContextRequest & { revision: number }) | null>(null);
  useEffect(() => {
    const projectedIds = new Set(inputVisibleIndices.map(index => getEventRowKey(events[index])).filter(Boolean));
    if (sourceMenu && !projectedIds.has(sourceMenu.eventId)) setSourceMenu(null);
    if (sourceMenuEventId && !projectedIds.has(sourceMenuEventId)) setSourceMenuEventId(null);
  }, [events, inputVisibleIndices, sourceMenu, sourceMenuEventId]);
  const compatibleListSurface = compatibleListSurfaceOf(compatibleEventRender);
  const isCompatibleList = Boolean(compatibleListSurface);
  const previousCompatibleRef = useRef<boolean | undefined>(undefined);
  if (!isCompatibleList && previousCompatibleRef.current !== false && !queryActive && !feedSession.followingLatest && feedSession.anchorId) {
    pendingQueryRestoreRef.current = { followingLatest: false, scrollTop: feedSession.scrollTop, anchorId: feedSession.anchorId, anchorOffset: feedSession.anchorOffset };
  }
  previousCompatibleRef.current = isCompatibleList;
  const locatedHighlightFrameRef = useRef<number | null>(null);
  const locatedHighlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (previousQueryActiveRef.current !== queryActive) {
    previousQueryActiveRef.current = queryActive;
    if (queryActive) {
      const anchor = !isCompatibleList ? readingAnchorRef.current : null;
      const viewport = !isCompatibleList ? scrollRef.current : null;
      const row = anchor && viewport ? Array.from(viewport.querySelectorAll<HTMLElement>(".event-row-slot[data-event-id]"))
        .find(row => row.dataset.eventId === anchor.eventKey) : undefined;
      feedSession.queryPosition = {
        scrollTop: viewport?.scrollTop ?? feedSession.scrollTop,
        followingLatest: feedSession.followingLatest,
        anchorId: anchor?.eventKey ?? feedSession.anchorId,
        anchorOffset: row && viewport ? row.getBoundingClientRect().top - viewport.getBoundingClientRect().top - viewport.clientTop
          : anchor?.offset ?? feedSession.anchorOffset,
      };
    } else if (feedSession.queryPosition) {
      if (!contextLocatingRef.current) {
        pendingQueryRestoreRef.current = feedSession.queryPosition;
        Object.assign(feedSession, feedSession.queryPosition);
        followRef.current = feedSession.followingLatest;
      }
      delete feedSession.queryPosition;
    }
  }

  useEffect(() => {
    setLocatedMarkKey(null);
    return () => {
      if (locatedHighlightFrameRef.current !== null) cancelAnimationFrame(locatedHighlightFrameRef.current);
      if (locatedHighlightTimerRef.current !== null) clearTimeout(locatedHighlightTimerRef.current);
    };
  }, [feedKey]);

  // 在投影改变、浏览器尚未因高度变化而夹紧 scrollTop 前，保存旧视图的状态。
  // 这样 onScroll 收到的“被动夹位”不会覆盖用户真实的阅读位置。
  if (previousViewKeyRef.current !== viewKey && viewSnapshotRef.current?.viewKey !== viewKey) {
    viewSnapshotRef.current = {
      viewKey,
      scrollTop: feedSession.scrollTop,
      followingLatest: feedSession.followingLatest,
    };
  }

  const setUnread = useCallback((nextValue: number | ((current: number) => number)) => {
    setUnreadCount((current) => {
      const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
      unreadCountRef.current = next;
      feedSession.unreadCount = next;
      return next;
    });
  }, [feedSession]);

  const contentScale = liveLayout ? normalizeEventDisplayScale(displayScale) : 1;
  const rowVirtualizer = useVirtualizer({
    count: orderedVisibleIndices.length,
    getScrollElement: () => scrollRef.current,
    // 现场两行事件按基准字号估算，实测高度仍由 measureElement 回写；
    // 这样放大字号后初始滚动范围不会明显偏松。
    estimateSize: (index) => estimateScaledEventRow({
      baseSize: (liveLayout ? Math.round((eventFontSize ?? DEFAULT_EVENT_FONT_SIZE) * 3.625) : 42) + Math.max(0, eventPadding - 6) * 2,
      spacing: index < orderedVisibleIndices.length - 1 ? eventSpacing : 0,
      scale: contentScale,
    }),
    measureElement: measureScaledEventRow,
    overscan: 8,
    anchorTo: scrollDirection === "top" ? "start" : "end",
    followOnAppend: scrollDirection === "bottom" && feedSession.followingLatest && !contextLocatingRef.current,
    scrollEndThreshold: FOLLOW_THRESHOLD,
    useAnimationFrameWithResizeObserver: true,
    getItemKey: (index) => {
      const ev = events[orderedVisibleIndices[index]];
      return ev.reactKey ?? ev.id;
    },
  });

  const virtualItems = rowVirtualizer.getVirtualItems();
  const virtualizerTotalSize = rowVirtualizer.getTotalSize();
  const scrollPaddingTopRef = useRef<number | null>(null);

  const captureReadingAnchor = useCallback((): FeedReadingAnchorSnapshot | null => {
    const el = scrollRef.current;
    if (!el || followRef.current) return null;
    const viewport = el.getBoundingClientRect();
    const rows = Array.from(el.querySelectorAll<HTMLElement>(".event-row-slot[data-event-id]"))
      .map(row => ({ row, bounds: row.getBoundingClientRect() }))
      .filter(({ bounds }) => bounds.bottom > viewport.top && bounds.top < viewport.bottom);
    const center = viewport.top + el.clientHeight / 2;
    const visibleRow = liveLayout ? rows[0] : rows.reduce<typeof rows[number] | undefined>((closest, candidate) =>
      !closest || Math.abs(candidate.bounds.top + candidate.bounds.height / 2 - center)
        < Math.abs(closest.bounds.top + closest.bounds.height / 2 - center) ? candidate : closest, undefined);
    if (!visibleRow?.row.dataset.eventId) return null;
    return {
      viewKey,
      eventKey: visibleRow.row.dataset.eventId,
      offset: visibleRow.bounds.top - viewport.top - el.clientTop,
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      visibleCount: visibleIndices.length,
    };
  }, [viewKey, scrollDirection, visibleIndices.length, liveLayout]);

  // 顶部阅读和底部尺寸重排由稳定事件锚点补偿，避免同一变化重复按像素补偿。
  rowVirtualizer.shouldAdjustScrollPositionOnItemSizeChange = (scrollDirection === "top" || layoutSnapshotRef.current !== null)
    && !followRef.current && readingAnchorRef.current ? () => false : undefined;

  const beginProgrammaticScroll = useCallback((intent: ProgrammaticScrollIntent) => {
    programmaticScrollRef.current = intent;
    if (programmaticScrollReleaseRafRef.current !== null) {
      cancelAnimationFrame(programmaticScrollReleaseRafRef.current);
    }
    programmaticScrollReleaseRafRef.current = requestAnimationFrame(() => {
      programmaticScrollReleaseRafRef.current = requestAnimationFrame(() => {
        programmaticScrollReleaseRafRef.current = null;
        if (!contextLocatingRef.current) programmaticScrollRef.current = null;
      });
    });
  }, []);

  const restoreScrollPosition = useCallback(() => {
    if (contextLocatingRef.current) return;
    const saved = pendingQueryRestoreRef.current;
    if (saved) {
      Object.assign(feedSession, saved);
      followRef.current = saved.followingLatest;
      pendingQueryRestoreRef.current = null;
      if (isCompatibleList) {
        sourceControlRef.current?.restoreScroll(saved);
        return;
      }
      if (!saved.followingLatest && saved.anchorId && saved.anchorOffset !== undefined) {
        const anchorId = saved.anchorId, anchorOffset = saved.anchorOffset;
        queryRestoreCancelRef.current?.();
        layoutSnapshotRef.current = null;
        readingAnchorRef.current = null;
        programmaticScrollRef.current = "target";
        const finish = () => {
          queryRestoreCancelRef.current = null;
          programmaticScrollRef.current = null;
          layoutSnapshotRef.current = null;
          const el = scrollRef.current;
          if (el) {
            feedSession.scrollTop = el.scrollTop;
            readingAnchorRef.current = { viewKey: previousViewKeyRef.current, eventKey: anchorId, offset: anchorOffset,
              scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, visibleCount: visibleCountRef.current };
          }
          feedSession.followingLatest = false;
        };
        queryRestoreCancelRef.current = locateLiveEvent({
          getIndex: () => { const rows = locationRowsRef.current; return rows.orderedVisibleIndices.findIndex(index => getEventRowKey(rows.events[index]) === anchorId); },
          scrollToIndex: index => rowVirtualizer.scrollToIndex(index, { align: "center", behavior: "auto" }),
          getPosition: () => {
            const el = scrollRef.current;
            const row = el && Array.from(el.querySelectorAll<HTMLElement>(".event-row-slot[data-event-id]")).find(row => row.dataset.eventId === anchorId);
            if (!el || !row) return null;
            const offset = el.scrollTop + row.getBoundingClientRect().top - el.getBoundingClientRect().top - el.clientTop - anchorOffset;
            return { current: el.scrollTop, target: Math.max(0, Math.min(el.scrollHeight - el.clientHeight, offset)) };
          },
          scrollToOffset: offset => rowVirtualizer.scrollToOffset(offset, { behavior: "auto" }),
          requestFrame: callback => requestAnimationFrame(callback), cancelFrame: frame => cancelAnimationFrame(frame), onLocated: finish, onMissing: finish,
        });
        return;
      }
    } else if (isCompatibleList) return;
    const el = scrollRef.current;
    if (!el) return;
    const shouldFollow = feedSession.followingLatest;
    const offset = getRestoredScrollTop(feedSession, el.scrollHeight, el.clientHeight, scrollDirection);
    if (saved) beginProgrammaticScroll(shouldFollow ? "latest" : "target");
    rowVirtualizer.scrollToOffset(offset, { behavior: "auto" });
    const atLatest = isFollowingLatest(scrollDirection, el.scrollTop, el.scrollHeight, el.clientHeight);
    followRef.current = shouldFollow && atLatest;
    captureFeedScrollSession(feedSession, { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight, unreadCount: unreadCountRef.current, visibleCount: visibleCountRef.current, direction: scrollDirection });
    feedSession.followingLatest = followRef.current;
  }, [beginProgrammaticScroll, feedSession, isCompatibleList, rowVirtualizer, scrollDirection]);

  // 顶部前插与后续实测共用同一个稳定事件；直到用户滚动或重新定位才更换锚点。
  useLayoutEffect(() => {
    if (isCompatibleList || queryRestoreCancelRef.current) return;
    const pendingAnchor = readingAnchorRef.current;
    const el = scrollRef.current;
    const prependSettling = topPrependSettlingRef.current;
    const isPrependSettling = prependSettling?.viewKey === viewKey
      && prependSettling.visibleCount === visibleIndices.length;
    if (
      pendingAnchor
      && el
      && pendingAnchor.viewKey === viewKey
      && (scrollDirection === "top" || layoutSnapshotRef.current?.readingAnchor !== undefined)
      && !followRef.current
      && (scrollDirection === "bottom" || !layoutSnapshotRef.current)
      && !contextLocatingRef.current
      && shouldAdjustTopAppendAnchor({
        visibleCount: visibleIndices.length,
        anchorVisibleCount: pendingAnchor.visibleCount,
        scrollHeightChanged: el.scrollHeight !== pendingAnchor.scrollHeight,
        prependSettling: isPrependSettling,
        measurementChanged: el.scrollHeight !== pendingAnchor.scrollHeight,
      })
    ) {
      const anchorIndex = orderedVisibleIndices.findIndex((eventIndex) => {
        const event = events[eventIndex];
        return event ? getEventRowKey(event) === pendingAnchor.eventKey : false;
      });
      const anchorStart = anchorIndex >= 0
        ? getFeedMeasurementStart(rowVirtualizer, anchorIndex)
        : undefined;
      const targetScrollTop = anchorStart === undefined
        ? getTopAppendScrollTop({
          scrollTop: pendingAnchor.scrollTop,
          previousScrollHeight: pendingAnchor.scrollHeight,
          nextScrollHeight: el.scrollHeight,
          clientHeight: el.clientHeight,
          followingLatest: false,
        })
        : getFeedAnchorScrollTop({ anchorStart, anchorOffset: pendingAnchor.offset,
          paddingTop: parseFloat(getComputedStyle(el).paddingTop) || 0,
          scrollHeight: el.scrollHeight, clientHeight: el.clientHeight });
      if (Math.abs(targetScrollTop - el.scrollTop) > 0.5) {
        beginProgrammaticScroll("target");
        rowVirtualizer.scrollToOffset(targetScrollTop, { behavior: "auto" });
      }
      pendingAnchor.scrollTop = targetScrollTop;
      pendingAnchor.scrollHeight = el.scrollHeight;
      pendingAnchor.visibleCount = visibleIndices.length;
      feedSession.scrollTop = targetScrollTop;
      feedSession.followingLatest = false;
    }
    if (isPrependSettling) topPrependSettlingRef.current = null;
    if (followRef.current || pendingAnchor?.viewKey !== viewKey) {
      readingAnchorRef.current = null;
    }
    if (!readingAnchorRef.current && !contextLocatingRef.current && !programmaticScrollRef.current) {
      readingAnchorRef.current = captureReadingAnchor();
    }
    if (!followRef.current && readingAnchorRef.current) {
      feedSession.anchorId = readingAnchorRef.current.eventKey;
      feedSession.anchorOffset = readingAnchorRef.current.offset;
    }
  }, [beginProgrammaticScroll, captureReadingAnchor, events, feedSession, isCompatibleList, orderedVisibleIndices, rowVirtualizer, scrollDirection, viewKey, visibleIndices.length, virtualItems, virtualizerTotalSize]);

  useLayoutEffect(() => {
    if (isCompatibleList || queryRestoreCancelRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const paddingTop = parseFloat(getComputedStyle(el).paddingTop);
    const previous = scrollPaddingTopRef.current;
    scrollPaddingTopRef.current = paddingTop;
    if (previous === null || previous === paddingTop || followRef.current || contextLocatingRef.current) return;
    if (scrollDirection === "top" && readingAnchorRef.current) return;
    el.scrollTop += paddingTop - previous;
    feedSession.scrollTop = el.scrollTop;
  });

  useEffect(() => {
    return () => {
      queryRestoreCancelRef.current?.();
      queryRestoreCancelRef.current = null;
      if (programmaticScrollReleaseRafRef.current !== null) {
        cancelAnimationFrame(programmaticScrollReleaseRafRef.current);
        programmaticScrollReleaseRafRef.current = null;
      }
      programmaticScrollRef.current = null;
    };
  }, []);

  // 窗口或分区尺寸变化时，虚拟列表会重测行高并回写 scrollTop。
  // 在这段重排窗口内先保留原来的阅读意图，避免把内部滚动误判成用户上翻。
  const markLayoutChange = useCallback(() => {
    if (isCompatibleList || queryRestoreCancelRef.current) return;
    if (contextLocatingRef.current) return;
    const el = scrollRef.current;
    if (!el) return;

    if (scrollDirection === "top" && !followRef.current && readingAnchorRef.current) {
      layoutSizeRef.current = { width: el.clientWidth, height: el.clientHeight };
      rowVirtualizer.measure();
      return;
    }

    if (!layoutSnapshotRef.current) {
      layoutSnapshotRef.current = captureFeedLayoutSnapshot({
        scrollTop: feedSession.scrollTop,
        followingLatest: followRef.current,
        readingAnchor: !followRef.current && readingAnchorRef.current
          ? { eventKey: readingAnchorRef.current.eventKey, offset: readingAnchorRef.current.offset } : undefined,
      });
    }
    layoutSizeRef.current = { width: el.clientWidth, height: el.clientHeight };
    const generation = ++layoutGenerationRef.current;

    if (layoutRafRef.current !== null) cancelAnimationFrame(layoutRafRef.current);
    if (layoutReleaseRafRef.current !== null) cancelAnimationFrame(layoutReleaseRafRef.current);

    layoutRafRef.current = requestAnimationFrame(() => {
      layoutRafRef.current = requestAnimationFrame(() => {
        const snapshot = layoutSnapshotRef.current;
        const current = scrollRef.current;
        if (!snapshot || !current || generation !== layoutGenerationRef.current || contextLocatingRef.current || queryRestoreCancelRef.current) return;

        const rows = locationRowsRef.current;
        const anchorIndex = snapshot.readingAnchor ? rows.orderedVisibleIndices.findIndex(index =>
          getEventRowKey(rows.events[index]) === snapshot.readingAnchor?.eventKey) : -1;
        const anchorStart = anchorIndex >= 0 ? getFeedMeasurementStart(rowVirtualizer, anchorIndex) : undefined;
        const restored = restoreFeedLayoutSnapshot(snapshot, current.scrollHeight, current.clientHeight, scrollDirection,
          anchorStart === undefined ? undefined : { start: anchorStart, paddingTop: parseFloat(getComputedStyle(current).paddingTop) || 0 });
        followRef.current = restored.followingLatest;
        feedSession.scrollTop = restored.scrollTop;
        feedSession.followingLatest = restored.followingLatest;

        if (restored.followingLatest && visibleCountRef.current > 0) {
          setUnread(0);
          rowVirtualizer.scrollToIndex(
            scrollDirection === "top" ? 0 : visibleCountRef.current - 1,
            { align: scrollDirection === "top" ? "start" : "end", behavior: "auto" },
          );
        } else {
          rowVirtualizer.scrollToOffset(restored.scrollTop, { behavior: "auto" });
        }

        // 给虚拟列表的最后一次内部 scroll 回写留出一个帧，再恢复用户滚动事件处理。
        layoutReleaseRafRef.current = requestAnimationFrame(() => {
          layoutReleaseRafRef.current = requestAnimationFrame(() => {
            if (generation === layoutGenerationRef.current) layoutSnapshotRef.current = null;
          });
        });
      });
    });
  }, [feedSession, isCompatibleList, rowVirtualizer, scrollDirection, setUnread]);

  useEffect(() => {
    if (scrollDirection === "bottom" && !followRef.current && readingAnchorRef.current) markLayoutChange();
    rowVirtualizer.measure();
  }, [eventSpacing, eventPadding, contentScale, contentAlignment, rowVirtualizer, markLayoutChange, scrollDirection]);

  useEffect(() => {
    if (!followRef.current && readingAnchorRef.current) {
      if (scrollDirection === "bottom") markLayoutChange();
      rowVirtualizer.measure();
    }
  }, [scrollDirection, eventFontSize, eventStyleSettings, contentScale, rowVirtualizer, markLayoutChange]);

  // 同时监听窗口尺寸和事件容器尺寸：前者覆盖最大化/还原，后者覆盖拖动分隔条和宽度重排。
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    layoutSizeRef.current = { width: el.clientWidth, height: el.clientHeight };

    const observer = new ResizeObserver(markLayoutChange);
    observer.observe(el);
    window.addEventListener("resize", markLayoutChange);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", markLayoutChange);
      if (layoutRafRef.current !== null) cancelAnimationFrame(layoutRafRef.current);
      if (layoutReleaseRafRef.current !== null) cancelAnimationFrame(layoutReleaseRafRef.current);
      layoutRafRef.current = null;
      layoutReleaseRafRef.current = null;
      layoutSnapshotRef.current = null;
    };
  }, [markLayoutChange]);

  // 首次挂载、方向变化或区域重新挂载时，恢复该直播间/区域上次的位置。
  // 两帧等待虚拟列表完成测量，避免把尚未计算好的高度当成顶部。
  useEffect(() => {
    let frame1 = 0;
    let frame2 = 0;
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(restoreScrollPosition);
    });
    return () => {
      cancelAnimationFrame(frame1);
      if (frame2) cancelAnimationFrame(frame2);
    };
  }, [feedKey, restoreScrollPosition]);

  // 追加事件时只在用户仍贴底时跟随；离开底部后累计未读数量，不抢夺阅读位置。
  // 视图筛选变化只恢复原位置，不把它当成新消息，也不强制跳到列表底部。
  useEffect(() => {
    const viewChanged = previousViewKeyRef.current !== viewKey;
    const viewSnapshot = viewSnapshotRef.current?.viewKey === viewKey ? viewSnapshotRef.current : null;
    const previousCount = previousCountRef.current;
    previousViewKeyRef.current = viewKey;
    previousCountRef.current = visibleIndices.length;
    viewSnapshotRef.current = null;
    feedSession.visibleCount = visibleIndices.length;

    if (viewChanged) {
      if (contextLocatingRef.current) return;
      const el = scrollRef.current;
      if (viewSnapshot) {
        followRef.current = viewSnapshot.followingLatest;
        feedSession.scrollTop = viewSnapshot.scrollTop;
        feedSession.followingLatest = viewSnapshot.followingLatest;
      } else if (el) {
        feedSession.scrollTop = el.scrollTop;
        feedSession.followingLatest = followRef.current;
      }
      let frame1 = 0;
      let frame2 = 0;
      frame1 = requestAnimationFrame(() => {
        frame2 = requestAnimationFrame(restoreScrollPosition);
      });
      return () => {
        cancelAnimationFrame(frame1);
        if (frame2) cancelAnimationFrame(frame2);
      };
    }

    if (visibleIndices.length > previousCount) {
      if (scrollDirection === "top" && !followRef.current) {
        topPrependSettlingRef.current = { viewKey, visibleCount: visibleIndices.length };
      }
      if (!isCompatibleList && followRef.current && scrollDirection === "top") {
        beginProgrammaticScroll("latest");
        setUnread(0);
        rowVirtualizer.scrollToIndex(0, { align: "start", behavior: "auto" });
      }
      setUnread((count) => updateUnreadCount(
        count,
        previousCount,
        visibleIndices.length,
        false,
        followRef.current,
      ));
    }
  }, [beginProgrammaticScroll, feedSession, isCompatibleList, restoreScrollPosition, rowVirtualizer, scrollDirection, setUnread, viewKey, visibleIndices.length]);

  // 退出文本/用户筛选后，在原分类的信息流中回到刚才选中的事件。
  useEffect(() => {
    const contextTargetKey = eventMenuHandlers?.contextTargetKey;
    const contextTargetRegionKey = eventMenuHandlers?.contextTargetRegionKey;
    if (!liveLayout || !contextTargetKey || contextTargetRegionKey !== feedKey) return;
    if (compatibleListSurface) {
      followRef.current = false;
      feedSession.followingLatest = false;
      sourceControlRef.current?.locate(contextTargetKey);
      if (locatedHighlightTimerRef.current !== null) clearTimeout(locatedHighlightTimerRef.current);
      setLocatedMarkKey(contextTargetKey);
      locatedHighlightTimerRef.current = setTimeout(() => { locatedHighlightTimerRef.current = null; setLocatedMarkKey(current => current === contextTargetKey ? null : current); }, 1400);
      eventMenuHandlers.onContextTargetConsumed?.(feedKey, contextTargetKey);
      return;
    }
    followRef.current = false;
    feedSession.followingLatest = false;
    if (locatedHighlightFrameRef.current !== null) cancelAnimationFrame(locatedHighlightFrameRef.current);
    if (locatedHighlightTimerRef.current !== null) clearTimeout(locatedHighlightTimerRef.current);
    setLocatedMarkKey(null);

    topPrependSettlingRef.current = null;
    readingAnchorRef.current = null;
    layoutSnapshotRef.current = null;
    programmaticScrollRef.current = "target";
    const finish = () => {
      contextLocatingRef.current = false;
      programmaticScrollRef.current = null;
      const el = scrollRef.current;
      if (el) feedSession.scrollTop = el.scrollTop;
      feedSession.followingLatest = false;
      readingAnchorRef.current = captureReadingAnchor();
      eventMenuHandlers.onContextTargetConsumed?.(feedKey, contextTargetKey);
    };
    const cancel = locateLiveEvent({
      getIndex: () => {
        const current = locationRowsRef.current;
        return current.orderedVisibleIndices.findIndex((index) => getEventRowKey(current.events[index]) === contextTargetKey);
      },
      scrollToIndex: (index) => rowVirtualizer.scrollToIndex(index, { align: "center", behavior: "auto" }),
      getPosition: () => {
        const el = scrollRef.current;
        if (!el) return null;
        const row = Array.from(el.querySelectorAll<HTMLElement>("[data-event-id]")).find((node) => node.dataset.eventId === contextTargetKey);
        if (!row) return null;
        const rowBounds = row.getBoundingClientRect();
        const viewport = el.getBoundingClientRect();
        const centered = el.scrollTop + rowBounds.top - viewport.top - el.clientTop - (el.clientHeight - rowBounds.height) / 2;
        return { current: el.scrollTop, target: Math.max(0, Math.min(el.scrollHeight - el.clientHeight, centered)) };
      },
      scrollToOffset: (offset) => rowVirtualizer.scrollToOffset(offset, { behavior: "auto" }),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (frame) => cancelAnimationFrame(frame),
      onMissing: finish,
      onLocated: () => {
        setLocatedMarkKey(contextTargetKey);
        locatedHighlightTimerRef.current = setTimeout(() => {
          locatedHighlightTimerRef.current = null;
          setLocatedMarkKey((current) => current === contextTargetKey ? null : current);
        }, 1400);
        finish();
      },
    });
    return cancel;
  }, [beginProgrammaticScroll, captureReadingAnchor, compatibleListSurface, eventMenuHandlers?.contextTargetKey, eventMenuHandlers?.contextTargetRegionKey, eventMenuHandlers?.onContextTargetConsumed, feedKey, feedSession, liveLayout, rowVirtualizer]);

  // 区域被切换、隐藏或布局切换导致卸载时，保存真实滚动位置。
  useEffect(() => {
    return () => {
      if (compatibleListSurface) return;
      const el = scrollRef.current;
      if (!el) return;
      const viewportTop = el.getBoundingClientRect().top + el.clientTop;
      const anchor = !followRef.current ? Array.from(el.querySelectorAll<HTMLElement>(".event-row-slot[data-event-id]"))
        .find(row => row.getBoundingClientRect().bottom > viewportTop) : undefined;
      if (anchor?.dataset.eventId) {
        feedSession.anchorId = anchor.dataset.eventId;
        feedSession.anchorOffset = anchor.getBoundingClientRect().top - viewportTop;
      }
      captureFeedScrollSession(feedSession, {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        unreadCount: unreadCountRef.current,
        visibleCount: visibleCountRef.current,
        direction: scrollDirection,
      });
      feedSession.followingLatest = followRef.current;
    };
  }, [compatibleListSurface, feedSession, scrollDirection]);

  // 让状态对象和 React 状态保持一致，供卸载和再次挂载时恢复。
  useEffect(() => {
    unreadCountRef.current = unreadCount;
    feedSession.unreadCount = unreadCount;
  }, [feedSession, unreadCount]);

  // UI 渲染日志：观察行新增与行内变更（连击合并、图片降级换 src 等）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    return observeRenderedEventRows(el, { windowLabel: "main", region: feedKey });
  }, [feedKey]);

  const onScroll = () => {
    if (compatibleListSurface) return;
    const el = scrollRef.current;
    if (!el) return;
    if (liveLayout && visibleIndices.length && !el.querySelector(".event-row-slot[data-event-id]")) return;

    const nextSize = { width: el.clientWidth, height: el.clientHeight };
    const previousSize = layoutSizeRef.current;
    const sizeChanged = previousSize !== null
      && (previousSize.width !== nextSize.width || previousSize.height !== nextSize.height);
    layoutSizeRef.current = nextSize;
    // ResizeObserver 与虚拟列表的内部回写顺序由浏览器决定；这里再用实际尺寸变化兜底，
    // 确保最早到达的 scroll 事件也不会覆盖 resize 前的状态快照。
    if (sizeChanged && !layoutSnapshotRef.current) markLayoutChange();
    if (layoutSnapshotRef.current) return;

    const programmaticIntent = programmaticScrollRef.current;
    if (programmaticIntent) {
      const followingLatest = programmaticIntent === "latest";
      followRef.current = followingLatest;
      feedSession.scrollTop = el.scrollTop;
      feedSession.followingLatest = followingLatest;
      feedSession.visibleCount = visibleIndices.length;
      if (followingLatest) setUnread(0);
      return;
    }

    const atLatest = isFollowingLatest(scrollDirection, el.scrollTop, el.scrollHeight, el.clientHeight);
    followRef.current = atLatest;
    feedSession.scrollTop = el.scrollTop;
    feedSession.followingLatest = atLatest;
    feedSession.visibleCount = visibleIndices.length;
    if (atLatest) setUnread(0);
    readingAnchorRef.current = atLatest ? null : captureReadingAnchor();
    if (atLatest || readingAnchorRef.current) {
      feedSession.anchorId = readingAnchorRef.current?.eventKey;
      feedSession.anchorOffset = readingAnchorRef.current?.offset;
    }
  };

  const scrollToLatest = () => {
    readingAnchorRef.current = null;
    beginProgrammaticScroll("latest");
    followRef.current = true;
    feedSession.followingLatest = true;
    if (compatibleListSurface) {
      sourceControlRef.current?.scrollToLatest();
      return;
    }
    setUnread(0);
    if (visibleIndices.length > 0) {
      rowVirtualizer.scrollToIndex(
        scrollDirection === "top" ? 0 : visibleIndices.length - 1,
        { align: scrollDirection === "top" ? "start" : "end", behavior: "auto" },
      );
    }
  };

  const dispatchCompatibleAction = (event: DanmakuEvent, eventId: string, action: CompatibleLiveAction): boolean => {
    if (getEventRowKey(event) !== eventId) return false;
    return dispatchCompatibleLiveAction(event, action, {
      onFilterUser: onUserFilter,
      onLocate: eventMenuHandlers?.onViewContext ? value => eventMenuHandlers.onViewContext?.(value, feedKey) : undefined,
      onFavorite: eventMenuHandlers ? value => runEventFavoriteAction(value, { ...eventMenuHandlers, regionKey: feedKey }) : undefined,
      onOpenUser: eventMenuHandlers?.onOpenUser,
      onGiftEffect: onPlayGiftEffect,
      onCopy: value => {
        const text = buildEventContentText(value);
        if (text && navigator.clipboard?.writeText) void navigator.clipboard.writeText(text).catch(() => {});
      },
      onOpenLink: (_value, href) => { void openUrl(href).catch(() => {}); },
    });
  };

  const compatibleSurface = compatibleRendererSurface(compatibleEventRender);
  const compatibleListEvents = orderedVisibleIndices.map(index => events[index]).filter(Boolean);
  const renderCompatibleFallback = (ev: DanmakuEvent) => <EventRowSlot className="event-row-slot" data-event-id={getEventRowKey(ev)}>
    <EventRow animateOnMount={false} ev={ev} liveLayout={liveLayout} reviewLayout={!liveLayout} allowWinnerExpansion={liveLayout} showTime={!liveLayout || (eventStyleSettings as EventStyleSettings & { display?: { showTimestamp?: boolean } }).display?.showTimestamp === true} onUserFilter={onUserFilter} displayPreferences={displayPreferences} eventStyleSettings={eventStyleSettings} eventFontSize={eventFontSize} enableBilibiliVideoLinks={enableBilibiliVideoLinks} eventAreaRef={eventAreaRef} locatedHighlight={locatedMarkKey === getEventRowKey(ev)} eventMenu={rowEventMenu} giftEffectResolver={giftEffectResolver} onPlayGiftEffect={onPlayGiftEffect} />
  </EventRowSlot>;
  const eventListContent = <>
        {compatibleListSurface && <BlivechatSourceSurface roomGuardProfile={roomGuardProfile} ref={sourceControlRef} descriptor={compatibleListSurface} events={compatibleListEvents} viewKey={viewKey} scale={contentScale} renderMode="dashboard" onRowHover={eventMenuHandlers ? setSourceHover : undefined} locatedEventId={locatedMarkKey} onLocatedRow={setSourceLocated} tickerEnabled={false} stickyItems={[]} animation={{ preset: displayPreferences?.eventAnimationPreset ?? "none", durationMs: getEventAnimationExitDuration(displayPreferences?.eventAnimationPreset ?? "none", displayPreferences?.eventAnimationDurationMs ?? 0) }} direction={scrollDirection} contentAlignment={liveLayout ? contentAlignment : "top"} fallbackRenderer={renderCompatibleFallback} fallbackStyle={{ scope: areaStyle.scope, css: areaStyle.css }} enableBilibiliVideoLinks={enableBilibiliVideoLinks} initialScrollState={{ followingLatest: feedSession.followingLatest, scrollTop: feedSession.scrollTop, anchorId: feedSession.anchorId, anchorOffset: feedSession.anchorOffset }} onPointerDown={() => { setSourceMenu(null); setSourceDismissRevision(value => value + 1); }} onScrollState={state => {
          followRef.current = state.followingLatest;
          feedSession.followingLatest = state.followingLatest;
          feedSession.scrollTop = state.scrollTop;
          if (state.anchorId || state.followingLatest) {
            feedSession.anchorId = state.anchorId;
            feedSession.anchorOffset = state.anchorOffset;
          }
          if (state.followingLatest) { readingAnchorRef.current = null; setUnread(0); }
        }} onContextMenu={request => setSourceMenu(current => ({ ...request, revision: (current?.revision ?? 0) + 1 }))} dispatch={(eventId, action) => {
          const event = compatibleListEvents.find(value => getEventRowKey(value) === eventId);
          return event ? dispatchCompatibleAction(event, eventId, action) : false;
        }} />}
        {!compatibleListSurface && visibleIndices.length > 0 && (
          <>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative",
              }}
            >
              {virtualItems.map((virtualRow) => {
                const ev = events[orderedVisibleIndices[virtualRow.index]];
                if (!ev) return null;
                const animationDuration = displayPreferences ? getEventAnimationDuration(displayPreferences.eventAnimationPreset, displayPreferences.eventAnimationDurationMs) : undefined;
                const animationExitDuration = displayPreferences ? getEventAnimationExitDuration(displayPreferences.eventAnimationPreset, displayPreferences.eventAnimationDurationMs) : undefined;
                return <EventRowSlot key={virtualRow.key} className="event-row-slot" data-index={virtualRow.index} data-event-id={getEventRowKey(ev)} data-event-msg-type={ev.msgType} data-event-room-id={ev.roomId} data-event-style-type={getEventStyleType(ev.msgType, ev.guard?.level ?? ev.user?.guardLevel)} data-event-animation-preset={displayPreferences?.eventAnimationPreset} data-event-animation-duration={animationDuration} data-event-animation-exit-duration={animationExitDuration} data-event-padding={displayPreferences?.eventPadding} data-event-font-family={eventStyleSettings?.fontFamily} ref={rowVirtualizer.measureElement} style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualRow.start}px)` }} showEventSpacing={virtualRow.index < orderedVisibleIndices.length - 1} contentScale={contentScale}>
                  <CompatibleEventRenderer event={ev} render={compatibleEventRender} dispatch={(eventId, action) => dispatchCompatibleAction(ev, eventId, action)} menu={liveLayout && eventMenuHandlers ? <EventContextMenu event={ev} nickname={ev.user ? userNicknames[ev.user.uid] : undefined} eventFontSize={eventFontSize} shortcutActions={shortcutActions} eventAreaRef={eventAreaRef} handlers={{ ...eventMenuHandlers, regionKey: feedKey, onPlayGiftEffect }} /> : undefined} locatedHighlight={locatedMarkKey === getEventRowKey(ev)} enableBilibiliVideoLinks={enableBilibiliVideoLinks} fallback={<EventRow ev={ev} liveLayout={liveLayout} reviewLayout={!liveLayout} allowWinnerExpansion={liveLayout} showTime={!liveLayout || (eventStyleSettings as EventStyleSettings & { display?: { showTimestamp?: boolean } }).display?.showTimestamp === true} onUserFilter={onUserFilter} displayPreferences={displayPreferences} eventStyleSettings={eventStyleSettings} eventFontSize={eventFontSize} enableBilibiliVideoLinks={enableBilibiliVideoLinks} eventAreaRef={eventAreaRef} locatedHighlight={locatedMarkKey === getEventRowKey(ev)} eventMenu={rowEventMenu} giftEffectResolver={giftEffectResolver} onPlayGiftEffect={onPlayGiftEffect} />} />
                </EventRowSlot>;
              })}
            </div>
          </>
        )}
        {visibleIndices.length === 0 && <div className={`flex h-full min-h-24 items-center justify-center px-4 ui-type-control text-t3 ${compatibleListSurface ? "absolute inset-0 pointer-events-none" : ""}`}>{emptyLabel}</div>}
  </>;

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        data-style-api="1"
        data-event-style-scope={areaStyle.scope}
        className={`event-area ${liveLayout ? "theme-surface theme-target-live live" : "review"} h-full overflow-y-auto overflow-x-hidden ${liveLayout ? "scene-live-list" : ""}`}
        data-native-runtime-target={liveLayout ? "live" : undefined}
        data-blivechat-scope={compatibleSurface?.scopeId}
        style={compatibleSurface?.surfaceStyle}
      >
        {areaStyle.style}
        <div className={`event-list ${compatibleListSurface ? "h-full" : `feed-virtual-viewport feed-virtual-viewport-${getFeedStackAlignment(scrollDirection, liveLayout ? contentAlignment : undefined)}`}`}>
        {eventListContent}
        </div>
        {sourceLocated && locatedMarkKey === sourceLocated.eventId && <div className="pointer-events-none event-row-located-indicator" style={{ position: "fixed", left: sourceLocated.left, top: sourceLocated.top, width: sourceLocated.width, height: sourceLocated.height, zIndex: 15 }} />}
        {eventMenuHandlers && (() => {
          const eventId = sourceMenu?.eventId ?? sourceMenuEventId ?? sourceHover?.eventId;
          const event = compatibleListEvents.find(value => getEventRowKey(value) === eventId);
          if (!event) return null;
          const bounds = sourceHover?.eventId === eventId ? sourceHover : null;
          return <div key={eventId} className="event-row-with-menu" data-source-hovered={bounds ? "true" : undefined} style={{ position: "fixed", left: bounds?.left ?? sourceMenu?.x ?? 0, top: bounds?.top ?? sourceMenu?.y ?? 0, width: bounds?.width ?? 0, height: bounds?.height ?? 0, ...(bounds?.actionsRightInset ? { "--event-menu-right-inset": `${bounds.actionsRightInset}px` } : {}), pointerEvents: "none", zIndex: 20 }}>
            <EventContextMenu event={event} nickname={event.user ? userNicknames[event.user.uid] : undefined} eventFontSize={eventFontSize} scope={liveLayout ? "live" : "review"} shortcutActions={shortcutActions} eventAreaRef={eventAreaRef} handlers={{ ...eventMenuHandlers, regionKey: feedKey, onPlayGiftEffect }} dismissRevision={sourceDismissRevision} onInteractionChange={active => { setSourceMenuEventId(active ? eventId! : null); if (!active) setSourceMenu(null); }} remoteOpenRequest={sourceMenu ? { revision: sourceMenu.revision, left: sourceMenu.x, top: sourceMenu.y } : undefined} />
          </div>;
        })()}
      </div>
      {(unreadCount > 0 || markedIndex >= 0) && (
        <div className={`pointer-events-none absolute inset-x-0 ${latestEdgeClass} z-20 flex justify-center px-3`}>
          <div className="flex flex-col items-center gap-2">
            {markedIndex >= 0 && (
              <button
                type="button"
                onClick={() => {
                  if (!markedEvent) return;
                  topPrependSettlingRef.current = null;
                  readingAnchorRef.current = null;
                  beginProgrammaticScroll("target");
                  followRef.current = false;
                  feedSession.followingLatest = false;
                  const rowKey = getEventRowKey(markedEvent);
                  if (locatedHighlightFrameRef.current !== null) cancelAnimationFrame(locatedHighlightFrameRef.current);
                  if (locatedHighlightTimerRef.current !== null) clearTimeout(locatedHighlightTimerRef.current);
                  setLocatedMarkKey(null);
                  if (compatibleListSurface) sourceControlRef.current?.locate(rowKey);
                  else rowVirtualizer.scrollToIndex(markedIndex, { align: "center", behavior: "auto" });
                  locatedHighlightFrameRef.current = requestAnimationFrame(() => {
                    locatedHighlightFrameRef.current = null;
                    setLocatedMarkKey(rowKey);
                    locatedHighlightTimerRef.current = setTimeout(() => {
                      locatedHighlightTimerRef.current = null;
                      setLocatedMarkKey((current) => current === rowKey ? null : current);
                    }, 1400);
                  });
                }}
                className="pointer-events-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent/60 bg-surface px-3.5 py-1.5 ui-type-control font-semibold text-accent-text shadow-lg ring-1 ring-black/5 transition-colors hover:border-accent hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                aria-label={uiText("eventList.aria_label")}
              >
                <span aria-hidden="true" className="inline-flex h-4 items-center text-sm leading-none">⌖</span>
                <span className="inline-flex h-4 items-center ui-type-control">{uiText("eventList.EventList2")}</span>
              </button>
            )}
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={scrollToLatest}
                className="pointer-events-auto inline-flex min-h-8 items-center gap-1.5 rounded-full border border-accent/60 bg-surface px-3.5 py-1.5 ui-type-control font-semibold text-accent-text shadow-lg ring-1 ring-black/5 transition-colors hover:border-accent hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                aria-label={uiText("eventList.aria_label2")}
              >
                <span aria-hidden="true" className="inline-flex h-4 items-center text-sm leading-none">{latestArrow}</span>
                <span className="inline-flex h-4 items-center ui-type-control">{uiText("eventList.EventList3")}</span>
                <span className="inline-flex h-4 items-center rounded-full bg-accent-subtle px-1.5 ui-type-micro">
                  {unreadCount >= 999 ? "999+" : unreadCount} {uiText("eventList.EventList4")}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
