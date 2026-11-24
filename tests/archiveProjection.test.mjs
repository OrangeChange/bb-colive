import test from "node:test";
import assert from "node:assert/strict";

test("显式用户条件优先于旧搜索文本，不再次按内容剔除", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const row = record({ event: event("reply-1", 0, 1, { text: "这期神了", replyTo: { uname: "目标用户" } }) }, 0);
  assert.equal(projectArchiveEvents([row], { filters: { searchText: "旧搜索", keywordConditions: [{ field: "user", value: "用户甲" }] } }).length, 1);
});

async function loadProjection() {
  try {
    return await import("../src/archive/archiveProjection.ts");
  } catch (error) {
    assert.fail(`无法加载回看投影模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadContentSearch() {
  try {
    return await import("../src/archive/archiveContentSearch.ts");
  } catch (error) {
    assert.fail(`无法加载回看内容搜索模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

const MSG = {
  danmu: 0,
  gift: 1,
  superChat: 2,
  guardBuy: 3,
  interact: 10,
  liveStart: 22,
};

function user(uid = "u-1", uname = "用户甲", guardLevel = 0) {
  return { uid, uname, guardLevel };
}

function event(id, msgType, ts, patch = {}) {
  return {
    id,
    msgType,
    roomId: 101,
    ts,
    user: user(),
    ...patch,
  };
}

function categoryFor(msgType) {
  if (msgType === MSG.danmu) return "danmu";
  if (msgType === MSG.gift) return "gift";
  if (msgType === MSG.superChat) return "superChat";
  if (msgType === MSG.guardBuy) return "guard";
  if (msgType === MSG.interact) return "interact";
  if (msgType === MSG.liveStart) return "system";
  return "system";
}

function record(input, ordinal) {
  const payload = input.event;
  return {
    eventKey: input.eventKey ?? `session-1:archive-event:${payload.id}`,
    sessionId: "session-1",
    roomId: 101,
    ordinal,
    eventTs: payload.ts,
    primaryCategory: input.primaryCategory ?? categoryFor(payload.msgType),
    secondaryCategory: input.secondaryCategory ?? null,
    userUid: payload.user?.uid ?? null,
    userName: payload.user?.uname ?? null,
    searchText: input.searchText ?? [payload.text, payload.user?.uname, payload.gift?.name].filter(Boolean).join(" ").toLocaleLowerCase(),
    payloadJson: JSON.stringify(payload),
    sourceId: null,
    favorited: input.favorited ?? false,
  };
}

function allLiveFilters() {
  return {
    left: {
      danmu: true,
      interact: true,
      interactKinds: { entry: true, follow: true, share: true, specialFollow: true, mutualFollow: true, like: true },
    },
    right: {
      gift: true,
      giftKinds: { free: true, normal: true, blind: true, redPocket: true, anchorLot: true },
      superChat: true,
      guard: true,
    },
  };
}

test("回看投影按现场一级分类保留事件，并显示低价礼物而不应用现场价格阈值", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const lowPriceGift = event("gift-low", MSG.gift, 1_700_000_000_000, {
    gift: { id: 1, name: "小礼物", count: 1, price: 1, total: 1, priceRmb: 0.01, totalRmb: 0.01, coinType: "gold" },
  });
  const rows = [
    record({ event: event("danmu-1", MSG.danmu, 1_700_000_000_001, { text: "你好" }) }, 0),
    record({ event: lowPriceGift }, 1),
    record({ event: event("sc-1", MSG.superChat, 1_700_000_000_003, { sc: { price: 1, message: "支持" } }) }, 2),
    record({ event: event("start-1", MSG.liveStart, 1_700_000_000_004, { text: "直播开始" }) }, 3),
  ];

  const projected = projectArchiveEvents(rows, { liveFilters: allLiveFilters(), liveGiftThreshold: 9999 });

  assert.deepEqual(projected.map((item) => item.primaryCategory), ["gift", "danmu", "superChat", "system"]);
  assert.equal(projected.find((item) => item.event.id === "gift-low")?.event.gift?.priceRmb, 0.01);
});

test("回看礼物沿用现场连击合并语义，重复弹幕保持独立且原文 payload 不被改写", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const giftOne = event("gift-1", MSG.gift, 1000, {
    comboId: "combo-1",
    gift: { id: 8, name: "小花", count: 1, total: 500, totalRmb: 0.5, price: 500, priceRmb: 0.5, coinType: "gold" },
  });
  const giftTwo = event("gift-2", MSG.gift, 1100, {
    comboId: "combo-1",
    gift: { id: 8, name: "小花", count: 2, total: 1000, totalRmb: 1, price: 500, priceRmb: 0.5, coinType: "gold" },
  });
  const danmuOne = event("danmu-1", MSG.danmu, 1200, { text: "重复内容" });
  const danmuTwo = event("danmu-2", MSG.danmu, 1300, { text: "重复内容" });
  const rows = [record({ event: giftOne }, 0), record({ event: giftTwo }, 1), record({ event: danmuOne }, 2), record({ event: danmuTwo }, 3)];
  const rawPayloads = rows.map((row) => row.payloadJson);

  const projected = projectArchiveEvents(rows, { liveFilters: allLiveFilters() });

  assert.equal(projected.filter((item) => item.event.msgType === MSG.gift).length, 1);
  assert.equal(projected.filter((item) => item.event.msgType === MSG.danmu).length, 2);
  assert.equal(projected.find((item) => item.event.id === "gift-1")?.event.gift?.count, 3);
  assert.equal(projected.find((item) => item.event.id === "gift-1")?.event.gift?.totalRmb, 1.5);
  assert.deepEqual(rows.map((row) => row.payloadJson), rawPayloads);
  assert.deepEqual(JSON.parse(rows[0].payloadJson), giftOne);
  assert.deepEqual(JSON.parse(rows[1].payloadJson), giftTwo);
});

test("连击合并后的礼物仍可通过任一原始事件 key 定位", async () => {
  const { findProjectedEventBySourceKey, projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("gift-1", MSG.gift, 1000, { comboId: "combo-1", gift: { id: 8, name: "小花", count: 1, total: 500, totalRmb: 0.5, price: 500, priceRmb: 0.5, coinType: "gold" } }) }, 0),
    record({ event: event("gift-2", MSG.gift, 1100, { comboId: "combo-1", gift: { id: 8, name: "小花", count: 2, total: 1000, totalRmb: 1, price: 500, priceRmb: 0.5, coinType: "gold" } }) }, 1),
  ];
  const projected = projectArchiveEvents(rows, { liveFilters: allLiveFilters(), mergeGifts: true });

  assert.equal(findProjectedEventBySourceKey(projected, rows[1].eventKey)?.eventKey, rows[0].eventKey);
});

