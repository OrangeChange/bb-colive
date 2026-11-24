import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { buildArchiveFavoriteQueryPlan } from "../src/archive/archiveFavorites.ts";
import { buildArchiveQuery } from "../src/archive/archiveQuery.ts";
import { buildArchiveContentText } from "../src/archive/archiveContentSearch.ts";
import { projectArchiveEvents } from "../src/archive/archiveProjection.ts";
import { initializeArchiveDatabase } from "../src/archive/archiveSchema.ts";

function sqliteArchiveDatabase(db, calls = []) {
  return {
    async select(sql, values = []) {
      const rows = select(db, sql, values);
      calls.push({ sql: sql.trim(), values, rowCount: rows.length });
      return rows;
    },
    async execute(sql, values = []) {
      const result = db.prepare(sql).run(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])));
      calls.push({ sql: sql.trim(), values, changes: Number(result.changes) });
      return { rowsAffected: Number(result.changes) };
    },
    async executeTransaction(statements) {
      db.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await this.execute(statement.sql, statement.values ?? []));
        db.exec("COMMIT");
        return results;
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
}

test("历史搜索列升级按批回填并保留正文、整理信息和时间，再次初始化不更新缓存", async () => {
  const db = await legacySearchDatabase();
  try {
    if (db.prepare("PRAGMA table_info(archive_historical_favorite)").all().some((row) => row.name === "search_text")) db.exec("ALTER TABLE archive_historical_favorite DROP COLUMN search_text");
    db.exec("PRAGMA user_version = 6");
    db.exec(`UPDATE archive_historical_favorite SET note = '保留备注';
      INSERT INTO archive_favorite_tag (tag_id, name, created_at, updated_at) VALUES (1, '保留标签', 17, 19);
      INSERT INTO archive_historical_favorite_tag VALUES ('history:reply', 1);
      UPDATE archive_event SET search_text = '正确正文' WHERE event_key = 'empty';
      UPDATE archive_event SET payload_json = '{"id":"empty","roomId":1,"ts":5,"msgType":0,"text":"正确正文"}' WHERE event_key = 'empty';
      UPDATE archive_search_index SET search_text = '正确正文' WHERE event_key = 'empty';`);
    for (let index = 0; index < 205; index += 1) {
      const key = `batch:${String(index).padStart(3, "0")}`;
      const payload = JSON.stringify({ id: key, roomId: 1, ts: index + 10, msgType: 0, text: "这期神了", replyTo: { uname: "目标用户" } });
      db.prepare(`INSERT INTO archive_event (event_key, session_id, room_id, ordinal, event_ts, primary_category, search_text, payload_json) VALUES (?, 'session', 1, ?, ?, 'danmu', ?, ?)`).run(key, index + 10, index + 10, `这期神了${" ".repeat(12)}@目标用户`, payload);
      db.prepare("INSERT INTO archive_search_index VALUES (?, 'session', ?)").run(key, `这期神了${" ".repeat(12)}@目标用户`);
      db.prepare("INSERT INTO archive_historical_favorite (legacy_key, room_id, event_id, event_json, favorited_at, label, note) VALUES (?, 1, ?, ?, 37, '历史收藏', '保留备注')").run(`history:${key}`, key, payload);
    }
    const snapshot = () => ({
      events: db.prepare("SELECT event_key, payload_json, event_ts, ordinal FROM archive_event ORDER BY event_key").all(),
      favorites: db.prepare("SELECT legacy_key, event_json, favorited_at, label, note FROM archive_historical_favorite ORDER BY legacy_key").all(),
      tags: db.prepare("SELECT * FROM archive_favorite_tag").all(),
      links: db.prepare("SELECT * FROM archive_historical_favorite_tag").all(),
    });
    const before = snapshot();
    const calls = [];
    const database = sqliteArchiveDatabase(db, calls);
    await initializeArchiveDatabase(database);
    assert.equal(db.prepare("PRAGMA table_info(archive_historical_favorite)").all().some((row) => row.name === "search_text"), true);
    assert.deepEqual(snapshot(), before);
    assert.equal(db.prepare("SELECT search_text FROM archive_event WHERE event_key = 'batch:000'").get().search_text, "这期神了 @目标用户");
    assert.equal(db.prepare("SELECT search_text FROM archive_search_index WHERE event_key = 'batch:000'").get().search_text, "这期神了 @目标用户");
    assert.equal(db.prepare("SELECT search_text FROM archive_historical_favorite WHERE legacy_key = 'history:batch:000'").get().search_text, "这期神了 @目标用户");
    assert.equal(calls.some((call) => /^UPDATE archive_event\s+SET search_text/i.test(call.sql) && call.values.includes("empty")), false);
    const pages = calls.filter((call) => /^SELECT[\s\S]*(payload_json|event_json)[\s\S]*LIMIT/i.test(call.sql));
    assert.ok(pages.length >= 4);
    assert.ok(pages.every((call) => call.rowCount <= 200));
    calls.length = 0;
    await initializeArchiveDatabase(database);
    assert.equal(calls.some((call) => /^UPDATE archive_(event|search_index|historical_favorite)\s+SET search_text/i.test(call.sql)), false);
    assert.equal(calls.some((call) => /^SELECT[\s\S]*(payload_json|event_json)[\s\S]*LIMIT/i.test(call.sql)), false);
  } finally { db.close(); }
});

