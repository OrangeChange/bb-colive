import test from "node:test";
import assert from "node:assert/strict";
import gateway from "../cloudflare/pages-fish-audio-gateway/_worker.js";

test("Fish Audio 网关把客户端取消信号传递给上游请求", async () => {
  const originalFetch = globalThis.fetch;
  let upstreamSignal;
  globalThis.fetch = async (_input, init) => {
    upstreamSignal = init?.signal;
    return new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "audio/mpeg" },
    });
  };

  try {
    const request = new Request("https://gateway.test/laplace/tts-fishaudio", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Danmu-Request-Id": "test-request-1",
      },
      body: JSON.stringify({ token: "secret", text: "测试", format: "mp3" }),
    });
    const response = await gateway.fetch(request);

    assert.equal(response.status, 200);
    assert.equal(upstreamSignal, request.signal);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
