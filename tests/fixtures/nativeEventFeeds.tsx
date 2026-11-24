import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { EventList } from "../../src/components/EventList";
import { ReviewSessionTimeline } from "../../src/components/ReviewSessionTimeline";
import { createFeedScrollSession, type LiveScrollDirection } from "../../src/events/feedScroll";
import { getEventBookmarkKey, getEventMarkKey } from "../../src/events/eventIdentity";
import { createReviewReadingMemoryStore } from "../../src/archive/reviewReadingMemory";
import type { ArchiveFilterState, ArchiveRepositoryContract, ArchiveSortDirection } from "../../src/archive/archiveTypes";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../../src/eventDisplaySettings";
import { createFixtureEvent, createNativeEventRepository, FIXTURE_OWNER, FIXTURE_SESSION, FIXTURE_TARGET_A, FIXTURE_TARGET_B } from "./nativeEventRepository";

function ScrollControls({ root }: { root: RefObject<HTMLDivElement | null> }) {
  const scroll = (bottom: boolean, distance = 0) => {
    const area = root.current?.querySelector<HTMLElement>(".event-area");
    if (!area) return;
    area.dispatchEvent(new WheelEvent("wheel", { deltaY: bottom ? 1 : -1, bubbles: true }));
    requestAnimationFrame(() => area.scrollTo({ top: bottom ? Math.max(0, area.scrollHeight - area.clientHeight - distance) : 0, behavior: "instant" }));
  };
  return <><button onClick={() => scroll(false)}>滚到列表顶部</button><button onClick={() => scroll(true)}>滚到列表底部</button>
    <button onClick={() => scroll(true, 120)}>距列表底部120px</button></>;
}

function useGeometry(root: RefObject<HTMLDivElement | null>) {
  const [geometry, setGeometry] = useState("等待测量");
  const read = useCallback(() => {
    const area = root.current?.querySelector<HTMLElement>(".event-area");
    if (!area) return;
    const rect = area.getBoundingClientRect();
    setGeometry(JSON.stringify({ scrollTop: area.scrollTop, scrollHeight: area.scrollHeight, clientHeight: area.clientHeight,
      rows: [...area.querySelectorAll<HTMLElement>(".event-row-slot")].map(row => ({ id: row.dataset.eventId, key: row.dataset.eventKey,
        y: row.getBoundingClientRect().top - rect.top, height: row.getBoundingClientRect().height,
        spacer: parseFloat(getComputedStyle(row.querySelector(".event-row-slot-content")).paddingBottom) || 0 })),
      boundaries: [...area.querySelectorAll<HTMLElement>("[data-review-session-boundary]")].map(node => node.dataset.reviewSessionBoundary) }));
  }, [root]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(read); };
    const mutation = new MutationObserver(schedule);
    mutation.observe(node, { childList: true, subtree: true, attributes: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(node);
    node.addEventListener("scroll", schedule, true);
    node.addEventListener("load", schedule, true);
    schedule();
    return () => { mutation.disconnect(); resize.disconnect(); cancelAnimationFrame(frame); node.removeEventListener("scroll", schedule, true); node.removeEventListener("load", schedule, true); };
  }, [root, read]);
  return { geometry, read };
}

function useFeedControls(append: (count: number) => void) {
  const [playing, setPlaying] = useState(false);
  const [spacing, setSpacing] = useState(0);
  const [media, setMedia] = useState(40);
  const [narrow, setNarrow] = useState(false);
  const [animation, setAnimation] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => append(1), 600);
    return () => clearInterval(timer);
  }, [playing, append]);
  return { playing, spacing, media, narrow, animation, buttons: <>
    <button onClick={() => append(1)}>追加一条</button><button onClick={() => append(10)}>追加十条</button>
    <button onClick={() => setPlaying(value => !value)}>{playing ? "暂停追加" : "持续追加"}</button>
    <button onClick={() => setSpacing(0)}>间距0</button><button onClick={() => setSpacing(8)}>间距8</button>
    <button onClick={() => setMedia(20)}>小媒体20</button><button onClick={() => setMedia(80)}>大媒体80</button>
    <button onClick={() => setNarrow(value => !value)}>{narrow ? "宽区域" : "窄区域240"}</button>
    <button onClick={() => setAnimation(value => !value)}>{animation ? "关闭动画" : "开启动画"}</button>
  </> };
}

