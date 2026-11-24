import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../cloudflare/pages-fish-audio-gateway/_worker.js";

test("默认网关转发语速和分贝音量，保留本地 token 与二进制音频", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, ...options, body: JSON.parse(options.body) });
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "Content-Type": "audio/mpeg" } });
  });
  for (const [speed, volume] of [[1.2, -1.9], [0.5, -96], [2, 0]]) {
    const response = await gateway.fetch(new Request("https://gateway.test/laplace/tts-fishaudio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "local-test-key", text: "测试", voice: "voice-id", model: "s2.1-pro-free", format: "mp3", prosody: { speed, volume, normalize_loudness: true } }),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual(Array.from(new Uint8Array(await response.arrayBuffer())), [1, 2, 3]);
    assert.equal(requests.at(-1).url, "https://api.fish.audio/v1/tts");
    assert.equal(requests.at(-1).headers.Authorization, "Bearer local-test-key");
    assert.equal(requests.at(-1).headers.model, "s2.1-pro-free");
    assert.equal(requests.at(-1).body.reference_id, "voice-id");
    assert.deepEqual(requests.at(-1).body.prosody, { speed, volume, normalize_loudness: true });
  }
});