test("历史收藏写入和导入生成缓存，导入冲突保持已有快照、时间、备注和标签", async () => {
  const { ArchiveRepository } = await import("../src/archive/archiveRepository.ts");
  const db = new DatabaseSync(":memory:");
  try {
    const database = sqliteArchiveDatabase(db);
    await initializeArchiveDatabase(database);
    assert.equal(db.prepare("PRAGMA table_info(archive_historical_favorite)").all().some((row) => row.name === "search_text"), true);
    const repository = new ArchiveRepository(database);
    const saved = { legacyKey: "saved", roomId: 1, eventId: "saved", event: { id: "saved", roomId: 1, ts: 1, msgType: 0, text: "@alice2 这期神了", replyTo: { uname: "alice" } }, favoritedAt: 37, label: "历史收藏", note: "原备注", tags: ["原标签"] };
    await repository.saveHistoricalFavorite(saved);
    assert.equal(db.prepare("SELECT search_text FROM archive_historical_favorite WHERE legacy_key = 'saved'").get().search_text, "@alice2 这期神了 @alice");
    const before = db.prepare("SELECT * FROM archive_historical_favorite WHERE legacy_key = 'saved'").get();
    const plan = { sourceId: "import-1", counts: { ownerCount: 0, sessionCount: 0, imported: 0, newEvents: 0, skipped: 0, completedFields: 0, conflicts: 0, unmatched: 0 }, owners: [], sessionCreates: [], sessionPatches: [], newEvents: [], favorites: [], nicknames: [], readingStates: [], affectedSessionIds: [], historicalFavorites: [
      { ...saved, event: { ...saved.event, text: "不同的导入正文" }, favoritedAt: 999, note: "导入备注", tags: [] },
      { ...saved, legacyKey: "imported", eventId: "imported", event: { ...saved.event, id: "imported", text: "这期神了", replyTo: { uname: "目标用户" } }, tags: ["导入标签"] },
    ] };
    await repository.commitArchiveImport(plan);
    assert.deepEqual(db.prepare("SELECT * FROM archive_historical_favorite WHERE legacy_key = 'saved'").get(), before);
    assert.equal(db.prepare("SELECT search_text FROM archive_historical_favorite WHERE legacy_key = 'imported'").get().search_text, "这期神了 @目标用户");
    assert.equal((await repository.queryFavorites({ keywordField: "content", searchText: "神了 @alice" })).items[0].stableId, "saved");
    assert.deepEqual((await repository.listHistoricalFavorites()).find((row) => row.legacyKey === "saved").tags, ["原标签"]);
  } finally { db.close(); }
});

