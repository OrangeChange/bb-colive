import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    assert.fail(`无法加载阅读位置模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

function item(eventKey, eventTs, ordinal) {
  return {
    eventKey,
    sessionId: "session-1",
    roomId: 101,
    ordinal,
    eventTs,
    primaryCategory: "danmu",
    secondaryCategory: null,
    userUid: "u-1",
    userName: "用户甲",
    searchText: "内容",
    payloadJson: JSON.stringify({ id: eventKey, msgType: 0, roomId: 101, ts: eventTs, text: "内容" }),
    sourceId: null,
    favorited: false,
  };
}

test("阅读位置按稳定 eventKey 恢复，而不是按数组索引", async () => {
  const { restoreReadingPosition } = await loadModule("../src/archive/archiveState.ts");
  const page = { items: [item("event-a", 100, 0), item("event-b", 200, 1)] };
  const state = {
    sessionId: "session-1",
    eventKey: "event-b",
    fallbackEventTs: 200,
    sortDirection: "asc",
    filters: {},
    searchScope: "session",
    updatedAt: 1,
  };

  assert.deepEqual(restoreReadingPosition(page, state), { eventKey: "event-b" });
});

test("阅读 eventKey 缺失时回到最近事件，既没有时间戳时回到首个结果", async () => {
  const { restoreReadingPosition } = await loadModule("../src/archive/archiveState.ts");
  const page = { items: [item("event-a", 100, 0), item("event-b", 200, 1), item("event-c", 400, 2)] };
  const missing = {
    sessionId: "session-1",
    eventKey: "deleted-event",
    fallbackEventTs: 260,
    sortDirection: "asc",
    filters: { favoriteOnly: true },
    searchScope: "session",
    updatedAt: 1,
  };
  assert.deepEqual(restoreReadingPosition(page, missing), { eventKey: "event-b", fallbackTs: 260 });
  assert.deepEqual(restoreReadingPosition(page, { ...missing, fallbackEventTs: null }), { eventKey: "event-a" });
});

test("查询 patch 明确区分 merge 与 replace，清除条件会移除旧 filters/userUid", async () => {
  const { applyReviewQueryPatch } = await loadModule("../src/archive/archiveState.ts");
  assert.equal(typeof applyReviewQueryPatch, "function");
  if (typeof applyReviewQueryPatch !== "function") return;

  const current = {
    searchText: "关键词",
    searchScope: "session",
    filters: { primaryCategories: ["gift"], userUid: "user-1", favoriteOnly: true },
    sort: "startedAt",
    sortDirection: "asc",
  };

  assert.deepEqual(
    applyReviewQueryPatch(current, { filters: { secondaryCategories: ["normal"] } }),
    {
      ...current,
      filters: {
        primaryCategories: ["gift"],
        userUid: "user-1",
        favoriteOnly: true,
        secondaryCategories: ["normal"],
      },
    },
  );
  assert.deepEqual(
    applyReviewQueryPatch(current, { searchText: "", filters: {} }, { filters: "replace" }),
    { ...current, searchText: "", filters: {} },
  );
  assert.deepEqual(
    applyReviewQueryPatch(current, { filters: { primaryCategories: ["gift"], favoriteOnly: true } }, { filters: "replace" }),
    { ...current, filters: { primaryCategories: ["gift"], favoriteOnly: true } },
  );
});

test("reading state restore guard 在查询变脏或代际失效后拒绝旧异步结果", async () => {
  const { createReadingStateRestoreGuard } = await loadModule("../src/archive/archiveState.ts");
  assert.equal(typeof createReadingStateRestoreGuard, "function");
  if (typeof createReadingStateRestoreGuard !== "function") return;

  const guard = createReadingStateRestoreGuard();
  const first = guard.begin("session:101:session-1");
  assert.equal(guard.canApply(first), true);
  guard.markDirty("session:101:session-1");
  assert.equal(guard.canApply(first), false);

  const second = guard.begin("session:101:session-1");
  assert.equal(guard.canApply(second), true);
  guard.invalidate(second);
  assert.equal(guard.canApply(second), false);
});

test("摘要定位消费后保留本次目标锚点，并在用户主动滚动前保护原阅读位置", async () => {
  const {
    createReviewTimelineNavigationState,
    updateReviewTimelineNavigationTarget,
    releaseReviewTimelineReadingProtection,
    shouldSaveReviewReadingPosition,
  } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  const initial = createReviewTimelineNavigationState();
  const located = updateReviewTimelineNavigationTarget(initial, "session-1", "event-match");
  const consumed = updateReviewTimelineNavigationTarget(located, "session-1", null);

  assert.notEqual(consumed, located);
  assert.equal(consumed.targetEventKey, "event-match");
  assert.equal(consumed.targetPending, false);
  assert.equal(consumed.preserveReadingPosition, true);
  const reopened = updateReviewTimelineNavigationTarget(consumed, "session-1", "event-match");
  assert.equal(reopened.targetPending, true);
  assert.equal(shouldSaveReviewReadingPosition(consumed, "session-1", false), false);

  const resumed = releaseReviewTimelineReadingProtection(consumed);
  assert.equal(resumed.targetEventKey, "event-match");
  assert.equal(shouldSaveReviewReadingPosition(resumed, "session-1", false), true);
  assert.equal(shouldSaveReviewReadingPosition(consumed, "another-session", false), true);
  assert.equal(shouldSaveReviewReadingPosition(resumed, "session-1", false, true), false);
  assert.equal(shouldSaveReviewReadingPosition(resumed, "session-1", true, false, true), true);
});

test("回看目标只有实际进入视口后才算定位完成，并在定位期间暂停自动操作", async () => {
  const {
    isReviewTimelineItemVisible,
    shouldPauseReviewTimelineAutomation,
  } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  assert.equal(isReviewTimelineItemVisible({ viewportTop: 100, viewportBottom: 500, itemTop: 120, itemBottom: 300 }), true);
  assert.equal(isReviewTimelineItemVisible({ viewportTop: 100, viewportBottom: 500, itemTop: 40, itemBottom: 90 }), false);
  assert.equal(isReviewTimelineItemVisible({ viewportTop: 100, viewportBottom: 500, itemTop: 520, itemBottom: 620 }), false);
  assert.equal(isReviewTimelineItemVisible({ viewportTop: 100, viewportBottom: 500, itemTop: 80, itemBottom: 560 }), false);

  assert.equal(shouldPauseReviewTimelineAutomation({ targetPending: true, restorePending: false, locatingTarget: false }), true);
  assert.equal(shouldPauseReviewTimelineAutomation({ targetPending: false, restorePending: true, locatingTarget: false }), true);
  assert.equal(shouldPauseReviewTimelineAutomation({ targetPending: false, restorePending: false, locatingTarget: true }), true);
  assert.equal(shouldPauseReviewTimelineAutomation({ targetPending: false, restorePending: false, locatingTarget: false }), false);
});

test("回看离开最新位置后刷新应锁定事件锚点，而跟随最新时不锁定", async () => {
  const { shouldPreserveReviewTimelineScroll } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  assert.equal(shouldPreserveReviewTimelineScroll(false, { eventKey: "event-1", offset: 32 }), true);
  assert.equal(shouldPreserveReviewTimelineScroll(true, { eventKey: "event-1", offset: 32 }), false);
  assert.equal(shouldPreserveReviewTimelineScroll(false, null), false);
});

test("回看滚动锚点只允许在同一查询代际且没有待定位目标时恢复", async () => {
  const {
    canRestoreReviewTimelineScrollAnchor,
  } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  const anchor = { eventKey: "event-1", offset: 32, generation: 7 };
  assert.equal(canRestoreReviewTimelineScrollAnchor(anchor, 7, false), true);
  assert.equal(canRestoreReviewTimelineScrollAnchor(anchor, 8, false), false);
  assert.equal(canRestoreReviewTimelineScrollAnchor(anchor, 7, true), false);
  assert.equal(canRestoreReviewTimelineScrollAnchor(null, 7, false), false);
});

test("回看上下文定位只有连续两次位置稳定后才完成", async () => {
  const { shouldCompleteReviewTimelineLocation } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  assert.equal(shouldCompleteReviewTimelineLocation(null, 120, 0), false);
  assert.equal(shouldCompleteReviewTimelineLocation(100, 108, 1), false);
  assert.equal(shouldCompleteReviewTimelineLocation(100, 100.4, 1), false);
  assert.equal(shouldCompleteReviewTimelineLocation(100, 100.4, 2), true);
});

test("回看最新位置按排序方向分别取顶部和底部", async () => {
  const {
    getReviewTimelineLatestIndex,
    getReviewTimelineLatestAlignment,
    isReviewTimelineAtLatest,
  } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  assert.equal(getReviewTimelineLatestIndex(10, "desc"), 0);
  assert.equal(getReviewTimelineLatestIndex(10, "asc"), 9);
  assert.equal(getReviewTimelineLatestAlignment("desc"), "start");
  assert.equal(getReviewTimelineLatestAlignment("asc"), "end");
  assert.equal(isReviewTimelineAtLatest("desc", 0, 1000, 400), true);
  assert.equal(isReviewTimelineAtLatest("desc", 12, 1000, 400), false);
  assert.equal(isReviewTimelineAtLatest("asc", 600, 1000, 400), true);
  assert.equal(isReviewTimelineAtLatest("asc", 580, 1000, 400), false);
});

test("跟随最新时顺序排列仍从最新查询窗口开始", async () => {
  const { getReviewInitialQueryDirections } = await loadModule("../src/archive/archiveState.ts");

  assert.deepEqual(getReviewInitialQueryDirections("desc", false, true), ["desc"]);
  assert.deepEqual(getReviewInitialQueryDirections("asc", false, true), ["desc"]);
  assert.deepEqual(getReviewInitialQueryDirections("asc", true, true), ["asc", "desc"]);
  assert.deepEqual(getReviewInitialQueryDirections("asc", false, false), ["asc"]);
});

test("回看只把水位之后的实时事件标记为入场动画", async () => {
  const { collectFreshReviewEventKeys } = await loadModule("../src/archive/reviewTimelineNavigation.ts");

  const result = collectFreshReviewEventKeys(
    ["old", "known"],
    [
      { eventKey: "old", eventTs: 100, ordinal: 0 },
      { eventKey: "known", eventTs: 200, ordinal: 0 },
      { eventKey: "history-page", eventTs: 250, ordinal: 0 },
      { eventKey: "live-new", eventTs: 301, ordinal: 1 },
      { eventKey: "same-second-new", eventTs: 300, ordinal: 2 },
    ],
    { eventTs: 300, ordinal: 1, eventKey: "watermark" },
  );

  assert.deepEqual(result.keys, ["live-new", "same-second-new"]);
  assert.deepEqual(result.watermark, { eventTs: 301, ordinal: 1, eventKey: "live-new" });
});

test("阅读位置按场次保存在运行期内存，并可在新一轮运行时清空", async () => {
  const { createReviewReadingMemoryStore } = await loadModule("../src/archive/reviewReadingMemory.ts");
  const store = createReviewReadingMemoryStore();
  const position = {
    eventKey: "event-2",
    eventTs: 200,
    offset: 36,
    updatedAt: 123,
  };

  assert.equal(store.get("session-a"), null);
  store.set("session-a", position);
  assert.deepEqual(store.get("session-a"), position);
  assert.equal(store.get("session-b"), null);

  store.clear();
  assert.equal(store.get("session-a"), null);
});

test("时间线使用运行期阅读位置恢复，并且不再读写数据库阅读状态", () => {
  const timeline = readUiSource(new URL("src/components/ReviewSessionTimeline.tsx", root), "utf8");
  const panel = readUiSource(new URL("src/components/ReviewPanel.tsx", root), "utf8");
  assert.match(timeline, /readingMemory/);
  assert.match(timeline, /readingMemory\.get\(sessionId\)/);
  assert.match(timeline, /readingMemory\.set\(sessionId/);
  assert.doesNotMatch(timeline, /getReadingState\(/);
  assert.doesNotMatch(timeline, /saveReadingState\(/);
  assert.match(timeline, /restoreReadingPosition\(/);
  assert.match(timeline, /eventKey/);
  assert.match(timeline, /offset/);
  assert.match(timeline, /sortDirection|direction/);
  assert.match(timeline, /filters/);
  assert.match(timeline, /searchScope/);
  assert.match(timeline, /requestGenerationRef/);
  assert.match(panel, /createReviewReadingMemoryStore/);
  assert.match(panel, /readingMemory/);
});
