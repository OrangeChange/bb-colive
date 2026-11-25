import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    assert.fail(`无法加载 Task7 模块 ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

class QueryDatabase {
  constructor(rows = []) {
    this.rows = rows;
    this.selectCalls = [];
    this.executeCalls = [];
  }

  async execute(query, bindValues = []) {
    this.executeCalls.push({ query, bindValues });
    return { rowsAffected: 1 };
  }

  async executeTransaction(statements) {
    const results = [];
    for (const statement of statements) {
      results.push(await this.execute(statement.sql, statement.values ?? []));
    }
    return results;
  }

  async select(query, bindValues = []) {
    this.selectCalls.push({ query, bindValues });
    return [...this.rows];
  }
}

function record({ eventKey, eventTs, ordinal, msgType = 1, priceRmb = 0.01 }) {
  const event = {
    id: eventKey,
    msgType,
    roomId: 101,
    ts: eventTs,
    user: { uid: "u-1", uname: "用户甲" },
    gift: msgType === 1
      ? { id: 1, name: "小花", count: 1, priceRmb, totalRmb: priceRmb, isFree: false }
      : undefined,
  };
  return {
    eventKey,
    sessionId: "session-1",
    roomId: 101,
    ordinal,
    eventTs,
    primaryCategory: msgType === 1 ? "gift" : "danmu",
    secondaryCategory: msgType === 1 ? "normal" : null,
    userUid: "u-1",
    userName: "用户甲",
    searchText: "用户甲 小花",
    payloadJson: JSON.stringify(event),
    sourceId: null,
    favorited: false,
  };
}

test("主播页场次与事件检索状态相互独立，事件 filters 按字段合并", async () => {
  const {
    createDefaultReviewOwnerState,
    applyReviewOwnerStatePatch,
  } = await loadModule("../src/archive/archiveState.ts");
  const initial = createDefaultReviewOwnerState();
  const withSession = applyReviewOwnerStatePatch(initial, {
    sessionQuery: { title: "读书", startedFromTs: 100, favoriteOnly: true, status: ["ended"], quality: ["complete"] },
  });
  const withEvent = applyReviewOwnerStatePatch(withSession, {
    mode: "events",
    eventQuery: {
      filters: {
        keywordConditions: [{ field: "content", value: "关注" }],
        fromTs: 200,
      },
    },
  });

  assert.equal(withEvent.mode, "events");
  assert.equal(withEvent.sessionQuery.title, "读书");
  assert.equal(withEvent.sessionQuery.startedFromTs, 100);
  assert.deepEqual(withEvent.sessionQuery.status, ["ended"]);
  assert.deepEqual(withEvent.sessionQuery.quality, ["complete"]);
  assert.equal(withEvent.sessionQuery.favoriteOnly, true);
  assert.equal(withEvent.eventQuery.filters.fromTs, 200);
  assert.deepEqual(withEvent.eventQuery.filters.keywordConditions, [{ field: "content", value: "关注" }]);

  const patched = applyReviewOwnerStatePatch(withEvent, {
    eventQuery: { filters: { favoriteOnly: true } },
  });
  assert.equal(patched.eventQuery.filters.fromTs, 200);
  assert.deepEqual(patched.eventQuery.filters.keywordConditions, [{ field: "content", value: "关注" }]);
  assert.equal(patched.eventQuery.filters.favoriteOnly, true);
  assert.equal(withEvent.eventQuery.filters.favoriteOnly, undefined);
  assert.notEqual(withEvent, patched);
  assert.notEqual(withEvent.eventQuery, patched.eventQuery);
  assert.notEqual(withEvent.eventQuery.filters, patched.eventQuery.filters);
  assert.equal(initial.sessionQuery.title, "");
});

test("主播事件条件可以完整替换和清空", async () => {
  const { createDefaultReviewOwnerState, applyReviewOwnerStatePatch } = await loadModule("../src/archive/archiveState.ts");
  const initial = createDefaultReviewOwnerState();
  const withConditions = applyReviewOwnerStatePatch(initial, {
    eventQuery: { filters: { fromTs: 200, favoriteOnly: true } },
  });
  const cleared = applyReviewOwnerStatePatch(withConditions, {
    eventQuery: { replaceFilters: {} },
  });
  assert.deepEqual(cleared.eventQuery.filters, {});

  const withPreset = applyReviewOwnerStatePatch(withConditions, {
    eventQuery: { replaceFilters: { keywordConditions: [{ field: "content", value: "开播" }] } },
  });
  assert.deepEqual(withPreset.eventQuery.filters, {
    keywordConditions: [{ field: "content", value: "开播" }],
  });
  assert.equal("replaceFilters" in withPreset.eventQuery, false);
});

test("主播历史实时刷新合并第一页并保留已加载分页", async () => {
  const { mergeOwnerEventGroupPage } = await loadModule("../src/archive/reviewOwnerEventQueryState.ts");
  const group = (sessionId, matchCount, latestMatchTs, startedAt) => ({
    session: { sessionId, startedAt },
    matchCount,
    latestMatchTs,
    matches: [],
  });
  const current = {
    items: [group("session-old", 2, 80, 10), group("session-current", 4, 100, 50)],
    nextOffset: 100,
    hasMore: true,
  };
  const refreshed = {
    items: [group("session-new", 1, 110, 60), group("session-current", 5, 105, 50)],
    nextOffset: 50,
    hasMore: true,
  };

  const merged = mergeOwnerEventGroupPage(current, refreshed, "latestMatch", "desc");

  assert.deepEqual(merged.items.map((item) => item.session.sessionId), ["session-new", "session-current", "session-old"]);
  assert.equal(merged.items[1].matchCount, 5);
  assert.equal(merged.items.length, 3);
  assert.equal(merged.nextOffset, 50);
  assert.equal(merged.hasMore, true);
});

test("主播历史追加分页按会话去重并使用仓库返回的下一偏移量", async () => {
  const { mergeOwnerEventGroupPage } = await loadModule("../src/archive/reviewOwnerEventQueryState.ts");
  const group = (sessionId, matchCount, latestMatchTs, startedAt) => ({
    session: { sessionId, startedAt },
    matchCount,
    latestMatchTs,
    matches: [],
  });
  const current = {
    items: [group("session-1", 1, 100, 10), group("session-2", 2, 90, 20), group("session-3", 1, 80, 30)],
    nextOffset: 50,
    hasMore: true,
  };
  const nextPage = {
    items: [group("session-2", 3, 95, 20), group("session-3", 1, 80, 30), group("session-4", 1, 70, 40)],
    nextOffset: 100,
    hasMore: true,
  };

  const merged = mergeOwnerEventGroupPage(current, nextPage, "latestMatch", "desc");

  assert.deepEqual(merged.items.map((item) => item.session.sessionId), ["session-1", "session-2", "session-3", "session-4"]);
  assert.equal(merged.items[1].matchCount, 3);
  assert.equal(merged.nextOffset, 100);
  assert.equal(merged.hasMore, true);

  const lastPage = mergeOwnerEventGroupPage(merged, { items: [], nextOffset: null, hasMore: false }, "latestMatch", "desc");
  assert.equal(lastPage.nextOffset, null);
  assert.equal(lastPage.hasMore, false);
});

test("Task7 查询构建器只绑定参数，并支持关键词字段 AND/OR、分类、收藏和日期", async () => {
  const { buildArchiveQuery } = await loadModule("../src/archive/archiveQuery.ts");

  const query = buildArchiveQuery({
    keywordOperator: "and",
    keywordConditions: [
      { field: "user", value: "用户甲" },
      { field: "nickname", value: "常用昵称" },
      { field: "content", value: "100%" },
    ],
    primaryCategories: ["gift", "superChat"],
    secondaryCategories: ["normal", "blind"],
    favoriteOnly: true,
    fromTs: 100,
    toTs: 200,
  });

  assert.match(query.whereSql, /LIKE \$\d+ ESCAPE '!'/g);
  assert.match(query.whereSql, /AND/);
  assert.match(query.whereSql, /IN \(\$\d+, \$\d+\)/);
  assert.match(query.whereSql, /f\.event_key IS NOT NULL/);
  assert.equal(query.values.includes("用户甲"), false);
  assert.ok(query.values.some((value) => typeof value === "string" && value.includes("!%")));
  assert.ok(query.values.includes(100));
  assert.ok(query.values.includes(200));
  assert.doesNotMatch(query.whereSql, /用户甲|常用昵称|100%/);
  assert.match(query.joinsSql, /archive_user_profile/);

  const orQuery = buildArchiveQuery({
    keywordOperator: "or",
    keywordConditions: [
      { field: "user", value: "用户甲" },
      { field: "content", value: "礼物" },
    ],
  });
  assert.match(orQuery.whereSql, /\(.* OR .*\)/s);
});

test("回看筛选排除模式使用 NOT IN，并同时作用于一级分类和细分类型", async () => {
  const { buildArchiveQuery } = await loadModule("../src/archive/archiveQuery.ts");
  const query = buildArchiveQuery({
    filterMode: "exclude",
    primaryCategories: ["interact"],
    secondaryCategories: ["entry", "follow"],
  });

  assert.match(query.whereSql, /e\.primary_category NOT IN \(\$\d+\)/);
  assert.match(query.whereSql, /e\.secondary_category IS NULL OR e\.secondary_category NOT IN \(\$\d+, \$\d+\)/);
  assert.ok(query.values.includes("interact"));
  assert.ok(query.values.includes("entry"));
  assert.ok(query.values.includes("follow"));
});

test("包含和排除切换会反选当前选项并保持有效筛选结果", async () => {
  const { switchReviewFilterMode } = await loadModule("../src/archive/archiveState.ts");
  const primaryOptions = ["danmu", "interact", "gift", "superChat"];
  const secondaryOptions = ["normal", "entry", "follow"];
  const included = {
    filterMode: "include",
    primaryCategories: ["danmu", "interact"],
    secondaryCategories: ["entry"],
  };

  const excluded = switchReviewFilterMode(included, "exclude", primaryOptions, secondaryOptions);
  assert.deepEqual(excluded, {
    filterMode: "exclude",
    primaryCategories: ["gift", "superChat"],
    secondaryCategories: ["normal", "follow"],
  });

  const includedAgain = switchReviewFilterMode(excluded, "include", primaryOptions, secondaryOptions);
  assert.deepEqual(includedAgain, included);
});

test("包含模式的明确全不选与排除模式的全排除会保留原始选中状态语义", async () => {
  const { switchReviewFilterMode } = await loadModule("../src/archive/archiveState.ts");
  const primaryOptions = ["danmu", "interact", "gift"];
  const secondaryOptions = ["normal", "entry"];

  const includeNone = { filterMode: "include", primaryCategories: [], secondaryCategories: [] };
  const excludeAll = switchReviewFilterMode(includeNone, "exclude", primaryOptions, secondaryOptions);
  assert.deepEqual(excludeAll, {
    filterMode: "exclude",
    primaryCategories: primaryOptions,
    secondaryCategories: secondaryOptions,
  });

  const includeNoneAgain = switchReviewFilterMode(excludeAll, "include", primaryOptions, secondaryOptions);
  assert.deepEqual(includeNoneAgain, includeNone);
});

test("单场查询和主播历史查询使用不同的作用域，均沿用稳定 eventTs/ordinal/eventKey 排序", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new QueryDatabase([
    record({ eventKey: "event-1", eventTs: 100, ordinal: 0 }),
    record({ eventKey: "event-2", eventTs: 100, ordinal: 1 }),
  ]);
  const repository = new ArchiveRepository(database);

  await repository.queryEvents({
    sessionId: "session-1",
    direction: "asc",
    filters: { primaryCategories: ["gift"], favoriteOnly: true },
  });
  const sessionQuery = database.selectCalls.at(-1);
  assert.match(sessionQuery.query, /e\.session_id = \$\d+/);
  assert.doesNotMatch(sessionQuery.query, /EXISTS\s*\(/i);
  assert.match(sessionQuery.query, /ORDER BY e\.event_ts ASC, e\.ordinal ASC, e\.event_key ASC/);

  await repository.queryEvents({
    ownerId: "room:101",
    direction: "desc",
    filters: { keywordConditions: [{ field: "nickname", value: "常用" }] },
  });
  const ownerQuery = database.selectCalls.at(-1);
  assert.match(ownerQuery.query, /s\.owner_id = \$\d+/);
  assert.match(ownerQuery.query, /archive_user_profile/);
  assert.match(ownerQuery.query, /ORDER BY e\.event_ts DESC, e\.ordinal DESC, e\.event_key DESC/);
});

test("主播历史场次列表按命中事件筛选，日期/类型/收藏仍绑定参数", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new QueryDatabase();
  const repository = new ArchiveRepository(database);

  await repository.listSessions({
    ownerId: "room:101",
    filters: {
      primaryCategories: ["gift"],
      favoriteOnly: true,
      fromTs: 100,
      toTs: 200,
    },
    direction: "desc",
  });

  const query = database.selectCalls.at(-1);
  assert.match(query.query, /EXISTS\s*\(/i);
  assert.match(query.query, /ae\.primary_category IN \(\$\d+\)/i);
  assert.match(query.query, /af\.event_key IS NOT NULL/i);
  assert.ok(query.bindValues.includes("room:101"));
  assert.ok(query.bindValues.includes(100));
  assert.ok(query.bindValues.includes(200));
  assert.match(query.query, /ORDER BY CASE WHEN s\.recording_status IN \('recording', 'reconnecting'\) THEN 0 ELSE 1 END/);
});

test("回看游标在同一时间戳下按 ordinal 和 eventKey 稳定续页，价格阈值不参与回看投影", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const { projectArchiveEvents } = await loadModule("../src/archive/archiveProjection.ts");
  const database = new QueryDatabase([
    record({ eventKey: "event-a", eventTs: 100, ordinal: 0 }),
    record({ eventKey: "event-b", eventTs: 100, ordinal: 1 }),
    record({ eventKey: "event-c", eventTs: 100, ordinal: 2 }),
  ]);
  const repository = new ArchiveRepository(database);
  const first = await repository.queryEvents({ sessionId: "session-1", limit: 2, direction: "asc" });
  await repository.queryEvents({ sessionId: "session-1", limit: 2, cursor: first.nextCursor });

  assert.match(database.selectCalls[1].query, /ORDER BY e\.event_ts ASC, e\.ordinal ASC, e\.event_key ASC/);
  assert.ok(database.selectCalls[1].bindValues.includes(100));
  assert.ok(database.selectCalls[1].bindValues.includes(1));
  assert.ok(database.selectCalls[1].bindValues.includes("event-b"));

  const projected = projectArchiveEvents([record({ eventKey: "low", eventTs: 100, ordinal: 0 })], {
    liveGiftThreshold: 9999,
  });
  assert.equal(projected.length, 1);
  assert.equal(projected[0].event.gift.priceRmb, 0.01);
});

test("回看搜索控件提供字段、逻辑、范围和可移除条件，不创建事件 marker", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  const presets = readUiSource(new URL("src/archive/reviewFilterPresets.ts", root), "utf8");
  const timeline = readUiSource(new URL("src/components/ReviewSessionTimeline.tsx", root), "utf8");
  assert.match(controls, /用户/);
  assert.doesNotMatch(controls, /label: ["']昵称["']/);
  assert.match(controls, /value: "all", label: ["']全部["']/);
  assert.match(controls, /value: "fanMedal", label: ["']粉丝牌["']/);
  assert.match(controls, /value: "gift", label: ["']礼物["']/);
  assert.match(controls, /内容/);
  assert.match(controls, /<UiSelect/);
  assert.match(controls, /options=\{\[\{ value: "and", label: ["']且["'] \}, \{ value: "or", label: ["']或["'] \}\]\}/);
  assert.doesNotMatch(controls, /<select|<option/);
  assert.match(controls, /全部历史/);
  assert.match(controls, /只看收藏/);
  assert.match(presets, /不看互动/);
  assert.match(presets, /只看收益/);
  assert.doesNotMatch(presets, /近7天/);
  assert.match(controls, /添加预设/);
  assert.match(controls, /管理预设/);
  assert.match(controls, /输入预设名称/);
  assert.match(controls, /删除预设/);
  assert.match(controls, /重命名/);
  assert.match(controls, /review-filter-preset/);
  assert.match(controls, /label: ["']大航海["']/);
  assert.match(controls, /主播粉丝牌/);
  assert.match(controls, /aria-label=["']只看收藏["']/);
  assert.doesNotMatch(controls, /<input type="checkbox"[^>]*favoriteOnly/);
  assert.match(controls, /review-filter-preset-divider/);
  assert.ok(controls.indexOf("presets.map") < controls.indexOf(">添加预设</Button>"));
  const quickConditionsStart = controls.indexOf("REVIEW_QUICK_CONDITIONS.map");
  const presetMenuStart = controls.indexOf("<ReviewFilterPresetMenu");
  const favoriteStart = controls.indexOf('aria-label="快捷收藏条件"');
  assert.ok(quickConditionsStart >= 0 && quickConditionsStart < presetMenuStart && presetMenuStart < favoriteStart);
  assert.match(controls, /activePresetId/);
  assert.match(controls, /aria-pressed=\{active\}/);
  assert.match(controls, /manageOpen \? ["']退出管理["'] : ["']管理预设["']/);
  assert.match(controls, /const deleteCurrent = \(id: string\)/);
  assert.match(controls, /if \(presets\.length <= 1\) \{\s*setManageOpen\(false\);/);
  assert.match(controls, /setAddOpen\(false\);\s*setManageOpen\(false\);/);
  assert.match(controls, /关键词连接/);
  assert.match(controls, /setKeywordJoin/);
  assert.doesNotMatch(controls, /关键词组合方式/);
  assert.match(controls, /<DateTimeField/);
  assert.match(timeline, /searchScope/);
  assert.match(timeline, /eventKey/);
  assert.doesNotMatch(timeline, /onToggleMark/);
});

test("回看快捷条件只覆盖互动排除和收益事件", async () => {
  const { applyReviewQuickCondition, isReviewQuickConditionActive, REVIEW_REVENUE_CATEGORIES } = await loadModule("../src/archive/reviewFilterPresets.ts");
  const now = 1_800_000_000_000;
  const base = { favoriteOnly: true, userIdentity: "captain" };

  assert.deepEqual(
    applyReviewQuickCondition(base, "excludeInteract", now),
    { ...base, filterMode: "exclude", primaryCategories: ["interact"], secondaryCategories: undefined, eventTypes: undefined },
  );
  assert.deepEqual(
    applyReviewQuickCondition(base, "revenue", now),
    { ...base, filterMode: "include", primaryCategories: [...REVIEW_REVENUE_CATEGORIES], secondaryCategories: undefined, eventTypes: undefined },
  );
  assert.equal(isReviewQuickConditionActive({ filterMode: "exclude", primaryCategories: ["interact"] }, "excludeInteract", now), true);
  assert.equal(isReviewQuickConditionActive({ filterMode: "include", primaryCategories: [...REVIEW_REVENUE_CATEGORIES] }, "revenue", now), true);
});

test("回看时间预设覆盖直播时长并保留分钟级自定义范围", async () => {
  const { getReviewDatePreset, getReviewDateRange } = await loadModule("../src/archive/archiveState.ts");
  const now = new Date(2026, 8, 21, 12, 34, 56, 789).getTime();
  assert.deepEqual(getReviewDateRange("2m", now), { fromTs: now - 2 * 60_000, toTs: undefined });
  assert.equal(getReviewDatePreset({ fromTs: now - 2 * 60_000 }, now), "2m");
  assert.deepEqual(getReviewDateRange("20m", now), { fromTs: now - 20 * 60_000, toTs: undefined });
  assert.deepEqual(getReviewDateRange("2h", now), { fromTs: now - 2 * 3_600_000, toTs: undefined });
  assert.deepEqual(getReviewDateRange("3h", now), { fromTs: now - 3 * 3_600_000, toTs: undefined });
  assert.equal(getReviewDatePreset({ fromTs: now - 3 * 3_600_000 }, now), "3h");
  const customFrom = new Date(2026, 8, 21, 9, 15).getTime();
  const customTo = new Date(2026, 8, 21, 11, 45).getTime();
  assert.equal(getReviewDatePreset({ fromTs: customFrom, toTs: customTo }, now), "custom");
});

test("回看快捷预设可以规范化、重命名和删除", async () => {
  const { normalizeReviewFilterPresets, renameReviewFilterPreset, removeReviewFilterPreset, appendReviewFilterPreset, isReviewFilterPresetActive } = await loadModule("../src/archive/reviewFilterPresets.ts");
  const presets = normalizeReviewFilterPresets([
    { id: "p1", name: "  收益  ", filters: { favoriteOnly: true }, updatedAt: 10 },
    { id: "invalid", name: "", filters: {} },
  ]);
  assert.deepEqual(presets, [{ id: "p1", name: "收益", filters: { favoriteOnly: true }, updatedAt: 10 }]);
  assert.deepEqual(renameReviewFilterPreset(presets, "p1", "收益事件"), [{ id: "p1", name: "收益事件", filters: { favoriteOnly: true }, updatedAt: 10 }]);
  assert.deepEqual(removeReviewFilterPreset(presets, "p1"), []);
  const appended = appendReviewFilterPreset(presets, { id: "p2", name: "近期开播", filters: { fromTs: 20 }, updatedAt: 20 });
  assert.deepEqual(appended.map((preset) => preset.id), ["p1", "p2"]);
  assert.equal(isReviewFilterPresetActive(presets[0], { favoriteOnly: true }), true);
  assert.equal(isReviewFilterPresetActive(presets[0], { favoriteOnly: false }), false);
  assert.equal(isReviewFilterPresetActive({ id: "p3", name: "分类", filters: { primaryCategories: ["gift", "danmu"] }, updatedAt: 0 }, { primaryCategories: ["danmu", "gift"] }), true);
});

test("回看筛选按现场栏提供包含排除切换，并按互动和礼物拆分细分类型", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  assert.match(controls, /包含/);
  assert.match(controls, /排除/);
  assert.match(controls, /label: ["']互动["']/);
  assert.match(controls, /label: ["']礼物["']/);
  assert.doesNotMatch(controls, /选择类型/);
  assert.match(controls, /switchReviewFilterMode/);
});

test("回看分类栏复用现场分割线和互动/礼物下拉菜单", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  assert.doesNotMatch(controls, /选中项表示/);
  assert.match(controls, /className="mx-1 h-4 w-px bg-line"/);
  assert.match(controls, /aria-haspopup="menu"/);
  assert.match(controls, /aria-label=\{`\$\{label\}类型筛选`\}/);
  assert.match(controls, /label=\{option\.label\}/);
  assert.doesNotMatch(controls, /aria-label=["']互动类型条件["']/);
  assert.doesNotMatch(controls, /aria-label=["']礼物类型条件["']/);
});

test("回看筛选默认只展示核心搜索区，详细条件收进更多筛选面板", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  assert.match(controls, /更多筛选/);
  const popover = readUiSource(new URL("src/components/ReviewFilterPopover.tsx", root), "utf8");
  assert.match(controls, /<ReviewFilterPopover/);
  assert.match(popover, /review-filter-advanced-panel/);
  assert.match(controls, /aria-controls=\{`review-filter-advanced-\$\{level\}`\}/);
  assert.doesNotMatch(controls, /<span>事件排序<\/span>/);
  assert.doesNotMatch(controls, /aria-label=["']显示大表情["']/);
});

test("回看筛选的添加按钮和高级面板保持在可点击层，时间输入精确到分钟", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  const css = readUiSource(new URL("src/App.css", root), "utf8");
  const presets = readUiSource(new URL("src/archive/reviewFilterPresets.ts", root), "utf8");
  const presetMenuStart = controls.indexOf("function ReviewFilterPresetMenu");
  const presetMenuEnd = controls.indexOf("export function ReviewSearchControls");
  const presetMenu = controls.slice(presetMenuStart, presetMenuEnd);
  assert.match(controls, /createPortal/);
  assert.match(presetMenu, /createPortal/);
  assert.match(controls, /onClick=\{addKeyword\}/);
  assert.match(controls, /<DateTimeField/);
  assert.match(controls, /<DateTimeField label=["']回看开始时间["']/);
  assert.match(css, /\.review-filter-advanced-panel[\s\S]*position:\s*fixed/);
  assert.doesNotMatch(presets, /recent7d|近7天/);
  assert.match(controls, /过去 2 分钟/);
  assert.match(controls, /过去 5 分钟/);
  assert.match(controls, /过去 20 分钟/);
  assert.match(controls, /过去 1 小时/);
  assert.match(controls, /过去 2 小时/);
  assert.match(controls, /过去 12 小时/);
  assert.match(controls, /过去 1 天/);
  assert.match(controls, /过去 1 周/);
  assert.match(controls, /过去 1 个月/);
  assert.match(controls, /value: "today", label: ["']今天["']/);
  assert.match(controls, /value: "yesterday", label: ["']昨天["']/);
  assert.match(controls, /value: "week", label: ["']本周["']/);
  assert.match(controls, /value: "lastWeek", label: ["']上周["']/);
  assert.match(controls, /value: "month", label: ["']本月["']/);
  assert.match(controls, /value: "lastMonth", label: ["']上月["']/);
  assert.match(controls, /value: "custom", label: ["']自定义["']/);
  assert.match(controls, /const visibleDatePreset:\s*DatePreset\s*=/);
  assert.match(controls, /value=\{visibleDatePreset\}/);
  assert.doesNotMatch(controls, /今年|去年/);
});

test("回看筛选将收藏快捷条件独立于分类，并拆分用户与礼物条件", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  const categoryStart = controls.indexOf('aria-label="回看分类条件"');
  const userStart = controls.indexOf('aria-label="回看用户条件"');
  assert.ok(categoryStart >= 0 && userStart > categoryStart);
  const categorySection = controls.slice(categoryStart, userStart);
  assert.doesNotMatch(categorySection, /aria-label=["']只看收藏["']/);
  assert.match(controls, /aria-label=["']快捷收藏条件["']/);
  assert.match(controls, /aria-label=["']回看用户条件["']/);
  assert.match(controls, /aria-label=["']回看礼物金额条件["']/);
  assert.match(controls, /review-filter-advanced-grid/);
});

test("回看关键词输入提供最近搜索和关键词建议下拉", () => {
  const controls = readUiSource(new URL("src/components/ReviewSearchControls.tsx", root), "utf8");
  const combobox = readUiSource(new URL("src/components/ui/Combobox.tsx", root), "utf8");
  assert.match(controls, /<UiCombobox/);
  assert.match(controls, /mergeComboboxOptions/);
  assert.doesNotMatch(controls, /<datalist|list=\{/);
  assert.match(controls, /localStorage/);
  assert.match(combobox, /最近搜索/);
  assert.match(combobox, /关键词建议/);
  assert.match(controls, /options=\{suggestionOptions\}/);
});

test("直播时长预设按滚动起点正确回显，日历范围和自定义日期仍保持独立", async () => {
  const { getReviewDatePreset, getReviewDateRange } = await loadModule("../src/archive/archiveState.ts");
  assert.equal(typeof getReviewDatePreset, "function");
  if (typeof getReviewDatePreset !== "function") return;

  const now = 1_800_000_000_000;
  assert.deepEqual(getReviewDateRange("5m", now), { fromTs: now - 5 * 60_000, toTs: undefined });
  assert.deepEqual(getReviewDateRange("3h", now), { fromTs: now - 3 * 3_600_000, toTs: undefined });
  assert.equal(getReviewDatePreset({ fromTs: now - 3 * 3_600_000 }, now), "3h");
  assert.equal(getReviewDatePreset({ fromTs: now - 13 * 60_000 }, now), "custom");
  assert.equal(getReviewDatePreset({ fromTs: now - 3 * 3_600_000, toTs: now }, now), "custom");
});

test("旧 owner/session searchText LIKE 路径转义百分号、下划线和反斜杠", async () => {
  const { escapeArchiveLikeValue } = await loadModule("../src/archive/archiveQuery.ts");
  const escaped = escapeArchiveLikeValue("A%_!\\B");
  assert.equal(escaped, "a!%!_!!!\\b");

  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const database = new QueryDatabase();
  const repository = new ArchiveRepository(database);
  await repository.listOwners({ searchText: "A%_\\B", limit: 10 });
  await repository.listSessions({ ownerId: "room:101", searchText: "A%_\\B", limit: 10 });

  const ownerQuery = database.selectCalls.find(({ query }) => /FROM archive_owner o/i.test(query));
  const sessionQuery = database.selectCalls.find(({ query }) => /s\.title\s+LIKE/i.test(query));
  assert.ok(ownerQuery);
  assert.ok(sessionQuery);
  assert.match(ownerQuery.query, /LIKE \$\d+ ESCAPE '!'/i);
  assert.match(sessionQuery.query, /LIKE \$\d+ ESCAPE '!'/i);
  assert.ok(ownerQuery.bindValues.includes("%a!%!_!\\b%"));
  assert.ok(sessionQuery.bindValues.includes("%a!%!_!\\b%"));
});

test("阅读锚点有双向初始页，asc/desc 均能查看锚点前后且按 eventKey 去重", async () => {
  const { getReviewReadingDirections } = await loadModule("../src/archive/archiveState.ts");
  assert.equal(typeof getReviewReadingDirections, "function");
  if (typeof getReviewReadingDirections !== "function") return;

  assert.deepEqual(getReviewReadingDirections("asc", true), ["asc", "desc"]);
  assert.deepEqual(getReviewReadingDirections("desc", true), ["desc", "asc"]);
  assert.deepEqual(getReviewReadingDirections("asc", false), ["asc"]);
  assert.deepEqual(getReviewReadingDirections("desc", false), ["desc"]);

  const { appendArchiveEventPage } = await loadModule("../src/archive/archiveProjection.ts");
  const row = (eventKey, eventTs, ordinal) => ({ eventKey, eventTs, ordinal });
  const merged = appendArchiveEventPage(
    appendArchiveEventPage([], { items: [row("anchor", 200, 0), row("newer", 300, 1)], nextCursor: "newer-cursor" }, "asc"),
    { items: [row("older", 100, -1), row("anchor", 200, 0)], nextCursor: "older-cursor" },
    "asc",
  );
  assert.deepEqual(merged.map((item) => item.eventKey), ["older", "anchor", "newer"]);
});

test("回看查看上下文时仅保留当前分类筛选，清除关键词、用户、价格和时间条件", async () => {
  const { createCategoryOnlyArchiveFilters } = await loadModule("../src/archive/archiveState.ts");
  assert.equal(typeof createCategoryOnlyArchiveFilters, "function");
  if (typeof createCategoryOnlyArchiveFilters !== "function") return;

  assert.deepEqual(createCategoryOnlyArchiveFilters({
    searchText: "关注",
    keywordConditions: [{ field: "content", value: "关注" }],
    keywordOperator: "or",
    filterMode: "exclude",
    primaryCategories: ["interact", "gift"],
    secondaryCategories: ["follow", "blind"],
    eventTypes: ["gift"],
    userUid: "123",
    userIdentity: "guard",
    fanMedal: { minLevel: 5 },
    giftPriceMinRmb: 10,
    giftPriceMaxRmb: 20,
    favoriteOnly: true,
    showBigEmote: false,
    fromTs: 100,
    toTs: 200,
  }), {
    filterMode: "exclude",
    primaryCategories: ["interact", "gift"],
    secondaryCategories: ["follow", "blind"],
    eventTypes: ["gift"],
  });

  assert.deepEqual(createCategoryOnlyArchiveFilters({
    primaryCategories: [],
    secondaryCategories: [],
  }), { primaryCategories: [], secondaryCategories: [] });
});
