import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { createPersonalBroadcastController } from "../src/voice/personalBroadcastController.ts";
import { createVoiceController } from "../src/voice/voiceController.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = () => new Promise((resolve) => setImmediate(resolve));
const sc = (id) => ({ id, roomId: 1, ts: 1, msgType: MsgType.SuperChat, sc: { price: 30, message: id } });
const entry = (id) => ({ id, roomId: 1, ts: 1, msgType: MsgType.Interact, interactKind: "entry" });

function setup(t, options = {}) {
  const calls = [];
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    enabled: true,
    eventIntervalSeconds: 0,
    templates: { ...DEFAULT_VOICE_SETTINGS.templates, superChat: [{ kind: "field", field: "content" }] },
    ...options.settings,
    personalBroadcast: {
      ...DEFAULT_VOICE_SETTINGS.personalBroadcast,
      enabled: true,
      mode: "before-tts",
      ...options.personalSettings,
      rules: {
        ...DEFAULT_VOICE_SETTINGS.personalBroadcast.rules,
        "super-chat": { enabled: true, audioPath: "sc.wav" },
        "interact-entry": { enabled: true, audioPath: "entry.wav" },
      },
    },
  };
  const personal = createPersonalBroadcastController({
    getSettings: () => settings,
    now: options.now ?? (() => 0),
    wait: options.wait ?? (async (ms) => { calls.push(`wait:${ms}`); }),
    audioOutput: {
      prepareLocalFile: async (path) => { await options.prepare?.(path); },
      playLocalFile: async (path) => { calls.push(`prompt:${path}`); await options.prompt?.(path); },
      pausePersonal: async () => { calls.push("personal:pause"); },
      resumePersonal: async () => { calls.push("personal:resume"); },
      skipPersonal: async () => { calls.push("personal:skip"); },
      stopPersonal: async () => { calls.push("personal:stop"); },
    },
  });
  const voice = createVoiceController({
    getSettings: () => settings,
    provider: {
      listVoices: async () => [],
      synthesize: async ({ text }) => {
        calls.push(`synthesize:${text}`);
        await options.synthesis?.(text);
        return new TextEncoder().encode(text);
      },
      cancel: async () => { calls.push("synthesis:cancel"); },
    },
    audioOutput: {
      listDevices: async () => [],
      play: async (audio) => { const text = new TextDecoder().decode(audio); calls.push(`tts:${text}`); await options.tts?.(text); },
      pause: async () => { calls.push("tts:pause"); },
      resume: async () => { calls.push("tts:resume"); },
      skip: async () => { calls.push("tts:skip"); },
      stop: async () => { calls.push("tts:stop"); },
    },
    beforePlayback: (event, session) => personal.playBeforeTts(event, session),
    onDiscardedEvent: (event) => {
      if (settings.personalBroadcast.mode === "before-tts") personal.acceptStandaloneEvent(event);
    },
    onPlaybackControl: (control) => {
      if (settings.personalBroadcast.mode !== "before-tts") return;
      personal[control]();
    },
  });
  t.after(() => { voice.shutdown(); personal.shutdown(); });
  const publish = (event) => {
    if (settings.personalBroadcast.mode === "independent") personal.acceptCommittedEvent(event);
    if (!voice.acceptCommittedEvent(event) && settings.personalBroadcast.mode === "before-tts") personal.acceptStandaloneEvent(event);
  };
  const audioCalls = () => calls.filter((call) => call.startsWith("prompt:") || call.startsWith("tts:") && !/:(pause|resume|skip|stop)$/.test(call));
  return { personal, voice, settings, calls, publish, audioCalls };
}

for (const mode of ["before-tts", "independent"]) {
  test(`事件菜单手动播报在${mode}模式下只触发 TTS，不触发个性播报`, async (t) => {
    const h = setup(t, { personalSettings: { mode } });

    assert.equal(h.voice.speakEvent(sc("manual")), true);
    await flush();

    assert.deepEqual(h.audioCalls(), ["tts:manual"]);
    assert.deepEqual(h.calls.filter((call) => call.startsWith("prompt:")), []);
  });
}

test("串行暂停联动当前提示音，提示音完成后也必须等继续才输出 TTS", async (t) => {
  const prompt = deferred();
  const h = setup(t, { prompt: () => prompt.promise });
  h.publish(sc("A"));
  await flush();
  assert.equal(h.personal.getSnapshot().current?.id, "A");
  h.voice.pause();
  assert.ok(h.calls.includes("personal:pause"));
  prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav"]);
  h.voice.resume();
  await flush();
  assert.ok(h.calls.includes("personal:resume"));
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav", "tts:A"]);
});

