import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";
import { DEFAULT_VOICE_TEMPLATES } from "../src/voice/voiceTypes.ts";
import { applyVoicePronunciation, DEFAULT_VOICE_PRONUNCIATION_RULES, stripEmojiForSpeech } from "../src/voice/voicePronunciation.ts";
import { renderVoiceEventTemplate } from "../src/voice/voiceTemplates.ts";

const rules = [
  { id: "au", source: "au", replacement: "阿呜", enabled: true },
];

test("发音修正只匹配安全边界，不误改英文单词内部", () => {
  assert.equal(
    applyVoicePronunciation("au来了 audio beautiful AU au-au", rules),
    "阿呜来了 audio beautiful 阿呜 阿呜-阿呜",
  );
});

test("发音修正不递归处理替换结果，并跳过 URL 和邮箱", () => {
  assert.equal(
    applyVoicePronunciation("au https://example.com/au test@example.com", [
      ...rules,
      { id: "replacement", source: "阿呜", replacement: "au", enabled: true },
    ]),
    "阿呜 https://example.com/au test@example.com",
  );
});

test("默认发音修正删除加号，空替换内容可以正常生效", () => {
  assert.deepEqual(DEFAULT_VOICE_SETTINGS.pronunciationRules, DEFAULT_VOICE_PRONUNCIATION_RULES);
  assert.equal(
    applyVoicePronunciation("A+B +", DEFAULT_VOICE_SETTINGS.pronunciationRules),
    "AB ",
  );
});

test("最终语音文本删除普通 Unicode Emoji，但保留数字、中文和正文符号", () => {
  assert.equal(stripEmojiForSpeech("好开心😅，今天20+个💜"), "好开心，今天20+个");
  assert.equal(stripEmojiForSpeech("🇨🇳👩‍💻👍🏽1️⃣"), "");
});

test("发音修正只作用于用户名和正文，不作用于礼物名与大航海类型", () => {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    pronunciationRules: rules,
  };
  const gift = renderVoiceEventTemplate({
    msgType: MsgType.Gift,
    user: { uname: "au酱" },
    gift: { name: "au礼物", count: 1 },
  }, settings);
  const danmu = renderVoiceEventTemplate({
    msgType: MsgType.Danmu,
    user: { uname: "au酱" },
    text: "au来了",
  }, settings);
  const guard = renderVoiceEventTemplate({
    msgType: MsgType.GuardBuy,
    user: { uname: "au酱" },
    guard: { level: 1, count: 1 },
  }, settings);

  assert.equal(gift.text, "感谢阿呜酱赠送au礼物");
  assert.equal(danmu.text, "阿呜酱说：阿呜来了");
  assert.equal(guard.text, "感谢阿呜酱开通舰长");
});

test("互动模板中的实际事件文案也作为正文参与发音修正", () => {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    pronunciationRules: [{ id: "entry", source: "进入直播间", replacement: "来到直播间", enabled: true }],
  };
  const result = renderVoiceEventTemplate({
    msgType: MsgType.Interact,
    interactKind: "entry",
    user: { uname: "小明" },
  }, settings);

  assert.equal(result.text, "小明来到直播间");
});

test("发音修正规则规范化时保留空替换并丢弃空原词和无效值", async () => {
  const { normalizeVoiceSettings } = await import("../src/voice/voiceSettings.ts");
  const normalized = normalizeVoiceSettings({
    pronunciationRules: [
      { id: "valid", source: "au", replacement: "阿呜", enabled: true },
      { id: "empty-source", source: "", replacement: "阿呜", enabled: true },
      { id: "empty-replacement", source: "xx", replacement: "", enabled: true },
      { id: "invalid", source: 1, replacement: "x", enabled: true },
    ],
  });

  assert.deepEqual(normalized.pronunciationRules, [
    { id: "valid", source: "au", replacement: "阿呜", enabled: true },
    { id: "empty-replacement", source: "xx", replacement: "", enabled: true },
  ]);
});
