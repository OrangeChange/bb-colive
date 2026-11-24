import test from "node:test";
import assert from "node:assert/strict";
import {
  getLiveSession,
  getLiveDedupeKeys,
  putLiveSession,
} from "../src/stores/liveSession.ts";

const event = (roomId, id) => ({
  id,
  msgType: 0,
  roomId,
  ts: 1,
});

test("按真实房间号分别保存并恢复现场事件和统计快照", () => {
  const a = {
    events: [event(101, "a-1")],
    stats: { fans: 10, likes: 20 },
    listCount: 1,
  };
  const b = {
    events: [event(202, "b-1"), event(202, "b-2")],
    stats: { fans: 30, likes: 40 },
    listCount: 2,
  };

  const sessions = putLiveSession(putLiveSession({}, 101, a), 202, b);

  assert.deepEqual(getLiveSession(sessions, 101), a);
  assert.deepEqual(getLiveSession(sessions, 202), b);
  assert.deepEqual(getLiveSession(sessions, 303), {
    events: [],
    stats: {},
    listCount: 0,
  });
});

test("恢复房间会话时能取回历史事件的去重键", () => {
  const events = [
    { ...event(101, "a-1"), dedupe: "a-dedupe" },
    event(101, "a-2"),
  ];

  assert.deepEqual(getLiveDedupeKeys(events), ["a-dedupe", "a-2"]);
});

test("迟到开播时间合并晚加入缺口，并保留已有中断原因", async () => {
  const { createLiveArchiveSession, ensureLiveArchiveSession, markArchiveUnclean, markArchiveLiveStart } =
    await import("../src/stores/liveSession.ts");
  const capturedAt = 1_700_000_000_000;
  const initial = createLiveArchiveSession({ roomId: 101, ownerId: "room:101", now: capturedAt });
  const interrupted = markArchiveUnclean(initial, "connection-error", "reconnecting");
  const recording = markArchiveLiveStart(interrupted, capturedAt + 1000);
  assert.equal(recording.sourceLiveStartedAt, null);
  assert.deepEqual(recording.qualityReasons, ["connection-error"]);
  const updated = ensureLiveArchiveSession(recording, {
    roomId: 101, ownerId: "room:101", now: capturedAt + 2000, sourceLiveStartedAt: capturedAt - 60000,
  });
  assert.equal(updated.sessionId, recording.sessionId);
  assert.equal(updated.quality, "incomplete");
  assert.deepEqual(updated.qualityReasons, ["connection-error", "live-start-not-captured"]);
  assert.equal(updated.qualityReason, "start-time-unknown");
  assert.equal(updated.recordingStatus, "recording");
  assert.equal(updated.stopReason, null);
  const repeated = ensureLiveArchiveSession(updated, {
    roomId: 101, ownerId: "room:101", now: capturedAt + 3000, sourceLiveStartedAt: capturedAt - 60000,
  });
  assert.deepEqual(repeated.qualityReasons, ["connection-error", "live-start-not-captured"]);
});