test("回看分类、收藏、用户和文字筛选按且语义投影当前上下文", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("fav-gift", MSG.gift, 1000, { user: user("u-fav", "收藏用户"), gift: { id: 1, name: "玫瑰", count: 1, total: 100, totalRmb: 0.1, price: 100, priceRmb: 0.1, coinType: "gold" } }), favorited: true }, 0),
    record({ event: event("other-gift", MSG.gift, 1100, { user: user("u-other", "其他用户"), gift: { id: 2, name: "小花", count: 1, total: 100, totalRmb: 0.1, price: 100, priceRmb: 0.1, coinType: "gold" } }) }, 1),
    record({ event: event("fav-danmu", MSG.danmu, 1200, { user: user("u-fav", "收藏用户"), text: "玫瑰很好看" }), favorited: true }, 2),
  ];

  const projected = projectArchiveEvents(rows, {
    filters: { primaryCategories: ["gift"], userUid: "u-fav", favoriteOnly: true, searchText: "玫瑰" },
    liveFilters: allLiveFilters(),
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["fav-gift"]);
  assert.equal(projected[0].favorited, true);
});

test("回看用户筛选把昵称作为用户信息的一部分匹配", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const row = record({ event: event("nickname-hit", MSG.danmu, 1000, { user: user("u-1", "原用户名") }) });
  row.userNickname = "通用昵称";

  const projected = projectArchiveEvents([row], {
    filters: { keywordConditions: [{ field: "user", value: "通用昵称" }] },
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["nickname-hit"]);
});

test("回看关键词可以按粉丝牌名称和礼物名称匹配", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("medal-hit", MSG.danmu, 1000, {
      user: { ...user("u-medal", "普通用户"), medal: { name: "星河", isCurrentRoom: true, isLighted: true } },
      text: "正文",
    }) }, 0),
    record({ event: event("gift-hit", MSG.gift, 1100, {
      gift: { id: 1, name: "小花", blindGiftName: "神秘礼盒", count: 1, priceRmb: 1, totalRmb: 1 },
    }) }, 1),
    record({ event: event("miss", MSG.danmu, 1200, {
      user: user("u-other", "其他用户"),
      text: "其他内容",
    }) }, 2),
  ];

  const medalMatches = projectArchiveEvents(rows, {
    filters: { keywordConditions: [{ field: "fanMedal", value: "星河" }] },
  });
  const giftMatches = projectArchiveEvents(rows, {
    filters: { keywordConditions: [{ field: "gift", value: "神秘礼盒" }] },
  });

  assert.deepEqual(medalMatches.map((item) => item.event.id), ["medal-hit"]);
  assert.deepEqual(giftMatches.map((item) => item.event.id), ["gift-hit"]);
});

