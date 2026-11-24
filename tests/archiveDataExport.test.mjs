import test from "node:test";
import assert from "node:assert/strict";

async function loadExport() {
  try {
    return await import("../src/archive/archiveDataExport.ts");
  } catch (error) {
    assert.fail(`无法加载业务导出模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadProjection() {
  try {
    return await import("../src/archive/archiveProjection.ts");
  } catch (error) {
    assert.fail(`无法加载回看投影模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

const MSG = {
  danmu: 0,
  gift: 1,
  superChat: 2,
  guardBuy: 3,
  anchorLotStart: 4,
  anchorLotAward: 5,
  redPocketStart: 6,
  redPocketWinner: 7,
  redPocketGift: 8,
  guardHonor: 9,
  interact: 10,
  entryEffect: 11,
  liveStart: 21,
  unknown: 255,
};

function user(uid = "u-1", uname = "用户甲", guardLevel = 0, patch = {}) {
  return {
    uid,
    uname,
    guardLevel,
    wealthLevel: 42,
    medal: { name: "小路泥", level: 18, isCurrentRoom: true },
    ...patch,
  };
}

function record(event, ordinal, patch = {}) {
  return {
    eventKey: patch.eventKey ?? `session-1:archive-event:${event.id}`,
    sessionId: patch.sessionId ?? "session-1",
    roomId: 101,
    ordinal,
    eventTs: event.ts,
    primaryCategory: patch.primaryCategory ?? "",
    secondaryCategory: patch.secondaryCategory ?? null,
    userUid: event.user?.uid ?? null,
    userName: event.user?.uname ?? null,
    searchText: [event.text, event.user?.uname, event.gift?.name].filter(Boolean).join(" ").toLowerCase(),
    payloadJson: JSON.stringify(event),
    sourceId: null,
    favorited: patch.favorited ?? false,
  };
}

function event(id, msgType, ts, patch = {}) {
  return { id, msgType, roomId: 101, ts, user: user(), ...patch };
}

test("业务导出只保留五类事件并排除里程碑和中奖明细", async () => {
  const { projectArchiveDataEvents } = await loadExport();
  const rows = [
    record(event("danmu", MSG.danmu, 1000, { text: "你好" }), 0),
    record(event("interact", MSG.interact, 1100, { text: "关注了主播" }), 1),
    record(event("gift", MSG.gift, 1200, { gift: { name: "礼物", count: 1, price: 1000, priceRmb: 1, total: 1000, totalRmb: 1, paymentRmb: 0.9, coinType: "gold" } }), 2),
    record(event("blind", MSG.gift, 1300, { gift: { name: "好运柚叶", count: 1, price: 2500, priceRmb: 2.5, total: 2500, totalRmb: 2.5, coinType: "gold", blindGiftName: "幸运盲盒", blindPriceRmb: 5, blindHitPriceRmb: 2.5 } }), 3),
    record(event("red", MSG.redPocketStart, 1400, { lottery: { totalPrice: 5000, awardName: "礼物", awardNum: 1 } }), 4),
    record(event("sc", MSG.superChat, 1500, { sc: { message: "支持", price: 30, duration: 30 } }), 5),
    record(event("guard", MSG.guardBuy, 1600, { guard: { level: 1, count: 1, unit: "月", priceRmb: 198, action: "开通" } }), 6),
    record(event("honor", MSG.guardHonor, 1700, { honor: { firstLine: "里程碑", secondLine: "千舰" } }), 7),
    record(event("winner", MSG.redPocketWinner, 1800, { lottery: { totalPrice: 5000, awardName: "礼物", awardNum: 1 } }), 8),
    record(event("lottery", MSG.anchorLotStart, 1900, { lottery: { awardName: "礼物", awardNum: 1 } }), 9),
    record(event("entry-effect", MSG.entryEffect, 2000), 10),
    record(event("unknown", MSG.unknown, 2100), 11),
  ];

  const projected = rows.map((row) => ({
    eventKey: row.eventKey,
    sourceEventKeys: [row.eventKey],
    sessionId: row.sessionId,
    roomId: row.roomId,
    ordinal: row.ordinal,
    eventTs: row.eventTs,
    primaryCategory: row.primaryCategory,
    secondaryCategory: row.secondaryCategory,
    favorited: row.favorited,
    record: row,
    event: JSON.parse(row.payloadJson),
  }));
  const result = projectArchiveDataEvents(projected);

  assert.deepEqual(result.map((item) => item.category), [
    "danmaku", "interaction", "gift", "gift", "gift", "superchat", "guard",
  ]);
  assert.equal(result[3].row["礼物类型"], "盲盒");
  assert.equal(result[4].row["礼物类型"], "红包");
  assert.equal(result[2].row["礼物价值"], 1);
  assert.equal(result[2].row["实际支付金额"], 0.9);
});

test("业务行保留回复前缀、荣耀等级和当前房间粉丝牌", async () => {
  const { projectArchiveDataEvents } = await loadExport();
  const row = record(event("reply", MSG.danmu, 1000, {
    text: "这期神了",
    replyTo: user("u-2", "被回复的人"),
  }), 0);
  const [result] = projectArchiveDataEvents([{
    eventKey: row.eventKey,
    sourceEventKeys: [row.eventKey],
    sessionId: row.sessionId,
    roomId: row.roomId,
    ordinal: row.ordinal,
    eventTs: row.eventTs,
    primaryCategory: row.primaryCategory,
    secondaryCategory: row.secondaryCategory,
    favorited: false,
    record: row,
    event: JSON.parse(row.payloadJson),
  }]);

  assert.equal(result.row["荣耀等级"], 42);
  assert.equal(result.row["粉丝牌"], "小路泥 18");
  assert.equal(result.row["内容"], "@被回复的人 这期神了");
});

test("完整连击投影后只输出一个业务礼物事件，盲盒价值和支付金额分列", async () => {
  const { projectArchiveDataEvents } = await loadExport();
  const { projectArchiveEvents } = await loadProjection();
  const rows = [1, 3, 10].map((count, index) => {
    const raw = record(event(`combo-${count}`, MSG.gift, 1000 + index, {
      comboId: "combo-1",
      isComboUpdate: true,
      gift: { name: "普通礼物", count, price: 2500, priceRmb: 2.5, total: count * 2500, totalRmb: count * 2.5, coinType: "gold" },
    }), index);
    return {
      eventKey: raw.eventKey,
      sourceEventKeys: [raw.eventKey],
      sessionId: raw.sessionId,
      roomId: raw.roomId,
      ordinal: raw.ordinal,
      eventTs: raw.eventTs,
      primaryCategory: raw.primaryCategory,
      secondaryCategory: raw.secondaryCategory,
      favorited: false,
      record: raw,
      event: JSON.parse(raw.payloadJson),
    };
  });
  const [result] = projectArchiveDataEvents(projectArchiveEvents(rows.map((row) => row.record)));
  assert.equal(result.row["数量"], 10);
  assert.equal(result.row["礼物价值"], 25);
  assert.equal(result.row["实际支付金额"], 25);

  const blindRecord = record(event("blind-combo", MSG.gift, 2000, {
    gift: { name: "好运柚叶", count: 2, price: 2500, priceRmb: 2.5, total: 5000, totalRmb: 5, paymentRmb: 10, coinType: "gold", blindGiftName: "幸运盲盒", blindPriceRmb: 5, blindHitPriceRmb: 2.5 },
  }), 3);
  const [blind] = projectArchiveDataEvents(projectArchiveEvents([blindRecord]));
  assert.equal(blind.row["礼物价值"], 5);
  assert.equal(blind.row["实际支付金额"], 10);
});

test("summary只统计最终业务行，未知金额不会伪装成完整金额", async () => {
  const { buildArchiveDataSummary } = await loadExport();
  const sessions = [{ sessionId: "session-1", ownerId: "owner-1", roomId: 101, title: "测试", startedAt: 1000, endedAt: 2000, status: "ended", quality: "complete", durationMs: 1000 }];
  const rows = [
    { category: "danmaku", sessionId: "session-1", eventTs: 1000, ordinal: 0, eventKey: "a", row: { "场次ID": "session-1", "事件时间": "2026-09-26 12:00:01", "用户UID": "u-1", "用户名": "甲", "内容": "a" } },
    { category: "gift", sessionId: "session-1", eventTs: 1100, ordinal: 1, eventKey: "b", row: { "场次ID": "session-1", "事件时间": "2026-09-26 12:00:02", "用户UID": "u-1", "用户名": "甲", "礼物类型": "普通礼物", "数量": 2, "礼物价值": 20, "实际支付金额": null } },
  ];
  const [summary] = buildArchiveDataSummary(sessions, rows);
  assert.equal(summary.stats.danmaku.eventCount, 1);
  assert.equal(summary.stats.normalGift.eventCount, 1);
  assert.equal(summary.stats.normalGift.amount, null);
  assert.equal(summary.stats.normalGift.value, 20);
  assert.equal(summary.exportedEventCount, 2);
});

function sessionSummary(sessionId, ownerId = "owner-1") {
  return { sessionId, ownerId, roomId: 101, title: sessionId, startedAt: 1000, endedAt: 2000, status: "ended", quality: "complete", durationMs: 1000, eventCount: 2, paidTotal: 0, favoriteCount: 0 };
}

function archiveRecord(sessionId, index) {
  const payload = event(`${sessionId}-event-${index}`, MSG.danmu, 1000 + index, { text: `内容${index}` });
  return record(payload, index, { sessionId });
}

test("主播导出会读取完整场次和事件分页，而不是只读取当前页面", async () => {
  const { collectArchiveDataExportSnapshot } = await loadExport();
  const allSessions = Array.from({ length: 205 }, (_, index) => sessionSummary(`session-${index}`));
  const repository = {
    listSessions: async (query) => allSessions.slice(query.offset ?? 0, (query.offset ?? 0) + 100),
    getSession: async (sessionId) => allSessions.find((session) => session.sessionId === sessionId) ?? null,
    queryEvents: async ({ sessionId, cursor, limit }) => {
      const start = cursor ? Number(cursor) : 0;
      const items = [0, 1].map((index) => archiveRecord(sessionId, start + index)).slice(0, Math.min(limit ?? 500, 2));
      const nextCursor = start + items.length < 2 ? String(start + items.length) : null;
      return { items, nextCursor, totalCount: 2 };
    },
  };
  const snapshot = await collectArchiveDataExportSnapshot(repository, { kind: "owner", ownerId: "owner-1" });
  assert.equal(snapshot.sessions.length, 205);
  assert.equal(snapshot.records.length, 410);
});

test("分页读取期间取消会停止后续读取并返回 AbortError", async () => {
  const { collectArchiveDataExportSnapshot } = await loadExport();
  const controller = new AbortController();
  let queryCount = 0;
  const repository = {
    getSession: async () => sessionSummary("session-1"),
    queryEvents: async ({ sessionId, cursor }) => {
      queryCount += 1;
      const start = cursor ? Number(cursor) : 0;
      const items = [archiveRecord(sessionId, start)];
      return { items, nextCursor: start < 2 ? String(start + 1) : null, totalCount: 3 };
    },
  };
  await assert.rejects(
    collectArchiveDataExportSnapshot(repository, { kind: "session", sessionId: "session-1" }, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    }),
    (error) => error?.name === "AbortError",
  );
  assert.equal(queryCount, 1);
});
