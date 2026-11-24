import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { DatabaseSync } from "node:sqlite";
import { sqliteAdapter } from "./helpers/archiveAcceptance.mjs";
import { initializeArchiveDatabase } from "../src/archive/archiveSchema.ts";
import { ArchiveRepository } from "../src/archive/archiveRepository.ts";
import { componentRuntime } from "./helpers/componentRuntime.mjs";
import { create } from "zustand";
import { createFavoriteActions } from "../src/archive/favoriteActions.ts";
import * as annotations from "../src/eventAnnotations.ts";
import { mergeOwnerEventGroupPage } from "../src/archive/reviewOwnerEventQueryState.ts";
import { shouldShowOwnerEventSearchLoading } from "../src/archive/reviewOwnerEventResultsState.ts";

const path = "../src/components/ReviewPanel.tsx";
const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const callbacks = {};
function visit(node) {
  if (ts.isCallExpression(node) && node.expression.getText(source) === "useEffect") {
    const callback = node.arguments[0];
    const text = callback.getText(source);
    if (text.includes("setOwnerArchiveRevision(nextRevision)")) callbacks.revision = text;
    if (text.includes("repository.queryOwnerEventGroups(query)")) callbacks.search = text;
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === "loadMoreOwnerEventResults") {
    callbacks.more = node.initializer.arguments[0].getText(source);
  }
  ts.forEachChild(node, visit);
}
visit(source);
function evaluate(text, bindings) {
  assert.ok(text, "缺少生产回调");
  return new Function(...Object.keys(bindings), ts.transpile(`return (${text});`, { target: ts.ScriptTarget.ES2022 }))(...Object.values(bindings));
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function group(id, count = 1) {
  return { session: { sessionId: id, startedAt: 1, favoriteCount: count }, matchCount: count, latestMatchTs: 1, matches: [] };
}
const page = (items, hasMore = false) => ({ items, hasMore, nextOffset: hasMore ? items.length : null });

async function sqliteFavorites() {
  const db = new DatabaseSync(":memory:");
  await initializeArchiveDatabase(sqliteAdapter(db));
  db.exec("INSERT INTO archive_owner (owner_id, room_id, owner_name, created_at, updated_at) VALUES ('room:2', 2, 'B', 1, 1); INSERT INTO archive_session (session_id, owner_id, room_id, started_at, status, quality, created_at, updated_at) VALUES ('first', 'room:2', 2, 1, 'ended', 'complete', 1, 1)");
  for (const [index, key] of ["one", "two"].entries()) {
    db.prepare("INSERT INTO archive_event (event_key, session_id, room_id, ordinal, event_ts, primary_category, search_text, payload_json) VALUES (?, 'first', 2, ?, 1, 'danmu', '正文', ?)")
      .run(key, index, JSON.stringify({ id: key, roomId: 2, ts: 1, msgType: 0, text: "正文" }));
  }
  const repository = new ArchiveRepository(sqliteAdapter(db));
  await repository.setFavorite("one", true, 37);
  return { db, repository };
}

function favoritePageCallback(name, bindings) {
  const path = "../src/components/ReviewFavoritesPanel.tsx";
  const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) callback = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return evaluate(callback, bindings);
}