for (const phase of ["提示音间隔", "提示音与 TTS 间隔"]) {
  test(`串行暂停冻结${phase}，继续后等待剩余时间`, async (t) => {
    const waits = [];
    let now = 0;
    const h = setup(t, {
      now: () => now,
      personalSettings: phase === "提示音间隔" ? { promptIntervalSeconds: 1 } : { promptToTtsIntervalSeconds: 1 },
      wait: (ms) => { const gate = deferred(); waits.push({ ms, gate }); return gate.promise; },
    });
    if (phase === "提示音间隔") await h.personal.playBeforeTts(sc("seed"));
    h.publish(sc("A"));
    await flush();
    assert.equal(waits[0].ms, 1000);
    now = 250;
    h.voice.pause();
    await flush();
    waits[0].gate.resolve();
    now = 5000;
    await flush();
    assert.ok(!h.audioCalls().includes("tts:A"));
    if (phase === "提示音间隔") assert.deepEqual(h.audioCalls(), ["prompt:sc.wav"]);
    h.voice.resume();
    await flush();
    assert.equal(waits[1]?.ms, 750);
    now = 5750;
    waits[1].gate.resolve();
    await flush();
    assert.ok(h.audioCalls().includes("tts:A"));
  });
}

test("串行跳过停止旧提示音并取消旧合成，晚返回不会输出旧 TTS", async (t) => {
  const prompt = deferred();
  const synthesis = deferred();
  let promptCount = 0;
  const h = setup(t, { prompt: () => ++promptCount === 1 ? prompt.promise : undefined, synthesis: (text) => text === "A" ? synthesis.promise : undefined });
  h.publish(sc("A"));
  h.publish(sc("B"));
  await flush();
  h.voice.skip();
  await flush();
  assert.ok(h.calls.includes("personal:skip"));
  assert.ok(h.calls.includes("synthesis:cancel"));
  assert.ok(h.audioCalls().includes("tts:B"));
  prompt.resolve();
  synthesis.resolve();
  await flush();
  assert.ok(!h.audioCalls().includes("tts:A"));
});

test("串行停止终止提示音及当前等待，释放旧 Promise 不会恢复播放", async (t) => {
  const prompt = deferred();
  const h = setup(t, { prompt: () => prompt.promise });
  h.publish(sc("A"));
  await flush();
  h.voice.stop();
  assert.ok(h.calls.includes("personal:stop"));
  assert.equal(h.personal.getSnapshot().current, null);
  prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav"]);
});

test("串行模式的控制操作也联动只有 standalone 提示音的事件", async (t) => {
  const prompts = [deferred(), deferred()];
  let promptIndex = 0;
  const h = setup(t, { prompt: () => prompts[promptIndex++].promise });

  h.publish(entry("standalone-pause"));
  await flush();
  h.voice.pause();
  assert.ok(h.calls.includes("personal:pause"));
  h.voice.resume();
  assert.ok(h.calls.includes("personal:resume"));
  h.voice.skip();
  assert.ok(h.calls.includes("personal:skip"));

  h.publish(entry("standalone-stop"));
  await flush();
  h.voice.stop();
  assert.ok(h.calls.includes("personal:stop"));
  assert.equal(h.personal.getSnapshot().current, null);

  for (const prompt of prompts) prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:entry.wav", "prompt:entry.wav"]);
});

test("串行暂停后跳过当前 standalone，继续会播放仍在等待的提示音", async (t) => {
  const prompts = [deferred(), deferred()];
  let promptIndex = 0;
  const h = setup(t, { prompt: () => prompts[promptIndex++].promise });

  h.publish(entry("current"));
  h.publish(entry("pending"));
  await flush();
  h.voice.pause();
  h.voice.skip();

  assert.equal(h.personal.getSnapshot().status, "paused");
  assert.equal(h.personal.getSnapshot().current, null);
  assert.equal(h.personal.getSnapshot().pendingCount, 1);

  h.voice.resume();
  await flush();
  assert.equal(h.personal.getSnapshot().current?.id, "pending");
  assert.deepEqual(h.audioCalls(), ["prompt:entry.wav", "prompt:entry.wav"]);

  for (const prompt of prompts) prompt.resolve();
});

test("串行事件在提示音与 TTS 全阶段持有 personal 通道，standalone 不插入", async (t) => {
  const prompt = deferred();
  const tts = deferred();
  let promptCount = 0;
  const h = setup(t, { prompt: () => ++promptCount === 1 ? prompt.promise : undefined, tts: (text) => text === "A" ? tts.promise : undefined });
  h.publish(sc("A"));
  await flush();
  h.publish(entry("entry"));
  h.publish(sc("B"));
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav"]);
  prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav", "tts:A"]);
  tts.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav", "tts:A", "prompt:entry.wav", "prompt:sc.wav", "tts:B"]);
});

test("已有 standalone 提示音时，新串行事件等待它完成才占用通道", async (t) => {
  const prompt = deferred();
  const h = setup(t, { prompt: (path) => path === "entry.wav" ? prompt.promise : undefined });
  h.publish(entry("entry"));
  h.publish(sc("A"));
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:entry.wav"]);
  prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:entry.wav", "prompt:sc.wav", "tts:A"]);
});

