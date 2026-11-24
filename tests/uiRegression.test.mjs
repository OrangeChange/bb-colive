import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

async function read(path) {
  return fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Portal 下拉的点击事件即使没有浏览器 Element 全局对象也能识别浮层", async () => {
  const { isUiOverlayPointerEvent } = await import("../src/components/ui/layer.ts");
  const overlay = {
    hasAttribute(name) {
      return name === "data-ui-overlay";
    },
  };
  const event = {
    target: { closest: () => overlay },
    composedPath: () => [{}, overlay],
  };

  assert.equal(isUiOverlayPointerEvent(event), true);
});

test("回看滚动只在上下文首次进入时应用，管理中的数据刷新不再重置位置", async () => {
  const { resolveReviewScrollTop, reviewScrollContextKey } = await import("../src/archive/reviewScrollPosition.ts");
  const managementKey = reviewScrollContextKey("owner:1", "owner", true);
  const sessionKey = reviewScrollContextKey("session:1", "session", false);

  assert.equal(resolveReviewScrollTop({ contextKey: managementKey, lastContextKey: null, routeLevel: "owner", showManagement: true, ready: true, savedScrollTop: 280 }), 0);
  assert.equal(resolveReviewScrollTop({ contextKey: managementKey, lastContextKey: managementKey, routeLevel: "owner", showManagement: true, ready: true, savedScrollTop: 280 }), null);
  assert.equal(resolveReviewScrollTop({ contextKey: managementKey, lastContextKey: null, routeLevel: "owner", showManagement: true, ready: false, savedScrollTop: 280 }), null);
  assert.equal(resolveReviewScrollTop({ contextKey: managementKey, lastContextKey: sessionKey, routeLevel: "owner", showManagement: false, ready: true, savedScrollTop: 280 }), 280);
});

test("事件检索同一主播切换关键词时保留旧结果容器", async () => {
  const { getOwnerEventDisplayPage } = await import("../src/archive/reviewOwnerEventResultsState.ts");
  const page = { items: [{ session: { sessionId: "session-1" }, matches: [], matchCount: 0 }], hasMore: false };
  const cache = { ownerId: "owner-1", queryKey: "old-query", page };

  assert.equal(getOwnerEventDisplayPage(cache, "owner-1", true), page);
  assert.equal(getOwnerEventDisplayPage(cache, "owner-1", false), null);
  assert.equal(getOwnerEventDisplayPage(cache, "owner-2", true), null);
});

test("选择器选项保留 Edge 音色的语言分组", async () => {
  const { groupUiSelectOptions } = await import("../src/components/ui/selectOptions.ts");
  const groups = groupUiSelectOptions([
    { value: "current", label: "当前音色" },
    { value: "zh", label: "晓晓", group: "中文（普通话）" },
    { value: "zh2", label: "云希", group: "中文（普通话）" },
    { value: "en", label: "Andrew", group: "English（美国）" },
  ]);

  assert.deepEqual(groups.map((group) => group.label), ["", "中文（普通话）", "English（美国）"]);
  assert.deepEqual(groups.map((group) => group.options.map((option) => option.value)), [["current"], ["zh", "zh2"], ["en"]]);
});

