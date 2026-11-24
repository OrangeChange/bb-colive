import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { createVoiceController } from "../src/voice/voiceController.ts";
import { createPersonalBroadcastController } from "../src/voice/personalBroadcastController.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";
import { DEFAULT_PERSONAL_BROADCAST_SETTINGS } from "../src/voice/personalBroadcastTypes.ts";
import { createVoiceGiftThresholdRuntime } from "../src/voice/giftThresholdRuntime.ts";

const cheapGift = {
  id: "cheap-gift",
  roomId: 1,
  ts: 1,
  msgType: MsgType.Gift,
  user: { uid: "1", uname: "小明", guardLevel: 0 },
  gift: {
    id: 1,
    name: "粉丝团灯牌",
    count: 1,
    price: 100,
    total: 100,
    priceRmb: 0.1,
    totalRmb: 0.1,
    isFree: false,
  },
};

test("提高阈值后立即移除语音待播队列中的低价礼物", () => {
  const threshold = createVoiceGiftThresholdRuntime();
  const settings = structuredClone(DEFAULT_VOICE_SETTINGS);
  settings.enabled = true;
  const controller = createVoiceController({
    getSettings: () => settings,
    getGiftThreshold: threshold.get,
    provider: {
      listVoices: async () => [],
      synthesize: async () => new Uint8Array([1]),
      cancel: async () => {},
    },
    audioOutput: {
      listDevices: async () => [],
      play: async () => {},
      pause: async () => {},
      resume: async () => {},
      skip: async () => {},
      stop: async () => {},
    },
  });

  controller.pause();
  assert.equal(controller.acceptCommittedEvent(cheapGift), true);
  assert.equal(controller.getSnapshot().pendingCount, 1);

  threshold.set(1, "unit");
  controller.revalidateGiftThreshold();

  assert.equal(controller.getSnapshot().pendingCount, 0);
  assert.equal(controller.getSnapshot().discardedCount, 1);
  controller.shutdown();
});

test("提高阈值后立即移除个性播报待播队列中的低价礼物", () => {
  const threshold = createVoiceGiftThresholdRuntime();
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
    monitorDeviceId: null,
    streamDeviceId: null,
    playbackGain: 1,
  };
  const controller = createPersonalBroadcastController({
    getSettings: () => settings,
    getGiftThreshold: threshold.get,
    audioOutput: {
      prepareLocalFile: async () => new Uint8Array([1]),
      playLocalFile: async () => {},
      pausePersonal: async () => {},
      resumePersonal: async () => {},
      skipPersonal: async () => {},
      stopPersonal: async () => {},
    },
  });

  controller.pause();
  assert.equal(controller.acceptCommittedEvent(cheapGift), true);
  assert.equal(controller.getSnapshot().pendingCount, 1);

  threshold.set(1, "unit");
  controller.revalidateGiftThreshold();

  assert.equal(controller.getSnapshot().pendingCount, 0);
  assert.equal(controller.getSnapshot().discardedCount, 1);
  controller.shutdown();
});
