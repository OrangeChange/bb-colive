import { readReviewTimelineSources } from "./helpers/reviewTimelineSources.mjs";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
function read(relativePath) {
  return fs.readFileSync(new URL(relativePath, root), "utf8");
}

test("ReviewPanel 的 session 路由接通 ReviewSessionTimeline，回看不耦合当前现场筛选", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const app = readApplicationSources();
  assert.match(panel, /ReviewSessionTimeline/);
  assert.match(panel, /route\.level === "session"/);
  assert.match(panel, /sessionId=\{route\.sessionId\}/);
  assert.match(panel, /filters=\{activeQuery\.filters\}/);
  assert.match(panel, /onUserFilter/);
  assert.doesNotMatch(panel, /liveFilters/);
  assert.doesNotMatch(app, /<ReviewPanel[\s\S]*liveFilters=/);
});

test("回看用户筛选在筛选栏提供独立退出入口，并保留其他条件", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const controls = read("src/components/ReviewSearchControls.tsx");
  const shell = read("src/components/ReviewFilterShell.tsx");
  assert.match(panel, /setReviewUserFilter/);
  assert.match(panel, /activeUserFilter=/);
  assert.match(panel, /onClearUserFilter=/);
  assert.match(controls, /activeUserFilter\?:/);
  assert.match(controls, /onClearUserFilter\?:/);
  assert.match(controls, /筛选用户：/);
  assert.match(controls, />退出筛选</);
  assert.match(controls, /headerActions=/);
  assert.match(shell, /\{headerActions\}/);
  assert.match(panel, /const \{ userUid: _userUid, \.\.\.filters \} = activeQuery\.filters/);
});

test("场次页的时间线可以驱动筛选区自动收起和恢复", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const timeline = readReviewTimelineSources();
  assert.match(panel, /collapsed=\{reviewFiltersCollapsed\}/);
  assert.match(panel, /onCollapsedChange=\{setReviewFiltersCollapsedManually\}/);
  assert.match(panel, /onScrollIntent=\{handleReviewTimelineScrollIntent\}/);
  assert.match(panel, /onWheel=\{route\.level === "session" \? handleReviewSessionWheel : route\.level === "owner" && !showManagement \? handleReviewOwnerWheel : undefined\}/);
  assert.match(timeline, /onScrollIntent\?: \(intent: "up" \| "down", atTimelineTop: boolean\)/);
  assert.match(timeline, /data-review-timeline-scroll/);
  assert.match(timeline, /onWheel=\{handleTimelineWheel\}/);
});

test("时间线程序化定位和增量刷新不会被当成筛选区展开意图", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /onScroll=\{handleTimelineScroll\}/);
  assert.match(timeline, /const handleTimelineScroll = useCallback/);
  assert.match(timeline, /onWheel=\{handleTimelineWheel\}/);
});

test("回看时间线使用 Repository cursor 分页和 TanStack 虚拟窗口，不一次性加载无限历史", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /useVirtualizer/);
  assert.match(timeline, /queryEvents\(/);
  assert.match(timeline, /cursor/);
  assert.match(timeline, /nextCursor/);
  assert.match(timeline, /overscan/);
  assert.match(timeline, /loadNextPage/);
  assert.match(timeline, /eventKey/);
});

test("回看最新跟随复用虚拟列表边缘锚定，并由事件水位决定入场动画", () => {
  const timeline = readReviewTimelineSources();
  const row = read("src/components/EventRow.tsx");
  assert.match(timeline, /anchorTo: direction === "asc" \? "end" : "start"/);
  assert.match(timeline, /followOnAppend: direction === "asc" && followingLatest/);
  assert.match(timeline, /scrollToLatestEdge/);
  assert.match(timeline, /isReviewTimelineAtLatest/);
  assert.match(timeline, /collectFreshReviewEventKeys/);
  assert.match(timeline, /animateOnMount=\{animateOnMount\}/);
  assert.match(row, /animateOnMount\?: boolean/);
  assert.match(row, /event-animation-none/);
});