function setup() {
  const runtime = componentRuntime("src/archive/archiveRuntime.ts", {
    zustand: { create }, "./favoriteActions.ts": { createFavoriteActions }, "../eventAnnotations.ts": annotations,
  }, ["notifyArchiveWriteComplete"]).exports;
  runtime.initializeArchiveRuntime({ isCurrent: () => true, addCleanup() {} });
  const requests = [], reviewStates = [];
  const state = {
    active: true, route: { level: "owner", roomId: 2 }, currentRoomId: 1,
    owner: { ownerId: "room:2" }, ownerState: { mode: "events" },
    ownerEventOwnerId: "room:2", ownerEventQueryKey: "query-B",
    ownerEventQuery: { filters: { favoriteOnly: true }, sort: "latestMatchTs", direction: "desc" },
    ownerEventHasConditions: true, ownerArchiveRevision: 0, ownerEventDataRevision: 0, managementRevision: 0,
    ownerArchiveRevisionRef: { current: 0 }, ownerEventQueryKeyRef: { current: "query-B" },
    ownerEventRequestGenerationRef: { current: 0 },
    ownerEventFirstPageGenerationRef: { current: null },
    lastOwnerArchiveRefreshRef: { current: 0 }, lastOwnerMutationRevisionRef: { current: 0 },
    lastOwnerEventRefreshRef: { current: { queryKey: "query-B", refreshKey: JSON.stringify({ ownerArchiveRevision: 0, ownerEventDataRevision: 0, managementRevision: 0 }), mutationKey: JSON.stringify({ archiveMutationRevision: 0, ownerEventDataRevision: 0, managementRevision: 0 }) } },
    ownerEventSearchLoading: false, ownerEventSearchError: null,
    ownerEventResults: { ownerId: "room:2", queryKey: "query-B", page: page([group("first")], true) },
    repository: { queryOwnerEventGroups(query) { const pending = deferred(); requests.push({ query, ...pending }); return pending.promise; } },
    ownerIdForRoom: (roomId) => `room:${roomId}`, activeArchiveFilterKeys: () => ["favoriteOnly"],
    createArchiveRequestId: () => "test", recordArchiveDiagnostic() {},
    updateArchiveReviewState(value) { reviewStates.push(value); },
    mergeOwnerEventGroupPage, shouldShowOwnerEventSearchLoading,
  };
  for (const name of ["OwnerArchiveRevision", "OwnerEventSearchLoading", "OwnerEventSearchError", "OwnerEventResults"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    state[`set${name}`] = (value) => { state[key] = typeof value === "function" ? value(state[key]) : value; };
  }
  function bindings() {
    return { ...state, ...runtime.useArchiveRuntime.getState(), refreshKey: runtime.useArchiveRuntime.getState().archiveRevision,
      ownerEventRefreshKey: JSON.stringify({ ownerArchiveRevision: state.ownerArchiveRevision, ownerEventDataRevision: state.ownerEventDataRevision, managementRevision: state.managementRevision }),
      ownerEventMutationKey: JSON.stringify({ archiveMutationRevision: runtime.useArchiveRuntime.getState().archiveMutationRevision, ownerEventDataRevision: state.ownerEventDataRevision, managementRevision: state.managementRevision }),
      displayedOwnerEventPage: state.ownerEventResults?.page };
  }
  let cleanup;
  return {
    runtime, state, requests, reviewStates,
    refresh() { evaluate(callbacks.revision, bindings())(); },
    search() { cleanup?.(); cleanup = evaluate(callbacks.search, bindings())(); },
    more() { return evaluate(callbacks.more, bindings())(); },
    moreCallback() { return evaluate(callbacks.more, bindings()); },
    record() { runtime.notifyArchiveWriteComplete({ getStatus: () => ({ pending: 0 }) }, { flushed: 1 }); },
    close() { cleanup?.(); requests.forEach((request) => request.resolve(page([]))); },
  };
}

test("A录档不重新查询B主播历史检索", () => {
  const app = setup();
  try {
    app.record(); app.refresh(); app.search();
    assert.equal(app.state.ownerArchiveRevisionRef.current, 0);
    assert.equal(app.requests.length, 0);
  } finally { app.close(); }
});

test("收藏首屏刷新在途时旧分页回调不能抢占，成功后使用新offset", async () => {
  const app = setup();
  try {
    const staleMore = app.moreCallback();
    app.runtime.notifyArchiveRevision(); app.refresh(); app.search();
    const generation = app.state.ownerEventRequestGenerationRef.current;
    const attempted = staleMore();
    assert.deepEqual(app.requests.map((request) => request.query.offset), [0]);
    await attempted;
    assert.equal(app.state.ownerEventRequestGenerationRef.current, generation);
    assert.equal(app.state.ownerEventSearchLoading, true);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["first"]);
    app.requests[0].resolve(page([group("replacement", 2), group("fresh", 3)], true)); await settle();
    assert.equal(app.state.ownerEventSearchLoading, false);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["replacement", "fresh"]);
    assert.equal(app.reviewStates.at(-1).ownerEventSearch.matchCount, 5);
    const more = app.more();
    assert.deepEqual(app.requests.map((request) => request.query.offset), [0, 2]);
    app.requests[1].resolve(page([group("later")])); await more;
    assert.equal(app.state.ownerEventSearchLoading, false);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["fresh", "later", "replacement"]);
  } finally { app.close(); }
});