export function NativeEventLive({ lotteryScene = false }: { lotteryScene?: boolean | 'pocket' }) {
  const [events, setEvents] = useState(() => Array.from({ length: 720 }, (_, index) => createFixtureEvent(index, FIXTURE_SESSION, lotteryScene)));
  const [session] = useState(() => createFeedScrollSession(720));
  const [direction, setDirection] = useState<LiveScrollDirection>("bottom");
  const [uid, setUid] = useState("");
  const [keyword, setKeyword] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [mark, setMark] = useState<string | null>(null);
  const [target, setTarget] = useState<string | undefined>();
  const [lastAction, setLastAction] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const { geometry, read } = useGeometry(root);
  const append = useCallback((count: number) => setEvents(current => [...current, ...Array.from({ length: count }, (_, index) => createFixtureEvent(current.length + index))]), []);
  const control = useFeedControls(append);
  const visible = events.flatMap((event, index) => (!uid || event.user?.uid === uid) && (!keyword || event.text?.includes(keyword)) ? [index] : []);
  return <section data-live-fixture>
    <h2>现场</h2><p>720 条完整合成事件；目标 A/B 同用户、不同事件。收藏和标记仅保存在本页内存。</p>
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setDirection("top")} aria-pressed={direction === "top"}>顶部追加</button><button onClick={() => setDirection("bottom")} aria-pressed={direction === "bottom"}>底部追加</button>
      <button onClick={() => setUid("fixture-same-user")}>筛选目标用户</button><button onClick={() => { setUid(""); setKeyword(""); }}>清除筛选</button>
      {lotteryScene && <button onClick={() => { setUid(''); setKeyword(''); setTarget(FIXTURE_TARGET_A); }}>定位中奖名单</button>}
      <label>关键词<input aria-label="现场关键词" value={keyword} onChange={event => setKeyword(event.target.value)} /></label>
      {control.buttons}<ScrollControls root={root} /><button onClick={read}>读取测量</button>
    </div>
    <output data-live-fixture-state>{JSON.stringify({ count: events.length, visibleCount: visible.length, direction, uid, keyword, favorites: [...favorites], mark, target, lastAction, playing: control.playing, spacing: control.spacing, media: control.media, session })}</output>
    <div ref={root} style={{ height: 420, width: control.narrow ? 240 : 760, maxWidth: "100%" }}>
      <EventList events={events} visibleIndices={visible} viewKey={`fixture-live:${uid}:${keyword}`} feedKey="fixture-live" feedSession={session} liveLayout scrollDirection={direction} queryActive={Boolean(uid || keyword)}
        displayPreferences={{ ...DEFAULT_EVENT_DISPLAY_PREFERENCES, eventSpacing: control.spacing, eventAnimationPreset: control.animation ? "lift" : "none" }}
        onUserFilter={user => setUid(user.uid)}
        eventMenuHandlers={{ onSpeakEvent: event => setLastAction(`语音:${event.id}`), onUserFilter: user => setUid(user.uid), isUserFiltered: user => user.uid === uid,
          onClearUserFilter: () => setUid(""), isFavorite: event => favorites.has(getEventBookmarkKey(event)),
          onToggleFavorite: event => setFavorites(current => { const next = new Set(current); const key = getEventBookmarkKey(event); if (next.has(key)) next.delete(key); else next.add(key); return next; }),
          isMarked: (_, event) => mark === getEventMarkKey(event), onToggleMark: (_, event) => setMark(current => current === getEventMarkKey(event) ? null : getEventMarkKey(event)),
          onViewContext: uid || keyword ? event => { setUid(""); setKeyword(""); setTarget(event.reactKey ?? event.id); } : undefined,
          contextTargetKey: target, contextTargetRegionKey: "fixture-live", onContextTargetConsumed: (_, key) => { setLastAction(`已定位:${key}`); setTarget(undefined); } }} />
    </div>
    <details open><summary>实际槽位测量</summary><output data-live-fixture-geometry>{geometry}</output></details>
  </section>;
}