test("档案场次只使用开播时间判断，两个 key 不参与合并", async () => {
  const {
    compareArchiveLiveIdentity,
    createLiveArchiveSession,
    ensureLiveArchiveSession,
    markArchiveLiveStart,
    markArchiveUnclean,
    toArchiveSessionInput,
    updateArchiveLiveCover,
  } = await import("../src/stores/liveSession.ts");
  const base = createLiveArchiveSession({
    roomId: 101,
    ownerId: "room:101",
    now: 1_700_000_000_000,
    coverUrl: "https://example.com/cover.jpg",
  });
  const first = markArchiveLiveStart(base, 1_700_000_000_000, {
    sourceLiveStartedAt: 1_700_000_000_000,
  });
  const reconnect = markArchiveLiveStart(base, 1_700_000_000_100, {
    liveKey: "different-key",
    subSessionKey: "different-subkey",
    sourceLiveStartedAt: 1_700_000_000_000,
  });
  const nextLive = markArchiveLiveStart(base, 1_700_003_600_000, {
    liveKey: "same-looking-key",
    sourceLiveStartedAt: 1_700_003_600_000,
  });
  const keyOnly = markArchiveLiveStart(base, 1_700_000_000_000, { liveKey: "live-a", subSessionKey: "sub-a" });

  assert.equal(compareArchiveLiveIdentity(first, reconnect), "same");
  assert.equal(compareArchiveLiveIdentity(first, nextLive), "different");
  assert.equal(compareArchiveLiveIdentity(first, keyOnly), "unknown");
  assert.equal(first.identityEvidence, "source-live-time");
  assert.equal(toArchiveSessionInput(first, 2).liveKey, null);
  assert.equal(toArchiveSessionInput(first, 2).coverUrl, "https://example.com/cover.jpg");
  assert.equal(updateArchiveLiveCover(first, "https://example.com/new-cover.jpg"), first);

  const emptyCover = createLiveArchiveSession({ roomId: 101, ownerId: "room:101", now: 9 });
  const filledCover = updateArchiveLiveCover(emptyCover, "https://example.com/cover.jpg");
  assert.equal(filledCover.coverUrl, "https://example.com/cover.jpg");

  const titled = ensureLiveArchiveSession(base, { roomId: 101, ownerId: "room:101", now: 2, title: "B站开播标题" });
  assert.equal(titled.title, "B站开播标题");
  assert.equal(titled.titleSource, "bilibili");
  assert.match(base.title ?? "", /直播$/);

  const unclean = markArchiveUnclean(first, "connection-error");
  const sameLive = ensureLiveArchiveSession(unclean, {
    roomId: 101,
    ownerId: "room:101",
    now: 3,
    sourceLiveStartedAt: 1_700_000_000_000,
  });
  const nextSession = ensureLiveArchiveSession(unclean, {
    roomId: 101,
    ownerId: "room:101",
    now: 4,
    sourceLiveStartedAt: 1_700_003_600_000,
  });
  const unknownSession = ensureLiveArchiveSession(unclean, {
    roomId: 101,
    ownerId: "room:101",
    now: 5,
  });
  assert.equal(sameLive.sessionId, first.sessionId);
  assert.notEqual(nextSession.sessionId, first.sessionId);
  assert.notEqual(unknownSession.sessionId, first.sessionId);
});

test("从数据库场次摘要恢复时保留身份、事件序号和累计金额", async () => {
  const { restoreLiveArchiveSession } = await import("../src/stores/liveSession.ts");
  const restored = restoreLiveArchiveSession({
    sessionId: "session-db-1",
    ownerId: "room:101",
    roomId: 101,
    title: "历史标题",
    coverUrl: "https://example.com/restored-cover.jpg",
    latestTitle: "最新标题",
    titleSource: "bilibili",
    liveKey: null,
    subSessionKey: null,
    sourceLiveStartedAt: 1_700_000_000_000,
    identityEvidence: "source-live-time",
    startedAt: 1_700_000_000_000,
    endedAt: null,
    status: "unclean",
    quality: "incomplete",
    qualityReason: "previous-runtime",
    eventCount: 42,
    paidTotal: 12.5,
    favoriteCount: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_100_000,
    durationMs: null,
  }, 1_700_000_200_000);

  assert.equal(restored.sessionId, "session-db-1");
  assert.equal(restored.roomId, 101);
  assert.equal(restored.sourceLiveStartedAt, 1_700_000_000_000);
  assert.equal(restored.nextOrdinal, 42);
  assert.equal(restored.paidTotal, 12.5);
  assert.equal(restored.status, "active");
  assert.equal(restored.endedAt, null);
  assert.equal(restored.qualityReason, "previous-runtime");
  assert.equal(restored.title, "历史标题");
  assert.equal(restored.latestTitle, "最新标题");
  assert.equal(restored.coverUrl, "https://example.com/restored-cover.jpg");

  const repeatedStart = (await import("../src/stores/liveSession.ts")).markArchiveLiveStart(
    restored,
    1_700_000_200_000,
    { sourceLiveStartedAt: 1_700_000_000_000 },
  );
  assert.equal(repeatedStart.qualityReason, "previous-runtime");
});

test("恢复场次优先使用数据库事件行推导出的下一个序号", async () => {
  const { restoreLiveArchiveSession } = await import("../src/stores/liveSession.ts");
  const restored = restoreLiveArchiveSession({
    sessionId: "session-db-2",
    ownerId: "room:101",
    roomId: 101,
    title: "历史标题",
    startedAt: 1_700_000_000_000,
    status: "unclean",
    quality: "incomplete",
    eventCount: 3,
    paidTotal: 0,
    durationMs: null,
  }, 1_700_000_200_000, 8);

  assert.equal(restored.nextOrdinal, 8);
});