test("首屏刷新失败释放在途状态，后续分页可正常发起", async () => {
  const app = setup();
  try {
    const staleMore = app.moreCallback();
    app.runtime.notifyArchiveRevision(); app.refresh(); app.search();
    const attempted = staleMore();
    assert.equal(app.requests.length, 1);
    await attempted;
    app.requests[0].reject(new Error("刷新失败")); await settle();
    assert.equal(app.state.ownerEventSearchLoading, false);
    assert.equal(app.state.ownerEventSearchError, "刷新失败");
    const more = app.more();
    assert.deepEqual(app.requests.map((request) => request.query.offset), [0, 1]);
    app.requests[1].resolve(page([group("later")])); await more;
    assert.equal(app.state.ownerEventSearchLoading, false);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["first", "later"]);
  } finally { app.close(); }
});

test("被替代首屏的finally不释放新刷新状态，旧分页回调仍被阻止", async () => {
  const app = setup();
  try {
    const staleMore = app.moreCallback();
    app.runtime.notifyArchiveRevision(); app.refresh(); app.search();
    app.runtime.notifyArchiveRevision(); app.refresh(); app.search();
    app.requests[0].resolve(page([group("stale")])); await settle();
    const generation = app.state.ownerEventRequestGenerationRef.current;
    const attempted = staleMore();
    assert.deepEqual(app.requests.map((request) => request.query.offset), [0, 0]);
    await attempted;
    assert.equal(app.state.ownerEventRequestGenerationRef.current, generation);
    assert.equal(app.state.ownerEventSearchLoading, true);
    app.requests[1].resolve(page([group("replacement"), group("fresh")], true)); await settle();
    const more = app.more();
    assert.deepEqual(app.requests.map((request) => request.query.offset), [0, 0, 2]);
    app.requests[2].resolve(page([group("later")])); await more;
    assert.equal(app.state.ownerEventSearchLoading, false);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["fresh", "later", "replacement"]);
  } finally { app.close(); }
});

test("B分页期间A录档仍追加结果且结束加载", async () => {
  const app = setup();
  try {
    const loading = app.more();
    app.record(); app.refresh(); app.search();
    app.requests[0].resolve(page([group("second")]));
    await loading;
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["first", "second"]);
    assert.equal(app.requests.length, 1);
    assert.equal(app.state.ownerEventSearchLoading, false);
  } finally { app.close(); }
});

test("B录档仍刷新B检索结果及计数", async () => {
  const app = setup();
  try {
    app.state.currentRoomId = 2;
    app.state.ownerEventResults.page.items.push(group("loaded-later"));
    app.record(); app.refresh(); app.search();
    assert.equal(app.requests.length, 1);
    app.requests[0].resolve(page([group("first", 3)])); await settle();
    assert.equal(app.state.ownerEventResults.page.items[0].matchCount, 3);
    assert.equal(app.reviewStates.at(-1).ownerEventSearch.matchCount, 3);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["first", "loaded-later"]);
  } finally { app.close(); }
});

test("B收藏提交跨入口刷新结果及计数，录档不推进整理版本", async () => {
  const app = setup();
  try {
    const before = app.runtime.useArchiveRuntime.getState().archiveMutationRevision;
    app.record();
    assert.equal(app.runtime.useArchiveRuntime.getState().archiveMutationRevision, before);
    const repository = { async setFavorite() {}, async getEvent() { return null; } };
    await app.runtime.createArchiveFavoriteActions(repository).set("B:event", true);
    app.refresh(); app.search();
    assert.equal(app.requests.length, 1);
    app.requests[0].resolve(page([group("first", 2)])); await settle();
    assert.equal(app.state.ownerEventResults.page.items[0].session.favoriteCount, 2);
    assert.equal(app.reviewStates.at(-1).ownerEventSearch.matchCount, 2);
    assert.equal(app.runtime.useArchiveRuntime.getState().archiveMutationRevision, 1);
  } finally { app.close(); }
});

