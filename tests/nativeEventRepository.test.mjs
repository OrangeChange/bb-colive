import test from "node:test";
import assert from "node:assert/strict";

let create;
try { ({ createNativeEventRepository: create } = await import("./fixtures/nativeEventRepository.ts")); } catch {}

test('阶段2合成名单沿真实查询返回160人，第二位用户筛选命中目标B', async () => {
  const db = create(true);
  const row = await db.repository.getEvent('fixture-session-2:event:360');
  const ev = JSON.parse(row.payloadJson);
  assert.equal(row.primaryCategory, 'lottery');
  assert.equal(ev.lottery.winners.length, 160);
  assert.equal(ev.lottery.winners[1].uid, 'fixture-same-user');
  const filtered = await db.repository.queryEvents({ sessionId: 'fixture-session-2', filters: { userUid: 'fixture-same-user' }, limit: 320 });
  assert.deepEqual(filtered.items.map(item => item.ordinal), [361]);
});

test("内存回看端口按双场范围、方向和真实页大小连续返回无重叠记录", async () => {
  assert.equal(typeof create, "function");
  const db = create();
  assert.equal(db.records.length, 1440);
  for (const direction of ["asc", "desc"]) {
    const first = await db.repository.queryEvents({ sessionId: "fixture-session-2", direction, limit: 320, includeTotal: true });
    assert.equal(first.items.length, 320);
    assert.equal(first.totalCount, 720);
    assert.equal(first.items[0].ordinal, direction === "asc" ? 0 : 719);
    assert.ok(first.nextCursor);
    const second = await db.repository.queryEvents({ sessionId: "fixture-session-2", direction, limit: 320, cursor: first.nextCursor });
    assert.equal(second.items[0].ordinal, direction === "asc" ? 320 : 399);
    assert.equal(second.totalCount, null);
    assert.equal(new Set([...first.items, ...second.items].map(row => row.eventKey)).size, 640);
    const third = await db.repository.queryEvents({ sessionId: "fixture-session-2", direction, limit: 320, cursor: second.nextCursor });
    assert.equal(third.items.length, 80);
    assert.equal(third.nextCursor, null);
    assert.ok(!first.items.some(row => row.eventKey === db.targetA));
  }
  const history = await db.repository.queryEvents({ ownerId: "fixture-owner", direction: "desc", limit: 1000, includeTotal: true });
  assert.equal(history.totalCount, 1440);
  assert.equal(new Set(history.items.map(row => row.sessionId)).size, 2);
});

test("anchor含目标且双向不漏同时间行，收藏和筛选按稳定键而非UID", async () => {
  assert.equal(typeof create, "function");
  const db = create();
  for (const direction of ["asc", "desc"]) {
    const page = await db.repository.queryEvents({ sessionId: "fixture-session-2", anchor: { eventKey: db.targetA }, direction, limit: 3 });
    assert.equal(page.items[0].eventKey, db.targetA);
    assert.equal(page.items.length, 3);
  }
  await db.repository.setFavorite(db.targetA, true);
  const favorite = await db.repository.queryEvents({ ownerId: "fixture-owner", filters: { favoriteOnly: true }, includeTotal: true });
  assert.deepEqual(favorite.items.map(row => row.eventKey), [db.targetA]);
  const pair = await db.repository.queryEvents({ sessionId: "fixture-session-2", filters: { userUid: "fixture-same-user" }, includeTotal: true });
  assert.deepEqual(new Set(pair.items.map(row => row.eventKey)), new Set([db.targetA, db.targetB]));
  assert.equal(pair.items.find(row => row.eventKey === db.targetB).favorited, false);
  const payload = JSON.parse(pair.items[0].payloadJson);
  assert.equal(payload.msgType, 0);
  assert.ok(payload.text.includes("目标"));
  assert.equal(pair.items[0].primaryCategory, "danmu");
  assert.equal(payload.content, undefined);
  db.append(2);
  const newest = await db.repository.queryEvents({ sessionId: "fixture-session-2", direction: "desc", limit: 2, includeTotal: true });
  assert.deepEqual(newest.items.map(row => row.ordinal), [721, 720]);
  assert.equal(newest.totalCount, 722);
});

test("缺失事件键的时间锚点按最近绝对距离、方向三元组选择，含范围外时间", async () => {
  const db = create();
  const time = db.records.find(row => row.eventKey === db.targetA).eventTs;
  for (const [offset, asc, desc] of [[100, 360, 361], [900, 362, 363], [500, 360, 363], [-1000000, 0, 1], [1000000, 718, 719]]) {
    for (const [direction, expected] of [["asc", asc], ["desc", desc]]) {
      const page = await db.repository.queryEvents({ sessionId: "fixture-session-2", direction, limit: 1,
        anchor: { eventKey: "missing", fallbackEventTs: time + offset } });
      assert.equal(page.items[0].ordinal, expected, `${direction}:${offset}`);
    }
  }
  for (const [direction, key] of [["asc", db.targetA], ["desc", db.targetB]]) {
    const page = await db.repository.queryEvents({ sessionId: "fixture-session-2", filters: { userUid: "fixture-same-user" },
      direction, limit: 1, anchor: { eventKey: "missing", fallbackEventTs: time + 900 } });
    assert.equal(page.items[0].eventKey, key);
  }
  const firstSessionKey = "fixture-session-1:event:360";
  db.records.find(row => row.eventKey === firstSessionKey).eventTs = time;
  await db.repository.setFavorite(firstSessionKey, true);
  await db.repository.setFavorite(db.targetA, true);
  for (const [direction, key] of [["asc", firstSessionKey], ["desc", db.targetA]]) {
    const page = await db.repository.queryEvents({ ownerId: "fixture-owner", filters: { favoriteOnly: true }, direction,
      limit: 1, anchor: { eventKey: "missing", fallbackEventTs: time + 100 } });
    assert.equal(page.items[0].eventKey, key);
  }
});
