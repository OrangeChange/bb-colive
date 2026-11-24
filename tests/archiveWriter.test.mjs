import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnosticContext, flushAllDiagnosticLogs } from "../src/diagnostics/diagnosticLogger.ts";

async function loadModule(relativePath) {
  try {
    return await import(relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert.fail(`无法加载待实现的档案模块 ${relativePath}: ${message}`);
  }
}

class FakeArchiveRepository {
  constructor() {
    this.appendCalls = [];
    this.updateEventCalls = [];
    this.updateSessionCalls = [];
    this.upsertOwnerCalls = [];
    this.upsertSessionCalls = [];
    this.failAppendCount = 0;
    this.nextOrdinalBySession = new Map();
  }

  async upsertOwner(input) {
    this.upsertOwnerCalls.push(input);
  }

  async upsertSession(input) {
    this.upsertSessionCalls.push(input);
  }

  async appendEvents(events) {
    this.appendCalls.push(events);
    if (this.failAppendCount > 0) {
      this.failAppendCount -= 1;
      throw new Error("append failed");
    }
    return events.length;
  }

  async getNextEventOrdinal(sessionId) {
    return this.nextOrdinalBySession.get(sessionId) ?? 0;
  }

  async updateEvent(input) {
    this.updateEventCalls.push(input);
  }

  async updateSession(input) {
    this.updateSessionCalls.push(input);
  }
}

function appendMutation(eventKey, event) {
  return {
    kind: "append",
    type: "append",
    eventKey,
    event,
  };
}

function batch(id, mutation) {
  return {
    archiveId: "archive-1",
    sessionId: "session-1",
    roomId: 101,
    ordinalStart: id === "first" ? 4 : 5,
    mutations: [mutation],
  };
}

function batchFor(sessionId, eventId, ordinalStart = 0) {
  return {
    archiveId: `archive-${sessionId}`,
    sessionId,
    roomId: 101,
    ordinalStart,
    mutations: [appendMutation(eventId, event(eventId))],
  };
}

const event = (id, extra = {}) => ({
  id,
  msgType: 0,
  roomId: 101,
  ts: 1_700_000_000_000,
  text: id,
  ...extra,
});

test("writer 串行提交批次并保留事件顺序", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));
  writer.enqueueBatch(batch("second", appendMutation("event-2", event("event-2"))));

  const result = await writer.flush();

  assert.equal(result.pending, 0);
  assert.equal(result.failed, 0);
  assert.deepEqual(
    repository.appendCalls.flatMap((items) => items.map((item) => item.eventKey)),
    ["session-1:archive-event:event-1", "session-1:archive-event:event-2"],
  );
  assert.deepEqual(
    repository.appendCalls.flatMap((items) => items.map((item) => item.ordinal)),
    [4, 5],
  );
});

test("writer 在现场事件落盘后写入 paidTotal sessionUpdate", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });
  const sessionUpdate = { sessionId: "session-1", eventCount: 1, paidTotal: 1.25, updatedAt: 200 };

  writer.enqueueBatch({
    ...batch("first", appendMutation("event-1", event("event-1"))),
    sessionUpdate,
  });

  await writer.flush();

  assert.equal(repository.updateSessionCalls.length, 1);
  assert.equal(repository.updateSessionCalls[0].sessionId, "session-1");
  assert.equal(repository.updateSessionCalls[0].paidTotal, 1.25);
  assert.equal(repository.updateSessionCalls[0].eventCount, undefined);
});

test("writer 使用数据库中的最大序号继续追加，避免恢复场次复用旧序号", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  repository.nextOrdinalBySession.set("session-1", 10);
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));
  await writer.flush();

  assert.equal(repository.appendCalls[0][0].ordinal, 10);
});

test("writer 单批失败不会阻塞后续场次", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  repository.failAppendCount = 1;
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batchFor("failed-session", "event-1"));
  writer.enqueueBatch(batchFor("next-session", "event-2"));
  const result = await writer.flush();

  assert.equal(result.pending, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(
    repository.appendCalls.flatMap((items) => items.map((item) => item.eventKey)),
    ["failed-session:archive-event:event-1", "next-session:archive-event:event-2"],
  );
});

test("writer 批次失败时保留 pending，并在下一次 flush 重试", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  repository.failAppendCount = 1;
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));

  const failed = await writer.flush();
  assert.equal(failed.pending, 1);
  assert.equal(failed.failed, 1);
  assert.equal(repository.appendCalls.length, 1);

  const retried = await writer.flush();
  assert.equal(retried.pending, 0);
  assert.equal(retried.failed, 0);
  assert.equal(repository.appendCalls.length, 2);
});

test("同场失败旧批次先于恢复状态重试，不能回写旧状态", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  repository.failAppendCount = 1;
  let state = { status: "unclean", recordingStatus: "stopped" };
  const order = [];
  repository.updateSession = async (input) => { state = { ...state, ...input }; order.push(input.recordingStatus); };
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });
  writer.enqueueBatch({ ...batchFor("session-1", "old-event"), sessionUpdate: {
    sessionId: "session-1", status: "unclean", recordingStatus: "stopped", stopReason: "connection-switched", updatedAt: 1,
  } });
  writer.enqueueBatch({ archiveId: "archive-1", sessionId: "session-1", roomId: 101, mutations: [], sessionUpdate: {
    sessionId: "session-1", status: "active", recordingStatus: "recording", stopReason: null, updatedAt: 2,
  } });
  writer.enqueueBatch(batchFor("other-session", "other-event"));
  const failed = await writer.flush();
  assert.equal(failed.pending, 2);
  assert.equal(repository.appendCalls.at(-1)[0].sessionId, "other-session");
  const recovered = await writer.flush();
  assert.equal(recovered.pending, 0);
  assert.deepEqual(order, ["stopped", "recording"]);
  assert.equal(state.status, "active");
  assert.equal(state.recordingStatus, "recording");
  assert.equal(state.stopReason, null);
});

