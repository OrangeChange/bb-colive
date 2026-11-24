import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { initializeArchiveDatabase } from "../src/archive/archiveSchema.ts";
import { ArchiveRepository } from "../src/archive/archiveRepository.ts";
import * as annotations from "../src/eventAnnotations.ts";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { projectArchiveEvents } from "../src/archive/archiveProjection.ts";

function favoriteCallbacks(dependencies, path = "../src/App.tsx", names = ["onToggleFavorite", "onEditFavorite", "isFavorite"]) {
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions = {};
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(source))) {
      expressions[node.name.getText(source)] = node.initializer.arguments[0].getText(source);
    }
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === "eventMenuHandlers") {
      expressions.isFavorite = node.initializer.arguments[0].body.expression.properties.find((property) => property.name?.getText(source) === "isFavorite").initializer.getText(source);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  const evaluate = (text, bindings) => new Function(...Object.keys(bindings), ts.transpile(`return (${text});`))(...Object.values(bindings));
  const callbacks = {};
  for (const name of names) callbacks[name] = evaluate(expressions[name], { ...dependencies, ...callbacks });
  return callbacks;
}

async function setup() {
  const module = await import("../src/archive/favoriteActions.ts").catch(() => ({}));
  assert.equal(typeof module.createFavoriteActions, "function", "缺少收藏协调入口");
  const db = new DatabaseSync(":memory:");
  let failWrite = false;
  const database = {
    async select(sql, values = []) { return db.prepare(sql).all(Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v]))); },
    async execute(sql, values = []) { const result = db.prepare(sql).run(Object.fromEntries(values.map((v, i) => [`$${i + 1}`, v]))); return { rowsAffected: Number(result.changes) }; },
    async executeTransaction(statements) {
      db.exec("BEGIN");
      try {
        for (const [i, statement] of statements.entries()) {
          await this.execute(statement.sql, statement.values);
          if (failWrite && i === 0) throw new Error("write failed");
        }
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  await initializeArchiveDatabase(database);
  db.exec("INSERT INTO archive_owner (owner_id, room_id, owner_name, created_at, updated_at) VALUES ('owner', 123, '主播', 1, 1); INSERT INTO archive_session (session_id, owner_id, room_id, started_at, status, quality, created_at, updated_at) VALUES ('session', 'owner', 123, 1, 'ended', 'complete', 1, 1)");
  const events = ["one", "two"].map((dedupe) => ({ id: "rnd", dedupe, reactKey: dedupe, roomId: 123, ts: 1000, msgType: 0, text: "相同正文", user: { uid: "7", uname: "用户", guardLevel: 0 } }));
  for (const [i, event] of events.entries()) db.prepare("INSERT INTO archive_event (event_key, session_id, room_id, ordinal, event_ts, primary_category, search_text, payload_json) VALUES (?, 'session', 123, ?, 1000, 'danmu', '相同正文', ?)").run(`session:archive-event:${event.dedupe}`, i, JSON.stringify(event));
  const repository = new ArchiveRepository(database);
  return { module, db, repository, events, fail() { failWrite = true; } };
}

test("收藏页单条和批量取消提交后同步精确现场目标、回看、收藏及场次数量", async () => {
  const { module, db, repository, events } = await setup();
  try {
    let favorites = [];
    let revisions = 0;
    const actions = module.createFavoriteActions({ repository, onCommitted: async (change) => {
      favorites = await annotations.refreshFavoriteProjection(repository, favorites, change);
      revisions++;
    } });
    for (const event of events) {
      favorites = annotations.bindFavoriteEvent(favorites, event, `session:archive-event:${event.dedupe}`, true, 37);
      await actions.set(`session:archive-event:${event.dedupe}`, true);
    }
    const pending = { ...events[0], dedupe: "pending", reactKey: "pending" };
    favorites = annotations.setFavoriteEvent(favorites, pending, true, 99);
    await repository.updateFavoriteOrganization({ target: { sourceKind: "archive", stableId: "session:archive-event:two" }, note: "保留备注", tags: ["保留标签"] });
    await actions.remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]);
    assert.equal(annotations.isEventFavorited(favorites, events[0]), false);
    assert.equal(annotations.isEventFavorited(favorites, events[1]), true);
    assert.equal(annotations.isEventFavorited(favorites, pending), true);
    assert.equal((await repository.getEvent("session:archive-event:one")).favorited, false);
    assert.deepEqual((await repository.queryFavorites()).items.map((x) => x.stableId), ["session:archive-event:two"]);
    assert.equal((await repository.listSessions())[0].favoriteCount, 1);
    assert.deepEqual(await repository.getFavoriteOrganization({ sourceKind: "archive", stableId: "session:archive-event:two" }), { note: "保留备注", tags: ["保留标签"] });
    await repository.saveHistoricalFavorite({ legacyKey: "unknown", roomId: 123, eventId: "rnd", event: events[1], favoritedAt: 10, label: "历史收藏" });
    await actions.remove([{ sourceKind: "historical", stableId: "unknown" }, { sourceKind: "archive", stableId: "session:archive-event:two" }]);
    assert.equal(annotations.isEventFavorited(favorites, events[1]), false);
    assert.equal(annotations.isEventFavorited(favorites, pending), true);
    assert.equal((await repository.queryFavorites()).items.length, 0);
    assert.equal((await repository.listSessions())[0].favoriteCount, 0);
    assert.equal(revisions, 4);
  } finally { db.close(); }
});

