import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

test("普通回看全部字段不匹配收藏备注", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE archive_event (event_key TEXT, user_uid TEXT, user_name TEXT, search_text TEXT, payload_json TEXT);
      CREATE TABLE archive_user_profile (user_uid TEXT, nickname TEXT);
      CREATE TABLE archive_favorite (event_key TEXT, note TEXT);
      INSERT INTO archive_event VALUES ('event', '1', '发送者', '正文', '{"msgType":0,"text":"正文"}');
      INSERT INTO archive_favorite VALUES ('event', '备注独有');`);
    for (const field of ["all", "note"]) {
      const query = buildArchiveQuery({ keywordConditions: [{ field, value: "备注独有" }] });
      assert.equal(db.prepare(`SELECT e.event_key FROM archive_event e ${query.joinsSql} WHERE ${query.whereSql}`).all({ $1: query.values[0] }).length, 0, field);
    }
  } finally {
    db.close();
  }
});

async function loadQuery() {
  try {
    return await import("../src/archive/archiveQuery.ts");
  } catch (error) {
    assert.fail(`无法加载回看查询模块：${error instanceof Error ? error.message : String(error)}`);
  }
}

test("回看用户关键词同时匹配用户名和通用昵称", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({
    keywordConditions: [{ field: "user", value: "小树" }],
  });

  assert.match(query.whereSql, /e\.user_name/);
  assert.match(query.whereSql, /p\.nickname/);
  assert.deepEqual(query.values, ["%小树%"]);
});

test("回看查询支持粉丝牌、礼物和全部关键词字段", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({
    keywordConditions: [
      { field: "fanMedal", value: "星河" },
      { field: "gift", value: "小花", join: "or" },
      { field: "all", value: "正文", join: "and" },
    ],
  });

  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.user\.medal\.name'\)/);
  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.gift\.name'\)/);
  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.gift\.blindGiftName'\)/);
  assert.match(query.whereSql, /e\.user_name/);
  assert.match(query.whereSql, /p\.nickname/);
  assert.match(query.whereSql, /e\.search_text/);
  assert.deepEqual(query.values, ["%星河%", "%小花%", "%正文%"]);
});

test("回看关键词支持逐项混合且或，并与其他筛选整体使用 AND", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({
    keywordConditions: [
      { field: "user", value: "用户A" },
      { field: "content", value: "内容B", join: "and" },
      { field: "content", value: "内容C", join: "or" },
    ],
    primaryCategories: ["gift"],
  });

  assert.match(query.whereSql, /\(\(.*LIKE.*AND.*LIKE.*\) OR .*LIKE.*\)/s);
  assert.match(query.whereSql, /\) AND e\.primary_category IN/);
  assert.deepEqual(query.values, ["%用户a%", "%内容b%", "%内容c%", "gift"]);
});

test("回看关键词按标准优先级处理：AND 高于 OR", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({
    keywordConditions: [
      { field: "content", value: "A" },
      { field: "content", value: "B", join: "or" },
      { field: "content", value: "C", join: "and" },
    ],
  });

  assert.match(query.whereSql, /LIKE \$1 ESCAPE '!' OR \(.*LIKE \$2 ESCAPE '!' AND .*LIKE \$3 ESCAPE '!'/s);
});

test("回看查询支持用户身份条件", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({ userIdentity: "captain" });

  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.user\.guardLevel'\)/);
  assert.deepEqual(query.values, []);
});

test("回看查询支持覆盖三档大航海的身份条件和主播粉丝牌条件", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({ userIdentity: "guard", fanMedal: "currentLighted" });

  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.user\.guardLevel'\)/);
  assert.match(query.whereSql, /IN \(1, 2, 3\)/);
  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.user\.medal\.isCurrentRoom'\)/);
  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.user\.medal\.isLighted'\)/);
  assert.deepEqual(query.values, []);
});

test("系统分类查询隐藏已确认的平台组件报文，但保留其余未识别事件", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({ primaryCategories: ["system"] });

  assert.match(query.whereSql, /CAST\(COALESCE\(json_extract\(e\.payload_json, '\$\.msgType'\), -1\) AS INTEGER\) = 27/);
  assert.match(query.whereSql, /NOT\s*\([\s\S]*json_extract\(e\.payload_json, '\$\.msgType'\)[\s\S]*COALESCE\(json_extract\(e\.payload_json, '\$\.text'\), ''\) IN/);
  for (const command of [
    "WIDGET_WISH_INFO",
    "WIDGET_WISH_INFO_V2",
    "LIVE_ANI_RES_UPDATE",
    "PLAYTOGETHER_ICON_CHANGE",
  ]) {
    assert.ok(query.whereSql.includes(`'${command}'`), `${command} 应从回放查询中隐藏`);
  }
  assert.match(query.whereSql, /e\.primary_category IN/);
  assert.doesNotMatch(query.whereSql, /e\.primary_category <> 'system'/);
});

test("回看查询支持独立的礼物价格区间", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({
    giftPriceMinRmb: 1,
    giftPriceMaxRmb: 5,
    giftPriceMode: "cumulative",
  });

  assert.match(query.whereSql, /e\.primary_category =/);
  assert.match(query.whereSql, /json_extract\(e\.payload_json, '\$\.gift\.count'\)/);
  assert.deepEqual(query.values, ["gift", 1, 5]);
});

test("回看查询区分包含模式的明确全不选和未设置分类", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const noneIncluded = buildArchiveQuery({ filterMode: "include", primaryCategories: [] });
  assert.match(noneIncluded.whereSql, /1 = 0/);

  const noneRestricted = buildArchiveQuery({ filterMode: "exclude", primaryCategories: [] });
  assert.doesNotMatch(noneRestricted.whereSql, /1 = 0/);
});

test("回看查询不会让空二级分类集合隐藏无二级分类的一级事件", async () => {
  const { buildArchiveQuery } = await loadQuery();
  const query = buildArchiveQuery({
    filterMode: "include",
    primaryCategories: ["danmu", "superChat"],
    secondaryCategories: [],
  });

  assert.match(query.whereSql, /e\.secondary_category IS NULL/);
  assert.doesNotMatch(query.whereSql, /1 = 0/);
});
