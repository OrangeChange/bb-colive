import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_VOICE_TEMPLATES } from "../src/voice/voiceTypes.ts";

test("大表情屏蔽缺省采用默认值，显式关闭保留", async () => {
  const { normalizeVoiceSettings } = await import("../src/voice/voiceSettings.ts");
  assert.equal(normalizeVoiceSettings({ blockBigEmoteDanmu: false }).blockBigEmoteDanmu, false);
  assert.equal(normalizeVoiceSettings({ blockBigEmoteDanmu: true }).blockBigEmoteDanmu, true);
  assert.equal(normalizeVoiceSettings({}).blockBigEmoteDanmu, true);
});

test("语音设置拥有确定默认值并规范化越界值", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.engine, "edge-online");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.engineVoices["edge-online"], "zh-CN-XiaoxiaoNeural");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.engineVoices["windows-system"], "Huihui");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.queueLimit, 50);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.outputScope, "host");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.speechRate, 1);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.playbackGain, 1);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.eventIntervalSeconds, 0);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.blockBigEmoteDanmu, true);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.blockLowPriceSuperChat, false);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.blockLowPriceGuard, false);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.eventEnabled.redPocket, true);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.eventEnabled.anchorLottery, true);
  assert.deepEqual(mod.DEFAULT_VOICE_SETTINGS.shortcutActions, ["speak", "favorite", "mark"]);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.fishAudio.model, "s2.1-pro-free");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.fishAudio.referenceVoices.length, 6);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.fishAudio.referenceVoices[0].id, "b255ca2902514f69bc22243436a94e4f");
  assert.equal(mod.normalizeVoiceSettings({ fishAudio: { referenceVoices: [] } }).fishAudio.referenceVoices.length, 0);
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.customHttp.method, "POST");
  assert.equal(mod.DEFAULT_VOICE_SETTINGS.customHttp.preset, "custom-json");
  assert.deepEqual(mod.normalizeVoiceSettings({ customHttp: { preset: "gpt-sovits", fixedBody: { input: { language: "zh" } } } }).customHttp.fixedBody, {
    input: { language: "zh" },
  });
  assert.equal(mod.normalizeVoiceSettings({ queueLimit: 1 }).queueLimit, 10);
  assert.equal(mod.normalizeVoiceSettings({ expiryEnabled: true }).expirySeconds, 60);
  assert.equal(mod.normalizeVoiceSettings({ speechRate: 1.37 }).speechRate, 1.4);
  assert.equal(mod.normalizeVoiceSettings({ speechRate: 9 }).speechRate, 2);
  assert.equal(mod.normalizeVoiceSettings({ playbackGain: 0.5 }).playbackGain, 1);
  assert.equal(mod.normalizeVoiceSettings({ playbackGain: 2.5 }).playbackGain, 2);
  assert.equal(mod.normalizeVoiceSettings({ playbackGain: 1.37 }).playbackGain, 1.37);
  assert.equal(mod.normalizeVoiceSettings({ eventIntervalSeconds: 31 }).eventIntervalSeconds, 30);
  assert.equal(mod.normalizeVoiceSettings({ blockLowPriceSuperChat: true, blockLowPriceGuard: true }).blockLowPriceSuperChat, true);
  assert.equal(mod.normalizeVoiceSettings({ blockLowPriceSuperChat: true, blockLowPriceGuard: true }).blockLowPriceGuard, true);
});

test("事件快捷菜单设置只保留有效且去重后的前三项，并允许清空", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  assert.deepEqual(
    mod.normalizeVoiceSettings({ shortcutActions: ["filter", "speak", "filter", "favorite", "mark"] }).shortcutActions,
    ["filter", "speak", "favorite"],
  );
  assert.deepEqual(mod.normalizeVoiceSettings({ shortcutActions: [] }).shortcutActions, []);
  assert.deepEqual(mod.normalizeVoiceSettings({ shortcutActions: ["nickname", "favorite"] }).shortcutActions, ["favorite"]);
});

test("语音音色按引擎和自定义 API 预设隔离，并迁移旧版全局音色", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  const legacy = mod.normalizeVoiceSettings({
    engine: "custom-http",
    voiceName: "旧参考音频.wav",
    customHttp: { preset: "gpt-sovits" },
  });

  assert.equal(legacy.customHttp.voiceValues["gpt-sovits"], "旧参考音频.wav");
  assert.equal(legacy.customHttp.voiceValues["index-tts"], "");
  assert.equal(legacy.engineVoices["edge-online"], "zh-CN-XiaoxiaoNeural");
  assert.equal(legacy.engineVoices["windows-system"], "Huihui");

  const isolated = mod.normalizeVoiceSettings({
    engine: "custom-http",
    customHttp: {
      preset: "index-tts",
      voiceValues: { "gpt-sovits": "ref.wav", "index-tts": "男主播" },
    },
    engineVoices: { "edge-online": "小晓", "windows-system": "Huihui" },
  });
  assert.equal(isolated.customHttp.voiceValues["gpt-sovits"], "ref.wav");
  assert.equal(isolated.customHttp.voiceValues["index-tts"], "男主播");
  assert.equal(isolated.engineVoices["edge-online"], "小晓");
  assert.equal(isolated.engineVoices["windows-system"], "Huihui");
});

