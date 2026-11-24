import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqliteAdapter } from "./helpers/archiveAcceptance.mjs";
import { ArchiveRepository, reconcileStaleArchiveSessions } from "../src/archive/archiveRepository.ts";
import { initializeArchiveDatabase } from "../src/archive/archiveSchema.ts";
import { getArchiveRecordNotices } from "../src/archive/archiveQuality.ts";

const root = new URL("..", import.meta.url).pathname.replace(/^\//, "").replaceAll("/", "\\");

function mockPlugin(repository) {
  const modules = new Map([
    ["\0task2-protocol", `
      export const MsgType = { Gift: 1, LiveStart: 22, LiveEnd: 23, WatchedChange: 8, OnlineRank: 9, LikeUpdate: 14, FansUpdate: 15, ScDeleted: 17, SuperChat: 2 };
      export class SharedRoomConnection {
        constructor(callbacks, _diagnosticContext, runtimeMetadata) {
          this.callbacks = callbacks;
          this.anchor = null;
          this.runtimeMetadata = runtimeMetadata;
          globalThis.__task2Connections ??= [];
          globalThis.__task2Connections.push(this);
        }
        connect() { return Promise.resolve(); }
        disconnect() {
          this.disconnected = true;
          globalThis.__task2ConnectionDisconnects = (globalThis.__task2ConnectionDisconnects ?? 0) + 1;
        }
      }
      export const getRealRoomId = async () => globalThis.__anchorRoomQuery
        ? globalThis.__anchorRoomQuery() : ({ room_id: 101, short_id: 101, live_status: 1, uid: 7 });
      export const getRoomBaseInfo = async (rooms) => {
        globalThis.__anchorBatchCalls = (globalThis.__anchorBatchCalls ?? 0) + 1;
        globalThis.__anchorBatchInputs = rooms;
        if (globalThis.__anchorBatchBlocked) throw new ApiError("blocked", 412);
        return [await getRealRoomId()];
      };
      export class ApiError extends Error { constructor(message, code) { super(message); this.code = code; } }
      export const loadAnchors = async () => [];
      export const upsertAnchor = async () => [];
      export const saveAnchors = async (anchors) => anchors;
      export const updateAnchorStatuses = async (statuses) => {
        globalThis.__anchorSavedStatuses = statuses;
        return [];
      };
      export const removeAnchor = async () => [];
      export const restoreSession = async () => null;
      export const saveSession = async (session) => session;
      export const clearSession = async () => {};
      export const qrLogin = async () => { throw new Error("not used"); };
    `],
    ["\0task2-adapter", `export const getEventId = (event) => event.reactKey ?? event.id;`],
    ["\0task2-gift-effects", `export const getEventEffect = () => undefined;`],
    ["\0task2-display", `export const publishDisplayEvent = () => "not-applicable"; export const switchDisplayRoom = () => {}; export const updateDisplayRoomGuardProfile = (profile) => { globalThis.__task1WindowProfiles ??= []; globalThis.__task1WindowProfiles.push(['display', profile]); };`],
    ["\0task2-gift-window", `export const publishGiftEffectEvent = () => {}; export const publishGiftEvent = () => "not-applicable"; export const switchGiftWindowRoom = () => {}; export const updateGiftRoomGuardProfile = (profile) => { globalThis.__task1WindowProfiles ??= []; globalThis.__task1WindowProfiles.push(['gift', profile]); };`],
    ["\0task2-voice", `export const clearVoiceRuntime = () => {}; export const publishVoiceEvent = () => {}; export const switchVoiceRoom = () => {};`],
    ["\0task2-gift-bus", `export const emitGiftEffect = () => {};`],
    ["\0task2-archive-repository", `
      export async function openArchiveDatabase() { return {}; }
      export class ArchiveRepository {
        constructor() {}
        async upsertOwner() {}
        async upsertSession(session) {
          const gate = globalThis.__task2ArchiveGate;
          gate.starts.push(session.sessionId);
          if (!gate.firstStarted) {
            gate.firstStarted = true;
            gate.firstSessionId = session.sessionId;
            await gate.block;
          }
          gate.commits.push(session.sessionId);
        }
        async appendEvents() {}
        async updateEvent() {}
        async updateSession() {}
      }
    `],
  ]);
  if (repository) {
    globalThis.__task2Repository = repository;
    modules.set("\0task2-archive-repository", `
      export async function openArchiveDatabase() { return {}; }
      export class ArchiveRepository { constructor() { return globalThis.__task2Repository; } }
    `);
  }

  return {
    name: "task2-connection-integration-mocks",
    enforce: "pre",
    resolveId(source, importer) {
      const normalizedSource = source.replaceAll("\\\\", "/");
      const isConnectionImport = importer?.includes("src\\stores\\connection.ts") || importer?.includes("src/stores/connection.ts");
      if (modules.has(source)) return source;
      const match = {
        "../protocol": "\0task2-protocol",
        "../obs/sharedRoomConnection.ts": "\0task2-protocol",
        "../protocol/adapter": "\0task2-adapter",
        "../protocol/giftEffects": "\0task2-gift-effects",
        "../windows/displayBridge": "\0task2-display",
        "../windows/giftBridge": "\0task2-gift-window",
        "../voice/voiceRuntime": "\0task2-voice",
        "../windows/giftEffectBus": "\0task2-gift-bus",
        "../archive/archiveRepository.ts": "\0task2-archive-repository",
      }[source];
      if (isConnectionImport && match) return match;
      if (normalizedSource.endsWith("/src/protocol") || normalizedSource.endsWith("/src/protocol/index.ts")) return "\0task2-protocol";
      if (normalizedSource.endsWith("/src/protocol/adapter.ts")) return "\0task2-adapter";
      if (normalizedSource.endsWith("/src/protocol/giftEffects.ts")) return "\0task2-gift-effects";
      if (normalizedSource.endsWith("/src/archive/archiveRepository.ts")) return "\0task2-archive-repository";
      return null;
    },
    load(id) {
      return modules.get(id) ?? null;
    },
    transform(code, id) {
      const normalizedId = id.replaceAll("\\\\", "/");
      if (!["/src/stores/connection.ts", "/src/stores/session.ts", "/src/runtime/liveEventDelivery.ts", "/src/archive/archiveRuntime.ts"].some((path) => normalizedId.includes(path))) return null;
      const replacements = {
        "./archiveRepository.ts": "\0task2-archive-repository",
        "../protocol": "\0task2-protocol",
        "../obs/sharedRoomConnection.ts": "\0task2-protocol",
        "../protocol/adapter": "\0task2-adapter",
        "../protocol/giftEffects": "\0task2-gift-effects",
        "../windows/displayBridge": "\0task2-display",
        "../windows/giftBridge": "\0task2-gift-window",
        "../voice/voiceRuntime": "\0task2-voice",
        "../windows/giftEffectBus": "\0task2-gift-bus",
        "../archive/archiveRepository.ts": "\0task2-archive-repository",
      };
      let transformed = code;
      for (const [from, to] of Object.entries(replacements)) {
        transformed = transformed.replaceAll(`from "${from}"`, `from "${to}"`);
      }
      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}

const event = (id) => ({
  id,
  msgType: 1,
  roomId: 101,
  ts: 1_700_000_000_000,
  gift: {
    id: 1,
    name: "小花",
    count: 1,
    price: 1000,
    coinType: "gold",
    total: 1000,
    priceRmb: 1,
    totalRmb: 1,
    isFree: false,
  },
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const startTime = 1_700_000_000_000;

async function archiveStoreFixture(t) {
  const path = join(mkdtempSync(join(tmpdir(), "danmu-lifecycle-")), "archive.sqlite");
  t.diagnostic(`SQLite fixture: ${path}`);
  const db = new DatabaseSync(path);
  const adapter = sqliteAdapter(db);
  await initializeArchiveDatabase(adapter);
  const repository = new ArchiveRepository(adapter);
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs", root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "silent",
    plugins: [mockPlugin(repository)], ssr: { noExternal: true, external: ["react", "react-dom", "zustand", "protobufjs"] },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  const { useConnection } = await server.ssrLoadModule("/src/stores/connection.ts");
  const runtime = await server.ssrLoadModule("/src/archive/archiveRuntime.ts");
  const lease = await server.ssrLoadModule("/src/archive/connectionRuntime.ts");
  t.after(async () => {
    useConnection.getState().disconnect();
    await runtime.flushArchiveWriter();
    await lease.getConnectionRuntime().closeArchiveWriter();
    lease.getConnectionRuntime().dispose();
    await server.close();
    db.close();
  });
  const connect = (roomId = 101, liveStartedAt = startTime, liveStatus = 1) => {
    useConnection.getState().connect(String(roomId), "fixture-cookie", "7");
    const connection = globalThis.__task2Connections.at(-1);
    connection.callbacks.onState({ status: "connected", roomId, liveStatus, liveStartedAt });
    return connection;
  };
  const settle = async () => { await wait(260); await runtime.flushArchiveWriter(); };
  const archive = (roomId = 101) => useConnection.getState().sessions[String(roomId)]?.archive;
  const seed = async (sessionId = "stored-a", overrides = {}) => {
    await repository.upsertOwner({ ownerId: "room:101", roomId: 101, name: "主播", updatedAt: startTime });
    await repository.upsertSession({ sessionId, ownerId: "room:101", roomId: 101, startedAt: startTime,
      sourceLiveStartedAt: startTime, status: "unclean", recordingStatus: "stopped", stopReason: "connection-switched",
      quality: "incomplete", qualityReason: "live-start-not-captured",
      qualityReasons: ["live-start-not-captured", "connection-switched"], eventCount: 0, paidTotal: 0, updatedAt: startTime, ...overrides });
  };
  return { repository, runtime, useConnection, connect, settle, archive, seed };
}

test('阶段1：连接档位晚到回刷现场并向两窗同步同一资料', async (t) => {
  const f = await archiveStoreFixture(t);
  const connection = f.connect();
  connection.callbacks.onEvent({ ...event('guard-user'), user: { uid: '1', uname: '舰长', guardLevel: 1 } });
  await f.settle();
  globalThis.__task1WindowProfiles = [];
  const roomGuardProfile = { roomId: 101, milestone: 'tenThousand', iconSet: 'enhanced', source: 'room-info' };
  connection.callbacks.onState({ status: 'connected', roomId: 101, roomGuardProfile });
  assert.equal(f.useConnection.getState().events[0].user.guardMilestone, 'tenThousand');
  assert.deepEqual(globalThis.__task1WindowProfiles, [['display', roomGuardProfile], ['gift', roomGuardProfile]]);
  delete globalThis.__task1WindowProfiles;
});

test("A→B→A 无新事件时恢复原场并立即落库，保留多种缺口", async (t) => {
  const f = await archiveStoreFixture(t);
  const a = f.connect();
  a.callbacks.onEvent(event("a-first"));
  await f.settle();
  const original = f.archive();
  const b = f.connect(202, startTime + 1000);
  b.callbacks.onEvent({ ...event("b-first"), roomId: 202 });
  await f.settle();
  assert.equal(f.archive().recordingStatus, "stopped");
  assert.equal(f.archive().stopReason, "connection-switched");
  f.connect();
  await f.settle();
  const restored = f.archive();
  const persisted = await f.repository.getSession(original.sessionId);
  assert.equal(restored.sessionId, original.sessionId);
  assert.equal(restored.status, "active");
  assert.equal(restored.recordingStatus, "recording");
  assert.equal(restored.stopReason, null);
  assert.equal(restored.quality, "incomplete");
  assert.deepEqual(restored.qualityReasons, ["live-start-not-captured", "connection-switched"]);
  assert.equal(persisted.recordingStatus, "recording");
  assert.equal(persisted.stopReason, null);
  assert.equal(persisted.eventCount, 1);
});

test("数据库恢复没有事件也立即持久化记录状态", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  f.connect();
  await f.settle();
  assert.equal(f.archive().sessionId, "stored-a");
  assert.equal(f.archive().quality, "incomplete");
  assert.deepEqual(f.archive().qualityReasons, ["live-start-not-captured", "connection-switched", "recovered-after-interruption"]);
  const stored = await f.repository.getSession("stored-a");
  assert.equal(stored.status, "active");
  assert.equal(stored.recordingStatus, "recording");
  assert.equal(stored.stopReason, null);
  assert.equal(stored.eventCount, 0);
});

test("异常退出收口不判缺口，确认同场数据库恢复后补中断且下播仍不完整", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed("stored-a", { status: "active", recordingStatus: "recording", stopReason: null,
    quality: "in-progress", qualityReason: null, qualityReasons: [] });
  await reconcileStaleArchiveSessions(f.repository, startTime + 1000);
  const stopped = await f.repository.getSession("stored-a");
  assert.equal(stopped.status, "unclean");
  assert.equal(stopped.recordingStatus, "stopped");
  assert.equal(stopped.stopReason, "previous-runtime");
  assert.equal(stopped.quality, "in-progress");
  assert.deepEqual(stopped.qualityReasons, []);
  const a = f.connect();
  await f.settle();
  for (const restored of [f.archive(), await f.repository.getSession("stored-a")]) {
    assert.equal(restored.sessionId, "stored-a");
    assert.equal(restored.recordingStatus, "recording");
    assert.equal(restored.stopReason, null);
    assert.equal(restored.quality, "incomplete");
    assert.deepEqual(restored.qualityReasons, ["recovered-after-interruption"]);
    assert.equal(restored.eventCount ?? restored.nextOrdinal, 0);
    assert.ok(getArchiveRecordNotices(restored).some(notice =>
      notice.kind === "quality" && notice.message === "记录曾中断，已恢复记录。"));
  }
  a.callbacks.onEvent({ id: "end-after-recovery", msgType: 23, roomId: 101, ts: startTime + 60000 });
  await f.settle();
  for (const ended of [f.archive(), await f.repository.getSession("stored-a")]) {
    assert.equal(ended.status, "ended");
    assert.equal(ended.quality, "incomplete");
    assert.deepEqual(ended.qualityReasons, ["recovered-after-interruption"]);
  }
});

for (const liveStartedAt of [null, startTime + 3600000]) {
  test(`数据库未知场次未确认同场不补缺口：开播时间 ${liveStartedAt}`, async (t) => {
    const f = await archiveStoreFixture(t);
    await f.seed("stored-a", { stopReason: "previous-runtime", quality: "in-progress",
      qualityReason: null, qualityReasons: [] });
    f.connect(101, liveStartedAt);
    await f.settle();
    assert.equal(f.archive(), undefined);
    const stored = await f.repository.getSession("stored-a");
    assert.equal(stored.status, "unclean");
    assert.equal(stored.recordingStatus, "stopped");
    assert.equal(stored.quality, "in-progress");
    assert.deepEqual(stored.qualityReasons, []);
  });
}

test("数据库恢复等待期间断线不发布记录中，重连成功无事件仍恢复同场", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  const findResumable = f.repository.findResumableSession.bind(f.repository);
  f.repository.findResumableSession = async (...args) => {
    started();
    await gate;
    return findResumable(...args);
  };
  try {
    const a = f.connect();
    await waiting;
    a.callbacks.onState({ status: "reconnecting", roomId: 101 });
    release();
    await f.settle();
    assert.equal(f.useConnection.getState().state.status, "reconnecting");
    assert.equal(f.archive(), undefined);
    const disconnected = await f.repository.getSession("stored-a");
    assert.equal(disconnected.status, "unclean");
    assert.equal(disconnected.recordingStatus, "stopped");
    assert.equal(disconnected.stopReason, "connection-switched");
    a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1, liveStartedAt: startTime });
    await f.settle();
    assert.equal(f.archive().sessionId, "stored-a");
    assert.equal(f.archive().status, "active");
    assert.equal(f.archive().recordingStatus, "recording");
    const recovered = await f.repository.getSession("stored-a");
    assert.equal(recovered.status, "active");
    assert.equal(recovered.recordingStatus, "recording");
    assert.equal(recovered.stopReason, null);
    assert.equal(recovered.eventCount, 0);
  } finally { release(); }
});