export function NativeEventReview({ lotteryScene = false }: { lotteryScene?: boolean | 'pocket' }) {
  const [memory] = useState(createReviewReadingMemoryStore);
  const [db] = useState(() => createNativeEventRepository(lotteryScene));
  const [, setRevision] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [direction, setDirection] = useState<ArchiveSortDirection>("desc");
  const [history, setHistory] = useState(false);
  const [filters, setFilters] = useState<ArchiveFilterState>({});
  const [target, setTarget] = useState<string | null>(null);
  const [found, setFound] = useState<boolean | null>(null);
  const [lastAction, setLastAction] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const { geometry, read } = useGeometry(root);
  useEffect(() => db.subscribe(() => setRevision(value => value + 1)), [db]);
  const append = useCallback((count: number) => { db.append(count); setRefresh(value => value + 1); }, [db]);
  const control = useFeedControls(append);
  const locate = (key: string) => { setFilters(current => ({ primaryCategories: current.primaryCategories, secondaryCategories: current.secondaryCategories, filterMode: current.filterMode })); setFound(null); setTarget(key); };
  return <section data-review-fixture>
    <h2>回看</h2><p>两场各 720 条完整合成事件，目标 A/B 在第二场首屏之外；真实时间线每页请求 320 条。</p>
    <div className="flex flex-wrap gap-2">
      <button onClick={() => setDirection("asc")} aria-pressed={direction === "asc"}>顺序排列</button><button onClick={() => setDirection("desc")} aria-pressed={direction === "desc"}>倒序排列</button>
      <button onClick={() => setHistory(value => !value)}>{history ? "单场" : "主播历史"}</button>
      <button onClick={() => setFilters(current => ({ ...current, userUid: "fixture-same-user" }))}>筛选目标用户</button>
      <button onClick={() => setFilters({})}>清除筛选</button>
      <button onClick={() => setFilters({ primaryCategories: ["danmu"], searchText: "目标" })}>弹幕关键词筛选</button>
      <button onClick={() => locate(FIXTURE_TARGET_A)}>定位目标A</button><button onClick={() => locate(FIXTURE_TARGET_B)}>定位目标B</button>
      <label>关键词<input aria-label="回看关键词" value={filters.searchText ?? ""} onChange={event => setFilters(current => ({ ...current, searchText: event.target.value }))} /></label>
      {control.buttons}<ScrollControls root={root} /><button onClick={read}>读取测量</button>
    </div>
    <output data-review-fixture-state>{JSON.stringify({ count: db.records.length, direction, history, filters, target, found, refresh,
      favorites: db.records.filter(row => row.favorited).map(row => row.eventKey), queries: db.queries.length, lastQuery: db.queries.at(-1), lastAction,
      playing: control.playing, spacing: control.spacing, media: control.media, reading: memory.get(FIXTURE_SESSION) })}</output>
    <div ref={root} style={{ height: 420, width: control.narrow ? 240 : 760, maxWidth: "100%", display: "flex", flexDirection: "column" }}>
      <ReviewSessionTimeline repository={db.repository as ArchiveRepositoryContract} readingMemory={memory} sessionId={FIXTURE_SESSION}
        ownerId={history ? FIXTURE_OWNER : undefined} searchScope={history ? "owner" : "session"} session={db.sessions[1]}
        direction={direction} onChangeSortDirection={setDirection} filters={filters} refreshKey={refresh} targetEventKey={target}
        onTargetEventConsumed={value => { setFound(value); setTarget(null); }} displayPreferences={{ ...DEFAULT_EVENT_DISPLAY_PREFERENCES, eventSpacing: control.spacing, eventAnimationPreset: control.animation ? "lift" : "none" }}
        onUserFilter={user => setFilters(current => ({ ...current, userUid: user.uid }))}
        isUserFiltered={user => user.uid === filters.userUid} onClearUserFilter={() => setFilters(current => ({ ...current, userUid: undefined }))}
        onViewContext={Object.keys(filters).some(key => filters[key as keyof ArchiveFilterState] !== undefined) ? locate : undefined}
        onToggleShowBigEmote={showBigEmote => setFilters(current => ({ ...current, showBigEmote }))}
        onSpeakEvent={event => setLastAction(`语音:${event.id}`)} onToggleFavorite={(row, favorited) => db.repository.setFavorite(row.eventKey, favorited)} />
    </div>
    <details open><summary>实际槽位测量</summary><output data-review-fixture-geometry>{geometry}</output></details>
  </section>;
}
