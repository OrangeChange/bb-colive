import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { createVoiceController } from "../src/voice/voiceController.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";

const danmu = (text) => ({
  id: text,
  msgType: MsgType.Danmu,
  text,
  roomId: 1,
  ts: 1,
});

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

const fakeProvider = () => ({
  listVoices: async () => [{ name: "fake", label: "测试音色" }],
  synthesize: async () => new Uint8Array([1]),
  cancel: async () => {},
});

const fakeAudioOutput = () => ({
  listDevices: async () => [],
  play: async () => {},
  pause: async () => {},
  resume: async () => {},
  skip: async () => {},
  stop: async () => {},
});

const testSettings = { ...DEFAULT_VOICE_SETTINGS, enabled: true };

const createTestVoiceController = (overrides = {}) => createVoiceController({
  provider: fakeProvider(),
  audioOutput: fakeAudioOutput(),
  getSettings: () => testSettings,
  getOnlyGuardEntry: () => false,
  now: () => 1,
  ...overrides,
});

const failingProvider = (message) => ({
  listVoices: async () => [],
  synthesize: async () => { throw new Error(message); },
  cancel: async () => {},
});

test("页面之外的全局控制器只接收真实提交事件", async () => {
  let releasePlayback;
  const controller = createTestVoiceController({
    audioOutput: {
      ...fakeAudioOutput(),
      play: () => new Promise((resolve) => { releasePlayback = resolve; }),
    },
  });

  controller.start();
  controller.acceptCommittedEvent(danmu("新事件"));
  controller.acceptCommittedEvent({ ...danmu("旧事件"), committed: false });
  await flushPromises();

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.current?.text, "说：新事件");
  assert.equal(snapshot.pendingCount, 0);
  releasePlayback();
  controller.stop();
});

test("事件菜单手动播报只放行选中的事件，不要求开启自动播报", async () => {
  let releasePlayback;
  const controller = createTestVoiceController({
    getSettings: () => ({ ...testSettings, enabled: false }),
    audioOutput: {
      ...fakeAudioOutput(),
      play: () => new Promise((resolve) => { releasePlayback = resolve; }),
    },
  });

  assert.equal(controller.speakEvent(danmu("手动播报")), true);
  await flushPromises();

  assert.equal(controller.getSnapshot().current?.text, "说：手动播报");
  releasePlayback();
  controller.stop();
});

test("引擎失败立即停止接收并清空状态", async () => {
  const controller = createTestVoiceController({ provider: failingProvider("语音合成失败") });

  controller.start();
  controller.acceptCommittedEvent(danmu("会失败的事件"));
  await flushPromises();

  const snapshot = controller.getSnapshot();
  assert.equal(snapshot.accepting, false);
  assert.equal(snapshot.current, null);
  assert.equal(snapshot.pendingCount, 0);
  assert.equal(snapshot.status, "error");
  assert.match(snapshot.error, /语音合成失败/);
});

test("清理当前会话时停止播放并清空语音运行态", async () => {
  let stopCount = 0;
  const controller = createTestVoiceController({
    audioOutput: {
      ...fakeAudioOutput(),
      stop: async () => { stopCount += 1; },
    },
  });

  controller.start();
  controller.acceptCommittedEvent(danmu("待清理"));
  await flushPromises();
  controller.reset();

  assert.equal(stopCount, 1);
  assert.equal(controller.getSnapshot().current, null);
  assert.equal(controller.getSnapshot().pendingCount, 0);
});

test("清空队列不打断当前正在播放的事件", async () => {
  let releasePlayback;
  const controller = createTestVoiceController({
    audioOutput: {
      ...fakeAudioOutput(),
      play: () => new Promise((resolve) => { releasePlayback = resolve; }),
    },
  });

  controller.start();
  controller.acceptCommittedEvent(danmu("正在播放"));
  await flushPromises();
  controller.clear();

  assert.equal(controller.getSnapshot().current?.text, "说：正在播放");
  releasePlayback();
  controller.stop();
});

test("语音事件播放完成后按设置等待再播报下一条", async () => {
  const waitCalls = [];
  let playCount = 0;
  const controller = createTestVoiceController({
    getSettings: () => ({ ...testSettings, eventIntervalSeconds: 1 }),
    wait: async (milliseconds) => { waitCalls.push(milliseconds); },
    audioOutput: { ...fakeAudioOutput(), play: async () => { playCount += 1; } },
  });

  controller.start();
  controller.acceptCommittedEvent(danmu("第一条"));
  controller.acceptCommittedEvent(danmu("第二条"));
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(playCount, 2);
  assert.deepEqual(waitCalls, [1000]);
  controller.stop();
});

test("控制器把播放增益传给统一音频输出层", async () => {
  const playCalls = [];
  const controller = createTestVoiceController({
    getSettings: () => ({ ...testSettings, playbackGain: 1.5 }),
    audioOutput: {
      ...fakeAudioOutput(),
      play: async (...args) => { playCalls.push(args); },
    },
  });

  controller.start();
  controller.acceptCommittedEvent(danmu("增益测试"));
  await flushPromises();

  assert.equal(playCalls[0]?.[2], 1.5);
  controller.stop();
});

