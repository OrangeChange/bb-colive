import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { createPersonalBroadcastController } from "../src/voice/personalBroadcastController.ts";
import { DEFAULT_PERSONAL_BROADCAST_SETTINGS } from "../src/voice/personalBroadcastTypes.ts";
import { createVoiceController } from "../src/voice/voiceController.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";

function eventOf(key) {
  if (key === "super-chat") {
    return { id: "sc-1", roomId: 1, ts: 1, msgType: MsgType.SuperChat, sc: { price: 30, message: "测试" } };
  }
  if (key === "normal-entry") {
    return { id: "entry-1", roomId: 1, ts: 1, msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 0 } };
  }
  throw new Error(`未定义测试事件: ${key}`);
}

function makeController({ mode = "independent", promptIntervalSeconds = 0, promptToTtsIntervalSeconds = 0, audioOutput, waits = [] } = {}) {
  const settings = {
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode,
      promptIntervalSeconds,
      promptToTtsIntervalSeconds,
      rules: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules,
        "super-chat": { enabled: true, audioPath: "sc.wav" },
      },
    },
    outputScope: "host",
    monitorDeviceId: "host",
    streamDeviceId: null,
    playbackGain: 1,
  };
  return createPersonalBroadcastController({
    getSettings: () => settings,
    getOnlyGuardEntry: () => false,
    now: () => Date.now(),
    wait: async (milliseconds) => { waits.push(milliseconds); },
    audioOutput: audioOutput ?? { prepareLocalFile: async () => {}, playLocalFile: async () => {}, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {} },
  });
}

async function flushController() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("独立模式按 FIFO 播放提示音并在提示音之间等待", async () => {
  const calls = [];
  const waits = [];
  const controller = makeController({
    mode: "independent",
    promptIntervalSeconds: 1,
    waits,
    audioOutput: { prepareLocalFile: async () => {}, playLocalFile: async (path) => { calls.push(path); }, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {} },
  });

  controller.acceptCommittedEvent(eventOf("super-chat"));
  controller.acceptCommittedEvent({ ...eventOf("super-chat"), id: "sc-2" });
  await flushController();

  assert.deepEqual(calls, ["sc.wav", "sc.wav"]);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] >= 990 && waits[0] <= 1010, `提示音间隔应约为 1000ms，实际为 ${waits[0]}ms`);
});

test("试听连续点击会打断上一条且不改动正式队列", async () => {
  const calls = [];
  let formalCount = 0;
  let releaseFormal;
  const formalStarted = new Promise((resolve) => { releaseFormal = resolve; });
  const settings = {
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode: "independent",
      rules: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules,
        "super-chat": { enabled: true, audioPath: "formal.wav" },
        "interact-entry": { enabled: true, audioPath: "preview-a.wav" },
      },
    },
    outputScope: "host",
    monitorDeviceId: "host",
    streamDeviceId: null,
    playbackGain: 1,
  };
  let skipCount = 0;
  let previewChannelCount = 0;
  let releasePreview;
  const previewStarted = new Promise((resolve) => { releasePreview = resolve; });
  const controller = createPersonalBroadcastController({
    getSettings: () => settings,
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async (path) => {
        calls.push(path);
        if (path === "formal.wav" && ++formalCount === 1) await formalStarted;
      },
      playPreviewLocalFile: async (path) => {
        previewChannelCount += 1;
        calls.push(path);
        if (path === "preview-a.wav") await previewStarted;
      },
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => { skipCount += 1; },
      stopPersonal: async () => {},
    },
  });

  controller.acceptCommittedEvent(eventOf("super-chat"));
  controller.acceptCommittedEvent({ ...eventOf("super-chat"), id: "formal-2" });
  await flushController();
  assert.deepEqual(calls, ["formal.wav"]);
  assert.equal(controller.getSnapshot().pendingCount, 1);

  const firstPreview = controller.testRule("interact-entry");
  await flushController();
  assert.deepEqual(calls, ["formal.wav", "preview-a.wav"]);
  assert.equal(controller.getSnapshot().pendingCount, 1);

  settings.personalBroadcast.rules["interact-entry"].audioPath = "preview-b.wav";
  const secondPreview = controller.testRule("interact-entry");
  await Promise.all([firstPreview, secondPreview]);

  assert.deepEqual(calls, ["formal.wav", "preview-a.wav", "preview-b.wav"]);
  assert.equal(previewChannelCount, 2);
  assert.equal(skipCount, 1);
  assert.equal(controller.getSnapshot().pendingCount, 1);
  assert.equal(controller.getSnapshot().current?.id, "sc-1");

  releasePreview();
  releaseFormal();
  await flushController();
  assert.deepEqual(calls, ["formal.wav", "preview-a.wav", "preview-b.wav", "formal.wav"]);
  controller.shutdown();
});