test("回看全部关键词在用户、粉丝牌、礼物和内容字段中任一匹配即可", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("user-hit", MSG.danmu, 1000, { user: user("u-user", "用户命中") }) }, 0),
    record({ event: event("medal-hit", MSG.danmu, 1100, {
      user: { ...user("u-medal", "普通用户"), medal: { name: "牌子命中", isCurrentRoom: true, isLighted: true } },
    }) }, 1),
    record({ event: event("gift-hit", MSG.gift, 1200, { gift: { id: 1, name: "礼物命中", count: 1, priceRmb: 1, totalRmb: 1 } }) }, 2),
    record({ event: event("content-hit", MSG.danmu, 1300, { text: "正文命中" }) }, 3),
  ];

  for (const [value, expected] of [["用户命中", "user-hit"], ["牌子命中", "medal-hit"], ["礼物命中", "gift-hit"], ["正文命中", "content-hit"]]) {
    const projected = projectArchiveEvents(rows, {
      filters: { keywordConditions: [{ field: "all", value }] },
    });
    assert.deepEqual(projected.map((item) => item.event.id), [expected]);
  }
});

test("回看内容关键词可以匹配结构化回复目标的 @ 用户名", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const { buildArchiveContentText } = await loadContentSearch();
  const replyEvent = event("reply-hit", MSG.danmu, 1400, {
    text: "这期神了[dog]",
    replyTo: user("u-replied", "蜗壳咪"),
  });
  const row = record({ event: replyEvent }, 0);

  assert.match(buildArchiveContentText(replyEvent), /@蜗壳咪/);
  for (const value of ["@", "@蜗壳咪", "蜗壳咪"]) {
    const projected = projectArchiveEvents([row], {
      filters: { keywordConditions: [{ field: "content", value }] },
    });
    assert.deepEqual(projected.map((item) => item.event.id), ["reply-hit"], `搜索 ${value} 应命中回复事件`);
  }
  assert.equal(replyEvent.text, "这期神了[dog]", "搜索索引不能改写原始正文");
});

test("回看投影按关键词逐项且或组合，并把分类条件放在关键词表达式之外", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("and-hit", MSG.gift, 1000, { user: user("u-a", "用户A"), text: "内容B" }) }, 0),
    record({ event: event("or-hit", MSG.gift, 1100, { user: user("u-other", "其他用户"), text: "内容C" }) }, 1),
    record({ event: event("miss", MSG.gift, 1200, { user: user("u-a", "用户A"), text: "其他内容" }) }, 2),
    record({ event: event("wrong-category", MSG.danmu, 1300, { user: user("u-a", "用户A"), text: "内容B" }) }, 3),
  ];

  const projected = projectArchiveEvents(rows, {
    filters: {
      keywordConditions: [
        { field: "user", value: "用户A" },
        { field: "content", value: "内容B", join: "and" },
        { field: "content", value: "内容C", join: "or" },
      ],
      primaryCategories: ["gift"],
    },
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["and-hit", "or-hit"]);
});

test("混合关键词按且优先于或计算，与 SQL 分组语义一致", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("a-only", MSG.danmu, 1000, { user: user("u-a", "用户A"), text: "无关" }) }, 0),
    record({ event: event("b-and-c", MSG.danmu, 1100, { user: user("u-other", "其他用户"), text: "内容B和内容C" }) }, 1),
    record({ event: event("b-only", MSG.danmu, 1200, { user: user("u-other", "其他用户"), text: "只有内容B" }) }, 2),
  ];

  const projected = projectArchiveEvents(rows, {
    filters: {
      keywordConditions: [
        { field: "user", value: "用户A" },
        { field: "content", value: "内容B", join: "or" },
        { field: "content", value: "内容C", join: "and" },
      ],
    },
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["a-only", "b-and-c"]);
});

