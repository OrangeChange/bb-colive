import assert from "node:assert/strict";
import { test } from "node:test";

for (const settlement of ["success", "failure"]) {
  test(`自定义 HTTP 取消登记在${settlement}诊断后清理，重复 requestId 不继承取消`, async () => {
    const { createCustomHttpProvider } = await import("../src/voice/customHttpProvider.ts");
    const { DEFAULT_VOICE_SETTINGS } = await import("../src/voice/voiceSettings.ts");
    const records = [], calls = [];
    let resolve, reject;
    const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
    let attempt = 0;
    const provider = createCustomHttpProvider({
      getSettings: () => DEFAULT_VOICE_SETTINGS.customHttp,
      diagnostics: { record: (record) => records.push(record) },
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === "synthesize_custom_http") return ++attempt === 1 ? pending : [9];
        return [];
      },
    });
    const request = { text: "测试", voice: "sample.wav", rate: 1, pitch: 0, volume: 1, requestId: "reused-id" };
    const first = provider.synthesize(request);
    const finished = settlement === "failure" ? assert.rejects(first, /HTTP 500/) : first;
    await provider.cancel();
    assert.equal(calls[1].args.requestId, "reused-id");
    assert.deepEqual(records, []);
    if (settlement === "failure") reject(new Error("HTTP 500"));
    else resolve([4]);
    await finished;
    assert.equal(records[0].outcome, "cancelled");
    assert.equal(records[0].stage, "cancelled");
    const cancellationCount = calls.filter((call) => call.command === "cancel_voice_synthesis").length;
    await provider.cancel();
    assert.equal(calls.filter((call) => call.command === "cancel_voice_synthesis").length, cancellationCount);
    assert.deepEqual(Array.from(await provider.synthesize(request)), [9]);
    assert.equal(records[1].outcome, "success");
    assert.equal(records[1].stage, "complete");
  });
}

test("已有 Fish Opus 配置归一化为 MP3，WAV 仍保留", async () => {
  const { normalizeVoiceSettings } = await import("../src/voice/voiceSettings.ts");
  assert.equal(normalizeVoiceSettings({ fishAudio: { format: "opus" } }).fishAudio.format, "mp3");
  assert.equal(normalizeVoiceSettings({ fishAudio: { format: "wav" } }).fishAudio.format, "wav");
});

test("外部语音设置提供 Fish Audio 和自定义 API 的稳定默认值", async () => {
  const { DEFAULT_VOICE_SETTINGS } = await import("../src/voice/voiceSettings.ts");

  assert.equal(DEFAULT_VOICE_SETTINGS.engine, "edge-online");
  assert.equal(DEFAULT_VOICE_SETTINGS.fishAudio.model, "s2.1-pro-free");
  assert.equal(DEFAULT_VOICE_SETTINGS.fishAudio.format, "mp3");
  assert.equal(DEFAULT_VOICE_SETTINGS.customHttp.method, "POST");
  assert.equal(DEFAULT_VOICE_SETTINGS.customHttp.responseFormat, "audio");
});

test("Fish Audio 请求使用官方模型请求头和 JSON 字段", async () => {
  const { buildFishAudioRequest } = await import("../src/voice/externalTts.ts");

  const request = buildFishAudioRequest({
    text: "欢迎来到直播间",
    voice: "voice-model-id",
    rate: 1.2,
    pitch: 0,
    volume: 0.8,
  }, {
    apiKey: "secret",
    baseUrl: "https://api.fish.audio",
    model: "s2.1-pro-free",
    referenceId: "voice-model-id",
    format: "mp3",
  });

  assert.equal(request.url, "https://api.fish.audio/v1/tts");
  assert.equal(request.headers.Authorization, "Bearer secret");
  assert.equal(request.headers.model, "s2.1-pro-free");
  assert.deepEqual(request.body, {
    text: "欢迎来到直播间",
    reference_id: "voice-model-id",
    prosody: { speed: 1.2, volume: -1.9, normalize_loudness: true },
    format: "mp3",
  });
});