test("未启用、没有文件或被 onlyGuardEntry 过滤的规则不会入队", async () => {
  const calls = [];
  let onlyGuardEntry = false;
  const settings = {
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode: "independent",
      rules: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules,
        "super-chat": { enabled: false, audioPath: "sc.wav" },
        "interact-entry": { enabled: true, audioPath: "" },
      },
    },
    outputScope: "host",
    monitorDeviceId: "host",
    streamDeviceId: null,
    playbackGain: 1,
  };
  const controller = createPersonalBroadcastController({
    getSettings: () => settings,
    getOnlyGuardEntry: () => onlyGuardEntry,
    audioOutput: { prepareLocalFile: async () => {}, playLocalFile: async (path) => { calls.push(path); }, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {} },
  });

  assert.equal(controller.acceptCommittedEvent(eventOf("super-chat")), false);
  assert.equal(controller.acceptCommittedEvent(eventOf("normal-entry")), false);
  settings.personalBroadcast.rules["interact-entry"] = { enabled: true, audioPath: "entry.wav" };
  onlyGuardEntry = true;
  assert.equal(controller.acceptCommittedEvent(eventOf("normal-entry")), false);
  await flushController();

  assert.deepEqual(calls, []);
  assert.equal(controller.getSnapshot().pendingCount, 0);
});

test("全局礼物价格阈值也会阻止低价个性播报", async () => {
  const calls = [];
  const settings = {
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode: "independent",
      rules: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules,
        gift: { enabled: true, audioPath: "gift.wav" },
      },
    },
    outputScope: "host",
    monitorDeviceId: "host",
    streamDeviceId: null,
    playbackGain: 1,
  };
  const controller = createPersonalBroadcastController({
    getSettings: () => settings,
    getGiftThreshold: () => ({ threshold: 2, mode: "unit" }),
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async (path) => { calls.push(path); },
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  const cheapGift = { id: "cheap-gift", roomId: 1, ts: 1, msgType: MsgType.Gift, user: { uname: "小明" }, gift: { name: "小心心", count: 1, priceRmb: 1 } };
  const visibleGift = { ...cheapGift, id: "visible-gift", gift: { ...cheapGift.gift, priceRmb: 2 } };
  assert.equal(controller.acceptCommittedEvent(cheapGift), false);
  assert.equal(controller.acceptCommittedEvent(visibleGift), true);
  await flushController();

  assert.deepEqual(calls, ["gift.wav"]);
  controller.shutdown();
});

