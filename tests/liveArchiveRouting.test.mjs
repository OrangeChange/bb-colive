import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const connectionSource = readFileSync(
  fileURLToPath(new URL("../src/stores/connection.ts", import.meta.url)),
  "utf8",
);
const protocolConnectionSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/connection.ts", import.meta.url)),
  "utf8",
);

// Node 当前的 strip-only loader 无法执行既有 enum；这些数值对应 types.ts 的稳定枚举顺序。
const MsgType = {
  Gift: 1,
  LikeUpdate: 14,
  ScDeleted: 17,
  LiveStart: 22,
  LiveEnd: 23,
};

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`无法加载待实现的档案模块 ${relativePath}: ${message}`);
  }
}

const gift = (id, extra = {}) => ({
  id,
  msgType: MsgType.Gift,
  roomId: 101,
  ts: 1_700_000_000_000,
  gift: {
    id: 1,
    name: "小花",
    count: 1,
    price: 1000,
    coinType: "gold",
    total: 1000,
    priceRmb: 1,
    totalRmb: 1,
    isFree: false,
  },
  ...extra,
});

test("标准事件路由在阈值、去重和连击处理前保留档案输入且不改变现场顺序", async () => {
  const { routeAcceptedEvents } = await loadModule("../src/archive/archiveEventMutations.ts");
  const acceptedGift = gift("gift-1");
  const belowThresholdGift = gift("gift-low", {
    gift: { ...acceptedGift.gift, priceRmb: 0.01, totalRmb: 0.01 },
  });
  const duplicateGift = gift("gift-1");
  const comboUpdate = gift("gift-combo", { comboId: "combo-1", isComboUpdate: true });
  const statsOnly = {
    id: "stats-1",
    msgType: MsgType.LikeUpdate,
    roomId: 101,
    ts: 1_700_000_000_001,
    stats: { likes: 99 },
  };

  const result = routeAcceptedEvents([
    acceptedGift,
    belowThresholdGift,
    duplicateGift,
    comboUpdate,
    statsOnly,
  ]);
  const appendMutations = result.archiveMutations.filter((mutation) => mutation.kind === "append");

  assert.deepEqual(result.liveEvents.map((item) => item.id), ["gift-1", "gift-low", "gift-combo"]);
  assert.deepEqual(appendMutations.map((mutation) => mutation.event.id), ["gift-1", "gift-low", "gift-combo"]);
  assert.equal(appendMutations.filter((mutation) => mutation.event.id === "gift-1").length, 1);
  assert.equal(appendMutations.some((mutation) => mutation.event.msgType === MsgType.LikeUpdate), false);
  assert.equal(result.liveEvents.some((item) => item.msgType === MsgType.LikeUpdate), false);
});

test("SC 删除路由生成指向原 SC 事件的 update，而不是新增可见事件", async () => {
  const { toArchiveMutations } = await loadModule("../src/archive/archiveEventMutations.ts");

  const mutations = toArchiveMutations([{
    id: "sc-delete-1",
    msgType: MsgType.ScDeleted,
    roomId: 101,
    ts: 1_700_000_000_002,
    scDeleteIds: ["sc-1", "sc-2"],
  }]);

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].kind, "update");
  assert.deepEqual(mutations[0].targetEventKeys, [
    "101:archive-event:sc-1",
    "101:archive-event:sc-2",
  ]);
  assert.deepEqual(mutations[0].patch, { scDeleted: true });
});

test("场次生命周期按开播时间复用或拆分，并区分完整结束与异常中断", async () => {
  const {
    createLiveArchiveSession,
    ensureLiveArchiveSession,
    markArchiveLiveEnd,
    markArchiveLiveStart,
    markArchiveUnclean,
    shouldReuseArchiveOnLiveStart,
  } = await import("../src/stores/liveSession.ts");
  const created = createLiveArchiveSession({
    roomId: 101,
    ownerId: "room:101",
    now: 100,
    archiveId: "archive-1",
    sessionId: "session-1",
  });
  const resumed = ensureLiveArchiveSession(created, {
    roomId: 101,
    ownerId: "room:101",
    now: 200,
    sourceLiveStartedAt: 100,
  });
  assert.equal(resumed.sessionId, "session-1");
  assert.equal(resumed.archiveId, "archive-1");

  const started = markArchiveLiveStart(resumed, 300, { sourceLiveStartedAt: 100 });
  const ended = markArchiveLiveEnd(started, 400);
  assert.equal(ended.status, "ended");
  assert.equal(ended.quality, "complete");
  assert.equal(ended.startedAt, 300);
  assert.equal(ended.endedAt, 400);

  const unclean = markArchiveUnclean(started, "connection-error");
  assert.equal(unclean.status, "unclean");
  assert.equal(unclean.quality, "incomplete");
  assert.deepEqual(unclean.qualityReasons, ["connection-error"]);
  assert.equal(unclean.stopReason, "connection-error");

  assert.equal(shouldReuseArchiveOnLiveStart(unclean, { sourceLiveStartedAt: 100 }), true);
  assert.equal(shouldReuseArchiveOnLiveStart(unclean, { sourceLiveStartedAt: 200 }), false);
  assert.equal(shouldReuseArchiveOnLiveStart(started, { liveKey: "new-live" }), true);
  assert.equal(shouldReuseArchiveOnLiveStart(unclean, undefined), false);
});