test("共享菜单至少与触发器同宽，长选项可以自然展开", async () => {
  const css = await read("src/App.css");
  const content = css.slice(css.indexOf(".ui-select-content {"), css.indexOf(".ui-select-viewport {"));
  const item = css.slice(css.indexOf(".ui-select-item {"), css.indexOf(".ui-select-content[data-size=\"standard\"]"));

  assert.doesNotMatch(content, /(?:^|\n)\s*width:\s*var\(--radix-select-trigger-width\)/);
  assert.match(content, /min-width:\s*var\(--radix-select-trigger-width\)/);
  assert.match(content, /max-width:\s*calc\(100vw - 16px\)/);
  assert.match(item, /font-size:\s*var\(--type-control-size\)/);
  assert.match(item, /line-height:\s*var\(--type-control-line\)/);
  assert.match(css, /\.ui-combobox-option\s*\{[\s\S]*font-size:\s*var\(--type-control-size\)/);
});

test("语音选择器不覆盖共享触发器的 inline-flex 布局", async () => {
  const css = await read("src/App.css");
  const voiceControl = css.slice(css.indexOf(".voice-select-control {"), css.indexOf(".voice-advanced-settings {"));

  assert.doesNotMatch(voiceControl, /display:\s*block/);
  assert.match(voiceControl, /width:\s*100%/);
});

test("共享选择器为长文本保留箭头空间", async () => {
  const select = await read("src/components/ui/Select.tsx");
  const css = await read("src/App.css");

  assert.doesNotMatch(select, /Value className=/);
  assert.match(css, /\.ui-select-trigger > span:first-child\s*\{[\s\S]*min-width:\s*0[\s\S]*overflow:\s*hidden[\s\S]*text-overflow:\s*ellipsis/);
});

test("共享浮层遵循减少动效设置", async () => {
  const css = await read("src/App.css");
  const reducedMotion = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"), css.indexOf("/* 底栏固定为单行"));

  assert.match(reducedMotion, /\.ui-overlay-surface/);
});

test("主窗口动效使用统一时序并覆盖主要浮层和状态反馈", async () => {
  const css = await read("src/App.css");
  assert.match(css, /--motion-fast:\s*120ms/);
  assert.match(css, /--motion-standard:\s*180ms/);
  assert.match(css, /--motion-enter:\s*160ms/);
  assert.match(css, /\.review-filter-content\s*\{[\s\S]*grid-template-rows\s+var\(--motion-standard\)/);
  assert.match(css, /\.ui-motion-enter\s*\{[\s\S]*animation:\s*ui-overlay-in\s+var\(--motion-enter\)/);
  assert.match(css, /\.ui-motion-filter-context\s*\{[\s\S]*animation:/);
  assert.match(css, /\.ui-modal-overlay\s*\{[\s\S]*animation:\s*ui-modal-backdrop-in/);
  assert.match(css, /\.ui-modal-surface\s*\{[\s\S]*animation:\s*ui-modal-surface-in/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-motion-enter[\s\S]*animation:\s*none/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-modal-overlay[\s\S]*\.ui-modal-surface[\s\S]*animation:\s*none/);

  const liveFilter = await read("src/components/LiveFilterBar.tsx");
  const connectBar = await read("src/components/ConnectBar.tsx");
  const reminder = await read("src/components/SystemReminderBell.tsx");
  const urgent = await read("src/components/UrgentSystemNotice.tsx");
  const rankings = await read("src/components/RoomRankings.tsx");
  const contextMenu = await read("src/components/EventContextMenu.tsx");
  const reviewSearch = await read("src/components/ReviewSearchControls.tsx");
  const sidebar = await read("src/components/Sidebar.tsx");
  const reviewTimeline = await read("src/components/ReviewSessionTimeline.tsx");
  const reviewOwnerFilters = await read("src/components/ReviewOwnerEventFilters.tsx");
  const reviewFilterPopover = await read("src/components/ReviewFilterPopover.tsx");
  const confirmDialog = await read("src/components/ConfirmDialog.tsx");
  const favoriteEditor = await read("src/components/FavoriteOrganizationEditor.tsx");
  const imagePreview = await read("src/components/ImagePreviewOverlay.tsx");
  const dataExportDialog = await read("src/components/ReviewDataExportDialog.tsx");

  assert.match(liveFilter, /ui-motion-filter-context/);
  assert.match(liveFilter, /ui-motion-enter/);
  assert.match(connectBar, /ui-motion-enter/);
  assert.match(reminder, /ui-motion-enter/);
  assert.match(urgent, /ui-motion-enter/);
  assert.match(rankings, /ui-motion-enter/);
  assert.match(contextMenu, /ui-motion-enter/);
  assert.match(reviewSearch, /ui-motion-enter/);
  assert.match(sidebar, /ui-motion-enter/);
  assert.match(reviewTimeline, /ui-motion-enter/);
  assert.match(reviewOwnerFilters, /<ReviewFilterPopover/);
  assert.match(reviewSearch, /<ReviewFilterPopover/);
  assert.match(reviewFilterPopover, /className="ui-motion-enter review-filter-advanced-panel"/);
  assert.match(confirmDialog, /ui-modal-overlay/);
  assert.match(confirmDialog, /ui-modal-surface/);
  assert.match(favoriteEditor, /ui-modal-overlay/);
  assert.match(favoriteEditor, /ui-modal-surface/);
  assert.match(imagePreview, /ui-modal-overlay/);
  assert.match(imagePreview, /ui-modal-surface/);
  assert.match(dataExportDialog, /ui-modal-overlay/);
  assert.match(dataExportDialog, /ui-modal-surface/);
});

test("共享 Portal 内容由对应浮层管理外部交互，筛选子层保持 Radix 层级", async () => {
  const select = await read("src/components/ui/Select.tsx");
  const combobox = await read("src/components/ui/Combobox.tsx");
  const searchControls = await read("src/components/ReviewSearchControls.tsx");
  const popover = await read("src/components/ReviewFilterPopover.tsx");

  assert.match(select, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(combobox, /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(searchControls, /<PopoverPrimitive\.Root[\s\S]*<PopoverPrimitive\.Portal>[\s\S]*<PopoverPrimitive\.Content/);
  assert.match(popover, /<PopoverPrimitive\.Root[\s\S]*<PopoverPrimitive\.Portal>[\s\S]*<PopoverPrimitive\.Content/);
  assert.match(popover, /data-ui-overlay="true"/);
  assert.match(popover, /onInteractOutside=/);
});

test("主播筛选的交互滚动不会触发整块筛选自动收起", async () => {
  const scrollBehavior = await import("../src/archive/reviewScrollBehavior.ts");
  assert.equal(typeof scrollBehavior.isReviewFilterInteractionTarget, "function");
  if (typeof scrollBehavior.isReviewFilterInteractionTarget === "function") {
    const filterTarget = { closest: (selector) => selector.includes("data-review-filter-shell") ? {} : null };
    const overlayTarget = { closest: (selector) => selector.includes("data-ui-overlay") ? {} : null };
    const pageTarget = { closest: () => null };
    assert.equal(scrollBehavior.isReviewFilterInteractionTarget(filterTarget), true);
    assert.equal(scrollBehavior.isReviewFilterInteractionTarget(overlayTarget), true);
    assert.equal(scrollBehavior.isReviewFilterInteractionTarget(pageTarget), false);
  }

  const panel = await read("src/components/ReviewPanel.tsx");
  assert.match(panel, /isReviewFilterInteractionTarget\(document\.activeElement\)/);
  assert.match(panel, /isReviewFilterInteractionTarget\(target\)/);
});

test("单场筛选的交互滚动不会驱动时间线自动收起", async () => {
  const panel = await read("src/components/ReviewPanel.tsx");
  const handlerStart = panel.indexOf("const handleReviewSessionWheel");
  const handlerEnd = panel.indexOf("const handleReviewOwnerWheel", handlerStart);
  const handler = panel.slice(handlerStart, handlerEnd);
  assert.match(handler, /isReviewFilterInteractionTarget\(target\)/);
});

test("事件检索查询身份不随直播刷新版本变化", async () => {
  const queryState = await import("../src/archive/reviewOwnerEventQueryState.ts");
  assert.equal(typeof queryState.createOwnerEventQueryKey, "function");
  if (typeof queryState.createOwnerEventQueryKey === "function") {
    const query = {
      filters: { searchText: "舰长" },
      sort: "latestMatchTs",
      direction: "desc",
    };
    assert.equal(
      queryState.createOwnerEventQueryKey("owner-1", query),
      JSON.stringify({ ownerId: "owner-1", filters: query.filters, sort: query.sort, direction: query.direction }),
    );
  }

  const panel = await read("src/components/ReviewPanel.tsx");
  const keyStart = panel.indexOf("const ownerEventQueryKey =");
  const keyBlock = panel.slice(keyStart, panel.indexOf("\n", keyStart));
  assert.match(keyBlock, /createOwnerEventQueryKey\(/);
  assert.doesNotMatch(keyBlock, /ownerEventDataRevision|managementRevision/);
});

test("直播刷新已有结果时不显示整页检索状态", async () => {
  const resultsState = await import("../src/archive/reviewOwnerEventResultsState.ts");
  assert.equal(typeof resultsState.shouldShowOwnerEventSearchLoading, "function");
  if (typeof resultsState.shouldShowOwnerEventSearchLoading === "function") {
    const page = { items: [], hasMore: false };
    const cache = { ownerId: "owner-1", queryKey: "query-1", page };
    assert.equal(resultsState.shouldShowOwnerEventSearchLoading(cache, "owner-1", "query-1"), false);
    assert.equal(resultsState.shouldShowOwnerEventSearchLoading(cache, "owner-1", "query-2"), true);
    assert.equal(resultsState.shouldShowOwnerEventSearchLoading(null, "owner-1", "query-1"), true);
  }

  const panel = await read("src/components/ReviewPanel.tsx");
  assert.match(panel, /shouldShowOwnerEventSearchLoading\(/);
});

test("主播档案排序下拉不嵌套在 label 中，避免开播时间和倒序排列联动", async () => {
  const sessionFilters = await read("src/components/ReviewOwnerSessionFilters.tsx");
  const eventResults = await read("src/components/ReviewOwnerEventResults.tsx");

  assert.doesNotMatch(sessionFilters, /<label[^>]*>\s*<span>排序<\/span>[\s\S]*?<UiSelect[\s\S]*?<UiSelect[\s\S]*?<\/label>/);
  assert.doesNotMatch(eventResults, /<label[^>]*>\s*<span>排序<\/span>[\s\S]*?<UiSelect[\s\S]*?<\/label>/);
  assert.doesNotMatch(sessionFilters, /<label[^>]*>\s*<span>开播时间<\/span>\s*<UiSelect/);
});