test("先捕获后迟到开播时间证明晚加入，无后续事件也更新内存和数据库质量", async (t) => {
  const f = await archiveStoreFixture(t);
  const a = f.connect(101, null);
  a.callbacks.onEvent(event("captured-without-start"));
  await f.settle();
  const initial = f.archive();
  assert.equal(initial.sourceLiveStartedAt, null);
  assert.equal(initial.quality, "in-progress");
  assert.deepEqual(initial.qualityReasons, []);
  const earlierStart = initial.startedAt - 60000;
  a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1, liveStartedAt: earlierStart });
  await f.settle();
  assert.equal(f.archive().sessionId, initial.sessionId);
  assert.equal(f.archive().sourceLiveStartedAt, earlierStart);
  assert.equal(f.archive().quality, "incomplete");
  assert.deepEqual(f.archive().qualityReasons, ["live-start-not-captured"]);
  const stored = await f.repository.getSession(initial.sessionId);
  assert.equal(stored.sourceLiveStartedAt, earlierStart);
  assert.equal(stored.quality, "incomplete");
  assert.deepEqual(stored.qualityReasons, ["live-start-not-captured"]);
  assert.equal(stored.eventCount, 1);
  assert.equal(stored.recordingStatus, "recording");
});

test("重连中独立保护记录，恢复保留缺口，正常退出使用 app-exit", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onState({ status: "reconnecting", roomId: 101 });
  await f.settle();
  assert.equal(f.archive().status, "unclean");
  assert.equal(f.archive().recordingStatus, "reconnecting");
  const preview = await f.repository.getDeletePreview({ all: true });
  assert.deepEqual(preview.blockedSessionIds, ["stored-a"]);
  a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1, liveStartedAt: startTime });
  await f.settle();
  assert.equal(f.archive().recordingStatus, "recording");
  assert.ok(f.archive().qualityReasons.includes("connection-error"));
  f.useConnection.getState().disconnect("app-exit");
  await f.settle();
  const stored = await f.repository.getSession("stored-a");
  assert.equal(stored.recordingStatus, "stopped");
  assert.equal(stored.stopReason, "app-exit");
  assert.equal(stored.endedAt, null);
  assert.ok(stored.qualityReasons.includes("connection-switched"));
});