test("规范化设置会迁移旧版礼物和大航海播报模板", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  const normalized = mod.normalizeVoiceSettings({
    templates: {
      gift: [
        { kind: "text", value: "感谢" },
        { kind: "field", field: "username" },
        { kind: "text", value: "赠送" },
        { kind: "field", field: "giftName" },
        { kind: "text", value: "×" },
        { kind: "field", field: "quantity" },
      ],
      guard: [
        { kind: "text", value: "感谢" },
        { kind: "field", field: "username" },
        { kind: "text", value: "开通" },
        { kind: "field", field: "guardName" },
        { kind: "text", value: "，" },
        { kind: "field", field: "months" },
        { kind: "text", value: "个月" },
      ],
      superChat: [
        { kind: "field", field: "username" },
        { kind: "text", value: "发送醒目留言：" },
        { kind: "field", field: "content" },
      ],
    },
  });

  assert.deepEqual(normalized.templates.gift, DEFAULT_VOICE_TEMPLATES.gift);
  assert.deepEqual(normalized.templates.guard, DEFAULT_VOICE_TEMPLATES.guard);
  assert.deepEqual(normalized.templates.superChat, DEFAULT_VOICE_TEMPLATES.superChat);
});

test("规范化设置会把旧的红包与天选合并开关迁移为两个分类", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  const normalized = mod.normalizeVoiceSettings({
    eventEnabled: { lottery: true },
    priorities: { lottery: "high" },
    templates: {
      lottery: [
        { kind: "text", value: "直播活动：" },
        { kind: "field", field: "content" },
      ],
    },
  });

  assert.equal(normalized.eventEnabled.redPocket, true);
  assert.equal(normalized.eventEnabled.anchorLottery, true);
  assert.equal(normalized.priorities.redPocket, "high");
  assert.equal(normalized.priorities.anchorLottery, "high");
  assert.deepEqual(normalized.templates.redPocket, mod.DEFAULT_VOICE_SETTINGS.templates.redPocket);
  assert.deepEqual(normalized.templates.anchorLottery, mod.DEFAULT_VOICE_SETTINGS.templates.anchorLottery);
  assert.equal("lottery" in normalized.eventEnabled, false);
});

test("规范化设置会迁移截图中的红包与天选旧版模板，但保留真正的自定义模板", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  const legacy = [
    { kind: "text", value: "直播活动：" },
    { kind: "field", field: "content" },
  ];
  const normalized = mod.normalizeVoiceSettings({
    templates: {
      redPocket: legacy,
      anchorLottery: legacy,
      gift: [{ kind: "text", value: "自定义礼物" }],
    },
  });

  assert.deepEqual(normalized.templates.redPocket, mod.DEFAULT_VOICE_SETTINGS.templates.redPocket);
  assert.deepEqual(normalized.templates.anchorLottery, mod.DEFAULT_VOICE_SETTINGS.templates.anchorLottery);
  assert.deepEqual(normalized.templates.gift, [{ kind: "text", value: "自定义礼物" }]);
});

test("规范化设置会迁移缺少陪伴信息的大航海旧模板", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  const normalized = mod.normalizeVoiceSettings({
    templates: {
      guard: [
        { kind: "text", value: "感谢" },
        { kind: "field", field: "username" },
        { kind: "text", value: "开通" },
        { kind: "field", field: "duration" },
        { kind: "field", field: "guardName" },
      ],
    },
  });

  assert.deepEqual(normalized.templates.guard, mod.DEFAULT_VOICE_SETTINGS.templates.guard);
});

test("语音设置提供六种互动子模板和红包天选结果模板", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  assert.deepEqual(Object.keys(mod.DEFAULT_VOICE_SETTINGS.interactTemplates), ["entry", "follow", "share", "specialFollow", "mutualFollow", "like"]);
  assert.deepEqual(mod.DEFAULT_VOICE_SETTINGS.redPocketResultTemplate, [{ kind: "text", value: "红包开奖了" }]);
  assert.deepEqual(mod.DEFAULT_VOICE_SETTINGS.anchorLotteryResultTemplate, [{ kind: "text", value: "天选开奖了" }]);
  const normalized = mod.normalizeVoiceSettings({});
  assert.deepEqual(normalized.interactTemplates, mod.DEFAULT_VOICE_SETTINGS.interactTemplates);
});

test("规范化设置会把旧版通用互动内容迁移为六类实际互动文字", async () => {
  const mod = await import("../src/voice/voiceSettings.ts");
  const normalized = mod.normalizeVoiceSettings({
    interactTemplates: Object.fromEntries(
      ["entry", "follow", "share", "specialFollow", "mutualFollow", "like"].map((kind) => [kind, [
        { kind: "field", field: "username" },
        { kind: "field", field: "content" },
      ]]),
    ),
  });

  for (const template of Object.values(normalized.interactTemplates)) {
    assert.deepEqual(template[0], { kind: "field", field: "username" });
    assert.equal(template[1].kind, "text");
    assert.notEqual(template[1].value, undefined);
    assert.equal(template.some((segment) => segment.kind === "field" && segment.field === "content"), false);
  }
});