test("回看支持按用户身份和礼物价格区间筛选", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const captain = event("captain", MSG.danmu, 1000, { user: { ...user("u-captain", "舰长用户", 1) } });
  const gift = event("gift-in-range", MSG.gift, 1100, {
    user: { ...user("u-captain", "舰长用户", 1) },
    gift: { id: 1, name: "小花", count: 2, total: 4000, totalRmb: 4, price: 2000, priceRmb: 2, coinType: "gold" },
  });
  const giftOutOfRange = event("gift-out", MSG.gift, 1200, {
    user: { ...user("u-captain", "舰长用户", 1) },
    gift: { id: 2, name: "小礼物", count: 1, total: 500, totalRmb: 0.5, price: 500, priceRmb: 0.5, coinType: "gold" },
  });

  const projected = projectArchiveEvents(
    [record({ event: captain }, 0), record({ event: gift }, 1), record({ event: giftOutOfRange }, 2)],
    { filters: { userIdentity: "captain", giftPriceMinRmb: 1, giftPriceMaxRmb: 5, giftPriceMode: "cumulative" } },
  );

  assert.deepEqual(projected.map((item) => item.event.id), ["gift-in-range"]);
});

test("回看大航海身份覆盖三档且主播粉丝牌只匹配当前已点亮粉丝牌", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const guard = (id, level, medal) => event(id, MSG.danmu, 1000 + level, {
    user: { ...user(`u-${id}`, id, level), medal },
  });
  const rows = [
    record({ event: guard("captain", 1, { name: "本场牌", level: 1, isCurrentRoom: true, isLighted: true }) }, 0),
    record({ event: guard("admiral", 2, { name: "本场牌", level: 2, isCurrentRoom: true, isLighted: false }) }, 1),
    record({ event: guard("viceroy", 3, { name: "其他牌", level: 3, isCurrentRoom: false, isLighted: true }) }, 2),
  ];

  const allGuards = projectArchiveEvents(rows, { filters: { userIdentity: "guard" } });
  const litCurrent = projectArchiveEvents(rows, { filters: { fanMedal: "currentLighted" } });

  assert.deepEqual(allGuards.map((item) => item.event.id), ["captain", "admiral", "viceroy"]);
  assert.deepEqual(litCurrent.map((item) => item.event.id), ["captain"]);
});

test("回看普通用户身份把缺失 guardLevel 的历史用户视为普通用户", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const row = record({ event: event("legacy-user", MSG.danmu, 1300, { user: { uid: "legacy", uname: "历史用户" } }) });

  const projected = projectArchiveEvents([row], { filters: { userIdentity: "normal" } });

  assert.deepEqual(projected.map((item) => item.event.id), ["legacy-user"]);
});

test("回看排除模式在本地投影中排除一级分类和细分类型", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("danmu-keep", MSG.danmu, 1000, { text: "保留" }) }, 0),
    record({ event: event("interact-exclude", MSG.interact, 1100, { interactKind: "entry", text: "进入直播间" }), secondaryCategory: "entry" }, 1),
    record({ event: event("gift-type-exclude", MSG.gift, 1200, { gift: { id: 1, name: "小花", count: 1, total: 100, totalRmb: 0.1, price: 100, priceRmb: 0.1, coinType: "gold" } }), secondaryCategory: "normal" }, 2),
  ];

  const projected = projectArchiveEvents(rows, {
    filters: { filterMode: "exclude", primaryCategories: ["interact"], secondaryCategories: ["normal"] },
    liveFilters: allLiveFilters(),
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["danmu-keep"]);
});

test("内容关键词与不看互动同时使用时保留正文匹配的弹幕", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({
      event: event("follow", MSG.interact, 1000, {
        text: "关注了主播",
        user: user("u-follow", "关注用户"),
        interactKind: "follow",
      }),
      secondaryCategory: "follow",
    }, 0),
    record({
      event: event("danmu", MSG.danmu, 1100, {
        text: "我也关注了这个话题",
        user: user("u-danmu", "普通用户"),
      }),
    }, 1),
  ];

  const projected = projectArchiveEvents(rows, {
    filters: {
      filterMode: "exclude",
      primaryCategories: ["interact"],
      keywordConditions: [{ field: "content", value: "关注" }],
    },
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["danmu"]);
});

