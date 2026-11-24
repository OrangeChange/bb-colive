import test from "node:test";
import assert from "node:assert/strict";
import { createPersonalBroadcastController } from "../src/voice/personalBroadcastController.ts";
import { createDiagnosticContext, flushAllDiagnosticLogs } from "../src/diagnostics/diagnosticLogger.ts";

function diagnosticLines() {
  const lines = [];
  createDiagnosticContext({ sessionId: "personal-test", invoke: async (_command, args) => lines.push(args.lines) });
  return lines;
}

test("personal broadcast does not prepare when disabled", async () => {
  let prepared = 0;
  const controller = createPersonalBroadcastController({ audioOutput: { prepareLocalFile: async () => { prepared++; return new Uint8Array(); }, playLocalFile: async () => {}, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {} }, getSettings: () => ({ personalBroadcast: { enabled: false, mode: "independent", rules: {} }, outputScope: "host", monitorDeviceId: null, streamDeviceId: null, playbackGain: 1 }) });
  assert.equal(controller.acceptStandaloneEvent({ id: "evt-1", msgType: "danmu", content: "x" }), false);
  await Promise.resolve();
  assert.equal(prepared, 0);
});

test("personal broadcast records disabled filtering with eventId and reason", async () => {
  const lines = diagnosticLines();
  const controller = createPersonalBroadcastController({ audioOutput: { prepareLocalFile: async () => new Uint8Array(), playLocalFile: async () => {}, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {} }, getSettings: () => ({ personalBroadcast: { enabled: false, mode: "independent", rules: {} }, outputScope: "host", monitorDeviceId: null, streamDeviceId: null, playbackGain: 1 }) });
  assert.equal(controller.acceptStandaloneEvent({ id: "evt-disabled", msgType: "danmu", content: "x" }), false);
  await flushAllDiagnosticLogs();
  assert.match(lines.join(""), /evt-disabled/);
  assert.match(lines.join(""), /disabled/);
});

test("independent-only personal filtering records non-independent phase", async () => {
  const lines = diagnosticLines();
  const controller = createPersonalBroadcastController({ audioOutput: { prepareLocalFile: async () => new Uint8Array(), playLocalFile: async () => {}, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {} }, getSettings: () => ({ personalBroadcast: { enabled: true, mode: "before-tts", rules: {} }, outputScope: "host", monitorDeviceId: null, streamDeviceId: null, playbackGain: 1 }) });
  assert.equal(controller.acceptCommittedEvent({ id: "evt-mode", msgType: "danmu", content: "x" }), false);
  await flushAllDiagnosticLogs();
  assert.match(lines.join(""), /not-independent/);
});

test("pause and resume record the actual audio control outcome", async () => {
  const lines = diagnosticLines();
  let pauseCalls = 0;
  const controller = createPersonalBroadcastController({ audioOutput: {
    prepareLocalFile: async () => new Uint8Array(), playLocalFile: async () => {},
    pausePersonal: async () => { pauseCalls += 1; throw new Error("pause failed"); },
    resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {},
  }, getSettings: () => ({ personalBroadcast: { enabled: false, mode: "independent", rules: {} }, outputScope: "host", monitorDeviceId: null, streamDeviceId: null, playbackGain: 1 }) });
  controller.pause();
  controller.resume();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushAllDiagnosticLogs();
  assert.equal(pauseCalls, 1);
  const records = lines.flatMap((chunk) => chunk.split("\n").filter(Boolean)).map((line) => JSON.parse(line));
  assert.deepEqual(records.filter((record) => ["pause", "resume"].includes(record.action)).map((record) => [record.action, record.outcome]), [["pause", "failure"], ["resume", "success"]]);
});
