import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { createRoomSessions } from "../src/obs/obsRoomSessions.ts";
import { componentRuntime } from "./helpers/componentRuntime.mjs";

function eventDecisionRecorder(connection, context, records) {
  const source = ts.createSourceFile("connection.ts", readFileSync(new URL("../src/stores/connection.ts", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "recordEventDecision");
  const code = ts.transpile(declaration.getText(source).replace(/^export /, ""));
  const bindings = {
    conn: connection,
    getDiagnosticContext: () => context,
    getDiagnosticConnectionId: () => context.currentConnectionId,
    recordDiagnosticContext: (_context, input) => records.push(input),
    runtimeDiagnosticData: () => ({ runtimeId: "main-runtime", generation: 1 }),
    EVENT_DECISION_REASONS: new Set(["new-id"]),
    useConnection: { getState: () => ({ state: { roomId: 101 } }) },
  };
  return new Function(...Object.keys(bindings), `${code}; return recordEventDecision;`)(...Object.values(bindings));
}

function sharedConnections() {
  const context = { currentConnectionId: undefined, next: 1 };
  const sources = new Map();
  class ProtocolConnection {
    constructor(callbacks) { this.callbacks = callbacks; this.anchor = null; this.isConnected = true; }
    async connect(params) {
      this.diagnosticConnectionId = context.currentConnectionId = `connect-${context.next++}`;
      sources.set(Number(params.roomIdInput), this);
      this.callbacks.onEvent({ id: "during-connect", roomId: Number(params.roomIdInput) });
    }
    disconnect() {}
  }
  const app = componentRuntime("src/obs/sharedRoomConnection.ts", {
    "../protocol/connection.ts": { DanmuConnection: ProtocolConnection },
    "../protocol/api.ts": { getRealRoomId: async input => ({ room_id: Number(input) }) },
    "./obsRoomSessions.ts": { createRoomSessions },
  });
  return { ...app.exports, context, sources };
}

const params = roomId => ({ roomIdInput: String(roomId), cookie: "", uid: 7 });
test("现场A与OBS房间B同时连接时，现场事件诊断仍关联A的物理连接", async () => {
  const runtime = sharedConnections(), records = [];
  let record;
  const main = new runtime.SharedRoomConnection({ onState() {}, onEvent(event) {
    record({ phase: "append", outcome: "accepted", eventId: event.id, reason: "new-id" }, event.roomId);
  } });
  record = eventDecisionRecorder(main, runtime.context, records);
  let obs;
  try {
    await main.connect(params(101));
    obs = await runtime.roomSessions.acquire(params(202), { onState() {}, onEvent() {} });
    runtime.sources.get(101).callbacks.onEvent({ id: "after-obs", roomId: 101 });
    assert.equal(runtime.context.currentConnectionId, "connect-2");
    assert.deepEqual(records.map(item => [item.eventId, item.roomId, item.connectionId]), [
      ["during-connect", 101, "connect-1"], ["after-obs", 101, "connect-1"],
    ]);
    assert.ok(records.every(item => item.data.runtimeId === "main-runtime" && item.data.generation === 1));
  } finally { main.disconnect(); obs?.release(); }
});

test("现场加入OBS已有房间时读取共享源标识，重连保留源且释放后清空", async () => {
  const runtime = sharedConnections();
  const a = await runtime.roomSessions.acquire(params(101), { onState() {}, onEvent() {} });
  const b = await runtime.roomSessions.acquire(params(202), { onState() {}, onEvent() {} });
  const main = new runtime.SharedRoomConnection({ onState() {}, onEvent() {} });
  try {
    await main.connect(params(101));
    assert.equal(main.diagnosticConnectionId, "connect-1");
    await main.connect(params(101));
    assert.equal(main.diagnosticConnectionId, "connect-1");
    main.disconnect();
    assert.equal(main.diagnosticConnectionId, undefined);
    assert.equal(runtime.roomSessions.inspect().find(room => room.roomId === 101).subscribers, 1);
  } finally { main.disconnect(); a.release(); b.release(); }
});