test("离开主播页的收藏变更在返回B后刷新", () => {
  const app = setup();
  try {
    app.state.route = { level: "home" };
    app.runtime.notifyArchiveRevision(); app.refresh();
    app.state.route = { level: "owner", roomId: 2 }; app.refresh(); app.search();
    assert.equal(app.requests.length, 1);
  } finally { app.close(); }
});

test("真实SQLite的B收藏提交及批量取消刷新检索和场次计数", async () => {
  const app = setup();
  const { db, repository } = await sqliteFavorites();
  try {
    app.state.repository = repository;
    app.state.ownerEventResults.page = await repository.queryOwnerEventGroups({ ownerId: "room:2", filters: { favoriteOnly: true } });
    const actions = app.runtime.createArchiveFavoriteActions(repository);
    await actions.set("two", true);
    app.refresh(); app.search(); await settle();
    assert.equal(app.state.ownerEventResults.page.items[0].matchCount, 2);
    assert.equal(app.state.ownerEventResults.page.items[0].session.favoriteCount, 2);
    assert.equal(app.reviewStates.at(-1).ownerEventSearch.matchCount, 2);
    let actionError;
    const removal = {
      repository, createArchiveFavoriteActions: app.runtime.createArchiveFavoriteActions,
      createArchiveRequestId: () => "test", recordArchiveDiagnostic() {},
      selectedItems: (await repository.queryFavorites()).items.filter((item) => item.stableId === "two"),
      setActionError(value) { actionError = value; }, setConfirmRemove() {}, setSelected() {}, setSingleRemove() {},
    };
    await favoritePageCallback("removeSelected", removal)();
    assert.equal(actionError, null);
    app.refresh(); app.search(); await settle();
    assert.equal(app.state.ownerEventResults.page.items[0].matchCount, 1);
    assert.equal(app.state.ownerEventResults.page.items[0].session.favoriteCount, 1);
    assert.equal(app.reviewStates.at(-1).ownerEventSearch.matchCount, 1);
    assert.equal((await repository.queryFavorites()).items[0].favoritedAt, 37);
    removal.singleRemove = (await repository.queryFavorites()).items[0];
    await favoritePageCallback("removeSingle", removal)();
    assert.equal(actionError, null);
    app.refresh(); app.search(); await settle();
    assert.deepEqual(app.state.ownerEventResults.page.items, []);
    assert.equal(app.reviewStates.at(-1).ownerEventSearch.matchCount, 0);
  } finally { app.close(); db.close(); }
});

test("收藏页实际备注与标签整理入口保持局部刷新和SQLite信息", async () => {
  const { db, repository } = await sqliteFavorites();
  try {
    let reloads = 0, updated = null, error = null;
    const bindings = {
      repository, editingItem: (await repository.queryFavorites()).items[0],
      createArchiveRequestId: () => "test", recordArchiveDiagnostic() {},
      updateItem(item) { updated = item; },
      setActionError(value) { error = value; }, setSelected() {}, setTagBatchName() {}, setTagToDelete() {},
      setTagFilter(update) { update({ names: ["改名"], mode: "any" }); },
      setReloadToken(update) { reloads = update(reloads); },
    };
    await favoritePageCallback("saveEditedFavorite", bindings)("备注", ["原标签"]);
    assert.equal(updated.note, "备注");
    assert.deepEqual(await repository.getFavoriteOrganization({ sourceKind: "archive", stableId: "one" }), { note: "备注", tags: ["原标签"] });
    bindings.selectedItems = (await repository.queryFavorites()).items;
    bindings.tags = await repository.listFavoriteTags();
    bindings.tagBatchName = "批量标签";
    await favoritePageCallback("addTagToSelected", bindings)();
    bindings.selectedItems = (await repository.queryFavorites()).items;
    await favoritePageCallback("removeTagFromSelected", bindings)("原标签");
    const tag = (await repository.listFavoriteTags()).find((item) => item.name === "批量标签");
    bindings.tagRenameValues = { [tag.tagId]: "改名" };
    await favoritePageCallback("renameTag", bindings)(tag);
    assert.deepEqual((await repository.queryFavorites()).items[0].tags, ["改名"]);
    bindings.tagToDelete = { ...tag, name: "改名" };
    await favoritePageCallback("deleteTag", bindings)();
    assert.equal(error, null);
    assert.equal(reloads, 4);
    const item = (await repository.queryFavorites()).items[0];
    assert.deepEqual(item.tags, []);
    assert.equal(item.note, "备注");
    assert.equal(item.favoritedAt, 37);
    assert.equal((await repository.getSession("first")).favoriteCount, 1);
  } finally { db.close(); }
});

