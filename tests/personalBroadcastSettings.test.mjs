import test from "node:test";
import assert from "node:assert/strict";

test("个性播报拥有完整默认规则且默认关闭", async () => {
  const { DEFAULT_VOICE_SETTINGS, normalizeVoiceSettings } = await import("../src/voice/voiceSettings.ts");
  const { PERSONAL_BROADCAST_RULE_KEYS } = await import("../src/voice/personalBroadcastTypes.ts");

  assert.equal(DEFAULT_VOICE_SETTINGS.personalBroadcast.enabled, false);
  assert.equal(DEFAULT_VOICE_SETTINGS.personalBroadcast.mode, "independent");
  assert.equal(DEFAULT_VOICE_SETTINGS.personalBroadcast.promptIntervalSeconds, 0);
  assert.equal(DEFAULT_VOICE_SETTINGS.personalBroadcast.promptToTtsIntervalSeconds, 0);
  assert.deepEqual(Object.keys(DEFAULT_VOICE_SETTINGS.personalBroadcast.rules), [...PERSONAL_BROADCAST_RULE_KEYS]);
  assert.equal(normalizeVoiceSettings({}).personalBroadcast.rules["guard-governor"].audioPath, "");
});

test("个性播报只保留绝对 MP3 或 WAV 音频路径", async () => {
  const { normalizeVoiceSettings } = await import("../src/voice/voiceSettings.ts");
  const normalizeAudioPath = (audioPath) => normalizeVoiceSettings({
    personalBroadcast: { rules: { "guard-governor": { audioPath } } },
  }).personalBroadcast.rules["guard-governor"].audioPath;

  assert.equal(normalizeAudioPath("C:\\audio\\notice.MP3"), "C:\\audio\\notice.MP3");
  assert.equal(normalizeAudioPath("C:\\audio\\notice.wav"), "C:\\audio\\notice.wav");
  assert.equal(normalizeAudioPath("audio/notice.mp3"), "");
  assert.equal(normalizeAudioPath("C:\\audio\\notice.ogg"), "");
  assert.equal(normalizeAudioPath(""), "");
  assert.equal(normalizeAudioPath(null), "");
});

test("个性播报间隔归一化到 0–30 秒且步进为半秒", async () => {
  const { normalizeVoiceSettings } = await import("../src/voice/voiceSettings.ts");
  const normalizeIntervals = (promptIntervalSeconds, promptToTtsIntervalSeconds) => normalizeVoiceSettings({
    personalBroadcast: { promptIntervalSeconds, promptToTtsIntervalSeconds },
  }).personalBroadcast;

  assert.deepEqual(normalizeIntervals(-1, 31), {
    ...normalizeIntervals(0, 30),
    promptIntervalSeconds: 0,
    promptToTtsIntervalSeconds: 30,
  });
  assert.equal(normalizeIntervals(0.26, 29.74).promptIntervalSeconds, 0.5);
  assert.equal(normalizeIntervals(0.26, 29.74).promptToTtsIntervalSeconds, 29.5);
  assert.equal(normalizeIntervals(Number.NaN, Number.POSITIVE_INFINITY).promptIntervalSeconds, 0);
  assert.equal(normalizeIntervals(Number.NaN, Number.POSITIVE_INFINITY).promptToTtsIntervalSeconds, 0);
});