test("恢复序号请求在切房后返回，不能回写旧房间内存或数据库", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  let release, started;
  const gate = new Promise(resolve => { release = resolve; });
  const waiting = new Promise(resolve => { started = resolve; });
  const getOrdinal = f.repository.getNextEventOrdinal.bind(f.repository);
  f.repository.getNextEventOrdinal = async (id) => { started(); await gate; return getOrdinal(id); };
  t.after(() => release());
  const old = f.connect();
  await waiting;
  f.connect(202, startTime + 1000);
  old.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1, liveStartedAt: startTime });
  old.callbacks.onEvent(event("late-old"));
  release();
  await f.settle();
  assert.equal(f.archive(), undefined);
  assert.equal(f.useConnection.getState().state.roomId, 202);
  assert.equal((await f.repository.getSession("stored-a")).recordingStatus, "stopped");
  assert.equal(f.useConnection.getState().events.length, 0);
});

test("不同开播时间无事件也收口旧场，下一事件创建新场", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onState({ status: "reconnecting", roomId: 101 });
  a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1, liveStartedAt: startTime + 3600000 });
  await f.settle();
  const old = await f.repository.getSession("stored-a");
  assert.equal(old.status, "unclean");
  assert.equal(old.recordingStatus, "stopped");
  assert.equal(old.endedAt, null);
  a.callbacks.onEvent(event("new-live"));
  await f.settle();
  assert.notEqual(f.archive().sessionId, "stored-a");
  assert.equal(f.archive().sourceLiveStartedAt, startTime + 3600000);
});