async function legacySearchDatabase(version = 5) {
  const db = new DatabaseSync(":memory:");
  const database = {
    async select(sql, values = []) { return select(db, sql, values); },
    async execute(sql, values = []) {
      return db.prepare(sql).run(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])));
    },
  };
  await initializeArchiveDatabase(database);
  db.exec(`INSERT INTO archive_owner (owner_id, room_id, owner_name, created_at, updated_at) VALUES ('owner', 1, '主播', 1, 1);
    INSERT INTO archive_session (session_id, owner_id, room_id, started_at, status, quality, created_at, updated_at) VALUES ('session', 'owner', 1, 1, 'ended', 'complete', 1, 1);`);
  const events = [
    { id: "prefix", text: "@alice2 这期神了", replyTo: { uname: "alice" } },
    { id: "reply", text: "这期神了", replyTo: { uname: "目标用户" } },
    { id: "medal", text: "正文", user: { uid: "sender", uname: "发送者", medal: { name: "勋章" } } },
    { id: "fields", text: "正文二", user: { uid: "named", uname: "用户名", medal: { name: "勋章二" } }, gift: { name: "礼物", blindGiftName: "盲盒" } },
    { id: "empty", text: "只有正文" },
  ];
  for (const [index, fixture] of events.entries()) {
    const event = { roomId: 1, ts: index + 1, msgType: 0, ...fixture };
    db.prepare(`INSERT INTO archive_event (event_key, session_id, room_id, ordinal, event_ts, primary_category, user_uid, user_name, search_text, payload_json) VALUES (?, 'session', 1, ?, ?, 'danmu', ?, ?, '旧索引', ?)`).run(event.id, index, event.ts, event.user?.uid ?? null, event.user?.uname ?? null, JSON.stringify(event));
    db.prepare("INSERT INTO archive_search_index VALUES (?, 'session', '旧索引')").run(event.id);
    db.prepare("INSERT INTO archive_favorite (event_key, session_id, favorited_at) VALUES (?, 'session', ?)").run(event.id, event.ts);
    db.prepare("INSERT INTO archive_historical_favorite (legacy_key, room_id, event_id, event_json, favorited_at, label) VALUES (?, 1, ?, ?, ?, '历史收藏')").run(`history:${event.id}`, event.id, JSON.stringify(event), event.ts);
  }
  db.exec("INSERT INTO archive_user_profile VALUES ('named', '昵称', 1)");
  const oldParts = ["$.text", "$.gift.name", "$.gift.blindGiftName", "$.sc.message", "$.sc.trans",
    "$.guard.action", "$.lottery.awardName", "$.lottery.giftName", "$.lottery.danmu",
    "$.pocket.danmu", "$.honor.firstLine", "$.honor.secondLine"]
    .map((path) => `COALESCE(CAST(json_extract(payload_json, '${path}') AS TEXT), '')`);
  oldParts.push("CASE WHEN COALESCE(json_extract(payload_json, '$.replyTo.uname'), '') <> '' THEN '@' || json_extract(payload_json, '$.replyTo.uname') ELSE '' END");
  db.exec(`UPDATE archive_event SET search_text = lower(trim(${oldParts.join(" || ' ' || ")}));
    UPDATE archive_search_index SET search_text = (SELECT e.search_text FROM archive_event e WHERE e.event_key = archive_search_index.event_key)`);
  assert.equal(db.prepare("SELECT search_text FROM archive_event WHERE event_key = 'reply'").get().search_text, `这期神了${" ".repeat(12)}@目标用户`);
  db.exec(`PRAGMA user_version = ${version}`);
  await initializeArchiveDatabase(database);
  return db;
}

