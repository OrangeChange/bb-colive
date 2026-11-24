import assert from "node:assert/strict";
import { test } from "node:test";

async function loadDiagnostics() {
  try {
    return await import("../src/voice/ttsDiagnostics.ts");
  } catch {
    return {};
  }
}

test("TTS 诊断记录只保留可排查字段，并脱敏地址与错误信息", async () => {
  const diagnostics = await loadDiagnostics();
  assert.equal(typeof diagnostics.buildTtsDiagnosticRecord, "function");

  const record = diagnostics.buildTtsDiagnosticRecord({
    timestamp: 1_757_680_000_000,
    requestId: "fish-audio-42",
    provider: "fish-audio",
    route: "direct",
    endpoint: "https://api.example.test/tts?api_key=secret-key&token=secret-token",
    model: "s2.1-pro-free",
    outcome: "failure",
    stage: "request",
    durationMs: 321,
    error: "error sending request; Bearer secret-key; 用户发送的敏感原文; error code: 1101",
  });

  const serialized = JSON.stringify(record);
  assert.equal(record.kind, "tts");
  assert.equal(record.httpStatus, null);
  assert.equal(record.remoteCode, "1101");
  assert.equal(record.errorClass, "transport");
  assert.equal(record.endpoint, "https://api.example.test/tts");
  assert.doesNotMatch(serialized, /secret-key|secret-token|敏感原文|apiKey|authorization|text/iu);
});

test("TTS 诊断能够区分网路请求失败、HTTP 错误和取消", async () => {
  const diagnostics = await loadDiagnostics();
  assert.equal(typeof diagnostics.classifyTtsDiagnosticError, "function");

  assert.deepEqual(
    diagnostics.classifyTtsDiagnosticError("error sending request for url https://api.fish.audio/v1/tts"),
    { stage: "request", errorClass: "transport", httpStatus: null, remoteCode: null },
  );
  assert.deepEqual(
    diagnostics.classifyTtsDiagnosticError("外部语音请求失败（HTTP 500）：error code: 1101"),
    { stage: "response", errorClass: "http", httpStatus: 500, remoteCode: "1101" },
  );
  assert.deepEqual(
    diagnostics.classifyTtsDiagnosticError("request aborted", true),
    { stage: "cancelled", errorClass: "cancelled", httpStatus: null, remoteCode: null },
  );
});

test("Fish 和自定义 API 合成会记录成功、失败及音频字节数", async () => {
  const diagnosticsModule = await loadDiagnostics();
  const { createFishAudioProvider } = await import("../src/voice/fishAudioProvider.ts");
  const { createCustomHttpProvider } = await import("../src/voice/customHttpProvider.ts");
  const records = [];
  const diagnostics = { record: (record) => records.push(record) };

  const fish = createFishAudioProvider({
    getSettings: () => ({
      apiKey: "key",
      baseUrl: "https://api.fish.audio",
      model: "s2.1-pro-free",
      referenceId: "voice-id",
      referenceVoices: [],
      format: "mp3",
    }),
    invoke: async () => [1, 2, 3],
    diagnostics,
  });
  await fish.synthesize({ text: "测试", voice: "voice-id", rate: 1, pitch: 0, volume: 1, requestId: "fish-1" });

  const custom = createCustomHttpProvider({
    getSettings: () => ({
      endpoint: "http://127.0.0.1:9880/tts",
      method: "POST",
      preset: "gpt-sovits",
      authType: "none",
      apiKey: "",
      apiKeyHeader: "Authorization",
      textField: "text",
      voiceField: "ref_audio_path",
      modelField: "",
      model: "",
      rateField: "speed",
      pitchField: "",
      volumeField: "",
      audioField: "audio",
      responseFormat: "audio",
      fixedBody: {},
      extraHeaders: {},
      voiceValues: { "openai-compatible": "", "gpt-sovits": "voice", "index-tts": "voice", "custom-json": "voice" },
    }),
    invoke: async () => [4, 5],
    diagnostics,
  });
  await custom.synthesize({ text: "测试", voice: "voice", rate: 1, pitch: 0, volume: 1, requestId: "custom-1" });

  assert.equal(typeof diagnosticsModule.buildTtsDiagnosticRecord, "function");
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(({ provider, outcome, audioBytes }) => ({ provider, outcome, audioBytes })), [
    { provider: "fish-audio", outcome: "success", audioBytes: 3 },
    { provider: "custom-http", outcome: "success", audioBytes: 2 },
  ]);
});

test("取消中的迟到合成结果会记录为 cancelled", async () => {
  const { createFishAudioProvider } = await import("../src/voice/fishAudioProvider.ts");
  const records = [];
  let releaseSynthesis;
  const provider = createFishAudioProvider({
    getSettings: () => ({
      apiKey: "key",
      baseUrl: "https://api.fish.audio",
      model: "s2.1-pro-free",
      referenceId: "voice-id",
      referenceVoices: [],
      format: "mp3",
    }),
    invoke: async (command) => command === "synthesize_fish_audio"
      ? new Promise((resolve) => { releaseSynthesis = () => resolve([6]); })
      : [],
    diagnostics: { record: (record) => records.push(record) },
  });

  const synthesis = provider.synthesize({ text: "测试", voice: "voice-id", rate: 1, pitch: 0, volume: 1, requestId: "fish-cancel" });
  await provider.cancel("fish-cancel");
  releaseSynthesis();
  await synthesis;

  assert.equal(records.length, 1);
  assert.equal(records[0].requestId, "fish-cancel");
  assert.equal(records[0].outcome, "cancelled");
  assert.equal(records[0].stage, "cancelled");
});

test("诊断日志按日期追加到 tts-YYYYMMDD.ndjson", async () => {
  const diagnostics = await loadDiagnostics();
  assert.equal(typeof diagnostics.createTtsDiagnosticLogger, "function");
  const calls = [];
  const logger = diagnostics.createTtsDiagnosticLogger({
    invoke: async (command, args) => calls.push({ command, args }),
    now: () => 1_789_000_000_000,
  });

  logger.record({ requestId: "req-1", provider: "fish-audio", outcome: "success", stage: "complete", audioBytes: 5 });
  await logger.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "append_log");
  assert.match(calls[0].args.file, /^tts-\d{8}\.ndjson$/);
  assert.match(calls[0].args.lines, /"kind":"tts"/);
  logger.stop();
});