test("待刷新事件在切房前入队，恢复后不能覆盖新记录状态", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onEvent(event("pending-a"));
  f.connect(202, startTime + 1000);
  f.connect();
  await f.settle();
  const stored = await f.repository.getSession("stored-a");
  assert.equal(stored.recordingStatus, "recording");
  assert.equal(stored.stopReason, null);
  assert.equal(stored.eventCount, 1);
  assert.equal(f.archive().nextOrdinal, 1);
});

test("重连请求确认下播时立即停止，不补写结束时间", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onState({ status: "reconnecting", roomId: 101 });
  a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 0, liveStartedAt: startTime });
  await f.settle();
  const stored = await f.repository.getSession("stored-a");
  assert.equal(stored.status, "ended");
  assert.equal(stored.recordingStatus, "stopped");
  assert.equal(stored.endedAt, null);
});

test("重连缺少同场时间证据时停止旧场，后续事件另建场次", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onState({ status: "reconnecting", roomId: 101 });
  a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1, liveStartedAt: undefined });
  await f.settle();
  const old = await f.repository.getSession("stored-a");
  assert.equal(old.recordingStatus, "stopped");
  a.callbacks.onEvent(event("unknown-new"));
  await f.settle();
  assert.notEqual(f.archive().sessionId, "stored-a");
  assert.equal(f.archive().sourceLiveStartedAt, null);
});

test("下播待刷新时重连不能重新打开旧场，手动断开保持结束", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onEvent({ id: "preparing", msgType: 23, roomId: 101, ts: startTime + 60000 });
  a.callbacks.onState({ status: "reconnecting", roomId: 101 });
  a.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 0, liveStartedAt: startTime });
  await f.settle();
  assert.equal(f.archive().status, "ended");
  assert.equal(f.archive().endedAt, startTime + 60000);
  f.useConnection.getState().disconnect();
  await f.settle();
  const stored = await f.repository.getSession("stored-a");
  assert.equal(stored.status, "ended");
  assert.equal(stored.recordingStatus, "stopped");
  assert.equal(stored.endedAt, startTime + 60000);
});

test("重连后无开播时间的 LIVE 不沿用上一场时间", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const a = f.connect();
  await f.settle();
  a.callbacks.onState({ status: "reconnecting", roomId: 101 });
  a.callbacks.onEvent({ id: "start-without-time", msgType: 22, roomId: 101, ts: startTime + 3600000 });
  a.callbacks.onState({ status: "connected", roomId: 101 });
  await f.settle();
  assert.notEqual(f.archive().sessionId, "stored-a");
  assert.equal(f.archive().sourceLiveStartedAt, null);
  assert.equal((await f.repository.getSession("stored-a")).recordingStatus, "stopped");
});

test("数据库恢复等待已有 writer 批次，不用旧计数覆盖已写事件", async (t) => {
  const f = await archiveStoreFixture(t);
  await f.seed();
  const writer = f.runtime.getArchiveWriter();
  writer.enqueueBatch({ archiveId: "archive-stored-a", sessionId: "stored-a", roomId: 101,
    ordinalStart: 0, mutations: [{ kind: "append", eventKey: "queued-from-previous-runtime", event: event("queued") }],
    sessionUpdate: { sessionId: "stored-a", paidTotal: 1, updatedAt: startTime + 1000 } });
  f.connect();
  await f.settle();
  const stored = await f.repository.getSession("stored-a");
  assert.equal(stored.eventCount, 1);
  assert.equal(stored.paidTotal, 1);
  assert.equal(f.archive().nextOrdinal, 1);
  assert.equal(f.archive().paidTotal, 1);
});

