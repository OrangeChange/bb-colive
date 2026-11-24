import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ArchiveWriter } from "../src/archive/archiveWriter.ts";
import { createDiagnosticContext, flushAllDiagnosticLogs } from "../src/diagnostics/diagnosticLogger.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

async function loadRuntime() {
  return import("../src/archive/connectionRuntime.ts").catch(() => null);
}

test("新代际接管会停止旧连接、writer、timer，并屏蔽旧回调", async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, "单实例连接运行时模块必须存在");

  const calls = [];
  const first = runtime.claimConnectionRuntime();
  first.setConnection({ disconnect: () => calls.push("old-connection-disconnected") });
  first.setArchiveWriter({ close: () => calls.push("old-writer-closed") });
  first.setTimer(() => calls.push("old-timer-stopped"));
  const oldCallback = first.guard(() => calls.push("old-callback-fired"));

  const second = runtime.claimConnectionRuntime();
  oldCallback();

  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  assert.deepEqual(calls, [
    "old-connection-disconnected",
    "old-timer-stopped",
  ]);
  assert.equal(second.getArchiveWriter(), first.getArchiveWriter());
  await second.closeArchiveWriter();
});

test("同一进程的 runtimeId 跨代际稳定，generation 单独递增", async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, "单实例连接运行时模块必须存在");

  const first = runtime.claimConnectionRuntime();
  const second = runtime.claimConnectionRuntime();

  assert.equal(first.runtimeId, second.runtimeId);
  assert.equal(second.generation, first.generation + 1);
});

test("runtime dispose 等待异步 writer flush 完成后才完成", async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, "单实例连接运行时模块必须存在");

  let releaseWriter;
  const writerClosed = new Promise((resolve) => { releaseWriter = resolve; });
  const first = runtime.claimConnectionRuntime();
  first.setArchiveWriter({ close: () => writerClosed });

  let disposeFinished = false;
  const disposing = first.closeArchiveWriter();
  assert.equal(typeof disposing?.then, "function");
  disposing.then(() => { disposeFinished = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(disposeFinished, false);

  releaseWriter();
  await disposing;
  assert.equal(disposeFinished, true);
});

test("HMR dispose 会清理当前代际，并让新连接回调继续工作", async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, "单实例连接运行时模块必须存在");

  const calls = [];
  const first = runtime.claimConnectionRuntime();
  first.setConnection({ disconnect: () => calls.push("connection-disconnected") });
  const sharedWriter = { close: () => calls.push("writer-closed") };
  first.setArchiveWriter(sharedWriter);
  first.setTimer(() => calls.push("timer-stopped"));
  first.addCleanup(() => calls.push("listener-removed"));

  const oldCallback = first.guard(() => calls.push("old-callback-fired"));
  first.dispose("hmr");
  oldCallback();

  const second = runtime.claimConnectionRuntime();
  const newCallback = second.guard(() => calls.push("new-callback-fired"));
  newCallback();

  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  assert.equal(second.getArchiveWriter(), sharedWriter);
  assert.deepEqual(calls, [
    "connection-disconnected",
    "timer-stopped",
    "listener-removed",
    "new-callback-fired",
  ]);
  await second.closeArchiveWriter();
});

test("归档 request 与 committed 诊断带 runtime/generation 标识", async () => {
  const runtime = await loadRuntime();
  assert.ok(runtime, "单实例连接运行时模块必须存在");

  const lease = runtime.claimConnectionRuntime();
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "connection-runtime-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });
  const writer = new ArchiveWriter({
    repository: {
      upsertSession: async () => {},
    },
    registerWithDiagnostics: false,
    runtimeId: lease.runtimeId,
    generation: lease.generation,
  });

  writer.enqueueBatch({
    archiveId: "archive-1",
    sessionId: "session-1",
    roomId: 101,
    session: {
      sessionId: "session-1",
      ownerId: "room:101",
      archiveId: "archive-1",
      roomId: 101,
      title: null,
      startedAt: null,
      endedAt: null,
      status: "preparing",
      quality: "unknown",
      qualityReason: null,
      eventCount: 0,
      paidTotal: 0,
      updatedAt: 1,
    },
    mutations: [],
  });
  await writer.flush();
  await flushAllDiagnosticLogs();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const archiveRecords = records.filter((record) => record.data?.featureId === "review-archive");
  assert.ok(archiveRecords.some((record) => record.outcome === "queued"));
  assert.ok(archiveRecords.some((record) => record.outcome === "committed"));
  for (const record of archiveRecords) {
    assert.equal(record.data.runtimeId, lease.runtimeId);
    assert.equal(record.data.generation, lease.generation);
  }

  context.stop?.();
  await writer.close();
  lease.dispose();
});

