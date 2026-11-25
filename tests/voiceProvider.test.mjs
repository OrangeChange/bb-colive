import test from "node:test";
import assert from "node:assert/strict";
import { createEdgeOnlineProvider } from "../src/voice/edgeOnlineProvider.ts";

class FakeWebSocket {
  constructor() {}
}

const fakeFetch = async () => ({ ok: true, json: async () => [] });

test("Edge Provider 通过桌面端命令返回音频数据", async () => {
  const calls = [];
  const provider = createEdgeOnlineProvider({
    invoke: async (command, args) => {
      calls.push({ command, args });
      return [82, 73, 70, 70];
    },
    fetch: fakeFetch,
    userAgent: "Mozilla/5.0 Edg/152.0.0.0",
  });
  const audio = await provider.synthesize({ text: "你好", voice: "zh-CN-XiaoxiaoNeural", rate: 1, pitch: 0, volume: 1 });
  assert.ok(audio.byteLength > 0);
  assert.equal(calls[0].command, "synthesize_edge_speech");
  assert.deepEqual(calls[0].args, { text: "你好", voiceName: "zh-CN-XiaoxiaoNeural", rate: 1, pitch: 0, volume: 1 });
});

test("Edge Provider 的音色列表只暴露可用的短名称", async () => {
  const provider = createEdgeOnlineProvider({
    WebSocket: FakeWebSocket,
    fetch: async () => ({
      ok: true,
      json: async () => [
        { ShortName: "zh-CN-XiaoxiaoNeural", FriendlyName: "Xiaoxiao", Locale: "zh-CN" },
        { ShortName: "zh-HK-HiuGaaiNeural", FriendlyName: "HiuGaai", Locale: "zh-HK" },
        { ShortName: "en-US-AndrewMultilingualNeural", FriendlyName: "AndrewMultilingual", Locale: "en-US" },
        { ShortName: "en-GB-RyanNeural", FriendlyName: "Ryan", Locale: "en-GB" },
        { ShortName: "ja-JP-NanamiNeural", FriendlyName: "Nanami", Locale: "ja-JP" },
        { ShortName: "fr-FR-DeniseNeural", FriendlyName: "Denise", Locale: "fr-FR" },
      ],
    }),
  });
  assert.deepEqual(await provider.listVoices(), [
    { name: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao", language: "zh-CN", local: false, group: "zh-CN", multilingual: false },
    { name: "zh-HK-HiuGaaiNeural", label: "HiuGaai", language: "zh-HK", local: false, group: "zh-HK", multilingual: false },
    { name: "en-US-AndrewMultilingualNeural", label: "AndrewMultilingual", language: "en-US", local: false, group: "multilingual", multilingual: true },
    { name: "en-GB-RyanNeural", label: "Ryan", language: "en-GB", local: false, group: "en-GB", multilingual: false },
    { name: "ja-JP-NanamiNeural", label: "Nanami", language: "ja-JP", local: false, group: "ja-JP", multilingual: false },
  ]);
});