test("写入失败回滚批量事务且不发送提交通知", async () => {
  const { module, db, repository, fail } = await setup();
  try {
    await repository.setFavorite("session:archive-event:one", true);
    await repository.setFavorite("session:archive-event:two", true);
    let notified = 0;
    const actions = module.createFavoriteActions({ repository, onCommitted() { notified++; } });
    fail();
    await assert.rejects(actions.remove(["one", "two"].map((id) => ({ sourceKind: "archive", stableId: `session:archive-event:${id}` }))), /write failed/);
    assert.equal((await repository.queryFavorites()).items.length, 2);
    assert.equal((await repository.listSessions())[0].favoriteCount, 2);
    assert.equal(notified, 0);
    await assert.rejects(actions.set("session:archive-event:one", false), /write failed/);
    assert.equal((await repository.getEvent("session:archive-event:one")).favorited, true);
  } finally { db.close(); }
});

test("已提交的收藏在刷新失败后仍保留数据库关系和整理信息", async () => {
  const { module, db, repository } = await setup();
  try {
    await repository.setFavorite("session:archive-event:one", true, 37);
    const actions = module.createFavoriteActions({ repository, onCommitted() { throw new Error("refresh failed"); } });
    assert.deepEqual(await actions.set("session:archive-event:one", true), { refresh: "failed" });
    await repository.updateFavoriteOrganization({ target: { sourceKind: "archive", stableId: "session:archive-event:one" }, note: "备注", tags: ["标签"] });
    const time = db.prepare("SELECT favorited_at FROM archive_favorite").get().favorited_at;
    assert.equal(time, 37);
    await actions.set("session:archive-event:one", true);
    assert.equal(db.prepare("SELECT favorited_at FROM archive_favorite").get().favorited_at, time);
    assert.deepEqual(await repository.getFavoriteOrganization({ sourceKind: "archive", stableId: "session:archive-event:one" }), { note: "备注", tags: ["标签"] });
    assert.deepEqual(await actions.remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]), { refresh: "failed" });
    assert.equal((await repository.queryFavorites()).items.length, 0);
  } finally { db.close(); }
});

test("历史取消不猜测现场归属，刷新期间新增未落盘收藏保持独立", async () => {
  const { module, db, repository, events } = await setup();
  try {
    let favorites = annotations.bindFavoriteEvent([], events[0], "session:archive-event:one", true, 37);
    await repository.setFavorite("session:archive-event:one", true);
    await repository.saveHistoricalFavorite({ legacyKey: "legacy", roomId: 123, eventId: "rnd", event: events[0], favoritedAt: 10, label: "历史收藏" });
    const actions = module.createFavoriteActions({ repository, onCommitted: async (change) => {
      favorites = await annotations.refreshFavoriteProjection(repository, () => favorites, change);
    } });
    await actions.remove([{ sourceKind: "historical", stableId: "legacy" }]);
    assert.equal(annotations.isEventFavorited(favorites, events[0]), true);
    const otherSession = { ...favorites[0], archiveEventKey: "other:archive-event:one" };
    favorites.push(otherSession);
    const pending = { ...events[1], dedupe: "pending", reactKey: "pending" };
    const originalGet = repository.getEvent.bind(repository);
    repository.getEvent = async (key) => {
      const row = await originalGet(key);
      favorites = annotations.setFavoriteEvent(favorites, pending, true, 99);
      return row;
    };
    await actions.remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]);
    assert.deepEqual(favorites.map((item) => item.archiveEventKey), ["other:archive-event:one", undefined]);
    assert.equal(annotations.isEventFavorited(favorites, pending), true);
  } finally { db.close(); }
});

