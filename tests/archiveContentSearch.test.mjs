import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

test("SQLite 写入缓存与回复解析在多候选、前后边界和中文姓名上一致", async () => {
  const { buildArchiveContentText } = await loadSearch();
  const { initializeArchiveDatabase } = await import("../src/archive/archiveSchema.ts");
  const { ArchiveRepository } = await import("../src/archive/archiveRepository.ts");
  const db = new DatabaseSync(":memory:");
  try {
    const database = {
      async select(sql, values = []) { return db.prepare(sql).all(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]))); },
      async execute(sql, values = []) { const result = db.prepare(sql).run(Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]))); return { rowsAffected: Number(result.changes) }; },
      async executeTransaction(statements) {
        db.exec("BEGIN");
        try { for (const statement of statements) await this.execute(statement.sql, statement.values); db.exec("COMMIT"); }
        catch (error) { db.exec("ROLLBACK"); throw error; }
      },
    };
    await initializeArchiveDatabase(database);
    const repository = new ArchiveRepository(database);
    const cases = [
      ["@alice2 这期神了", "alice", "@alice2 这期神了 @alice"],
      ["@alice，欢迎", "alice", "@alice，欢迎"],
      ["@alice2 后面 @alice，欢迎", "alice", "@alice2 后面 @alice，欢迎"],
      ["邮箱 a@alice，回复", "alice", "邮箱 a@alice，回复 @alice"],
      ["@alice_ 后缀", "alice", "@alice_ 后缀 @alice"],
      ["@alice- 后缀", "alice", "@alice- 后缀 @alice"],
      ["@alice中 后缀", "alice", "@alice中 后缀 @alice"],
      ["@目标用户，欢迎", " 目标用户 ", "@目标用户，欢迎"],
      ["@目标用户二 回复", "目标用户", "@目标用户二 回复 @目标用户"],
      ["@alice 回复", "", "@alice 回复"],
    ];
    for (const [text, uname, expected] of cases) {
      const event = { id: "reply", roomId: 1, ts: 1, msgType: 0, text, replyTo: { uname } };
      await repository.saveHistoricalFavorite({ legacyKey: "reply", roomId: 1, eventId: "reply", event, favoritedAt: 1, label: "历史收藏", tags: [] });
      assert.equal(db.prepare("SELECT search_text FROM archive_historical_favorite").get().search_text, expected, `缓存 ${text}`);
      assert.equal((await repository.queryFavorites({ keywordField: "content", searchText: expected, includeTotal: true })).totalCount, 1, `SQL ${text}`);
      assert.equal(buildArchiveContentText(event), expected, `TS ${text}`);
    }
  } finally { db.close(); }
});

test("内容补充完整回复目标而不把用户名前缀当成已有回复", async () => {
  const { buildArchiveContentText } = await loadSearch();
  const event = { id: "reply-1", roomId: 1, ts: 1, msgType: 0, text: "@alice2 这期神了", replyTo: { uname: "alice" } };
  assert.equal(buildArchiveContentText(event), "@alice2 这期神了 @alice");
  assert.equal(buildArchiveContentText({ ...event, text: "@alice，欢迎" }), "@alice，欢迎");
});

async function loadSearch() {
  try {
    return await import("../src/archive/archiveContentSearch.ts");
  } catch (error) {
    assert.fail(`无法加载档案内容搜索模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

test("档案内容索引不混入用户名和粉丝牌名称", async () => {
  const { buildArchiveContentText } = await loadSearch();
  const text = buildArchiveContentText({
    msgType: 0,
    roomId: 1,
    ts: 1,
    id: "danmu-1",
    text: "正文关注内容",
    user: {
      uid: "u-1",
      uname: "用户名关注",
      guardLevel: 0,
      medal: { name: "牌子jll", level: 1 },
    },
  });

  assert.match(text, /正文关注内容/);
  assert.doesNotMatch(text, /用户名关注/);
  assert.doesNotMatch(text, /牌子jll/);
});

test("档案内容索引保留结构化事件内容", async () => {
  const { buildArchiveContentText } = await loadSearch();
  const text = buildArchiveContentText({
    msgType: 1,
    roomId: 1,
    ts: 1,
    id: "gift-1",
    gift: { id: 1, name: "小花", blindGiftName: "盲盒", count: 1, price: 100, total: 100, coinType: "gold" },
    user: { uid: "u-1", uname: "用户", guardLevel: 0 },
  });

  assert.match(text, /小花/);
  assert.match(text, /盲盒/);
  assert.doesNotMatch(text, /用户/);
});