for (const revision of ["ownerEventDataRevision", "managementRevision"]) {
  test(`整理或档案管理刷新替代分页并释放状态：${revision}`, async () => {
    const app = setup();
    try {
      const old = app.more();
      app.state[revision] += 1; app.search();
      app.requests[0].resolve(page([group("stale")])); await old;
      assert.equal(app.state.ownerEventSearchLoading, true);
      app.requests[1].resolve(page([group("first", 3)])); await settle();
      assert.equal(app.state.ownerEventSearchLoading, false);
      assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["first"]);
    } finally { app.close(); }
  });
}

test("离开事件检索时释放分页状态，旧请求不覆盖新查询", async () => {
  const app = setup();
  try {
    const old = app.more();
    app.state.active = false; app.search();
    assert.equal(app.state.ownerEventSearchLoading, false);
    app.state.active = true;
    app.state.ownerEventQueryKey = "new-query";
    app.state.ownerEventQueryKeyRef.current = "new-query";
    app.search();
    app.requests[0].resolve(page([group("stale")])); await old;
    assert.equal(app.state.ownerEventSearchLoading, true);
    app.requests[1].resolve(page([group("new")])); await settle();
    assert.equal(app.state.ownerEventSearchLoading, false);
    assert.deepEqual(app.state.ownerEventResults.page.items.map((item) => item.session.sessionId), ["new"]);
  } finally { app.close(); }
});

for (const order of ["old-first", "refresh-first", "refresh-error", "old-error"]) {
  test(`相关刷新替代分页释放loading，旧请求不清新任务状态：${order}`, async () => {
    const app = setup();
    try {
      const old = app.more();
      app.runtime.notifyArchiveRevision(); app.refresh(); app.search();
      assert.equal(app.requests.length, 2);
      if (order === "old-first" || order === "old-error") {
        if (order === "old-error") app.requests[0].reject(new Error("旧分页失败"));
        else app.requests[0].resolve(page([group("stale")]));
        await old;
        assert.equal(app.state.ownerEventSearchLoading, true);
        assert.equal(app.state.ownerEventSearchError, null);
        app.requests[1].resolve(page([group("first", 4)])); await settle();
      } else {
        if (order === "refresh-error") app.requests[1].reject(new Error("查询失败"));
        else app.requests[1].resolve(page([group("first", 4)], true));
        await settle();
        assert.equal(app.state.ownerEventSearchLoading, false);
        const current = app.more();
        if (order !== "refresh-error") assert.equal(app.state.ownerEventSearchLoading, true);
        app.requests[0].resolve(page([group("stale")])); await old;
        if (order !== "refresh-error") {
          assert.equal(app.state.ownerEventSearchLoading, true);
          app.requests[2].resolve(page([group("second")]));
        } else app.requests[2]?.resolve(page([group("second")]));
        await current;
      }
      assert.equal(app.state.ownerEventSearchLoading, false);
      assert.ok(!app.state.ownerEventResults.page.items.some((item) => item.session.sessionId === "stale"));
    } finally { app.close(); }
  });
}