test("合并行原持久键取消后移除现场收藏，回看快照不会另建一个 combo 收藏", async () => {
  const { module, db, repository, events } = await setup();
  try {
    const first = { ...events[0], msgType: 1, gift: { id: 1, name: "花", count: 1, price: 1000, total: 1000 } };
    const { mergeGiftInto } = await import("../src/events/giftMerge.ts");
    const rows = [first];
    let favorites = annotations.bindFavoriteEvent([], first, "session:archive-event:one", true, 37);
    mergeGiftInto(rows, { ...first, dedupe: "next", comboId: "combo", ts: 1100 });
    favorites = annotations.bindFavoriteEvent(favorites, { ...first, comboId: "combo" }, "session:archive-event:one", true, 50);
    assert.equal(favorites.length, 1);
    assert.equal(favorites[0].favoritedAt, 37);
    assert.equal(annotations.isEventFavorited(favorites, rows[0]), true);
    await repository.setFavorite("session:archive-event:one", true);
    const actions = module.createFavoriteActions({ repository, onCommitted: async (change) => {
      favorites = await annotations.refreshFavoriteProjection(repository, favorites, change);
    } });
    await actions.remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]);
    assert.equal(annotations.isEventFavorited(favorites, rows[0]), false);
  } finally { db.close(); }
});

test("页面共用运行期入口每次提交只通知一次，查询失败不撤销数据库", async () => {
  const { db, repository, events } = await setup();
  const { createArchiveFavoriteActions, useArchiveRuntime } = await import("../src/archive/archiveRuntime.ts");
  const before = useArchiveRuntime.getState().archiveRevision;
  try {
    annotations.useEventAnnotations.setState({ favorites: annotations.bindFavoriteEvent([], events[0], "session:archive-event:one", true, 37) });
    const actions = createArchiveFavoriteActions(repository);
    assert.deepEqual(await actions.set("session:archive-event:one", true), { refresh: "complete" });
    assert.equal(useArchiveRuntime.getState().archiveRevision, before + 1);
    repository.getEvent = async () => { throw new Error("query failed"); };
    assert.deepEqual(await actions.remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]), { refresh: "failed" });
    assert.equal((await repository.queryFavorites()).items.length, 0);
    assert.equal(useArchiveRuntime.getState().archiveRevision, before + 2);
  } finally { annotations.useEventAnnotations.setState({ favorites: [] }); db.close(); }
});

test("取消写入失败恢复首次收藏时间和明确映射，不覆盖其他新收藏", async () => {
  assert.equal(typeof annotations.restoreFavoriteEvent, "function");
  const first = { id: "rnd", dedupe: "one", roomId: 123, ts: 1000, msgType: 0 };
  const second = { ...first, dedupe: "two" };
  const saved = annotations.bindFavoriteEvent([], first, "session:archive-event:one", true, 37);
  const canceled = annotations.bindFavoriteEvent(saved, first, "session:archive-event:one", false);
  const current = annotations.setFavoriteEvent(canceled, second, true, 99);
  const restored = annotations.restoreFavoriteEvent(current, first, saved);
  assert.equal(restored.find((item) => item.event.dedupe === "one").favoritedAt, 37);
  assert.equal(restored.find((item) => item.event.dedupe === "one").archiveEventKey, "session:archive-event:one");
  assert.equal(restored.find((item) => item.event.dedupe === "two").favoritedAt, 99);
});