test("连接层保留 room_init 的 live_time 作为档案开播时间来源", () => {
  const apiSource = readFileSync(
    fileURLToPath(new URL("../src/protocol/api.ts", import.meta.url)),
    "utf8",
  );
  assert.match(apiSource, /live_time\?: number/);
  assert.match(protocolConnectionSource, /liveStartedAt/);
  assert.match(protocolConnectionSource, /roomInit\.live_time/);
});

test("连接层会按平台开播身份恢复旧场次，并等待恢复结果后再创建新场次", () => {
  assert.match(connectionSource, /function scheduleArchiveSessionRecovery\(/);
  assert.match(connectionSource, /findResumableSession\(roomId, sourceLiveStartedAt\)/);
  assert.match(connectionSource, /getNextEventOrdinal\(summary\.sessionId\)/);
  assert.match(connectionSource, /restoreLiveArchiveSession\(summary,/);
  assert.match(connectionSource, /archiveRecoveryPromises/);
  assert.match(connectionSource, /recoveryLiveStartedAt/);
  assert.match(connectionSource, /recoveryGeneration\s*===\s*connectionGeneration/);
});

test("终止连接路径收口未结束档案且保留停止原因", async () => {
  const { createLiveArchiveSession, markArchiveUnclean } = await import("../src/stores/liveSession.ts");
  for (const reason of ["connection-closed", "connection-error", "manual-disconnect", "app-exit"]) {
    const stopped = markArchiveUnclean(createLiveArchiveSession({ roomId: 101, ownerId: "room:101", now: 100 }), reason);
    assert.equal(stopped.status, "unclean");
    assert.equal(stopped.recordingStatus, "stopped");
    assert.equal(stopped.stopReason, reason);
    assert.equal(stopped.endedAt, null);
  }
});

test("档案只在直播中捕获普通事件，开播和已有场次的下播是边界事件", async () => {
  const { shouldCaptureArchiveEvent } = await import("../src/stores/liveSession.ts");

  assert.equal(shouldCaptureArchiveEvent({ kind: "content", liveStatusBefore: 1 }), true);
  assert.equal(shouldCaptureArchiveEvent({ kind: "content", liveStatusBefore: 0 }), false);
  assert.equal(shouldCaptureArchiveEvent({ kind: "content", liveStatusBefore: 2 }), false);
  assert.equal(shouldCaptureArchiveEvent({ kind: "start", liveStatusBefore: 0 }), true);
  assert.equal(shouldCaptureArchiveEvent({ kind: "end", liveStatusBefore: 1, archiveStatus: "active" }), true);
  assert.equal(shouldCaptureArchiveEvent({ kind: "end", liveStatusBefore: 0 }), false);
  assert.equal(shouldCaptureArchiveEvent({ kind: "end", liveStatusBefore: 1, archiveStatus: "ended" }), false);
});

test("开播和下播档案分类统一为系统", async () => {
  const { normalizeArchivePrimaryCategory, toArchiveMutations, toArchiveEventInput } = await loadModule("../src/archive/archiveEventMutations.ts");
  const events = [
    { id: "live-start", msgType: MsgType.LiveStart, roomId: 101, ts: 1_700_000_000_000, text: "直播开始" },
    { id: "live-end", msgType: MsgType.LiveEnd, roomId: 101, ts: 1_700_000_000_001, text: "直播结束" },
  ];
  const mutations = toArchiveMutations(events);

  assert.deepEqual(
    mutations.map((mutation, ordinal) => toArchiveEventInput(mutation, {
      sessionId: "session-1",
      roomId: 101,
      ordinal,
      eventKey: mutation.eventKey,
    }).primaryCategory),
    ["system", "system"],
  );
  assert.equal(normalizeArchivePrimaryCategory("lifecycle"), "system");
});

test("没有已接受事件时，连接准备和 room_init 不预创建回看场次", () => {
  assert.doesNotMatch(connectionSource, /ensureArchiveSession\(/);
  assert.match(connectionSource, /ensureArchiveSessionForAcceptedEvent\(/);
});

test("现场付费事件累计到场次 paidTotal，并保留小数金额", async () => {
  const {
    sumArchivePaidTotal,
    toArchiveMutations,
  } = await loadModule("../src/archive/archiveEventMutations.ts");
  const { createLiveArchiveSession, toArchiveSessionInput } = await loadModule("../src/stores/liveSession.ts");
  const payments = [
    gift("gift-decimal", {
      gift: {
        id: 1,
        name: "小花",
        count: 1,
        price: 1250,
        coinType: "gold",
        total: 1250,
        priceRmb: 1.25,
        totalRmb: 1.25,
        isFree: false,
      },
    }),
    { id: "sc-1", msgType: 2, roomId: 101, ts: 1_700_000_000_001, sc: { price: 2.5, message: "支持" } },
    { id: "guard-1", msgType: 3, roomId: 101, ts: 1_700_000_000_002, guard: { level: 1, count: 1, priceRmb: 198 } },
  ];
  const paidTotal = sumArchivePaidTotal(toArchiveMutations(payments));
  const archive = { ...createLiveArchiveSession({ roomId: 101, ownerId: "room:101", now: 100 }), paidTotal };

  assert.equal(paidTotal, 201.75);
  assert.equal(toArchiveSessionInput(archive, 200).paidTotal, 201.75);
  assert.match(connectionSource, /paidTotal/);
  assert.match(connectionSource, /sessionUpdate:[\s\S]*toArchiveSessionInput/);
});

test("连击更新只累计实际新增金额，不重复计算累计总额", async () => {
  const { sumArchivePaidTotal, toArchiveMutations } = await loadModule("../src/archive/archiveEventMutations.ts");
  const first = gift("gift-combo-first", {
    comboId: "combo-paid",
    gift: { ...gift("source").gift, count: 1, total: 1_250, totalRmb: 1.25 },
  });
  const update = gift("gift-combo-update", {
    comboId: "combo-paid",
    isComboUpdate: true,
    gift: { ...first.gift, count: 3, total: 3_750, totalRmb: 3.75 },
  });

  assert.equal(sumArchivePaidTotal(toArchiveMutations([first, update])), 3.75);
});

test("LiveEnd 仍沿用 pending 批处理，不在 onEvent 立即触发现场 flush", () => {
  assert.doesNotMatch(
    connectionSource,
    /if\s*\(\s*ev\.msgType\s*===\s*MsgType\.LiveEnd\s*\)\s*flush\s*\(\s*\)/,
  );
  assert.match(
    connectionSource,
    /if\s*\(!isStatisticsEvent\(ev\)\)\s*\{\s*pendingEvents\.push\(\{\s*event:\s*ev,\s*liveStatusBefore\s*\}\);/,
  );
});

test("结束场次收到已接受的迟到事件时复用原档案，不创建第二场", async () => {
  const {
    createLiveArchiveSession,
    getLiveArchiveSessionForAcceptedEvent,
    markArchiveLiveEnd,
    markArchiveLiveStart,
  } = await import("../src/stores/liveSession.ts");
  const created = createLiveArchiveSession({
    roomId: 101,
    ownerId: "room:101",
    now: 100,
    archiveId: "archive-1",
    sessionId: "session-1",
  });
  const ended = markArchiveLiveEnd(markArchiveLiveStart(created, 300), 400);

  const latePreparing = getLiveArchiveSessionForAcceptedEvent(ended, {
    roomId: 101,
    ownerId: "room:101",
    now: 500,
  });
  const lateScDelete = getLiveArchiveSessionForAcceptedEvent(latePreparing, {
    roomId: 101,
    ownerId: "room:101",
    now: 600,
  });

  assert.equal(latePreparing.sessionId, "session-1");
  assert.equal(latePreparing.archiveId, "archive-1");
  assert.equal(lateScDelete.sessionId, "session-1");
  assert.equal(lateScDelete.status, "ended");
});
