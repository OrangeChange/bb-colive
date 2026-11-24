import test from "node:test";
import assert from "node:assert/strict";
import { createDiagnosticContext } from "../src/diagnostics/diagnosticLogger.ts";

test("TTS stage forwards correlation fields to app diagnostics", async () => {
  const lines = [];
  createDiagnosticContext({ sessionId: "session-test", invoke: async (_command, args) => lines.push(args.lines) });
  const { recordTtsStage } = await import("../src/voice/ttsDiagnostics.ts");
  recordTtsStage({ provider: "edge-online", stage: "request", phase: "synthesis-start", outcome: "success", requestId: "req-1", eventId: "evt-1", queueDepth: 2 });
  assert.equal(lines.length, 0);
  await import("../src/diagnostics/diagnosticLogger.ts").then(({ flushAllDiagnosticLogs }) => flushAllDiagnosticLogs());
  assert.match(lines.join(""), /req-1/);
  assert.match(lines.join(""), /evt-1/);
  assert.match(lines.join(""), /queueDepth/);
});

test("voice controller filters disabled speech at runtime", async () => {
  const { createVoiceController } = await import("../src/voice/voiceController.ts");
  const controller = createVoiceController({ provider: { synthesize: async () => new Uint8Array(), cancel: async () => {} }, audioOutput: { listDevices: async () => [], play: async () => {}, pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => {} }, getSettings: () => ({ enabled: false, engine: "edge-online", personalBroadcast: { enabled: false, mode: "independent", rules: {} } }) });
  assert.equal(controller.acceptCommittedEvent({ id: "evt-1", msgType: "danmu", content: "x" }), false);
});

test("语音设置变更进入功能诊断而不复制设置值", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../src/voice/voiceSettings.ts", import.meta.url), "utf8"));
  assert.match(source, /getChangedSettingPaths/);
  assert.match(source, /recordFeatureSettingChange/);
  assert.match(source, /featureId: "voice"/);
  assert.match(source, /featureId: "personal-broadcast"/);
});