test("明确场次键的收藏和取消不改写另一场次同身份的收藏", () => {
  const event = { id: "raw", dedupe: "source", roomId: 123, ts: 1000, msgType: 0 };
  const first = annotations.bindFavoriteEvent([], event, "first:archive-event:source", true, 37);
  const both = annotations.bindFavoriteEvent(first, event, "second:archive-event:source", true, 99);
  assert.deepEqual(both.map((item) => [item.archiveEventKey, item.favoritedAt]), [["first:archive-event:source", 37], ["second:archive-event:source", 99]]);
  const removed = annotations.bindFavoriteEvent(both, event, "second:archive-event:source", false);
  assert.deepEqual(removed.map((item) => item.archiveEventKey), ["first:archive-event:source"]);
  const restored = annotations.restoreFavoriteEvent(removed, event, both, "second:archive-event:source");
  assert.deepEqual(restored.map((item) => item.archiveEventKey), ["first:archive-event:source", "second:archive-event:source"]);
});

test("已有迁移标记的无映射旧收藏从收藏页取消后同步现场，保留其他目标", async () => {
  const { db, repository, events } = await setup();
  const { createArchiveFavoriteActions } = await import("../src/archive/archiveRuntime.ts");
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const values = new Map([[annotations.LEGACY_FAVORITES_MIGRATION_STORAGE_KEY, "1"]]);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem(key) { return values.get(key) ?? null; }, setItem(key, value) { values.set(key, value); },
  } });
  try {
    const old = annotations.setFavoriteEvent([], events[0], true, 37);
    const unrelated = annotations.setFavoriteEvent(old, events[1], true, 38);
    const pending = { ...events[0], dedupe: "pending", reactKey: "pending" };
    const favorites = annotations.setFavoriteEvent(unrelated, pending, true, 99);
    favorites.push({ ...old[0], archiveEventKey: "other:archive-event:one" });
    annotations.useEventAnnotations.setState({ favorites });
    await repository.setFavorite("session:archive-event:one", true, 37);
    repository.queryEvents = async () => { throw new Error("不应重跑迁移查询"); };
    repository.saveHistoricalFavorite = async () => { throw new Error("不应重写历史收藏"); };
    const migration = await annotations.migrateLegacyFavorites(repository);
    assert.equal(migration.alreadyMigrated, true);
    assert.equal(annotations.useEventAnnotations.getState().favorites[0].archiveEventKey, undefined);
    const reads = [];
    const getEvent = repository.getEvent.bind(repository);
    repository.getEvent = async (key) => { reads.push(key); return getEvent(key); };
    const result = await createArchiveFavoriteActions(repository).remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]);
    assert.deepEqual(result, { refresh: "complete" });
    assert.equal((await getEvent("session:archive-event:one")).favorited, false);
    assert.deepEqual(annotations.useEventAnnotations.getState().favorites.map((favorite) => [favorite.event.dedupe, favorite.archiveEventKey]), [
      ["two", undefined], ["pending", undefined], ["one", "other:archive-event:one"],
    ]);
    assert.deepEqual(reads, ["session:archive-event:one"]);
    assert.equal(values.get(annotations.LEGACY_FAVORITES_MIGRATION_STORAGE_KEY), "1");
  } finally {
    annotations.useEventAnnotations.setState({ favorites: [] });
    if (storageBefore) Object.defineProperty(globalThis, "localStorage", storageBefore);
    else Reflect.deleteProperty(globalThis, "localStorage");
    db.close();
  }
});

test("现场实际展示和点击按当前场次新增与取消，另一场次的同身份收藏不阻挡", async () => {
  const { db, repository, events } = await setup();
  const { createArchiveFavoriteActions } = await import("../src/archive/archiveRuntime.ts");
  try {
    annotations.useEventAnnotations.setState({ favorites: annotations.bindFavoriteEvent([], events[0], "other:archive-event:one", true, 37) });
    const dependencies = {
      archiveRepository: repository, archiveSessionId: "session", useEventAnnotations: annotations.useEventAnnotations,
      ...annotations, createArchiveFavoriteActions, favoriteOperationRef: { current: new Map() },
      flushArchiveWriter: async () => ({ pending: 0, failed: 0 }), recordFeatureDiagnostic() {},
      setFavoriteFailureKey() {}, setFavoriteFailureMessage() {}, setFavoriteEditor() {},
    };
    const render = () => favoriteCallbacks({ ...dependencies, favorites: annotations.useEventAnnotations.getState().favorites });
    const callbacks = render();
    assert.equal(callbacks.isFavorite(events[0]), false);
    await callbacks.onToggleFavorite(events[0]);
    assert.equal((await repository.getEvent("session:archive-event:one")).favorited, true);
    assert.equal(render().isFavorite(events[0]), true);
    assert.deepEqual(annotations.useEventAnnotations.getState().favorites.map((favorite) => favorite.archiveEventKey), ["other:archive-event:one", "session:archive-event:one"]);
    await callbacks.onToggleFavorite(events[0]);
    assert.equal((await repository.getEvent("session:archive-event:one")).favorited, false);
    assert.equal(render().isFavorite(events[0]), false);
    assert.deepEqual(annotations.useEventAnnotations.getState().favorites.map((favorite) => favorite.archiveEventKey), ["other:archive-event:one"]);
    await callbacks.onEditFavorite(events[0]);
    assert.equal((await repository.getEvent("session:archive-event:one")).favorited, true);
    assert.ok(await repository.getFavoriteOrganization({ sourceKind: "archive", stableId: "session:archive-event:one" }));
  } finally { annotations.useEventAnnotations.setState({ favorites: [] }); db.close(); }
});