function assertSearchRoutes(db, field, value, expected) {
  const filters = { keywordConditions: [{ field, value }] };
  const query = buildArchiveQuery(filters);
  const archive = select(db, `SELECT e.event_key FROM archive_event e ${query.joinsSql} WHERE ${query.whereSql}`, query.values);
  assert.deepEqual(archive.map((row) => row.event_key).sort(), [...expected].sort(), `档案 ${field}:${value}`);
  const records = db.prepare(`SELECT e.event_key AS eventKey, e.session_id AS sessionId, e.room_id AS roomId, e.ordinal, e.event_ts AS eventTs, e.primary_category AS primaryCategory, e.secondary_category AS secondaryCategory, e.user_uid AS userUid, e.user_name AS userName, p.nickname AS userNickname, e.search_text AS searchText, e.payload_json AS payloadJson FROM archive_event e LEFT JOIN archive_user_profile p ON p.user_uid = e.user_uid`).all();
  assert.deepEqual(projectArchiveEvents(records, { filters }).map((row) => row.eventKey).sort(), [...expected].sort(), `投影 ${field}:${value}`);
  const plan = buildArchiveFavoriteQueryPlan({ keywordField: field, searchText: value });
  const favorites = select(db, plan.pageSql, plan.pageValues);
  assert.deepEqual(favorites.filter((row) => row.sourceKind === "archive").map((row) => row.stableId).sort(), [...expected].sort(), `普通收藏 ${field}:${value}`);
  // 历史快照没有通用昵称，按其独立来源验证。
  const historicalExpected = value.includes("昵称") ? [] : expected;
  assert.deepEqual(favorites.filter((row) => row.sourceKind === "historical").map((row) => row.stableId).sort(), historicalExpected.map((id) => `history:${id}`).sort(), `历史收藏 ${field}:${value}`);
  assert.equal(select(db, plan.totalSql, plan.totalValues)[0].totalCount, expected.length + historicalExpected.length);
}

test("SQLite 中回复用户名前缀的完整短语在两类收藏和投影中一致", async () => {
  const db = await legacySearchDatabase();
  try {
    assertSearchRoutes(db, "content", "神了 @alice", ["prefix"]);
  } finally { db.close(); }
});

for (const version of [2, 5]) {
  test(`真实 schema ${version} 升级产生的旧索引不影响回复短语查询`, async () => {
    const db = await legacySearchDatabase(version);
    try {
      const before = db.prepare("SELECT e.payload_json, e.search_text, i.search_text AS index_text FROM archive_event e JOIN archive_search_index i ON i.event_key = e.event_key WHERE e.event_key = 'reply'").get();
      assert.equal(before.search_text, "这期神了 @目标用户");
      assert.equal(before.index_text, before.search_text);
      assertSearchRoutes(db, "content", "这期神了 @目标用户", ["reply"]);
      const legacyQuery = buildArchiveQuery({ searchText: "这期神了 @目标用户" });
      assert.deepEqual(select(db, `SELECT e.event_key FROM archive_event e ${legacyQuery.joinsSql} WHERE ${legacyQuery.whereSql}`, legacyQuery.values).map((row) => row.event_key), ["reply"]);
      const after = db.prepare("SELECT e.payload_json, e.search_text, i.search_text AS index_text FROM archive_event e JOIN archive_search_index i ON i.event_key = e.event_key WHERE e.event_key = 'reply'").get();
      assert.deepEqual(after, before);
    } finally { db.close(); }
  });
}

test("SQLite 全部字段按固定顺序排空，跨字段短语与投影一致", async () => {
  const db = await legacySearchDatabase();
  try {
    assertSearchRoutes(db, "all", "勋章 正文", ["medal"]);
    assertSearchRoutes(db, "all", "发送者 勋章", ["medal"]);
    assertSearchRoutes(db, "all", "用户名 昵称 勋章二 礼物 盲盒 正文二", ["fields"]);
    assertSearchRoutes(db, "all", "只有正文", ["empty"]);
    assertSearchRoutes(db, "all", "勋章   正文", []);
    const plan = buildArchiveFavoriteQueryPlan({ direction: "asc" });
    const favorites = select(db, plan.pageSql, plan.pageValues);
    assert.equal(favorites.find((row) => row.stableId === "medal").keywordAll, "发送者 勋章 正文");
    assert.equal(favorites.find((row) => row.stableId === "fields").keywordAll, "用户名 昵称 勋章二 礼物 盲盒 正文二 礼物 盲盒");
    assert.equal(favorites.find((row) => row.stableId === "history:fields").keywordAll, "用户名 勋章二 礼物 盲盒 正文二 礼物 盲盒");
    assert.equal(favorites.find((row) => row.stableId === "empty").keywordAll, "只有正文");
  } finally { db.close(); }
});