test("真实 connection.ts 模块接管后屏蔽旧回调、保留单一 writer 并让新代际工作", async () => {
  let releaseArchive;
  const archiveBlock = new Promise((resolve) => { releaseArchive = resolve; });
  globalThis.__task2ArchiveGate = { block: archiveBlock, firstStarted: false, starts: [], commits: [] };
  globalThis.__task2Connections = [];
  globalThis.__task2ConnectionDisconnects = 0;
  let currentModule = null;

  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs",
    root,
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
    logLevel: "silent",
    plugins: [mockPlugin()],
    ssr: { noExternal: true, external: ["react", "react-dom", "zustand", "protobufjs"] },
    server: { middlewareMode: true, watch: null },
  });
  assert.ok(server.config.plugins.some((plugin) => plugin.name === "task2-connection-integration-mocks"), server.config.plugins.map((plugin) => plugin.name).join(","));

  try {
    const first = await server.ssrLoadModule("/src/stores/connection.ts?task2-generation=1");
    const archiveRuntime = await server.ssrLoadModule("/src/archive/archiveRuntime.ts");
    assert.equal("archiveRevision" in first.useConnection.getState(), false);
    const initialRevision = archiveRuntime.useArchiveRuntime.getState().archiveRevision;
    await archiveRuntime.flushArchiveWriter();
    assert.equal(archiveRuntime.useArchiveRuntime.getState().archiveRevision, initialRevision);
    first.useConnection.getState().connect("101", "cookie", "7");
    const firstConnection = globalThis.__task2Connections.at(-1);
    const loadedRuntime = await server.ssrLoadModule("/src/archive/connectionRuntime.ts");
    assert.ok(firstConnection, `SharedRoomConnection 替身未被使用；state=${JSON.stringify(first.useConnection.getState().state)} runtime=${JSON.stringify(loadedRuntime.getConnectionRuntime()?.runtimeId ?? null)} resolve=${JSON.stringify(globalThis.__task2Resolves ?? [])}`);
    assert.equal(firstConnection.runtimeMetadata.runtimeId, loadedRuntime.getConnectionRuntime().runtimeId);
    assert.equal(firstConnection.runtimeMetadata.generation, loadedRuntime.getConnectionRuntime().generation);
    firstConnection.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1 });
    firstConnection.callbacks.onEvent(event("old-event"));
    // connection flushes its in-memory batch every 200ms, then archive writes coalesce for 200ms.
    await wait(500);
    assert.equal(globalThis.__task2ArchiveGate.firstStarted, true);

    const second = await server.ssrLoadModule("/src/stores/connection.ts?task2-generation=2");
    currentModule = second;
    assert.equal(firstConnection.disconnected, true);
    second.useConnection.getState().connect("101", "cookie", "7");
    const secondConnection = globalThis.__task2Connections.at(-1);
    assert.equal(secondConnection.runtimeMetadata.runtimeId, firstConnection.runtimeMetadata.runtimeId);
    assert.equal(secondConnection.runtimeMetadata.generation, firstConnection.runtimeMetadata.generation + 1);
    secondConnection.callbacks.onState({ status: "connected", roomId: 101, liveStatus: 1 });
    secondConnection.callbacks.onEvent(event("new-event"));
    firstConnection.callbacks.onEvent(event("late-old-event"));
    await wait(500);

    assert.equal(first.useConnection.getState().events.some((item) => item.id === "late-old-event"), false);
    assert.equal(globalThis.__task2ArchiveGate.starts.length, 1);

    releaseArchive();
    await wait(500);

    assert.equal(globalThis.__task2ArchiveGate.starts.length, 2);
    assert.equal(globalThis.__task2ArchiveGate.commits.length, 2);
    assert.equal(second.useConnection.getState().events.some((item) => item.id === "new-event"), true);
    assert.equal(second.useConnection.getState().events.some((item) => item.id === "late-old-event"), false);
    assert.ok(archiveRuntime.useArchiveRuntime.getState().archiveRevision > initialRevision);
    const sessionsBeforeNotification = second.useConnection.getState().sessions;
    archiveRuntime.notifyArchiveRevision();
    assert.equal(second.useConnection.getState().sessions, sessionsBeforeNotification);
  } finally {
    releaseArchive();
    currentModule?.useConnection.getState().disconnect();
    await server.close();
  }
});


function protocolLifecyclePlugin() {
  const modules = new Map([
    ["\0task2-ws", `
      export class KeepLiveWS {
        constructor() {
          this.listeners = new Map();
          this.connection = { live: false };
          globalThis.__task2Ws = this;
        }
        addEventListener(name, callback) { this.listeners.set(name, callback); }
        emit(name, data) {
          if (name === "live") this.connection.live = true;
          this.listeners.get(name)?.({ data });
        }
        close() { this.connection.live = false; }
      }
    `],
    ["\0task2-api", `
      export class ApiError extends Error {}
      export class BiliTransportError extends Error {}
      export const getDanmuInfo = async () => ({ token: "token", host_list: [{ host: "broadcast.example", wss_port: 443, ws_port: 80 }] });
      export const getFinger = async () => null;
      export const getMasterInfo = async () => ({ uname: "主播", face: "https://example.com/face.jpg" });
      export const getNav = async () => ({ wbi_img: { img_url: "https://example.com/img.png", sub_url: "https://example.com/sub.png" } });
      export const getRealRoomId = async () => globalThis.__task2RoomInit ?? ({ room_id: 101, short_id: 101, live_status: 1, live_time: 1700000000, uid: 7, locked: false, encrypted: false });
      export const getRoomInfo = async () => {
        const value = await globalThis.__task2RoomInfo;
        if (!value) return undefined;
        const level = value.guard_info?.anchor_guard_achieve_level;
        return {
          ...value,
          title: value.room_info?.title ?? "",
          coverUrl: value.room_info?.user_cover ?? undefined,
          liveStartTime: value.room_info?.live_start_time ? value.room_info.live_start_time * 1000 : undefined,
          roomGuardProfile: typeof level === "number" && Number.isFinite(level) && level >= 10000
            ? { anchorGuardAchieveLevel: level, milestone: "tenThousand", iconSet: "enhanced", source: "room-info" }
            : { milestone: "unknown", iconSet: "base", source: "unknown" },
        };
      };
      export const keyFromUrl = () => "key";
      export const describeRequestFailure = () => ({ category: "unknown" });
      export const withNetworkRetry = async (operation) => operation();
    `],
    ["\0task2-protocol-adapter", "export const adapt = (data) => data?.event ?? null;"],
    ["\0task2-protocol-gifts", "export const loadGiftConfig = async () => {};"],
    ["\0task2-protocol-gift-effects", "export const loadGiftEffectResources = async () => {};"],
    ["\0task2-protocol-laplace", "export const adaptLaplaceStateMessage = () => null;"],
    ["\0task2-diagnostics", "export const getDiagnosticContext = () => ({ record: () => {}, nextConnectionId: () => \"connect-1\" });"],
    ["\0task2-source-logger", "export const sourceDiagnosticLogger = { record: () => {} };"],
    ["\0task2-feature-diagnostics", "export const recordFeatureDiagnostic = () => {};"],
    ["\0task2-archive-diagnostics", "export const recordArchiveSourceEvent = () => {};"],
    ["\0task2-protocol-types", "export const MsgType = { LiveStart: 22, LiveEnd: 23 };"],
  ]);
  const replacements = {
    "@laplace.live/ws": "\0task2-ws",
    "./api": "\0task2-api",
    "./adapter": "\0task2-protocol-adapter",
    "./gifts": "\0task2-protocol-gifts",
    "./giftEffects": "\0task2-protocol-gift-effects",
    "./laplaceCompatibility": "\0task2-protocol-laplace",
    "../diagnostics/diagnosticLogger": "\0task2-diagnostics",
    "../diagnostics/sourceLogger": "\0task2-source-logger",
    "../diagnostics/featureDiagnostics": "\0task2-feature-diagnostics",
    "../archive/archiveDiagnostics.ts": "\0task2-archive-diagnostics",
    "./types": "\0task2-protocol-types",
  };
  return {
    name: "task2-protocol-lifecycle-mocks",
    enforce: "pre",
    resolveId(source) {
      return modules.has(source) ? source : null;
    },
    load(id) {
      return modules.get(id) ?? null;
    },
    transform(code, id) {
      if (!id.replaceAll("\\\\", "/").includes("/src/protocol/connection.ts")) return null;
      let transformed = code;
      for (const [from, to] of Object.entries(replacements)) {
        transformed = transformed.replaceAll(`from "${from}"`, `from "${to}"`);
        transformed = transformed.replaceAll(`from '${from}'`, `from '${to}'`);
      }
      return { code: transformed, map: null };
    },
  };
}