test("队列溢出时完成当前项后按 FIFO 播放 sc-3 到 sc-18", async () => {
  const calls = [];
  let releaseCurrent;
  const settings = {
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode: "independent",
      rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc-1.wav" } },
    },
    outputScope: "host",
    monitorDeviceId: "host",
    streamDeviceId: null,
    playbackGain: 1,
  };
  const controller = createPersonalBroadcastController({
    getSettings: () => settings,
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async (path) => {
        calls.push(path);
        if (calls.length === 1) await new Promise((resolve) => { releaseCurrent = resolve; });
      },
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  for (let index = 1; index <= 18; index += 1) {
    settings.personalBroadcast.rules["super-chat"].audioPath = `sc-${index}.wav`;
    controller.acceptCommittedEvent({ ...eventOf("super-chat"), id: `sc-${index}` });
  }
  await flushController();

  assert.equal(controller.getSnapshot().current?.id, "sc-1");
  assert.equal(controller.getSnapshot().pendingCount, 16);
  assert.equal(controller.getSnapshot().discardedCount, 1);
  releaseCurrent();
  await flushController();
  assert.deepEqual(calls, ["sc-1.wav", ...Array.from({ length: 16 }, (_, index) => `sc-${index + 3}.wav`)]);
});

test("清空队列保留最后一个正在播放的提示音", async () => {
  let releaseCurrent;
  const controller = makeController({
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => new Promise((resolve) => { releaseCurrent = resolve; }),
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  controller.acceptCommittedEvent(eventOf("super-chat"));
  controller.acceptCommittedEvent({ ...eventOf("super-chat"), id: "sc-2" });
  await flushController();
  controller.clear();

  assert.equal(controller.getSnapshot().current?.id, "sc-1");
  assert.equal(controller.getSnapshot().pendingCount, 0);
  releaseCurrent();
  await flushController();
});

test("前置提示音的间隔等待被 reset 或 shutdown 取消后不播放", async () => {
  for (const stopMethod of ["reset", "shutdown"]) {
    const calls = [];
    let releaseInterval;
    let signalIntervalStarted;
    const intervalStarted = new Promise((resolve) => { signalIntervalStarted = resolve; });
    const settings = {
      personalBroadcast: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
        enabled: true,
        mode: "before-tts",
        promptIntervalSeconds: 1,
        rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc.wav" } },
      },
      outputScope: "host",
      monitorDeviceId: "host",
      streamDeviceId: null,
      playbackGain: 1,
    };
    const controlled = createPersonalBroadcastController({
      getSettings: () => settings,
      now: () => 1,
      wait: async () => {
        signalIntervalStarted();
        await new Promise((resolve) => { releaseInterval = resolve; });
      },
      audioOutput: {
        prepareLocalFile: async () => {},
        playLocalFile: async (path) => { calls.push(path); },
        pausePersonal: async () => {},
        resumePersonal: async () => {},
        skipPersonal: async () => {},
        stopPersonal: async () => {},
      },
    });

    await controlled.playBeforeTts(eventOf("super-chat"));
    const pendingPlayback = controlled.playBeforeTts(eventOf("super-chat"));
    await intervalStarted;
    controlled[stopMethod]();
    releaseInterval();
    await pendingPlayback;

    assert.deepEqual(calls, ["sc.wav"], `${stopMethod} 后不应开始旧提示音`);
  }
});

test("独立模式播放失败时在快照中保留失败规则键和错误", async () => {
  const controller = makeController({
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => { throw new Error("文件不存在"); },
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  controller.acceptCommittedEvent(eventOf("super-chat"));
  await flushController();

  assert.equal(controller.getSnapshot().failedRuleKey, "super-chat");
  assert.equal(controller.getSnapshot().error, "文件不存在");
  controller.clearError();
  assert.equal(controller.getSnapshot().failedRuleKey, null);
  assert.equal(controller.getSnapshot().error, null);
});

test("前置提示音播放失败时记录规则错误且不拒绝 TTS 前置调用", async () => {
  const controller = makeController({
    mode: "before-tts",
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => { throw new Error("无法读取提示音"); },
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  await assert.doesNotReject(controller.playBeforeTts(eventOf("super-chat")));
  assert.equal(controller.getSnapshot().failedRuleKey, "super-chat");
  assert.equal(controller.getSnapshot().error, "无法读取提示音");
});

test("独立模式不等待提示音与 TTS 间隔", async () => {
  const waits = [];
  const controller = makeController({
    mode: "independent",
    promptToTtsIntervalSeconds: 30,
    waits,
  });

  controller.acceptCommittedEvent(eventOf("super-chat"));
  await flushController();

  assert.deepEqual(waits, []);
});

test("TTS 前提示音只等待距上一条结束的剩余间隔", async () => {
  const waits = [];
  const calls = [];
  let currentTime = 0;
  let releaseFirst;
  const controller = createPersonalBroadcastController({
    getSettings: () => ({
      personalBroadcast: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
        enabled: true,
        mode: "before-tts",
        promptIntervalSeconds: 1,
        rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc.wav" } },
      },
      outputScope: "host",
      monitorDeviceId: "host",
      streamDeviceId: null,
      playbackGain: 1,
    }),
    now: () => currentTime,
    wait: async (milliseconds) => { waits.push(milliseconds); currentTime += milliseconds; },
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => {
        calls.push(currentTime);
        if (calls.length === 1) await new Promise((resolve) => { releaseFirst = resolve; });
      },
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  const firstPlayback = controller.playBeforeTts(eventOf("super-chat"));
  await flushController();
  releaseFirst();
  await firstPlayback;
  currentTime = 650;
  await controller.playBeforeTts({ ...eventOf("super-chat"), id: "sc-2" });

  assert.deepEqual(waits, [350]);
  assert.deepEqual(calls, [0, 1000]);
});

test("TTS 前提示音结束后恰等待配置间隔才播放 TTS", async () => {
  const order = [];
  const waits = [];
  let releasePrompt;
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    enabled: true,
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode: "before-tts",
      promptToTtsIntervalSeconds: 2,
      rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc.wav" } },
    },
  };
  const personal = createPersonalBroadcastController({
    getSettings: () => settings,
    wait: async (milliseconds) => { waits.push(milliseconds); order.push("wait"); },
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => {
        order.push("prompt-start");
        await new Promise((resolve) => { releasePrompt = resolve; });
        order.push("prompt-end");
      },
      pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => {},
    },
  });
  const voice = createVoiceController({
    getSettings: () => settings,
    provider: { listVoices: async () => [], synthesize: async () => { order.push("synthesize"); return new Uint8Array([1]); }, cancel: async () => {} },
    audioOutput: { listDevices: async () => [], play: async () => { order.push("tts-play"); }, pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => {} },
    beforePlayback: (event) => personal.playBeforeTts(event),
  });

  voice.start();
  voice.acceptCommittedEvent(eventOf("super-chat"));
  await flushController();
  assert.deepEqual(order, ["synthesize", "prompt-start"]);
  releasePrompt();
  await flushController();
  assert.deepEqual(order, ["synthesize", "prompt-start", "prompt-end", "wait", "tts-play"]);
  assert.deepEqual(waits, [2000]);
  voice.stop();
});

test("重置提示音通道时停止当前提示音并清空等待项", async () => {
  let stopPersonalCount = 0;
  let releaseCurrent;
  const controller = makeController({
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => new Promise((resolve) => { releaseCurrent = resolve; }),
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => { stopPersonalCount += 1; },
    },
  });

  controller.acceptCommittedEvent(eventOf("super-chat"));
  controller.acceptCommittedEvent({ ...eventOf("super-chat"), id: "sc-2" });
  await flushController();
  controller.reset();

  assert.equal(stopPersonalCount, 1);
  assert.equal(controller.getSnapshot().current, null);
  assert.equal(controller.getSnapshot().pendingCount, 0);
  releaseCurrent();
});

test("提示音路径为空、读取失败或解码失败时仍完成 TTS", async () => {
  for (const [audioPath, failure] of [["", null], ["missing.wav", "读取本地音频文件失败"], ["broken.wav", "解析本地音频文件失败"]]) {
    const playedTts = [];
    const settings = {
      ...DEFAULT_VOICE_SETTINGS,
      enabled: true,
      personalBroadcast: {
        ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
        enabled: true,
        mode: "before-tts",
        rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath } },
      },
    };
    const personal = createPersonalBroadcastController({
      getSettings: () => settings,
      audioOutput: {
        prepareLocalFile: async () => { if (failure) throw new Error(failure); },
        playLocalFile: async () => {},
        pausePersonal: async () => {},
        resumePersonal: async () => {},
        skipPersonal: async () => {},
        stopPersonal: async () => {},
      },
    });
    const voice = createVoiceController({
      getSettings: () => settings,
      provider: { listVoices: async () => [], synthesize: async () => new Uint8Array([1]), cancel: async () => {} },
      audioOutput: { listDevices: async () => [], play: async () => { playedTts.push(audioPath || "empty"); }, pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => {} },
      beforePlayback: (event) => personal.playBeforeTts(event),
    });

    voice.start();
    voice.acceptCommittedEvent(eventOf("super-chat"));
    await flushController();

    assert.deepEqual(playedTts, [audioPath || "empty"], failure ?? "空路径");
    assert.equal(personal.getSnapshot().failedRuleKey, failure ? "super-chat" : null);
    assert.equal(personal.getSnapshot().error, failure);
    voice.stop();
  }
});

test("独立提示音未结束时 TTS 仍可播放", async () => {
  let releasePrompt;
  const played = [];
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    enabled: true,
    personalBroadcast: {
      ...DEFAULT_PERSONAL_BROADCAST_SETTINGS,
      enabled: true,
      mode: "independent",
      rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc.wav" } },
    },
  };
  const personal = createPersonalBroadcastController({
    getSettings: () => settings,
    audioOutput: {
      prepareLocalFile: async () => {},
      playLocalFile: async () => new Promise((resolve) => { releasePrompt = resolve; }),
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });
  const voice = createVoiceController({
    getSettings: () => settings,
    provider: { listVoices: async () => [], synthesize: async () => new Uint8Array([1]), cancel: async () => {} },
    audioOutput: { listDevices: async () => [], play: async () => { played.push("tts"); }, pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => {} },
  });

  voice.start();
  personal.acceptCommittedEvent(eventOf("super-chat"));
  voice.acceptCommittedEvent(eventOf("super-chat"));
  await flushController();

  assert.deepEqual(played, ["tts"]);
  releasePrompt();
  voice.stop();
});

test("关闭个性播报不停止 TTS，停止 TTS 不清理独立提示音", async () => {
  const settings = { ...DEFAULT_VOICE_SETTINGS, enabled: true, personalBroadcast: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS, enabled: true, mode: "independent", rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc.wav" } } } };
  let releasePrompt;
  let releaseTts;
  let stopPersonalCount = 0;
  let stopTtsCount = 0;
  const output = {
    prepareLocalFile: async () => {},
    playLocalFile: async () => new Promise((resolve) => { releasePrompt = resolve; }),
    pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {},
    stopPersonal: async () => { stopPersonalCount += 1; },
  };
  const personal = createPersonalBroadcastController({ getSettings: () => settings, audioOutput: output });
  const voice = createVoiceController({
    getSettings: () => settings,
    provider: { listVoices: async () => [], synthesize: async () => new Uint8Array([1]), cancel: async () => {} },
    audioOutput: { listDevices: async () => [], play: async () => new Promise((resolve) => { releaseTts = resolve; }), pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => { stopTtsCount += 1; } },
  });
  personal.acceptCommittedEvent(eventOf("super-chat"));
  voice.start();
  voice.acceptCommittedEvent(eventOf("super-chat"));
  await flushController();

  settings.personalBroadcast.enabled = false;
  personal.reset();
  assert.equal(stopPersonalCount, 1);
  assert.equal(stopTtsCount, 0);

  settings.personalBroadcast.enabled = true;
  personal.acceptCommittedEvent({ ...eventOf("super-chat"), id: "independent-after-disable" });
  await flushController();
  voice.stop();
  assert.equal(stopTtsCount, 1);
  assert.equal(stopPersonalCount, 1);
  releasePrompt();
  releaseTts();
  await flushController();
});

test("切房或退出分别终止 TTS 与提示音，并且旧异步完成不会复活播放", async () => {
  let releasePrompt;
  let releaseTts;
  let promptCalls = 0;
  let ttsCalls = 0;
  let stopPersonalCount = 0;
  let stopTtsCount = 0;
  const settings = { ...DEFAULT_VOICE_SETTINGS, enabled: true, personalBroadcast: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS, enabled: true, mode: "independent", rules: { ...DEFAULT_PERSONAL_BROADCAST_SETTINGS.rules, "super-chat": { enabled: true, audioPath: "sc.wav" } } } };
  const personal = createPersonalBroadcastController({
    getSettings: () => settings,
    audioOutput: { prepareLocalFile: async () => {}, playLocalFile: async () => { promptCalls += 1; await new Promise((resolve) => { releasePrompt = resolve; }); }, pausePersonal: async () => {}, resumePersonal: async () => {}, skipPersonal: async () => {}, stopPersonal: async () => { stopPersonalCount += 1; } },
  });
  const voice = createVoiceController({
    getSettings: () => settings,
    provider: { listVoices: async () => [], synthesize: async () => { await new Promise((resolve) => { releaseTts = resolve; }); return new Uint8Array([1]); }, cancel: async () => {} },
    audioOutput: { listDevices: async () => [], play: async () => { ttsCalls += 1; }, pause: async () => {}, resume: async () => {}, skip: async () => {}, stop: async () => { stopTtsCount += 1; } },
  });
  personal.acceptCommittedEvent(eventOf("super-chat"));
  voice.start();
  voice.acceptCommittedEvent(eventOf("super-chat"));
  await flushController();
  personal.reset();
  voice.reset();
  releasePrompt();
  releaseTts();
  await flushController();
  assert.equal(promptCalls, 1);
  assert.equal(ttsCalls, 0);
  assert.equal(stopPersonalCount, 1);
  assert.equal(stopTtsCount, 1);
  assert.equal(personal.getSnapshot().current, null);
  assert.equal(voice.getSnapshot().current, null);
  assert.equal(personal.getSnapshot().pendingCount, 0);
  assert.equal(voice.getSnapshot().pendingCount, 0);

  personal.acceptCommittedEvent({ ...eventOf("super-chat"), id: "exit-prompt" });
  voice.start();
  voice.acceptCommittedEvent({ ...eventOf("super-chat"), id: "exit-tts" });
  await flushController();
  personal.shutdown();
  voice.shutdown();
  releasePrompt();
  releaseTts();
  await flushController();
  assert.equal(stopPersonalCount, 2);
  assert.equal(stopTtsCount, 2);
  assert.equal(promptCalls, 2);
  assert.equal(ttsCalls, 0);
});