test("仓库入口在旧索引上保留回复短语，并仅排除同场次中的互动事件", async () => {
  const { ArchiveRepository } = await import("../src/archive/archiveRepository.ts");
  const db = await legacySearchDatabase();
  try {
    const repository = new ArchiveRepository({
      async select(sql, values = []) { return select(db, sql, values); },
      async execute(sql, values = []) {
        return db.prepare(sql).run(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])));
      },
    });
    const replyPage = await repository.queryEvents({ sessionId: "session", filters: { searchText: "这期神了 @目标用户" }, includeTotal: true });
    assert.deepEqual(replyPage.items.map((row) => row.eventKey), ["reply"]);
    assert.equal(replyPage.totalCount, 1);
    db.prepare(`INSERT INTO archive_event (event_key, session_id, room_id, ordinal, event_ts, primary_category, user_uid, user_name, payload_json) VALUES ('interaction', 'session', 1, 20, 20, 'interact', 'sender', '发送者', ?)`).run(JSON.stringify({ id: "interaction", roomId: 1, ts: 20, msgType: 10, text: "正文", user: { uid: "sender", uname: "发送者" } }));
    db.exec("INSERT INTO archive_favorite (event_key, session_id, favorited_at) VALUES ('interaction', 'session', 20)");
    const filters = {
      favoriteOnly: true, filterMode: "exclude", primaryCategories: ["interact"],
      keywordConditions: [{ field: "user", value: "发送者" }, { field: "content", value: "正文", join: "and" }],
    };
    const groups = await repository.queryOwnerEventGroups({ ownerId: "owner", filters });
    assert.deepEqual(groups.items.map((item) => item.session.sessionId), ["session"]);
    assert.equal(groups.items[0].matchCount, 1);
    assert.deepEqual(groups.items[0].matches.map((row) => row.eventKey), ["medal"]);
  } finally { db.close(); }
});

function select(db, sql, values) {
  return db.prepare(sql).all(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value])));
}