test("新代际复用同一 writer，等待旧批次后串行提交并更新诊断代际", async () => {
  const runtime = await loadRuntime();
  let releaseOld;
  let oldStarted;
  const oldStartedPromise = new Promise((resolve) => { oldStarted = resolve; });
  const oldReleasePromise = new Promise((resolve) => { releaseOld = resolve; });
  const order = [];
  const diagnosticWrites = [];
  const context = createDiagnosticContext({
    sessionId: "connection-runtime-handoff",
    invoke: async (_command, args) => diagnosticWrites.push(args.lines),
    flushIntervalMs: 0,
  });

  const first = runtime.claimConnectionRuntime();
  const writer = new ArchiveWriter({
    repository: {
      upsertSession: async (session) => {
        if (session.sessionId === "old-session") {
          order.push("old-start");
          oldStarted();
          await oldReleasePromise;
          order.push("old-commit");
        } else {
          order.push("new-commit");
        }
      },
    },
    registerWithDiagnostics: false,
    runtimeId: first.runtimeId,
    generation: first.generation,
  });
  first.setArchiveWriter(writer);
  const session = (sessionId) => ({
    sessionId,
    ownerId: "room:101",
    archiveId: "archive-1",
    roomId: 101,
    title: null,
    startedAt: null,
    endedAt: null,
    status: "preparing",
    quality: "unknown",
    qualityReason: null,
    eventCount: 0,
    paidTotal: 0,
    updatedAt: 1,
  });
  writer.enqueueBatch({ archiveId: "archive-1", sessionId: "old-session", roomId: 101, session: session("old-session"), mutations: [] });
  const oldFlush = writer.flush();
  await oldStartedPromise;

  const second = runtime.claimConnectionRuntime();
  const sharedWriter = second.getArchiveWriter();
  assert.equal(sharedWriter, writer);
  writer.enqueueBatch({ archiveId: "archive-1", sessionId: "new-session", roomId: 101, session: session("new-session"), mutations: [] });
  const newFlush = writer.flush();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["old-start"]);

  releaseOld();
  await Promise.all([oldFlush, newFlush]);
  assert.deepEqual(order, ["old-start", "old-commit", "new-commit"]);
  await flushAllDiagnosticLogs();
  const records = diagnosticWrites.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const newQueued = records.find((record) => record.outcome === "queued" && record.data?.sessionId === "new-session");
  assert.equal(newQueued?.data.runtimeId, second.runtimeId, JSON.stringify(newQueued));
  assert.equal(newQueued?.data.generation, second.generation, JSON.stringify(newQueued));

  context.stop?.();
  await second.closeArchiveWriter();
});

test("connection 编排把运行时代际接入真实回调、连接诊断与 HMR 清理", () => {
  const storeSource = read("src/stores/connection.ts");
  const protocolSource = read("src/protocol/connection.ts");

  assert.match(storeSource, /new SharedRoomConnection\([\s\S]*runtimeDiagnosticData\(\)\)/);
  assert.match(storeSource, /onEvent:[\s\S]*generation !== connectionGeneration[\s\S]*connectionRuntime\?\.isCurrent\(\)/);
  assert.match(storeSource, /onState:[\s\S]*generation !== connectionGeneration[\s\S]*connectionRuntime\?\.isCurrent\(\)/);
  assert.match(storeSource, /import\.meta\.hot\.dispose\([\s\S]*connectionRuntime\?\.dispose\("hmr"\)/);
  assert.match(protocolSource, /runtimeDiagnostic\?: ConnectionRuntimeDiagnostic/);
  assert.match(protocolSource, /recordConnectionLifecycle[\s\S]*this\.runtimeDiagnostic/);
});