test("writer status 暴露队列、冻结、revision 和最后错误", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  repository.failAppendCount = 1;
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));
  assert.deepEqual(writer.getStatus().pendingSessionIds, ["session-1"]);
  assert.deepEqual(writer.getStatus().failedSessionIds, []);
  await writer.flush();
  assert.equal(writer.getStatus().pending, 1);
  assert.deepEqual(writer.getStatus().pendingSessionIds, ["session-1"]);
  assert.deepEqual(writer.getStatus().failedSessionIds, ["session-1"]);
  assert.equal(writer.getStatus().revision, 0);
  assert.match(writer.getStatus().lastError, /append failed/);

  await writer.flush();
  assert.equal(writer.getStatus().revision, 1);
  assert.deepEqual(writer.getStatus().pendingSessionIds, []);
  assert.deepEqual(writer.getStatus().failedSessionIds, []);
  assert.deepEqual(writer.getStatus().frozenSessionIds, []);

  await writer.runTransferExclusive(async ({ blockSessions }) => {
    blockSessions(["session-1"]);
  });
  assert.deepEqual(writer.getStatus().frozenSessionIds, ["session-1"]);
});

test("writer close 后拒绝新批次但会刷完已有队列", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));
  const closed = await writer.close();
  writer.enqueueBatch(batch("second", appendMutation("event-2", event("event-2"))));
  const afterClose = await writer.flush();

  assert.equal(closed.pending, 0);
  assert.equal(afterClose.pending, 0);
  assert.equal(repository.appendCalls.length, 1);
  assert.deepEqual(repository.appendCalls[0].map((item) => item.eventKey), ["session-1:archive-event:event-1"]);
});

test("writer 失败诊断包含 archive、session、room 和事件关联", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "archive-writer-diagnostic-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });
  const repository = new FakeArchiveRepository();
  repository.failAppendCount = 1;
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));
  await writer.flush();
  await flushAllDiagnosticLogs();
  context.stop?.();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const record = records.find((item) => item.action === "archive-write" && item.outcome === "failed");
  assert.equal(record.data.archiveId, "archive-1");
  assert.equal(record.data.sessionId, "session-1");
  assert.equal(record.data.roomId, 101);
  assert.equal(record.data.eventIds, "event-1");
  assert.equal(record.data.sourceRef, "source:session-1:event-1");
  assert.equal(record.data.renderRef, "render:session-1:event-1");
});

test("传输排他期间迟到批次等待并在删除 session 后被丢弃", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const repository = new FakeArchiveRepository();
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  writer.enqueueBatch(batch("first", appendMutation("event-1", event("event-1"))));

  const order = [];
  let signalTransferStarted;
  const transferStarted = new Promise((resolve) => { signalTransferStarted = resolve; });
  let releaseDelete;
  const deleteGate = new Promise((resolve) => { releaseDelete = resolve; });
  const transfer = writer.runTransferExclusive(async ({ blockSessions }) => {
    order.push("transfer-start");
    writer.enqueueBatch(batch("late", appendMutation("event-2", event("event-2"))));
    signalTransferStarted();
    await deleteGate;
    order.push("delete-commit");
    blockSessions(["session-1"]);
    order.push("transfer-end");
  });

  await transferStarted;
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(
    repository.appendCalls.flatMap((items) => items.map((item) => item.eventKey)),
    ["session-1:archive-event:event-1"],
  );
  releaseDelete();
  await transfer;

  await writer.flush();

  assert.deepEqual(order, ["transfer-start", "delete-commit", "transfer-end"]);
  assert.deepEqual(
    repository.appendCalls.flatMap((items) => items.map((item) => item.eventKey)),
    ["session-1:archive-event:event-1"],
  );
  assert.deepEqual(repository.upsertSessionCalls.map((item) => item.sessionId), []);
});

test("删除 session 丢弃 pending batch 时记录 canceled write 及 requestId", async () => {
  const { ArchiveWriter } = await loadModule("../src/archive/archiveWriter.ts");
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "archive-writer-cancel-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });
  const repository = new FakeArchiveRepository();
  const writer = new ArchiveWriter({ repository, registerWithDiagnostics: false });

  await writer.runTransferExclusive(async ({ blockSessions }) => {
    writer.enqueueBatch(batch("late", appendMutation("event-2", event("event-2"))));
    blockSessions(["session-1"], "archive-delete-request-3");
  });
  await writer.flush();
  await flushAllDiagnosticLogs();
  context.stop?.();

  const records = writes.join("").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  const canceled = records.find((record) => record.action === "archive-write" && record.outcome === "canceled");
  assert.equal(canceled.requestId, "archive-delete-request-3");
  assert.equal(canceled.data.sessionId, "session-1");
  assert.equal(canceled.data.reason, "session-deleted");
});
