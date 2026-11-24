import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

async function pages(queryEvents) {
  const state = { values: [], index: 0, effects: [] };
  globalThis.__reviewPages = state;
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-reviewTimelinePages.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root: fileURLToPath(new URL("../", import.meta.url)), configFile: false,
    logLevel: "silent", server: {watch:null, middlewareMode: true },
    plugins: [{
      name: "review-page-ports",
      resolveId: (id) => id.startsWith("\0review-pages:") ? id : undefined,
      load(id) {
        if (id === "\0review-pages:react") return `
          export const useRef = (current) => ({ current });
          export const useCallback = (callback) => callback;
          export const useEffect = (effect) => globalThis.__reviewPages.effects.push(effect);
          export const useState = (initial) => {
            const state = globalThis.__reviewPages;
            const index = state.index++;
            state.values[index] = typeof initial === 'function' ? initial() : initial;
            return [state.values[index], value => { state.values[index] = typeof value === 'function' ? value(state.values[index]) : value; }];
          };`;
        if (id === "\0review-pages:diagnostics") return 'export const createArchiveRequestId = () => "test"; export const recordArchiveDiagnostic = () => {};';
      },
      transform(code, id) {
        if (!/\/src\/archive\/useReviewTimeline(?:Pages|Reading|Refresh)\.ts$/.test(id.replaceAll("\\", "/"))) return;
        return code.replace('from "react"', 'from "\0review-pages:react"')
          .replace('from "./archiveDiagnostics.ts"', 'from "\0review-pages:diagnostics"');
      },
    }],
  });
  const { useReviewTimelinePages } = await server.ssrLoadModule("/src/archive/useReviewTimelinePages.ts");
  const { useReviewTimelineReading } = await server.ssrLoadModule("/src/archive/useReviewTimelineReading.ts");
  const { useReviewTimelineRefresh } = await server.ssrLoadModule("/src/archive/useReviewTimelineRefresh.ts");
  const data = useReviewTimelinePages({
    repository: { queryEvents }, sessionId: "session", searchScope: "session",
    archiveFilters: {}, direction: "desc", active: true, readingReady: true,
    getReadingAnchorRef: { current: () => null },
  });
  return { data, state, useReviewTimelineReading, useReviewTimelineRefresh,
    async close() { await server.close(); delete globalThis.__reviewPages; } };
}

const event = (eventKey, ordinal) => ({ eventKey, eventTs: ordinal, ordinal });

test("回看双向初始分页只在两页完成后合并，事件不重复", async () => {
  let release;
  const delayed = new Promise((resolve) => { release = resolve; });
  const app = await pages(async ({ direction }) => direction === "asc" ? delayed : {
    items: [event("target", 2), event("older", 1)], nextCursor: null, totalCount: 3,
  });
  try {
    app.data.resetPages(["asc", "desc"]);
    const ascending = app.data.loadDirectionPage("asc");
    await app.data.loadDirectionPage("desc");
    assert.deepEqual(app.data.recordsRef.current, []);
    release({ items: [event("target", 2), event("newer", 3)], nextCursor: null, totalCount: null });
    await ascending;
    assert.deepEqual(app.data.recordsRef.current.map((row) => row.eventKey), ["newer", "target", "older"]);
  } finally { release?.({ items: [], nextCursor: null, totalCount: null }); await app.close(); }
});

test("重置查询后，旧分页结果不能覆盖新场次窗口", async () => {
  let release;
  let calls = 0;
  const app = await pages(() => ++calls === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve({
    items: [event("current", 5)], nextCursor: null, totalCount: 1,
  }));
  try {
    app.data.resetPages(["desc"]);
    const stale = app.data.loadDirectionPage("desc");
    app.data.resetPages(["desc"]);
    await app.data.loadDirectionPage("desc");
    release({ items: [event("stale", 1)], nextCursor: "old", totalCount: 100 });
    assert.equal(await stale, false);
    assert.deepEqual(app.data.recordsRef.current.map((row) => row.eventKey), ["current"]);
    assert.equal(app.data.cursorByDirectionRef.current.desc, null);
  } finally { await app.close(); }
});

test("跳到最新忽略阅读锚点，固定请求最新窗口并限制页大小", async () => {
  const queries = [];
  const app = await pages(async (query) => {
    queries.push(query);
    return { items: [], nextCursor: null, totalCount: 0 };
  });
  try {
    app.data.getReadingAnchorRef.current = () => ({ eventKey: "saved", fallbackEventTs: 2 });
    app.data.resetPages(["desc"], true);
    await app.data.loadDirectionPage("desc", { ignoreReadingAnchor: true, includeTotal: true });
    assert.equal(queries[0].anchor, undefined);
    assert.equal(queries[0].direction, "desc");
    assert.equal(queries[0].limit, 320);
    assert.equal(queries[0].includeTotal, true);
    assert.equal(await app.data.loadDirectionPage("desc"), false);
    assert.equal(queries.length, 1);
  } finally { await app.close(); }
});

test("上下文定位完成后停止跟随，用户返回最新才能重新开启", async () => {
  const app = await pages(async () => ({ items: [], nextCursor: null, totalCount: 0 }));
  try {
    const results = [];
    const reading = app.useReviewTimelineReading({ sessionId: "session", targetEventKey: "target", onTargetEventConsumed: (found) => results.push(found) });
    assert.equal(reading.pendingTargetEventKey, "target");
    assert.equal(reading.navigationState.preserveReadingPosition, true);
    reading.completeTargetLocation(true);
    assert.equal(reading.followingLatestRef.current, false);
    assert.deepEqual(results, [true]);
    reading.updateFollowingLatest(true);
    assert.equal(reading.followingLatestRef.current, true);
  } finally { await app.close(); }
});

test("停止跟随和定位期间不刷新，恢复跟随后只标记新增事件动画", async () => {
  const queries = [];
  let resolveQuery;
  const received = new Promise((resolve) => { resolveQuery = resolve; });
  const repository = { queryEvents: async (query) => {
    queries.push(query);
    if (query.limit === 320) return { items: [event("old", 2)], nextCursor: null, totalCount: 1 };
    resolveQuery();
    return { items: [event("new", 3), event("old", 2)], nextCursor: null, totalCount: 2 };
  } };
  const app = await pages(repository.queryEvents);
  let cleanup;
  try {
    app.data.resetPages(["desc"]);
    await app.data.loadDirectionPage("desc");
    queries.length = 0;
    const reading = app.useReviewTimelineReading({ sessionId: "session" });
    const options = { ...app.data, ...reading, active: true, loaded: true, archiveFilters: {}, direction: "asc", latestResumeRevision: 1, refreshKey: 1, repository, searchScope: "session", sessionId: "session" };
    reading.updateFollowingLatest(false);
    app.useReviewTimelineRefresh(options);
    app.state.effects.at(-1)();
    assert.equal(queries.length, 0);
    reading.updateFollowingLatest(true);
    reading.restorePendingRef.current = true;
    app.useReviewTimelineRefresh(options);
    app.state.effects.at(-1)();
    assert.equal(queries.length, 0);
    reading.restorePendingRef.current = false;
    app.useReviewTimelineRefresh(options);
    cleanup = app.state.effects.at(-1)();
    await received;
    await Promise.resolve();
    assert.equal(queries.length, 1);
    assert.equal(queries[0].direction, "desc");
    assert.equal(queries[0].limit, 500);
    assert.deepEqual(app.data.recordsRef.current.map((row) => row.eventKey), ["old", "new"]);
    assert.deepEqual([...app.data.reviewAnimationKeysRef.current], ["new"]);
  } finally { cleanup?.(); await app.close(); }
});