test("内存 SQLite 中普通档案、两类收藏和投影的同名字段一致", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`
      CREATE TABLE archive_owner (owner_id TEXT, owner_name TEXT);
      CREATE TABLE archive_session (session_id TEXT, owner_id TEXT, title TEXT, started_at INTEGER, ended_at INTEGER);
      CREATE TABLE archive_event (event_key TEXT, session_id TEXT, room_id INTEGER, event_ts INTEGER, primary_category TEXT, secondary_category TEXT, user_uid TEXT, user_name TEXT, search_text TEXT, payload_json TEXT);
      CREATE TABLE archive_user_profile (user_uid TEXT, nickname TEXT);
      CREATE TABLE archive_favorite (event_key TEXT, favorited_at INTEGER, note TEXT);
      CREATE TABLE archive_historical_favorite (legacy_key TEXT, room_id INTEGER, event_json TEXT, favorited_at INTEGER, label TEXT, note TEXT, search_text TEXT);
      CREATE TABLE archive_favorite_tag (tag_id TEXT, name TEXT);
      CREATE TABLE archive_favorite_event_tag (event_key TEXT, tag_id TEXT);
      CREATE TABLE archive_historical_favorite_tag (legacy_key TEXT, tag_id TEXT);
      INSERT INTO archive_owner VALUES ('owner', '主播');
      INSERT INTO archive_session VALUES ('session', 'owner', '场次', 0, 100);
      INSERT INTO archive_favorite_tag VALUES ('tag', '标签独有');
    `);
    const fixtures = [
      { id: "reply", msgType: 0, text: "这期神了", replyTo: { uname: "目标用户" } },
      { id: "gift", msgType: 1, gift: { name: "小花", blindGiftName: "幸运盲盒" } },
      { id: "lottery", msgType: 4, lottery: { awardName: "天选奖品", giftName: "参与礼物", danmu: "天选口令" } },
      { id: "pocket", msgType: 6, pocket: { danmu: "红包口令" } },
      { id: "sc", msgType: 2, sc: { message: "HELLO 中文 100% a_b", trans: "译文" } },
      { id: "guard", msgType: 3, guard: { action: "续费" }, honor: { firstLine: "荣誉一行", secondLine: "荣誉二行" } },
      { id: "decoy", msgType: 0, text: "1000 axb" },
    ];
    const records = fixtures.map((fixture, ordinal) => {
      const event = { roomId: 1, ts: ordinal + 1, ...fixture, user: { uid: "sender", uname: "发送者独有", medal: { name: "粉丝牌独有" } } };
      const payload = JSON.stringify(event);
      const category = ["danmu", "gift", "superChat", "guard", "lottery", "lottery", "redPocket"][event.msgType];
      db.prepare("INSERT INTO archive_event VALUES (?, 'session', 1, ?, ?, NULL, 'sender', '发送者独有', ?, ?)").run(event.id, event.ts, category, buildArchiveContentText(event), payload);
      db.prepare("INSERT INTO archive_favorite VALUES (?, ?, '备注独有')").run(event.id, event.ts);
      db.prepare("INSERT INTO archive_historical_favorite VALUES (?, 1, ?, ?, '历史收藏', '备注独有', ?)").run(`history:${event.id}`, payload, event.ts, buildArchiveContentText(event));
      db.prepare("INSERT INTO archive_favorite_event_tag VALUES (?, 'tag')").run(event.id);
      db.prepare("INSERT INTO archive_historical_favorite_tag VALUES (?, 'tag')").run(`history:${event.id}`);
      return { eventKey: event.id, sessionId: "session", roomId: 1, ordinal, eventTs: event.ts, primaryCategory: category, secondaryCategory: null, userUid: "sender", userName: "发送者独有", searchText: buildArchiveContentText(event), payloadJson: payload, favorited: true };
    });
    const cases = [
      ["content", "目标用户", ["reply"]], ["content", "小花", ["gift"]],
      ["content", "幸运盲盒", ["gift"]], ["gift", "幸运盲盒", ["gift"]],
      ["content", "天选奖品", ["lottery"]], ["content", "参与礼物", ["lottery"]],
      ["content", "天选口令", ["lottery"]], ["content", "红包口令", ["pocket"]],
      ["content", "hello", ["sc"]], ["content", "中文", ["sc"]],
      ["content", "%", ["sc"]], ["content", "_", ["sc"]],
      ["content", "译文", ["sc"]], ["content", "续费", ["guard"]],
      ["content", "荣誉二行", ["guard"]],
      ["content", "发送者独有", []], ["content", "粉丝牌独有", []],
      ["content", "备注独有", []], ["content", "标签独有", []],
      ["user", "发送者独有", fixtures.map(({ id }) => id)],
      ["fanMedal", "粉丝牌独有", fixtures.map(({ id }) => id)],
      ["all", "备注独有", []], ["all", "标签独有", []],
    ];
    for (const [field, value, expected] of cases) {
      const filters = { keywordConditions: [{ field, value }] };
      const query = buildArchiveQuery(filters);
      const archive = select(db, `SELECT e.event_key FROM archive_event e ${query.joinsSql} WHERE ${query.whereSql} ORDER BY e.event_key`, query.values).map((row) => row.event_key);
      assert.deepEqual(archive, [...expected].sort(), `档案 ${field}:${value}`);
      assert.deepEqual(projectArchiveEvents(records, { filters }).map((row) => row.eventKey).sort(), [...expected].sort(), `投影 ${field}:${value}`);
      const plan = buildArchiveFavoriteQueryPlan({ keywordField: field, searchText: value, direction: "asc" });
      const favorites = select(db, plan.pageSql, plan.pageValues);
      const favoriteExpected = field === "all" && ["备注独有", "标签独有"].includes(value) ? fixtures.map(({ id }) => id) : expected;
      assert.deepEqual(favorites.filter((row) => row.sourceKind === "archive").map((row) => row.stableId).sort(), [...favoriteExpected].sort(), `普通收藏 ${field}:${value}`);
      assert.deepEqual(favorites.filter((row) => row.sourceKind === "historical").map((row) => row.stableId).sort(), favoriteExpected.map((id) => `history:${id}`).sort(), `历史收藏 ${field}:${value}`);
      assert.equal(select(db, plan.totalSql, plan.totalValues)[0].totalCount, favoriteExpected.length * 2);
    }
    for (const field of ["note", "all"]) {
      const plan = buildArchiveFavoriteQueryPlan({ keywordField: field, searchText: "备注独有", limit: 1 });
      assert.equal(select(db, plan.pageSql, plan.pageValues).length, 2);
      assert.equal(select(db, plan.totalSql, plan.totalValues)[0].totalCount, 14);
    }
    db.prepare("UPDATE archive_historical_favorite SET event_json = ?, search_text = ? WHERE legacy_key = 'history:reply'").run(JSON.stringify({ id: "reply", roomId: 1, ts: 1, msgType: 0, text: "历史快照独有" }), "历史快照独有");
    const independent = buildArchiveFavoriteQueryPlan({ keywordField: "content", searchText: "历史快照独有" });
    assert.deepEqual(select(db, independent.pageSql, independent.pageValues).map((row) => row.stableId), ["history:reply"]);
  } finally {
    db.close();
  }
});

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`无法加载待实现的收藏模块 ${relativePath}: ${message}`);
  }
}