test("自定义 API 请求保留固定字段并映射文本、音色和语速", async () => {
  const { buildCustomHttpRequest } = await import("../src/voice/externalTts.ts");

  const request = buildCustomHttpRequest({
    text: "测试文本",
    voice: "voice-a",
    rate: 0.8,
    pitch: 2,
    volume: 0.5,
  }, {
    endpoint: "http://127.0.0.1:9880/tts",
    method: "POST",
    authType: "bearer",
    apiKey: "local-secret",
    textField: "text",
    voiceField: "ref_audio_path",
    modelField: "text_lang",
    model: "zh",
    rateField: "speed_factor",
    pitchField: "pitch",
    volumeField: "volume",
    audioField: "audio",
    responseFormat: "audio",
    fixedBody: { text_lang: "zh", media_type: "wav" },
    extraHeaders: {},
  });

  assert.equal(request.url, "http://127.0.0.1:9880/tts");
  assert.equal(request.headers.Authorization, "Bearer local-secret");
  assert.deepEqual(request.body, {
    text: "测试文本",
    text_lang: "zh",
    media_type: "wav",
    ref_audio_path: "voice-a",
    speed_factor: 0.8,
    pitch: 2,
    volume: 0.5,
  });
});

test("自定义 API 字段支持嵌套路径且不会改写固定请求对象", async () => {
  const { buildCustomHttpRequest } = await import("../src/voice/externalTts.ts");
  const fixedBody = {
    input: { language: "zh" },
    voice: { languageCode: "zh-CN" },
    audioConfig: { audioEncoding: "MP3" },
  };

  const request = buildCustomHttpRequest({
    text: "嵌套测试",
    voice: "voice-a",
    rate: 1.2,
    pitch: 3,
    volume: 0.8,
  }, {
    endpoint: "http://127.0.0.1:9000/v1/tts",
    method: "POST",
    authType: "none",
    apiKey: "",
    apiKeyHeader: "X-API-Key",
    textField: "input.text",
    voiceField: "voice.name",
    modelField: "voice.model",
    model: "demo-model",
    rateField: "audioConfig.speakingRate",
    pitchField: "",
    volumeField: "",
    audioField: "result.audioContent",
    responseFormat: "json-base64",
    fixedBody,
    extraHeaders: {},
  });

  assert.deepEqual(request.body, {
    input: { language: "zh", text: "嵌套测试" },
    voice: { languageCode: "zh-CN", name: "voice-a", model: "demo-model" },
    audioConfig: { audioEncoding: "MP3", speakingRate: 1.2 },
  });
  assert.deepEqual(fixedBody, {
    input: { language: "zh" },
    voice: { languageCode: "zh-CN" },
    audioConfig: { audioEncoding: "MP3" },
  });
});

test("自定义 API 预设提供 OpenAI 兼容、GPT-SoVITS 和 IndexTTS 的最小映射", async () => {
  const { CUSTOM_HTTP_PRESET_DEFAULTS } = await import("../src/voice/customHttpPresets.ts");

  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["openai-compatible"].textField, "input");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["openai-compatible"].voiceField, "voice");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["openai-compatible"].rateField, "speed");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["gpt-sovits"].endpoint, "http://127.0.0.1:9880/tts");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["gpt-sovits"].textField, "text");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["gpt-sovits"].voiceField, "ref_audio_path");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["index-tts"]?.endpoint, "http://127.0.0.1:9880");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["index-tts"]?.textField, "text");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["index-tts"]?.voiceField, "speaker");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["index-tts"]?.modelField, "");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["index-tts"]?.rateField, "speed");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["index-tts"]?.volumeField, "");
  assert.equal(CUSTOM_HTTP_PRESET_DEFAULTS["custom-json"].rateField, "");
});