test("协议连接生命周期诊断携带 runtimeId 与 generation", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs",
    root,
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
    logLevel: "silent",
    plugins: [protocolLifecyclePlugin()],
    ssr: { noExternal: true },
    server: { middlewareMode: true, watch: null },
  });
  try {
    const writes = [];
    const connectionModule = await server.ssrLoadModule("/src/protocol/connection.ts?task2-lifecycle=1");
    const connection = new connectionModule.DanmuConnection(
      { onEvent: () => {}, onState: () => {} },
      {
        sessionId: "session-1",
        nextConnectionId: () => "connect-1",
        nextSequence: () => 1,
        record: (input) => { writes.push(input); return JSON.stringify(input); },
        getHealthSnapshot: () => ({ status: "healthy", pending: 0, writeFailures: 0, droppedRecords: 0 }),
      },
      { runtimeId: "runtime-stable", generation: 4 },
    );
    connection.disconnect();

    const lifecycle = writes.find((record) => record.data?.lifecycle === "disconnect");
    assert.ok(lifecycle, "应记录 disconnect 生命周期");
    assert.equal(lifecycle.data.runtimeId, "runtime-stable");
    assert.equal(lifecycle.data.generation, 4);
  } finally {
    await server.close();
  }
});

test("房间大航海档位诊断只记录数值与来源，不记录凭证", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs",
    root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "silent",
    plugins: [protocolLifecyclePlugin()], ssr: { noExternal: true },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  });
  let connection;
  try {
    const { DanmuConnection } = await server.ssrLoadModule("/src/protocol/connection.ts");
    const writes = [];
    connection = new DanmuConnection(
      { onEvent: () => {}, onState: () => {} },
      { nextConnectionId: () => "connect-profile", record: (input) => { writes.push(input); return "record"; } },
      { runtimeId: "runtime-profile", generation: 1 },
    );
    globalThis.__task2RoomInfo = {
      room_info: { title: "测试直播", live_start_time: 1700000000 },
      guard_info: { anchor_guard_achieve_level: 10000 },
    };
    await connection.connect({ roomIdInput: "101", cookie: "fixture-cookie-secret", uid: 7 });
    const records = writes.filter((record) => record.action === "room-guard-profile");
    assert.equal(records.length, 1);
    assert.equal(records[0].roomId, 101);
    assert.deepEqual(records[0].data, {
      anchorGuardAchieveLevel: 10000, source: "room-info",
      runtimeId: "runtime-profile", generation: 1,
    });
    assert.doesNotMatch(JSON.stringify(records), /cookie|token|fixture-cookie-secret/);
  } finally {
    connection?.disconnect();
    globalThis.__task2RoomInfo = undefined;
    await server.close();
  }
});

test("room_info 档位会发布到连接状态，而 room_info 缺失不阻断 WS 连接", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs",
    root,
    configFile: false, optimizeDeps: { noDiscovery: true, include: [] },
    appType: "custom",
    logLevel: "silent",
    plugins: [protocolLifecyclePlugin()],
    ssr: { noExternal: true },
    server: { middlewareMode: true, watch: null },
  });
  try {
    const connectionModule = await server.ssrLoadModule("/src/protocol/connection.ts?task2-room-profile=1");
    const states = [];
    const connection = new connectionModule.DanmuConnection(
      { onEvent: () => {}, onState: (state) => states.push(state) },
      {
        sessionId: "session-1",
        nextConnectionId: () => "connect-1",
        nextSequence: () => 1,
        record: () => "{}",
        getHealthSnapshot: () => ({ status: "healthy", pending: 0, writeFailures: 0, droppedRecords: 0 }),
      },
      { runtimeId: "runtime-stable", generation: 4 },
    );

    globalThis.__task2RoomInfo = {
      room_info: {
        title: "测试直播",
        live_start_time: 1700000000,
        user_cover: "https://example.com/room-cover.jpg",
      },
      guard_info: { anchor_guard_achieve_level: 10000 },
    };
    assert.equal(connection.diagnosticConnectionId, undefined);
    await connection.connect({ roomIdInput: "101", cookie: "cookie", uid: 7 });
    assert.equal(connection.diagnosticConnectionId, "connect-1");
    assert.equal(globalThis.__task2Ws.listeners.has("live"), true);
    globalThis.__task2Ws.emit("live");
    const profiledState = states.find((state) => state.roomGuardProfile?.milestone === "tenThousand");
    assert.equal(profiledState?.coverUrl, "https://example.com/room-cover.jpg");
    assert.deepEqual(profiledState?.roomGuardProfile, {
      roomId: 101,
      anchorUid: "7",
      anchorGuardAchieveLevel: 10000,
      milestone: "tenThousand",
      iconSet: "enhanced",
      source: "room-info",
    });

    states.length = 0;
    globalThis.__task2RoomInfo = undefined;
    const second = new connectionModule.DanmuConnection(
      { onEvent: () => {}, onState: (state) => states.push(state) },
      {
        sessionId: "session-2",
        nextConnectionId: () => "connect-2",
        nextSequence: () => 1,
        record: () => "{}",
        getHealthSnapshot: () => ({ status: "healthy", pending: 0, writeFailures: 0, droppedRecords: 0 }),
      },
      { runtimeId: "runtime-stable", generation: 5 },
    );
    await second.connect({ roomIdInput: "101", cookie: "cookie", uid: 7 });
    globalThis.__task2Ws.emit("live");
    assert.equal(states.some((state) => state.status === "connected"), true);
    assert.equal(states.some((state) => state.roomGuardProfile), false);
  } finally {
    await server.close();
  }
});

