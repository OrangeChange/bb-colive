import test from "node:test";
import assert from "node:assert/strict";

const MODEL_IDS = [
  "b255ca2902514f69bc22243436a94e4f",
  "33f931ec7a8749c88cda37f1100a4809",
  "eacc56f8ab48443fa84421c547d3b60e",
  "b4f70fdef5f943c2bf43db00e80ad680",
  "4ca68a299cb24ae599dbb828dc31a73c",
  "434587bd27be4faabee6aa26cb721678",
];

test("Fish Audio 初始参考音色预设包含指定模型及公开名称", async () => {
  const { DEFAULT_FISH_REFERENCE_VOICES } = await import("../src/voice/fishAudioModels.ts");
  assert.deepEqual(DEFAULT_FISH_REFERENCE_VOICES.map((voice) => voice.id), MODEL_IDS);
  assert.deepEqual(DEFAULT_FISH_REFERENCE_VOICES.map((voice) => voice.name), ["曼波", "豆包", "派蒙", "高松灯（企鹅）", "井芹仁菜", "塔菲"]);
});

test("Fish Audio 参考音色预设按 ID 去重并允许删除本地预设", async () => {
  const { upsertFishReferenceVoice, removeFishReferenceVoice } = await import("../src/voice/fishAudioModels.ts");
  const voice = { id: "voice-1", name: "旧名称" };
  const updated = upsertFishReferenceVoice([voice], { id: "voice-1", name: "新名称", author: "作者" });
  assert.deepEqual(updated, [{ id: "voice-1", name: "新名称", author: "作者" }]);
  assert.deepEqual(removeFishReferenceVoice(updated, "voice-1"), []);
});

test("Fish Audio 查询结果保留模型名称、作者和语言", async () => {
  const { normalizeFishReferenceVoice } = await import("../src/voice/fishAudioModels.ts");
  assert.deepEqual(normalizeFishReferenceVoice({
    id: "voice-2",
    name: "中文女声",
    author: "Fish 官方",
    languages: ["zh"],
  }), {
    id: "voice-2",
    name: "中文女声",
    author: "Fish 官方",
    languages: ["zh"],
  });
});

test("Fish Audio 查询通过桌面端命令返回参考音色信息", async () => {
  const { lookupFishAudioModel } = await import("../src/voice/fishAudioProvider.ts");
  const calls = [];
  const voice = await lookupFishAudioModel(
    { baseUrl: "https://api.fish.audio", apiKey: "secret", modelId: "voice-3" },
    async (command, args) => {
      calls.push({ command, args });
      return { id: "voice-3", name: "查询音色", author: "作者", languages: ["zh"] };
    },
  );
  assert.deepEqual(voice, { id: "voice-3", name: "查询音色", author: "作者", languages: ["zh"] });
  assert.deepEqual(calls, [{
    command: "lookup_fish_audio_model",
    args: { baseUrl: "https://api.fish.audio", apiKey: "secret", modelId: "voice-3" },
  }]);
});