test("Fish Audio Provider 把当前配置交给桌面端命令", async () => {
  const { createFishAudioProvider } = await import("../src/voice/fishAudioProvider.ts");
  const calls = [];
  const provider = createFishAudioProvider({
    getSettings: () => ({ apiKey: "secret", baseUrl: "https://api.fish.audio", model: "s2.1-pro-free", referenceId: "voice-id", format: "mp3" }),
    invoke: async (command, args) => {
      calls.push({ command, args });
      return [1, 2, 3];
    },
  });

  const audio = await provider.synthesize({ text: "欢迎", voice: "voice-id", rate: 1, pitch: 0, volume: 1 });

  assert.deepEqual(Array.from(audio), [1, 2, 3]);
  assert.equal(calls[0].command, "synthesize_fish_audio");
  assert.equal(calls[0].args.config.model, "s2.1-pro-free");
  assert.equal(calls[0].args.text, "欢迎");
});

test("Fish Audio Provider 会请求取消当前桌面端合成", async () => {
  const calls = [];
  let releaseSynthesis;
  const provider = (await import("../src/voice/fishAudioProvider.ts")).createFishAudioProvider({
    getSettings: () => ({ apiKey: "secret", baseUrl: "https://api.fish.audio", model: "s2.1-pro-free", referenceId: "voice-id", format: "mp3", referenceVoices: [] }),
    invoke: async (command, args) => {
      calls.push({ command, args });
      if (command === "synthesize_fish_audio") return new Promise((resolve) => { releaseSynthesis = () => resolve([1]); });
      return [];
    },
  });

  const synthesis = provider.synthesize({ text: "欢迎", voice: "voice-id", rate: 1, pitch: 0, volume: 1, requestId: "fish-request-1" });
  await provider.cancel();

  assert.equal(calls[1].command, "cancel_voice_synthesis");
  assert.equal(calls[1].args.requestId, "fish-request-1");
  releaseSynthesis();
  await synthesis;
});

test("自定义 API Provider 把配置和合成参数交给桌面端命令", async () => {
  const { createCustomHttpProvider } = await import("../src/voice/customHttpProvider.ts");
  const calls = [];
  const provider = createCustomHttpProvider({
    getSettings: () => ({ endpoint: "http://127.0.0.1:9880/tts", method: "POST", authType: "none", apiKey: "", apiKeyHeader: "X-API-Key", textField: "text", voiceField: "ref_audio_path", modelField: "text_lang", model: "zh", rateField: "speed_factor", pitchField: "", volumeField: "", audioField: "audio", responseFormat: "audio", fixedBody: {}, extraHeaders: {} }),
    invoke: async (command, args) => {
      calls.push({ command, args });
      return [4, 5];
    },
  });

  const audio = await provider.synthesize({ text: "测试", voice: "sample.wav", rate: 0.9, pitch: 0, volume: 1 });

  assert.deepEqual(Array.from(audio), [4, 5]);
  assert.equal(calls[0].command, "synthesize_custom_http");
  assert.equal(calls[0].args.config.endpoint, "http://127.0.0.1:9880/tts");
  assert.equal(calls[0].args.voiceName, "sample.wav");
});

test("自定义 API Provider 会请求取消当前桌面端合成", async () => {
  const calls = [];
  let releaseSynthesis;
  const provider = (await import("../src/voice/customHttpProvider.ts")).createCustomHttpProvider({
    getSettings: () => ({ endpoint: "http://127.0.0.1:9880/tts", method: "POST", authType: "none", apiKey: "", apiKeyHeader: "X-API-Key", textField: "text", voiceField: "ref_audio_path", modelField: "text_lang", model: "zh", rateField: "speed_factor", pitchField: "", volumeField: "", audioField: "audio", responseFormat: "audio", fixedBody: {}, extraHeaders: {}, voiceValues: { "openai-compatible": "", "gpt-sovits": "", "index-tts": "", "custom-json": "" } }),
    invoke: async (command, args) => {
      calls.push({ command, args });
      if (command === "synthesize_custom_http") return new Promise((resolve) => { releaseSynthesis = () => resolve([4]); });
      return [];
    },
  });

  const synthesis = provider.synthesize({ text: "测试", voice: "sample.wav", rate: 1, pitch: 0, volume: 1, requestId: "custom-request-1" });
  await provider.cancel();

  assert.equal(calls[1].command, "cancel_voice_synthesis");
  assert.equal(calls[1].args.requestId, "custom-request-1");
  releaseSynthesis();
  await synthesis;
});