test("平台开播早于首次捕获时间时，结束后仍标记为不完整", async () => {
  const { createLiveArchiveSession, markArchiveLiveStart, markArchiveLiveEnd } = await import(
    "../src/stores/liveSession.ts",
  );
  const sourceStartedAt = 1_700_000_000_000;
  const capturedAt = sourceStartedAt + 55 * 60 * 1000;
  const base = createLiveArchiveSession({
    roomId: 101,
    ownerId: "room:101",
    now: capturedAt,
    sourceLiveStartedAt: sourceStartedAt,
  });

  const started = markArchiveLiveStart(base, capturedAt, { sourceLiveStartedAt: sourceStartedAt });
  const ended = markArchiveLiveEnd(started, capturedAt + 60 * 60 * 1000);

  assert.equal(ended.quality, "incomplete");
  assert.equal(ended.qualityReason, "live-start-not-captured");
});

test("没有平台开播时间时，收到本地 LIVE 快照也不能判定为完整", async () => {
  const { createLiveArchiveSession, markArchiveLiveStart, markArchiveLiveEnd } = await import(
    "../src/stores/liveSession.ts",
  );
  const capturedAt = 1_700_000_000_000;
  const base = createLiveArchiveSession({ roomId: 101, ownerId: "room:101", now: capturedAt });

  const started = markArchiveLiveStart(base, capturedAt);
  const ended = markArchiveLiveEnd(started, capturedAt + 60 * 60 * 1000);

  assert.equal(ended.quality, "in-progress");
  assert.equal(ended.qualityReason, "start-time-unknown");
});

test("恢复记录清空停止原因，保留质量缺口；停止和下播分别收口", async () => {
  const { createLiveArchiveSession, markArchiveLiveStart, markArchiveUnclean, ensureLiveArchiveSession, markArchiveLiveEnd } =
    await import("../src/stores/liveSession.ts");
  const time = 1_700_000_000_000;
  const started = markArchiveLiveStart(createLiveArchiveSession({ roomId: 101, ownerId: "room:101", now: time,
    sourceLiveStartedAt: time }), time, { sourceLiveStartedAt: time });
  const stopped = markArchiveUnclean(started, "connection-switched");
  assert.equal(stopped.recordingStatus, "stopped");
  assert.equal(stopped.stopReason, "connection-switched");
  assert.deepEqual(stopped.qualityReasons, ["connection-switched"]);
  const resumed = ensureLiveArchiveSession(stopped, { roomId: 101, ownerId: "room:101", now: time + 2000,
    sourceLiveStartedAt: time });
  assert.equal(resumed.recordingStatus, "recording");
  assert.equal(resumed.stopReason, null);
  assert.equal(resumed.quality, "incomplete");
  const ended = markArchiveLiveEnd(resumed, time + 3000);
  assert.equal(ended.recordingStatus, "stopped");
  assert.deepEqual(ended.qualityReasons, ["connection-switched"]);
  const exit = markArchiveUnclean(ended, "app-exit");
  assert.equal(exit.status, "ended");
  assert.equal(exit.endedAt, time + 3000);
});

test("同一场重连不会清除首次捕获时已经确定的不完整原因", async () => {
  const { createLiveArchiveSession, markArchiveLiveStart, markArchiveLiveEnd } = await import(
    "../src/stores/liveSession.ts",
  );
  const sourceStartedAt = 1_700_000_000_000;
  const firstCapturedAt = sourceStartedAt + 10 * 60 * 1000;
  const base = createLiveArchiveSession({
    roomId: 101,
    ownerId: "room:101",
    now: firstCapturedAt,
    sourceLiveStartedAt: sourceStartedAt,
  });

  const firstStart = markArchiveLiveStart(base, firstCapturedAt, { sourceLiveStartedAt: sourceStartedAt });
  const reconnected = markArchiveLiveStart(firstStart, firstCapturedAt + 30 * 60 * 1000, {
    sourceLiveStartedAt: sourceStartedAt,
  });
  const ended = markArchiveLiveEnd(reconnected, firstCapturedAt + 40 * 60 * 1000);

  assert.equal(ended.quality, "incomplete");
  assert.equal(ended.qualityReason, "live-start-not-captured");
});

test("平台开播时间与首次捕获相差几秒时允许判定为完整", async () => {
  const { createLiveArchiveSession, markArchiveLiveStart, markArchiveLiveEnd } = await import(
    "../src/stores/liveSession.ts",
  );
  const sourceStartedAt = 1_700_000_000_000;
  const capturedAt = sourceStartedAt + 3_000;
  const base = createLiveArchiveSession({
    roomId: 101,
    ownerId: "room:101",
    now: capturedAt,
    sourceLiveStartedAt: sourceStartedAt,
  });

  const started = markArchiveLiveStart(base, capturedAt, { sourceLiveStartedAt: sourceStartedAt });
  const ended = markArchiveLiveEnd(started, capturedAt + 60 * 60 * 1000);

  assert.equal(ended.quality, "complete");
  assert.equal(ended.qualityReason, null);
});