class FakeDatabase {
  constructor(selectResults = []) {
    this.selectResults = [...selectResults];
    this.selectCalls = [];
  }

  async select(query, bindValues = []) {
    this.selectCalls.push({ query, bindValues });
    return this.selectResults.shift() ?? [];
  }

  async execute() {
    return { rowsAffected: 1 };
  }
}

test("queryFavorites 使用稳定游标统一普通收藏和历史收藏，并标记可定位性", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase([
    [
      {
        sourceKind: "archive",
        stableId: "session-1:archive-event:event-1",
        eventKey: "session-1:archive-event:event-1",
        legacyKey: null,
        sessionId: "session-1",
        ownerId: "owner-1",
        ownerName: "主播甲",
        roomId: 101,
        sessionTitle: "今晚直播",
        sessionStartedAt: 100,
        sessionEndedAt: 500,
        eventTs: 200,
        favoritedAt: 300,
        primaryCategory: "danmu",
        secondaryCategory: null,
        userUid: "u1",
        userName: "用户甲",
        userNickname: null,
        searchText: "你好",
        payloadJson: JSON.stringify({ id: "event-1", roomId: 101, msgType: 0, ts: 200, user: { uid: "u1", uname: "用户甲" }, text: "你好" }),
        canLocate: 1,
        label: null,
        note: "重点",
        tagsJson: '["待复盘","礼物"]',
      },
      {
        sourceKind: "historical",
        stableId: "101:event:event-legacy",
        eventKey: null,
        legacyKey: "101:event:event-legacy",
        sessionId: null,
        ownerId: null,
        ownerName: null,
        roomId: 101,
        sessionTitle: null,
        sessionStartedAt: null,
        sessionEndedAt: null,
        eventTs: 150,
        favoritedAt: 250,
        primaryCategory: "danmu",
        secondaryCategory: null,
        userUid: "u2",
        userName: "历史用户",
        userNickname: null,
        searchText: "旧内容",
        payloadJson: JSON.stringify({ id: "event-legacy", roomId: 101, msgType: 0, ts: 150, user: { uid: "u2", uname: "历史用户" }, text: "旧内容" }),
        canLocate: 0,
        label: "历史收藏（场次未知）",
      },
    ],
    [{ totalCount: 2 }],
  ]);
  const repository = new ArchiveRepository(db);

  const page = await repository.queryFavorites({
    sort: "eventTs",
    direction: "asc",
    limit: 1,
    includeTotal: true,
  });

  assert.equal(page.items.length, 1);
  assert.equal(page.items[0].sourceKind, "archive");
  assert.equal(page.items[0].canLocate, true);
  assert.equal(page.items[0].note, "重点");
  assert.deepEqual(page.items[0].tags, ["待复盘", "礼物"]);
  assert.equal(page.totalCount, 2);
  assert.ok(page.nextCursor);
  assert.match(db.selectCalls[0].query, /UNION ALL/i);
  assert.match(db.selectCalls[0].query, /archive_historical_favorite/i);
  assert.match(db.selectCalls[0].query, /ORDER BY[\s\S]*eventTs[\s\S]*stableId/i);
  assert.ok(db.selectCalls[0].bindValues.includes(2));
});

