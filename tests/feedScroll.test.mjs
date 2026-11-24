import test from "node:test";
import assert from "node:assert/strict";
import { updateUnreadCount } from "../src/events/feedScroll.ts";

const feedScroll = await import("../src/events/feedScroll.ts");

test("贴底时追加消息不产生未读提示", () => {
  assert.equal(updateUnreadCount(0, 10, 14, false, true), 0);
});

test("用户上翻后只累计新增的可见消息", () => {
  assert.equal(updateUnreadCount(3, 10, 14, false, false), 7);
});

test("切换房间或筛选视图时清空旧的未读数量", () => {
  assert.equal(updateUnreadCount(8, 10, 14, true, false), 0);
});

test("未读数量最多显示 999+", () => {
  assert.equal(updateUnreadCount(998, 10, 20, false, false), 999);
});

test("新的面板会话默认跟随最新消息，而不是停在顶部", () => {
  const session = feedScroll.createFeedScrollSession(120);

  assert.deepEqual(session, {
    initialized: false,
    scrollTop: 0,
    followingLatest: true,
    unreadCount: 0,
    visibleCount: 120,
  });
});

test("恢复历史位置时限制在新的滚动范围内，跟随最新时恢复到底部", () => {
  const history = {
    initialized: true,
    scrollTop: 850,
    followingLatest: false,
    unreadCount: 4,
    visibleCount: 100,
  };
  const latest = { ...history, followingLatest: true };

  assert.equal(feedScroll.getRestoredScrollTop(history, 1000, 300), 700);
  assert.equal(feedScroll.getRestoredScrollTop(history, 500, 300), 200);
  assert.equal(feedScroll.getRestoredScrollTop(latest, 1000, 300), 700);
});

test("记录真实滚动位置时同步跟随状态、未读数和可见事件数", () => {
  const session = feedScroll.createFeedScrollSession(10);

  feedScroll.captureFeedScrollSession(session, {
    scrollTop: 120,
    scrollHeight: 1000,
    clientHeight: 300,
    unreadCount: 7,
    visibleCount: 24,
  });

  assert.deepEqual(session, {
    initialized: true,
    scrollTop: 120,
    followingLatest: false,
    unreadCount: 7,
    visibleCount: 24,
  });
});

test("尺寸重排恢复时保留原有的自动滚动状态", () => {
  const latest = {
    scrollTop: 1200,
    followingLatest: true,
  };
  const history = {
    scrollTop: 420,
    followingLatest: false,
  };

  assert.deepEqual(
    feedScroll.restoreFeedLayoutSnapshot(
      feedScroll.captureFeedLayoutSnapshot(latest),
      2200,
      500,
    ),
    { scrollTop: 1700, followingLatest: true },
  );
  assert.deepEqual(
    feedScroll.restoreFeedLayoutSnapshot(
      feedScroll.captureFeedLayoutSnapshot(history),
      2200,
      500,
    ),
    { scrollTop: 420, followingLatest: false },
  );
});

test("滚动会话支持顶部和底部两个最新边缘", () => {
  assert.equal(feedScroll.getLatestScrollTop("bottom", 1000, 300), 700);
  assert.equal(feedScroll.getLatestScrollTop("top", 1000, 300), 0);
  assert.equal(feedScroll.isFollowingLatest("top", 4), true);
  assert.equal(feedScroll.isFollowingLatest("bottom", 696, 1000, 300), true);
  assert.equal(feedScroll.isFollowingLatest("bottom", 500, 1000, 300), false);
});

test("顶部追加模式的初始事件从列表底部开始排列", () => {
  assert.equal(feedScroll.getFeedStackAlignment("top"), "end");
  assert.equal(feedScroll.getFeedStackAlignment("bottom"), "start");
});

test("顶部追加且已定位时，按新增内容高度保持原阅读位置", () => {
  assert.equal(
    feedScroll.getTopAppendScrollTop?.({
      scrollTop: 240,
      previousScrollHeight: 1200,
      nextScrollHeight: 1380,
      clientHeight: 500,
      followingLatest: false,
    }),
    420,
  );
});

test("顶部追加且跟随最新时，始终保持在顶部", () => {
  assert.equal(
    feedScroll.getTopAppendScrollTop?.({
      scrollTop: 240,
      previousScrollHeight: 1200,
      nextScrollHeight: 1380,
      clientHeight: 500,
      followingLatest: true,
    }),
    0,
  );
});

test("跳转定位时同数量的高度变化不触发顶部追加补偿", () => {
  assert.equal(
    feedScroll.shouldAdjustTopAppendAnchor?.({
      visibleCount: 100,
      anchorVisibleCount: 100,
      scrollHeightChanged: true,
      prependSettling: false,
    }),
    false,
  );
});

test("顶部追加后的安全区变化允许完成一次补偿", () => {
  assert.equal(
    feedScroll.shouldAdjustTopAppendAnchor?.({
      visibleCount: 100,
      anchorVisibleCount: 100,
      scrollHeightChanged: true,
      prependSettling: true,
    }),
    true,
  );
});

test("阅读历史时前插或淘汰消息后保留来源窗口", () => {
  const ids = Array.from({length: 80}, (_, i) => String(i));
  assert.equal(feedScroll.getRetainedFeedWindowStart(ids.slice(0, 60), ['new', ...ids], 60), 1);
  assert.equal(feedScroll.getRetainedFeedWindowStart(ids.slice(20), ids.slice(10), 60), 10);
  assert.equal(feedScroll.getRetainedFeedWindowStart(['missing'], ids, 60), undefined);
});

test("置顶栏溢出时纵向滚轮转换为横向滚动，原横向输入保持原样",()=>{
  const area={scrollWidth:800,clientWidth:400,scrollLeft:0};let prevented=0;
  feedScroll.scrollSticky({currentTarget:area,deltaX:0,deltaY:80,preventDefault:()=>prevented++});
  assert.equal(area.scrollLeft,80);assert.equal(prevented,1);
  feedScroll.scrollSticky({currentTarget:area,deltaX:90,deltaY:10,preventDefault:()=>prevented++});
  assert.equal(area.scrollLeft,80);assert.equal(prevented,1);
  area.scrollWidth=400;
  feedScroll.scrollSticky({currentTarget:area,deltaX:0,deltaY:80,preventDefault:()=>prevented++});
  assert.equal(prevented,1);
});