test("协议 PREPARING 后重连沿用最新下播证据，LIVE 更新新场开播时间", async () => {
  globalThis.__task2RoomInfo = undefined;
  globalThis.__task2RoomInit = undefined;
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs", root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "silent",
    plugins: [protocolLifecyclePlugin()], ssr: { noExternal: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  let connection;
  try {
    const module = await server.ssrLoadModule("/src/protocol/connection.ts");
    const states = [], events = [];
    connection = new module.DanmuConnection({ onEvent: event => events.push(event), onState: state => states.push(state) });
    await connection.connect({ roomIdInput: "101", cookie: "fixture-cookie", uid: 7 });
    const ws = globalThis.__task2Ws;
    ws.emit("live");
    ws.emit("msg", { cmd: "PREPARING", event: { id: "end", msgType: 23, roomId: 101, ts: startTime + 1000 } });
    ws.emit("close");
    ws.emit("live");
    await wait(0);
    assert.equal(events.at(-1).msgType, 23);
    assert.equal(states.at(-1).status, "connected");
    assert.equal(states.at(-1).liveStatus, 0);
    ws.emit("msg", { cmd: "LIVE", event: { id: "start", msgType: 22, roomId: 101, ts: startTime + 3600000,
      liveIdentity: { sourceLiveStartedAt: startTime + 3600000 } } });
    globalThis.__task2RoomInit = { room_id: 101, live_status: 1, live_time: (startTime + 3600000) / 1000 };
    ws.emit("close");
    ws.emit("live");
    await wait(0);
    assert.equal(states.at(-1).liveStatus, 1);
    assert.equal(states.at(-1).liveStartedAt, startTime + 3600000);
  } finally {
    connection?.disconnect();
    globalThis.__task2RoomInit = undefined;
    await server.close();
  }
});

test("协议重连重新请求开播时间，查询失败不覆盖期间的 LIVE", async () => {
  globalThis.__task2RoomInfo = undefined;
  globalThis.__task2RoomInit = undefined;
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs", root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "silent",
    plugins: [protocolLifecyclePlugin()], ssr: { noExternal: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  let connection, reject;
  try {
    const module = await server.ssrLoadModule("/src/protocol/connection.ts");
    const states = [];
    connection = new module.DanmuConnection({ onEvent: () => {}, onState: state => states.push(state) });
    await connection.connect({ roomIdInput: "101", cookie: "fixture-cookie", uid: 7 });
    const ws = globalThis.__task2Ws;
    ws.emit("live");
    globalThis.__task2RoomInit = { room_id: 101, live_status: 1, live_time: (startTime + 3600000) / 1000 };
    ws.emit("close"); ws.emit("live");
    await wait(0);
    assert.equal(states.at(-1).liveStartedAt, startTime + 3600000);
    const query = new Promise((_resolve, fail) => { reject = fail; });
    globalThis.__task2RoomInit = query;
    ws.emit("close"); ws.emit("live");
    await wait(0);
    ws.emit("msg", { cmd: "LIVE", event: { id: "fresh-live", msgType: 22, roomId: 101, ts: startTime + 7200000,
      liveIdentity: { sourceLiveStartedAt: startTime + 7200000 } } });
    reject(new Error("fixture offline"));
    await wait(0);
    assert.equal(states.at(-1).liveStatus, 1);
    assert.equal(states.at(-1).liveStartedAt, startTime + 7200000);
  } finally {
    connection?.disconnect();
    globalThis.__task2RoomInit = undefined;
    await server.close();
  }
});

test("连续重连时上一次房间请求迟到，不能覆盖最新开播时间", async () => {
  globalThis.__task2RoomInfo = undefined;
  globalThis.__task2RoomInit = undefined;
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs", root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "silent",
    plugins: [protocolLifecyclePlugin()], ssr: { noExternal: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  let connection, resolve;
  try {
    const module = await server.ssrLoadModule("/src/protocol/connection.ts");
    const states = [];
    connection = new module.DanmuConnection({ onEvent: () => {}, onState: state => states.push(state) });
    await connection.connect({ roomIdInput: "101", cookie: "fixture-cookie", uid: 7 });
    const ws = globalThis.__task2Ws;
    ws.emit("live");
    globalThis.__task2RoomInit = new Promise(done => { resolve = done; });
    ws.emit("close"); ws.emit("live");
    await wait(0);
    globalThis.__task2RoomInit = { room_id: 101, live_status: 1, live_time: (startTime + 7200000) / 1000 };
    ws.emit("close"); ws.emit("live");
    await wait(0);
    assert.equal(states.at(-1).liveStartedAt, startTime + 7200000);
    const count = states.length;
    resolve({ room_id: 101, live_status: 1, live_time: (startTime + 3600000) / 1000 });
    await wait(0);
    assert.equal(states.length, count);
    assert.equal(states.at(-1).liveStartedAt, startTime + 7200000);
  } finally {
    resolve?.({ room_id: 101, live_status: 1, live_time: 1700000000 });
    connection?.disconnect();
    globalThis.__task2RoomInit = undefined;
    await server.close();
  }
});

test("房间信息迟到补齐开播时间时保持已连接，允许无事件恢复", async () => {
  globalThis.__task2RoomInit = { room_id: 101, short_id: 101, live_status: 1, uid: 7 };
  let resolve, connection;
  globalThis.__task2RoomInfo = new Promise(done => { resolve = done; });
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-connectionIntegration.test.mjs", root, configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, appType: "custom", logLevel: "silent",
    plugins: [protocolLifecyclePlugin()], ssr: { noExternal: true }, server: { middlewareMode: true, watch: null, hmr: false, ws: false } });
  try {
    const module = await server.ssrLoadModule("/src/protocol/connection.ts");
    const states = [];
    connection = new module.DanmuConnection({ onEvent: () => {}, onState: state => states.push(state) });
    await connection.connect({ roomIdInput: "101", cookie: "fixture-cookie", uid: 7 });
    globalThis.__task2Ws.emit("live");
    assert.equal(states.at(-1).liveStartedAt, undefined);
    resolve({ room_info: { title: "直播", live_start_time: startTime / 1000 } });
    await wait(0);
    assert.equal(states.at(-1).liveStartedAt, startTime);
    assert.equal(states.at(-1).status, "connected");
  } finally {
    resolve?.(undefined);
    connection?.disconnect();
    globalThis.__task2RoomInfo = undefined;
    globalThis.__task2RoomInit = undefined;
    await server.close();
  }
});

test('定时核对同步顶部、主播列表及保存状态，不改变最近连接时间', async t => {
  const f = await archiveStoreFixture(t);
  t.after(() => { delete globalThis.__anchorRoomQuery; delete globalThis.__anchorSavedStatuses; });
  const c = f.connect();
  c.isConnected = true;
  c.liveStatusRevision = 0;
  c.reconcileLiveStatus = (room, revision) => {
    assert.equal(revision, 0);
    c.callbacks.onState({ status: 'connected', roomId: 101, liveStatus: room.live_status });
    return true;
  };
  f.useConnection.setState({ anchors: [{ roomIdInput: '101', realRoomId: 101, uname: '主播', liveStatus: 1, lastConnectedAt: 123 }] });
  globalThis.__anchorRoomQuery = async () => ({ room_id: 101, live_status: 0 });
  f.useConnection.getState().refreshAnchors();
  await wait(50);
  assert.equal(f.useConnection.getState().state.liveStatus, 0);
  assert.equal(f.useConnection.getState().anchors[0].liveStatus, 0);
  assert.equal(f.useConnection.getState().anchors[0].lastConnectedAt, 123);
  assert.deepEqual(globalThis.__anchorSavedStatuses, [{ realRoomId: 101, liveStatus: 0 }]);
});

test('定时查询尚未返回时发生下播，旧结果不能恢复主播列表的直播中状态', async t => {
  const f = await archiveStoreFixture(t);
  t.after(() => { delete globalThis.__anchorRoomQuery; delete globalThis.__anchorSavedStatuses; });
  const c = f.connect();
  c.isConnected = true;
  c.liveStatusRevision = 0;
  c.reconcileLiveStatus = (_room, revision) => revision === c.liveStatusRevision;
  f.useConnection.setState({ anchors: [{ roomIdInput: '101', realRoomId: 101, uname: '主播', liveStatus: 1, lastConnectedAt: 123 }] });
  let resolve;
  globalThis.__anchorRoomQuery = () => new Promise(done => { resolve = done; });
  f.useConnection.getState().refreshAnchors();
  await wait(5);
  c.liveStatusRevision++;
  c.callbacks.onEvent({ id: 'end-during-refresh', msgType: 23, roomId: 101, ts: startTime + 10000 });
  resolve({ room_id: 101, live_status: 1 });
  await wait(50);
  assert.equal(f.useConnection.getState().state.liveStatus, 0);
  assert.equal(f.useConnection.getState().anchors[0].liveStatus, 0);
  assert.deepEqual(globalThis.__anchorSavedStatuses, [{ realRoomId: 101, liveStatus: 0 }]);
});

test('单个房间查询失败保留顶部和列表的已知状态', async t => {
  const f = await archiveStoreFixture(t);
  t.after(() => { delete globalThis.__anchorRoomQuery; delete globalThis.__anchorSavedStatuses; });
  f.connect();
  f.useConnection.setState({ anchors: [{ roomIdInput: '101', realRoomId: 101, uname: '主播', liveStatus: 1, lastConnectedAt: 123 }] });
  globalThis.__anchorRoomQuery = async () => { throw new Error('网络暂不可用'); };
  f.useConnection.getState().refreshAnchors();
  await wait(50);
  assert.equal(f.useConnection.getState().state.liveStatus, 1);
  assert.equal(f.useConnection.getState().anchors[0].liveStatus, 1);
});

test('主播列表一次批量刷新，412后暂停后台查询五分钟并保留状态', async t => {
  const f = await archiveStoreFixture(t);
  t.after(() => { delete globalThis.__anchorBatchCalls; delete globalThis.__anchorBatchInputs; delete globalThis.__anchorBatchBlocked; });
  const now = Date.now();let clock=now;t.mock.method(Date,'now',()=>clock);
  f.useConnection.setState({ anchors: Array.from({length:31},(_,i)=>({roomIdInput:String(101+i),realRoomId:101+i,uname:'主播'+i,liveStatus:1,lastConnectedAt:123})) });
  globalThis.__anchorBatchCalls=0;globalThis.__anchorBatchBlocked=true;
  f.useConnection.getState().refreshAnchors();await wait(30);
  assert.equal(globalThis.__anchorBatchCalls,1);assert.equal(globalThis.__anchorBatchInputs.length,31);
  assert(f.useConnection.getState().anchors.every(a=>a.liveStatus===1));
  clock=now+61000;globalThis.__anchorBatchBlocked=false;f.useConnection.getState().refreshAnchors();await wait(10);assert.equal(globalThis.__anchorBatchCalls,1);
  clock=now+301000;f.useConnection.getState().refreshAnchors();await wait(30);assert.equal(globalThis.__anchorBatchCalls,2);
});