test("queryFavorites 的关键词、主播和时间条件进入数据库查询，而不是前端分页", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase([[], [{ totalCount: 0 }]]);
  const repository = new ArchiveRepository(db);

  await repository.queryFavorites({
    ownerId: "owner-1",
    keywordField: "all",
    searchText: "关注",
    fromTs: 100,
    toTs: 200,
    limit: 20,
    includeTotal: true,
  });

  const query = db.selectCalls[0].query;
  assert.match(query, /ownerId/);
  assert.match(query, /keywordAll/);
  assert.match(query, /eventTs >=/);
  assert.match(query, /eventTs < /);
  assert.match(query, /LIMIT/);
  assert.ok(db.selectCalls[0].bindValues.some((value) => String(value).includes("关注")));
  assert.ok(db.selectCalls[0].bindValues.includes(100));
  assert.ok(db.selectCalls[0].bindValues.includes(200));
});

test("queryFavorites 可以按收藏时间而不是事件时间过滤", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase([[], [{ totalCount: 0 }]]);
  const repository = new ArchiveRepository(db);

  await repository.queryFavorites({
    timeField: "favoritedAt",
    fromTs: 300,
    toTs: 400,
    limit: 20,
    includeTotal: true,
  });

  const query = db.selectCalls[0].query;
  assert.match(query, /favoritedAt >=/);
  assert.match(query, /favoritedAt < /);
  assert.doesNotMatch(query, /u\.eventTs >=/);
  assert.ok(db.selectCalls[0].bindValues.includes(300));
  assert.ok(db.selectCalls[0].bindValues.includes(400));
});

test("queryFavorites 支持任一/全部标签条件并包含备注字段", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase([[]]);
  const repository = new ArchiveRepository(db);

  await repository.queryFavorites({
    searchText: "重点",
    keywordField: "note",
    tagFilter: { names: ["待复盘", "礼物"], mode: "all" },
    limit: 10,
  });

  const query = db.selectCalls[0].query;
  assert.match(query, /keywordNote/);
  assert.match(query, /archive_favorite_event_tag/);
  assert.match(query, /archive_historical_favorite_tag/);
  assert.match(query, /t\.name =/);
  assert.ok(db.selectCalls[0].bindValues.includes("待复盘"));
  assert.ok(db.selectCalls[0].bindValues.includes("礼物"));
});

test("queryFavorites 的全部关键词包含收藏标签名称", async () => {
  const { ArchiveRepository } = await loadModule("../src/archive/archiveRepository.ts");
  const db = new FakeDatabase([[]]);
  const repository = new ArchiveRepository(db);

  await repository.queryFavorites({ searchText: "待复盘", keywordField: "all", limit: 10 });

  const query = db.selectCalls[0].query;
  assert.match(query, /keywordAll/);
  assert.match(query, /group_concat\(t\.name/);
});
