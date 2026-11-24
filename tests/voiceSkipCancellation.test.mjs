import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { createVoiceController } from "../src/voice/voiceController.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";
import { createCustomHttpProvider } from "../src/voice/customHttpProvider.ts";

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setImmediate(resolve));

const superChat = (id) => ({
  id,
  roomId: 1,
  ts: 1,
  msgType: MsgType.SuperChat,
  sc: { price: 30, message: id },
});

test("自定义 HTTP 取消后返回的音频由控制器丢弃，下一条正常播放", async (t) => {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS, enabled: true, engine: "custom-http", eventIntervalSeconds: 0,
    templates: { ...DEFAULT_VOICE_SETTINGS.templates, superChat: [{ kind: "field", field: "content" }] },
  };
  const pending = deferred();
  const played = [], records = [], cancelled = [];
  const provider = createCustomHttpProvider({
    getSettings: () => settings.customHttp,
    diagnostics: { record: (record) => records.push(record) },
    invoke: async (command, args) => {
      if (command === "cancel_voice_synthesis") { cancelled.push(args.requestId); return []; }
      return args.text === "A" ? pending.promise : Array.from(new TextEncoder().encode(args.text));
    },
  });
  const controller = createVoiceController({
    getSettings: () => settings, provider,
    audioOutput: {
      listDevices: async () => [], play: async (audio) => { played.push(new TextDecoder().decode(audio)); },
      pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => {},
    },
  });
  t.after(() => controller.shutdown());
  controller.acceptCommittedEvent(superChat("A"));
  await flush();
  controller.acceptCommittedEvent(superChat("B"));
  controller.skip();
  await flush();
  pending.resolve(Array.from(new TextEncoder().encode("A")));
  await flush();
  assert.deepEqual(played, ["B"]);
  assert.equal(records.find((record) => record.outcome === "cancelled")?.requestId, cancelled[0]);
  assert.equal(records.filter((record) => record.outcome === "success").length, 1);
  assert.equal(controller.getSnapshot().failedCount, 0);
  assert.equal(controller.getSnapshot().discardedCount, 1);
});

test("跳过外部合成中的当前事件只丢弃当前请求，并在取消完成后继续下一条", async (t) => {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    enabled: true,
    eventIntervalSeconds: 0,
    templates: { ...DEFAULT_VOICE_SETTINGS.templates, superChat: [{ kind: "field", field: "content" }] },
  };
  const calls = [];
  const played = [];
  const syntheses = new Map();
  const cancellation = deferred();
  let firstRequestId = null;

  const controller = createVoiceController({
    getSettings: () => settings,
    provider: {
      listVoices: async () => [],
      synthesize: ({ text, requestId }) => {
        calls.push(`synthesize:${text}`);
        if (!firstRequestId) firstRequestId = requestId;
        const synthesis = deferred();
        syntheses.set(text, synthesis);
        return synthesis.promise;
      },
      cancel: async (requestId) => {
        calls.push(`cancel:${requestId ?? ""}`);
        await cancellation.promise;
      },
    },
    audioOutput: {
      listDevices: async () => [],
      play: async (audio) => { played.push(new TextDecoder().decode(audio)); },
      pause: async () => {},
      resume: async () => {},
      skip: async () => {},
      stop: async () => {},
    },
  });
  t.after(() => controller.shutdown());

  controller.acceptCommittedEvent(superChat("A"));
  await flush();
  controller.acceptCommittedEvent(superChat("B"));
  controller.skip();
  await flush();

  assert.equal(controller.getSnapshot().current, null);
  assert.equal(controller.getSnapshot().pendingCount, 1);
  assert.equal(controller.getSnapshot().discardedCount, 1);
  assert.equal(calls[1], `cancel:${firstRequestId}`);
  assert.deepEqual(calls.filter((call) => call.startsWith("synthesize:")), ["synthesize:A"]);

  syntheses.get("A").resolve(new TextEncoder().encode("A"));
  cancellation.resolve();
  await flush();
  assert.deepEqual(calls.filter((call) => call.startsWith("synthesize:")), ["synthesize:A", "synthesize:B"]);

  syntheses.get("B").resolve(new TextEncoder().encode("B"));
  await flush();
  assert.deepEqual(played, ["B"]);
  assert.equal(controller.getSnapshot().failedCount, 0);
});

test("切换引擎后取消仍发送给产生当前请求的引擎", async (t) => {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    enabled: true,
    eventIntervalSeconds: 0,
    templates: { ...DEFAULT_VOICE_SETTINGS.templates, superChat: [{ kind: "field", field: "content" }] },
  };
  const event = superChat("A");
  const synthesis = deferred();
  const calls = [];
  const providerA = {
    listVoices: async () => [],
    synthesize: ({ requestId }) => {
      calls.push(`synthesize:A:${requestId}`);
      return synthesis.promise;
    },
    cancel: async (requestId) => { calls.push(`cancel:A:${requestId}`); },
  };
  const providerB = {
    listVoices: async () => [],
    synthesize: async () => new Uint8Array([2]),
    cancel: async (requestId) => { calls.push(`cancel:B:${requestId ?? ""}`); },
  };
  let selectedProvider = providerA;
  const providerProxy = {
    listVoices: async () => [],
    synthesize: (request) => selectedProvider.synthesize(request),
    cancel: (requestId) => selectedProvider.cancel(requestId),
  };
  const controller = createVoiceController({
    getSettings: () => settings,
    provider: providerProxy,
    getProvider: () => selectedProvider,
    audioOutput: {
      listDevices: async () => [],
      play: async () => {},
      pause: async () => {},
      resume: async () => {},
      skip: async () => {},
      stop: async () => {},
    },
  });
  t.after(() => controller.shutdown());

  controller.acceptCommittedEvent(event);
  await flush();
  selectedProvider = providerB;
  controller.skip();
  await flush();

  assert.match(calls.find((call) => call.startsWith("cancel:")) ?? "", /^cancel:A:/);
  synthesis.resolve(new Uint8Array([1]));
});