test("无映射旧连击收藏按原去重身份关联目标，取消后保留其他场次", async () => {
  const { db, repository, events } = await setup();
  const { createArchiveFavoriteActions } = await import("../src/archive/archiveRuntime.ts");
  const { mergeGiftInto } = await import("../src/events/giftMerge.ts");
  try {
    const first = { ...events[0], msgType: 1, gift: { id: 1, name: "花", count: 1, price: 1000, total: 1000 } };
    db.prepare("UPDATE archive_event SET payload_json = ? WHERE event_key = 'session:archive-event:one'").run(JSON.stringify(first));
    const rows = [first];
    mergeGiftInto(rows, { ...first, id: "gift-2", dedupe: "next", comboId: "combo", ts: 1100 });
    const snapshot = { ...first, comboId: "combo", ts: 1100, gift: rows[0].gift };
    const old = annotations.setFavoriteEvent([], snapshot, true, 37);
    annotations.useEventAnnotations.setState({ favorites: [...old, { ...old[0], archiveEventKey: "other:archive-event:one" }] });
    await repository.setFavorite("session:archive-event:one", true, 37);
    assert.equal(annotations.isEventFavorited(old, rows[0], "session:archive-event:one"), true);
    await createArchiveFavoriteActions(repository).remove([{ sourceKind: "archive", stableId: "session:archive-event:one" }]);
    const remaining = annotations.useEventAnnotations.getState().favorites;
    assert.equal(annotations.isEventFavorited(remaining, rows[0], "session:archive-event:one"), false);
    assert.equal(annotations.isEventFavorited(remaining, rows[0], "other:archive-event:one"), true);
    assert.equal(remaining[0].favoritedAt, 37);
  } finally { annotations.useEventAnnotations.setState({ favorites: [] }); db.close(); }
});

test("回看实际编辑入口只检查目标场次，先新增该场次收藏再打开整理", async () => {
  const { db, repository, events } = await setup();
  const { createArchiveFavoriteActions } = await import("../src/archive/archiveRuntime.ts");
  try {
    annotations.useEventAnnotations.setState({ favorites: annotations.bindFavoriteEvent([], events[0], "other:archive-event:one", true, 37) });
    const [row] = projectArchiveEvents([await repository.getEvent("session:archive-event:one")]);
    let editor = null;
    let actionError = null;
    const callbacks = favoriteCallbacks({
      repository, ...annotations, createArchiveFavoriteActions,
      createArchiveRequestId: () => "review-favorite-test", recordArchiveDiagnostic() {},
      setReviewActionError(value) { actionError = value; }, setFavoriteEditor(value) { editor = value; },
    }, "../src/components/ReviewPanel.tsx", ["onReviewToggleFavorite", "onReviewEditFavorite"]);
    await callbacks.onReviewEditFavorite(row);
    assert.equal(actionError, null);
    assert.equal((await repository.getEvent("session:archive-event:one")).favorited, true);
    assert.equal(editor.stableId, "session:archive-event:one");
    assert.deepEqual(annotations.useEventAnnotations.getState().favorites.map((favorite) => favorite.archiveEventKey), ["other:archive-event:one", "session:archive-event:one"]);
  } finally { annotations.useEventAnnotations.setState({ favorites: [] }); db.close(); }
});