test("独立模式下暂停、跳过和停止 TTS 仍不控制 personal 通道", async (t) => {
  const prompt = deferred();
  const h = setup(t, { personalSettings: { mode: "independent" }, prompt: () => prompt.promise });
  h.publish(sc("A"));
  await flush();
  assert.ok(h.audioCalls().includes("tts:A"));
  h.voice.pause();
  h.voice.resume();
  h.voice.skip();
  h.voice.stop();
  assert.deepEqual(h.calls.filter((call) => call.startsWith("personal:")), []);
  prompt.resolve();
});

test("串行 TTS 失败只取消关联事件，不清除已接受的 standalone 提示音", async (t) => {
  const prompt = deferred();
  const h = setup(t, {
    prompt: (path) => path === "entry.wav" ? prompt.promise : undefined,
    synthesis: (text) => {
      if (text === "failed-tts") throw new Error("合成失败");
    },
  });

  h.publish(entry("keep-personal"));
  await flush();
  h.publish(sc("failed-tts"));
  await flush();

  assert.equal(h.voice.getSnapshot().status, "error");
  assert.equal(h.personal.getSnapshot().current?.id, "keep-personal");
  assert.ok(!h.calls.includes("personal:stop"));

  prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:entry.wav"]);
});

test("shutdown 后 reset 可恢复两控制器的接收并播放新事件", async (t) => {
  const h = setup(t);
  h.voice.shutdown();
  h.personal.shutdown();
  assert.equal(h.voice.acceptCommittedEvent(sc("old")), false);
  assert.equal(h.personal.acceptStandaloneEvent(entry("old")), false);
  h.voice.reset();
  h.personal.reset();
  assert.equal(h.voice.getSnapshot().accepting, true);
  assert.equal(h.personal.getSnapshot().accepting, true);
  h.publish(sc("new"));
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav", "tts:new"]);
});

test("drop-oldest 将已接受但淘汰的事件交给 personal，保持 TTS 上限与丢弃统计", async (t) => {
  const prompt = deferred();
  let count = 0;
  const h = setup(t, { settings: { queueLimit: 1, overflowPolicy: "drop-oldest" }, prompt: () => ++count === 1 ? prompt.promise : undefined });
  h.publish(sc("A"));
  h.publish(sc("B"));
  h.publish(sc("C"));
  await flush();
  assert.equal(h.voice.getSnapshot().pendingCount, 1);
  assert.equal(h.voice.getSnapshot().discardedCount, 1);
  prompt.resolve();
  await flush();
  assert.deepEqual(h.audioCalls(), ["prompt:sc.wav", "tts:A", "prompt:sc.wav", "prompt:sc.wav", "tts:C"]);
  assert.equal(h.personal.getSnapshot().discardedCount, 0);
});

for (const failure of ["读取本地音频文件失败", "解析本地音频文件失败"]) {
  test(`前置${failure}在提示音间隔前被发现，不增加 TTS 等待`, async (t) => {
    const h = setup(t, { personalSettings: { promptIntervalSeconds: 30, promptToTtsIntervalSeconds: 30 }, prepare: (path) => { if (path === "missing.wav") throw new Error(failure); }, prompt: (path) => { if (path === "missing.wav") throw new Error(failure); } });
    await h.personal.playBeforeTts(sc("seed"));
    h.calls.length = 0;
    h.settings.personalBroadcast.rules["super-chat"].audioPath = "missing.wav";
    h.publish(sc("A"));
    await flush();
    assert.deepEqual(h.calls.filter((call) => call.startsWith("wait:")), []);
    assert.ok(h.audioCalls().includes("tts:A"));
    assert.equal(h.personal.getSnapshot().failedRuleKey, "super-chat");
    assert.equal(h.personal.getSnapshot().error, failure);
  });
}

test("提示音尚在等待时合成拒绝立即更新错误并终止当前事件，无 unhandledRejection", async (t) => {
  const synthesis = deferred();
  const prompt = deferred();
  const h = setup(t, { synthesis: () => synthesis.promise, prompt: () => prompt.promise });
  h.publish(sc("A"));
  await flush();
  synthesis.reject(new Error("合成服务失败"));
  await flush();
  assert.equal(h.voice.getSnapshot().error, "合成服务失败");
  assert.equal(h.voice.getSnapshot().failedCount, 1);
  assert.equal(h.voice.getSnapshot().accepting, false);
  assert.ok(h.calls.includes("personal:stop"));
  prompt.resolve();
  await flush();
  assert.ok(!h.audioCalls().includes("tts:A"));
});

test("取消事件后的迟到合成拒绝不污染下一事件，也不产生未处理拒绝", async (t) => {
  const synthesis = deferred();
  const prompt = deferred();
  let count = 0;
  const h = setup(t, { synthesis: (text) => text === "A" ? synthesis.promise : undefined, prompt: () => ++count === 1 ? prompt.promise : undefined });
  h.publish(sc("A"));
  await flush();
  h.voice.skip();
  h.publish(sc("B"));
  synthesis.reject(new Error("已取消"));
  await flush();
  assert.equal(h.voice.getSnapshot().error, null);
  assert.equal(h.voice.getSnapshot().failedCount, 0);
  assert.ok(h.audioCalls().includes("tts:B"));
  prompt.resolve();
});