test("控制器按当前引擎和自定义 API 预设选择隔离的音色值", async () => {
  const voices = [];
  let currentSettings = {
    ...testSettings,
    engine: "edge-online",
    customHttp: {
      ...testSettings.customHttp,
      preset: "index-tts",
      voiceValues: {
        ...testSettings.customHttp.voiceValues,
        "index-tts": "男主播",
        "gpt-sovits": "ref.wav",
      },
    },
    engineVoices: {
      ...testSettings.engineVoices,
      "edge-online": "小晓",
      "windows-system": "Huihui",
    },
  };
  const controller = createVoiceController({
    provider: {
      ...fakeProvider(),
      synthesize: async (request) => { voices.push(request.voice); return new Uint8Array([1]); },
    },
    audioOutput: fakeAudioOutput(),
    getSettings: () => currentSettings,
    now: () => 1,
  });

  controller.start();
  controller.acceptCommittedEvent(danmu("Edge 音色"));
  await flushPromises();
  currentSettings = { ...currentSettings, engine: "custom-http" };
  controller.acceptCommittedEvent(danmu("IndexTTS 音色"));
  await flushPromises();
  currentSettings = { ...currentSettings, customHttp: { ...currentSettings.customHttp, preset: "gpt-sovits" } };
  controller.acceptCommittedEvent(danmu("GPT-SoVITS 音色"));
  await flushPromises();
  currentSettings = { ...currentSettings, engine: "windows-system" };
  controller.acceptCommittedEvent(danmu("Windows 音色"));
  await flushPromises();

  assert.deepEqual(voices, ["小晓", "男主播", "ref.wav", "Huihui"]);
  controller.stop();
});

test("控制器传给语音引擎的礼物文本不含旧模板乘号", async () => {
  const spokenTexts = [];
  const legacyGiftTemplate = [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
    { kind: "text", value: "赠送" },
    { kind: "field", field: "giftName" },
    { kind: "text", value: "×" },
    { kind: "field", field: "quantity" },
  ];
  const controller = createTestVoiceController({
    getSettings: () => ({
      ...testSettings,
      templates: { ...testSettings.templates, gift: legacyGiftTemplate },
    }),
    provider: {
      ...fakeProvider(),
      synthesize: async ({ text }) => { spokenTexts.push(text); return new Uint8Array([1]); },
    },
  });

  controller.start();
  controller.acceptCommittedEvent({
    id: "gift",
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 2 },
  });
  await flushPromises();

  assert.deepEqual(spokenTexts, ["感谢小明赠送两个小心心"]);
  controller.stop();
});

test("控制器按互动子模板和开奖结果模板生成播报文本", async () => {
  const spokenTexts = [];
  const controller = createTestVoiceController({
    getSettings: () => ({
      ...testSettings,
      eventEnabled: { ...testSettings.eventEnabled, interact: true, redPocket: true },
      interactTemplates: {
        ...testSettings.interactTemplates,
        entry: [{ kind: "text", value: "进房自定义" }],
      },
      redPocketResultTemplate: [{ kind: "text", value: "红包结果自定义" }],
    }),
    provider: {
      ...fakeProvider(),
      synthesize: async ({ text }) => { spokenTexts.push(text); return new Uint8Array([1]); },
    },
  });

  controller.start();
  controller.acceptCommittedEvent({ id: "entry", msgType: MsgType.Interact, interactKind: "entry", roomId: 1, ts: 1 });
  controller.acceptCommittedEvent({ id: "winner", msgType: MsgType.RedPocketWinner, roomId: 1, ts: 1 });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.deepEqual(spokenTexts, ["进房自定义", "红包结果自定义"]);
  controller.stop();
});

test("TTS 前模式先启动合成，提示音结束并满足间隔后才播放 TTS", async () => {
  const order = [];
  let releaseSynthesis;
  const event = { id: "sc-1", roomId: 1, ts: 1, msgType: MsgType.SuperChat, sc: { price: 30, message: "测试" } };
  const controller = createTestVoiceController({
    provider: {
      ...fakeProvider(),
      synthesize: async () => {
        order.push("synthesize-start");
        return new Promise((resolve) => { releaseSynthesis = () => resolve(new Uint8Array([1])); });
      },
    },
    audioOutput: { ...fakeAudioOutput(), play: async () => { order.push("tts-play"); } },
    beforePlayback: async () => {
      order.push("prompt-start");
      order.push("prompt-end");
    },
  });

  controller.start();
  controller.acceptCommittedEvent(event);
  await flushPromises();

  assert.deepEqual(order, ["synthesize-start", "prompt-start", "prompt-end"]);
  releaseSynthesis();
  await flushPromises();

  assert.deepEqual(order, ["synthesize-start", "prompt-start", "prompt-end", "tts-play"]);
  controller.stop();
});