test("回看分页请求按代际提交，旧请求的 then/catch/finally 不得污染新查询", () => {
  const timeline = readReviewTimelineSources();
  const pages = read("src/archive/useReviewTimelinePages.ts");
  const loadStart = pages.indexOf("const loadDirectionPage");
  const loadEnd = pages.indexOf("const resetPages", loadStart);
  const loadSource = pages.slice(loadStart, loadEnd);
  assert.match(timeline, /const requestGenerationRef = useRef\(0\)/);
  assert.match(loadSource, /const generation = requestGenerationRef\.current/);
  assert.match(loadSource, /createArchiveRequestId/);
  assert.match(loadSource, /requestId/);
  assert.match(loadSource, /recordArchiveDiagnostic\("cancel"/);
  assert.equal((loadSource.match(/requestGenerationRef\.current !== generation/g) ?? []).length, 2);
  assert.match(loadSource, /if \(requestGenerationRef\.current !== generation\) \{[\s\S]*setRecords\([\s\S]*cursorByDirectionRef\.current\[pageDirection\] = page\.nextCursor[\s\S]*setNextCursor/);
  assert.match(loadSource, /catch[\s\S]*if \(requestGenerationRef\.current !== generation\) \{[\s\S]*setError/);
  assert.match(loadSource, /finally[\s\S]*loadingGenerationByDirectionRef[\s\S]*setLoading/);

  const resetSource = pages.slice(loadEnd);
  assert.match(resetSource, /requestGenerationRef\.current \+= 1/);
  assert.match(resetSource, /setLoading\(false\)/);
  assert.match(resetSource, /pendingInitialDirectionsRef\.current = new Set/);
});

test("档案提交刷新不会重置时间线查询，只增量合并新事件", () => {
  const timeline = readReviewTimelineSources();
  const queryKeyStart = timeline.indexOf("const dataQueryKey");
  const queryKeyEnd = timeline.indexOf("useEffect", queryKeyStart);
  const queryKeySource = timeline.slice(queryKeyStart, queryKeyEnd);
  assert.doesNotMatch(queryKeySource, /refreshKey/);
  const refreshSource = read("src/archive/useReviewTimelineRefresh.ts");
  assert.match(refreshSource, /direction:\s*["']desc["']/);
  assert.doesNotMatch(refreshSource, /cursor:/);
  assert.match(refreshSource, /setRecords\(\(current\) => \{[\s\S]*?appendArchiveEventPage\(current, page, direction\)[\s\S]*?recordsRef\.current = next/);
});

test("回看首屏双向查询等两边返回后只提交一次列表", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /initialPagesRef/);
  assert.match(timeline, /const commitInitialPages = useCallback/);
  assert.match(timeline, /if \(pendingInitialDirectionsRef\.current\.size > 0\) return;/);
  assert.match(timeline, /initialPagesRef\.current\.set\(pageDirection, page\)/);
  assert.match(timeline, /initialPagesRef\.current\.clear\(\);[\s\S]*setRecords\(next\);[\s\S]*setLoaded\(true\)/);
});

test("回看同一查询代际只启动一次，避免开发模式重复初始化请求", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /startedQueryKeyRef/);
  assert.match(timeline, /if \(active && readingReadyRef\.current && startedQueryKeyRef\.current === queryKey\) return;/);
});

test("直播档案连续刷盘在短窗口内合并刷新请求", () => {
  const timeline = readReviewTimelineSources();
  const refreshSource = read("src/archive/useReviewTimelineRefresh.ts");
  assert.match(timeline, /refreshTimerRef/);
  assert.match(refreshSource, /setTimeout\(\(\) => \{/);
  assert.match(refreshSource, /\}, 120\);/);
  assert.match(refreshSource, /clearTimeout\(timer\)/);
});

test("阅读锚点按两侧 cursor 加载，owner 历史显示 session 边界元数据", () => {
  const timeline = readReviewTimelineSources();
  const repository = read("src/archive/archiveRepository.ts");
  assert.match(timeline, /getReviewInitialQueryDirections/);
  assert.match(timeline, /cursorByDirectionRef/);
  assert.match(timeline, /loadDirectionPage/);
  assert.match(timeline, /appendArchiveEventPage/);
  assert.match(timeline, /session-boundary|sessionBoundary/);
  assert.match(timeline, /sessionTitle|sessionQuality|sessionStartedAt/);
  assert.match(repository, /s\.title AS sessionTitle/);
  assert.match(repository, /s\.started_at AS sessionStartedAt/);
  assert.match(repository, /s\.quality AS sessionQuality/);
});

test("回看事件行支持自然换行、真实右对齐时间，并让菜单高光覆盖时间区域", () => {
  const row = read("src/components/EventRow.tsx");
  const css = read("src/App.css");
  const timeline = readReviewTimelineSources();
  assert.match(row, /reviewLayout\?/);
  assert.match(row, /formatReviewEventTime/);
  assert.match(row, /eventMenuScope/);
  assert.match(row, /scope=\{eventMenuScope\}/);
  assert.match(row, /w-\[72px\] shrink-0 text-right/);
  const archiveCss = read("src/archiveEventStyle.css");
  const reviewContentStart = archiveCss.indexOf(".event.event-surface-archive .event-body {");
  const reviewContentEnd = archiveCss.indexOf("}", reviewContentStart);
  const reviewContent = archiveCss.slice(reviewContentStart, reviewContentEnd);
  assert.match(reviewContent, /white-space:\s*normal/);
  assert.doesNotMatch(reviewContent, /overflow:\s*hidden/);
  assert.doesNotMatch(timeline, /eventSpacing/);
  assert.match(archiveCss, /--review-space: calc\(var\(--review-main\) \* 2 \/ 7\)/);
  assert.match(archiveCss, /padding: calc\(var\(--review-main\) \* 3 \/ 7\) calc\(var\(--review-space\) \* 2\)/);
  assert.match(timeline, /useAnimationFrameWithResizeObserver:\s*true/);
  assert.match(timeline, /measureLoadedReviewRow/);
  assert.doesNotMatch(timeline, /virtualizer\.measure\(\)/);
  assert.match(timeline, /onContentSizeChange/);
  assert.match(css, /\.event-row-with-menu \.event-row-actions[\s\S]*z-index:\s*10/);
});

test("回看菜单使用 TTS-only、全局收藏/昵称/用户主页，并隐藏事件标记", () => {
  const menu = read("src/components/EventContextMenu.tsx");
  const timeline = readReviewTimelineSources();
  const panel = read("src/components/ReviewPanel.tsx");
  assert.match(menu, /scope === "review" \? \[\] :/);
  assert.match(menu, /scope === "review" \? action !== "mark"/);
  assert.match(timeline, /eventMenuScope="review"/);
  assert.match(timeline, /onSpeakEvent/);
  assert.match(panel, /voiceController\.speakEvent/);
  assert.match(panel, /createArchiveFavoriteActions\(repository\)\.set/);
  assert.match(panel, /setNickname/);
  assert.match(panel, /openUrl/);
  assert.doesNotMatch(timeline, /onToggleMark/);
});

test("回看头像和礼物资源失败时使用固定占位，特效播放失败不阻断事件列表", () => {
  const row = read("src/components/EventRow.tsx");
  const avatar = read("src/components/UserAvatar.tsx");
  const timeline = readReviewTimelineSources();
  assert.match(row, /import\s+\{\s*UserAvatar\s*\}\s+from\s+["']\.\/UserAvatar["']/);
  assert.match(row, /<UserAvatar user=\{user\} showAvatar=\{showAvatar\} showAvatarFrame=\{showAvatarFrame && !plain\} \/>/);
  assert.match(avatar, /event-avatar-placeholder/);
  assert.match(avatar, /failedSource === DEFAULT_AVATAR_PATH/);
  assert.match(avatar, /aria-label="头像不可用"/);
  assert.match(avatar, /onError=\{\(\) => setFailedSource\(source\)\}/);
  assert.match(row, /event-resource-retry/);
  assert.match(row, /重新加载/);
  assert.match(row, /onError=\{\(\) => setFailed/);
  assert.match(row, /onError=\{\(\) => setIdx/);
  assert.match(timeline, /GiftEffectOverlay/);
  assert.match(timeline, /getGiftEffect/);
  assert.match(timeline, /onPlayGiftEffect/);
});

test("回看时间线把导出和删除操作交给右上角管理档案", () => {
  const timeline = readReviewTimelineSources();
  const panel = read("src/components/ReviewPanel.tsx");
  const management = read("src/components/ReviewArchiveManagement.tsx");
  assert.doesNotMatch(timeline, /导出场次|导出当前结果|导出当前收藏|删除场次/);
  assert.match(panel, /route\.level === "session"/);
  assert.match(panel, /sessionOnly/);
  assert.match(panel, /管理档案/);
  assert.match(management, /导出当前结果/);
  assert.match(management, /导出当前收藏/);
  assert.match(panel, /kind: "result"/);
  assert.match(panel, /favoriteOnly/);
});

test("回看时间线标题栏承载事件排序和显示大表情开关", () => {
  const timeline = readReviewTimelineSources();
  const panel = read("src/components/ReviewPanel.tsx");
  assert.match(timeline, /onChangeSortDirection\?: \(direction: ArchiveSortDirection\)/);
  assert.match(timeline, /onToggleShowBigEmote\?: \(show: boolean\)/);
  assert.match(timeline, /aria-label="事件排序方向"/);
  assert.match(timeline, /aria-label="显示大表情"/);
  assert.match(panel, /onChangeSortDirection=\{/);
  assert.match(panel, /onToggleShowBigEmote=\{/);
});

test("回看排序切换复用已加载窗口，并避免跟随最新时自动扫历史分页", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /startedDataQueryKeyRef/);
  assert.match(timeline, /preserveLoadedWindowForDirectionChange/);
  assert.match(timeline, /getReviewInitialQueryDirections\(/);
  assert.match(timeline, /followingLatestRef\.current \|\| readingAction === "latest"/);
});

test("回看时间线标题栏在窄宽度下使用显示菜单且不为未激活保存状态预留空间", () => {
  const timeline = readReviewTimelineSources();
  const css = read("src/App.css");
  assert.match(timeline, /aria-label="显示菜单"/);
  assert.match(timeline, /aria-label="回看显示菜单"/);
  assert.match(timeline, /排列顺序/);
  assert.match(timeline, /顺序排列/);
  assert.match(timeline, /倒序排列/);
  assert.doesNotMatch(timeline, /w-\[9rem\][^\n]*invisible/);
  assert.match(css, /\.review-timeline-header/);
  assert.match(css, /container-type:\s*inline-size/);
  assert.match(css, /@container\s+review-timeline\s*\(max-width:\s*620px\)/);
});

test("回看显示菜单脱离时间线裁剪层，切换排序后保持菜单和当前选中状态", () => {
  const timeline = readReviewTimelineSources();
  const panel = read("src/components/ReviewPanel.tsx");
  assert.match(timeline, /createPortal/);
  assert.match(timeline, /displayPanelRef/);
  assert.match(timeline, /aria-checked=\{direction === sortDirection\}/);
  assert.doesNotMatch(timeline, /onChangeSortDirection\?\.\(sortDirection\); setDisplayMenuOpen\(false\)/);
  assert.match(panel, /onChangeSortDirection=\{\(direction\) => updateActiveQuery\(\{ sortDirection: direction \}, \{ restorePreviousSearch: false \}\)\}/);
});

test("从主播事件结果进入单场时精准定位目标事件，且不保存为阅读位置", () => {
  const timeline = readReviewTimelineSources();
  const panel = read("src/components/ReviewPanel.tsx");
  assert.match(timeline, /targetEventKey\?: string \| null/);
  assert.match(timeline, /targetEventKey/);
  assert.match(timeline, /onTargetEventConsumed/);
  assert.match(timeline, /skipNextReadingSaveRef\.current = true/);
  assert.match(panel, /targetEventKey/);
  assert.match(panel, /onTargetEventConsumed/);
  assert.match(timeline, /if \(skipNextReadingSaveRef\.current\)/);
  assert.match(timeline, /eventKey: targetAnchorEventKey/);
  assert.match(panel, /activeFilterKeys/);
});

test("查看上下文查询在导航状态同步前也使用原始目标事件锚点", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /const targetAnchorEventKey = targetEventKey \?\? activeTargetEventKey;/);
  assert.match(timeline, /if \(targetAnchorEventKey\) \{/);
  assert.match(timeline, /eventKey: targetAnchorEventKey,/);
});

test("回看上下文定位优先使用待处理目标，目标未找到时不回退到首条事件", () => {
  const timeline = readReviewTimelineSources();
  const targetMarker = timeline.indexOf("const targetRow =");
  const restoreStart = timeline.lastIndexOf("useEffect(() => {", targetMarker);
  const restoreEnd = timeline.indexOf("  }, [active,", restoreStart);
  const restoreSource = timeline.slice(restoreStart, restoreEnd);
  assert.match(timeline, /const pendingTargetEventKey = targetEventKey \?\? activeTargetEventKey;/);
  assert.match(restoreSource, /const targetRow = pendingTargetEventKey/);
  assert.match(restoreSource, /if \(pendingTargetEventKey && !targetRow\) \{[\s\S]*?if \(loading\) return;[\s\S]*?restorePendingRef\.current = false;[\s\S]*?completeTargetLocation\(false\);[\s\S]*?return;/);
  assert.doesNotMatch(restoreSource, /targetIndex >= 0 \? targetIndex : 0/);
  assert.match(restoreSource, /virtualizer\.scrollToIndex\(targetIndex, \{ align: "center" \}\);/);
});

test("回看查询重置后不使用上一查询的 loaded 状态提前消费上下文目标", () => {
  const timeline = readReviewTimelineSources();
  const resetStart = timeline.indexOf("const queryKey");
  const resetEnd = timeline.indexOf("const projectedBase", resetStart);
  const resetSource = timeline.slice(resetStart, resetEnd);
  const targetMarker = timeline.indexOf("const targetRow =");
  const restoreStart = timeline.lastIndexOf("useEffect(() => {", targetMarker);
  const restoreEnd = timeline.indexOf("  }, [active,", restoreStart);
  const restoreSource = timeline.slice(restoreStart, restoreEnd);
  assert.match(timeline, /const loadedRef = useRef\(false\);/);
  assert.match(timeline, /loadedRef\.current = loaded;/);
  assert.match(resetSource, /loadedRef\.current = false;/);
  assert.match(restoreSource, /if \(!active \|\| !loaded \|\| !loadedRef\.current \|\| !readingReady/);
});

test("上下文目标晚于查询重置到达时会补发一次锚点查询，而不是消费成未找到", () => {
  const timeline = readReviewTimelineSources();
  const queryKeyStart = timeline.indexOf("const dataQueryKey");
  const queryKeyEnd = timeline.indexOf("useEffect", queryKeyStart);
  const queryKeySource = timeline.slice(queryKeyStart, queryKeyEnd);
  const resetStart = timeline.indexOf("const queryKey");
  const resetEnd = timeline.indexOf("const projectedBase", resetStart);
  const resetSource = timeline.slice(resetStart, resetEnd);

  assert.match(timeline, /const targetQueryKeyRef = useRef<string \| null>\(null\);/);
  assert.match(timeline, /const \[targetReloadRevision, setTargetReloadRevision\] = useState\(0\);/);
  assert.match(timeline, /pendingTargetEventKey === targetQueryKeyRef\.current/);
  assert.match(queryKeySource, /targetReloadRevision/);
  assert.match(resetSource, /targetQueryKeyRef\.current = pendingTargetEventKey;/);
});

test("回看上下文定位必须在目标实际可见后消费，并暂停自动分页", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /locatingTargetKeyRef/);
  assert.match(timeline, /isReviewTimelineItemVisible/);
  assert.match(timeline, /shouldPauseReviewTimelineAutomation/);
  assert.match(timeline, /completeTargetLocation\(true\)/);
  assert.match(timeline, /if \(pendingTargetEventKey\) \{[\s\S]*?setLocatingTargetKey/);
  assert.doesNotMatch(timeline, /if \(pendingTargetEventKey\) onTargetEventConsumed\?\.\(targetFound\);/);
});

test("同一事件再次查看上下文时会重新建立定位请求", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /if \(!pendingTargetEventKey\) targetQueryKeyRef\.current = null;/);
});

test("定位期间跳过的增量刷新会在定位结束后重试", () => {
  const timeline = read("src/archive/useReviewTimelineRefresh.ts");
  const refreshStart = timeline.indexOf("useEffect(() => {");
  const refreshGuard = timeline.indexOf("shouldPauseReviewTimelineAutomation", refreshStart);
  const refreshMark = timeline.indexOf("lastRefreshKeyRef.current = refreshKey;", refreshStart);
  assert.ok(refreshGuard >= 0 && refreshMark >= 0);
  assert.ok(refreshMark > refreshGuard);
});

test("上下文目标未找到时显示定位状态提示", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /targetLocateMessage/);
  assert.match(timeline, /role="status"/);
});

test("回看刷新按事件键恢复停止跟随时的视口", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /followingLatestRef/);
  assert.match(timeline, /lockedTargetScrollAnchorRef/);
  assert.match(timeline, /if \(!followingLatestRef\.current\)/);
  assert.match(timeline, /canRestoreReviewTimelineScrollAnchor/);
  assert.match(timeline, /scrollTop/);
  assert.match(timeline, /setFollowingLatest/);
});

test("上下文定位和查询重置都会清除旧的实时刷新锚点", () => {
  const timeline = readReviewTimelineSources();
  const queryResetStart = timeline.indexOf("const queryKey");
  const queryResetEnd = timeline.indexOf("const projectedBase", queryResetStart);
  const queryResetSource = timeline.slice(queryResetStart, queryResetEnd);
  const targetLocateStart = timeline.indexOf("if (pendingTargetEventKey) {");
  const targetLocateEnd = timeline.indexOf("const searching", targetLocateStart);
  const targetLocateSource = timeline.slice(targetLocateStart, targetLocateEnd);
  assert.match(queryResetSource, /lockedTargetScrollAnchorRef\.current = null;/);
  assert.match(targetLocateSource, /lockedTargetScrollAnchorRef\.current = null;/);
});

test("上下文定位按事件键等待虚拟列表稳定，并在完成后保留目标锚点", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /locatingTargetFrameRef/);
  assert.match(timeline, /requestAnimationFrame/);
  assert.match(timeline, /shouldCompleteReviewTimelineLocation/);
  assert.match(timeline, /lockedTargetScrollAnchorRef\.current = \{/);
});

test("回看锚点校正通过虚拟列表同步滚动状态", () => {
  const timeline = readReviewTimelineSources();
  const effectStart = timeline.indexOf("const lockedAnchor = lockedTargetScrollAnchorRef.current;");
  const effectEnd = timeline.indexOf("const notifyScrollIntent", effectStart);
  const effectSource = timeline.slice(effectStart, effectEnd);
  assert.match(effectSource, /virtualizer\.scrollToOffset\(root\.scrollTop \+ adjustment/);
  assert.doesNotMatch(effectSource, /root\.scrollTop \+= adjustment/);
});

test("实时刷新时按虚拟列表布局恢复目标锚点，不依赖目标仍在 DOM 中", () => {
  const timeline = readReviewTimelineSources();
  const effectStart = timeline.indexOf("const lockedAnchor = lockedTargetScrollAnchorRef.current;");
  const effectEnd = timeline.indexOf("const notifyScrollIntent", effectStart);
  const effectSource = timeline.slice(effectStart, effectEnd);
  assert.match(effectSource, /const targetIndex = timelineEntries\.findIndex/);
  assert.match(effectSource, /virtualizer\.getOffsetForIndex\(targetIndex, "start"\)/);
  assert.match(effectSource, /const currentOffset = element\s*\n\s*\? element\.getBoundingClientRect/);
  assert.match(effectSource, /: targetStart - root\.scrollTop/);
});

test("消费单次定位目标后保留阅读保护，但不因锚点回调变化重置时间线查询", () => {
  const timeline = readReviewTimelineSources();
  assert.match(timeline, /navigationState\.targetPending/);
  assert.match(timeline, /getReadingAnchorRef\.current\(\)/);
  assert.match(timeline, /\}, \[active, dataQueryKey, direction, keywordSearchActive, loadDirectionPage, pendingTargetEventKey, queryKey\]\);/);
  assert.doesNotMatch(timeline, /\}, \[active, direction, getReadingAnchor, keywordSearchActive, loadDirectionPage, queryKey\]\);/);
});

test("回看礼物特效通知按查询代际隔离，并不广播到现场总线", () => {
  const timeline = readReviewTimelineSources();
  const app = readApplicationSources();

  assert.match(timeline, /useEffect\(\(\) => \{\s*setGiftEffectNotices\(\[\]\);\s*\}, \[queryKey\]\);/);
  assert.match(timeline, /<GiftEffectOverlay enabled notices=\{giftEffectNotices\} resetKey=\{queryKey\} roomKey=\{sessionId\} \/>/);
  assert.doesNotMatch(timeline, /emitGiftEffect/);
  assert.match(app, /subscribeGiftEffect/);
});