test("回看分类明确全不选时包含模式为空，排除模式全选时也为空", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("danmu", MSG.danmu, 1000, { text: "弹幕" }) }, 0),
    record({ event: event("gift", MSG.gift, 1100, { gift: { id: 1, name: "礼物", count: 1, total: 100, totalRmb: 0.1, price: 100, priceRmb: 0.1, coinType: "gold" } }) }, 1),
  ];

  assert.deepEqual(
    projectArchiveEvents(rows, { filters: { filterMode: "include", primaryCategories: [] } }).map((item) => item.event.id),
    [],
  );
  assert.deepEqual(
    projectArchiveEvents(rows, { filters: { filterMode: "exclude", primaryCategories: ["danmu", "gift"] } }).map((item) => item.event.id),
    [],
  );
});

test("一级分类重新选中后，空的二级分类集合不隐藏无二级分类的事件", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("danmu", MSG.danmu, 1000, { text: "弹幕" }) }, 0),
    record({ event: event("super-chat", MSG.superChat, 1100, { text: "醒目留言" }) }, 1),
    record({ event: event("gift", MSG.gift, 1200, { gift: { id: 1, name: "礼物", count: 1, total: 100, totalRmb: 0.1, price: 100, priceRmb: 0.1, coinType: "gold" } }), secondaryCategory: "normal" }, 2),
  ];

  const projected = projectArchiveEvents(rows, {
    filters: { filterMode: "include", primaryCategories: ["danmu", "superChat"], secondaryCategories: [] },
  });

  assert.deepEqual(projected.map((item) => item.event.id), ["danmu", "super-chat"]);

  const mixedProjected = projectArchiveEvents(rows, {
    filters: { filterMode: "include", primaryCategories: ["danmu", "gift"], secondaryCategories: ["normal"] },
  });
  assert.deepEqual(mixedProjected.map((item) => item.event.id), ["danmu", "gift"]);
});

test("回看筛选菜单可以隐藏独立大表情，但保留普通事件", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("plain", MSG.danmu, 1000, { text: "普通弹幕" }) }, 0),
    record({ event: event("big-emote", MSG.danmu, 1100, { emoticon: { url: "https://example.com/big.png" } }) }, 1),
  ];

  const projected = projectArchiveEvents(rows, { filters: { showBigEmote: false } });

  assert.deepEqual(projected.map((item) => item.event.id), ["plain"]);
});

test("现场显示策略不会影响回看可见性，回看只使用自己的筛选和礼物合并", async () => {
  const { projectArchiveEvents } = await loadProjection();
  const rows = [
    record({ event: event("entry-normal", MSG.interact, 1000, { interactKind: "entry", text: "进入直播间" }) }, 0),
    record({ event: event("danmu-hidden", MSG.danmu, 1100, { text: "隐藏弹幕" }) }, 1),
    record({ event: event("gift-hidden", MSG.gift, 1200, { gift: { id: 3, name: "礼物", count: 1, total: 100, totalRmb: 0.1, price: 100, priceRmb: 0.1, coinType: "gold" } }) }, 2),
  ];
  const liveFilters = allLiveFilters();
  liveFilters.left.danmu = false;
  liveFilters.right.gift = false;
  liveFilters.left.interactKinds.entry = false;

  const projected = projectArchiveEvents(rows, { liveFilters, onlyGuardEntry: true, mergeSameDanmu: true });

  assert.deepEqual(projected.map((item) => item.event.id), ["entry-normal", "danmu-hidden", "gift-hidden"]);
});

test("回看时间使用事件真实本地时间并固定为 HH:mm:ss", async () => {
  const { formatReviewEventTime } = await loadProjection();
  const ts = new Date(2026, 8, 20, 7, 8, 9).getTime();
  assert.equal(formatReviewEventTime(ts), "07:08:09");
  assert.match(formatReviewEventTime(ts), /^\d{2}:\d{2}:\d{2}$/);
});

test("回看游标页按 eventTs、ordinal、eventKey 稳定拼接并去重", async () => {
  const { appendArchiveEventPage } = await loadProjection();
  const row = (eventKey, eventTs, ordinal) => ({
    eventKey,
    sessionId: "session-1",
    roomId: 101,
    ordinal,
    eventTs,
    primaryCategory: "danmu",
    secondaryCategory: null,
    userUid: null,
    userName: null,
    searchText: "",
    payloadJson: JSON.stringify({ id: eventKey, msgType: MSG.danmu, roomId: 101, ts: eventTs }),
    sourceId: null,
    favorited: false,
  });
  const first = [row("a", 100, 0), row("b", 100, 1)];
  const second = [row("b", 100, 1), row("c", 101, 0)];
  assert.deepEqual(
    appendArchiveEventPage(first, { items: second, nextCursor: "next" }, "asc").map((item) => item.eventKey),
    ["a", "b", "c"],
  );
});
