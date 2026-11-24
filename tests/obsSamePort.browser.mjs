import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const b = await chromium.connectOverCDP(
  process.env.PROGRAM_CDP ||
    (() => {
      throw new Error("请设置隔离程序的 PROGRAM_CDP 地址");
    })(),
);
const p = b.contexts()[0].pages()[0];
try {
  const result = await p.evaluate(async () => {
    const invoke = window.__TAURI_INTERNALS__.invoke;
    let before = await invoke("obs_service_status");
    if (!before.running) before = await invoke("obs_start_service");
    const socket = new WebSocket(
      `ws://127.0.0.1:${before.port}/ws?preview=current`,
    );
    try {
      await new Promise((ok, fail) => {
        socket.onopen = ok;
        socket.onerror = fail;
      });
      await new Promise((r) => setTimeout(r, 100));
      const connected = await invoke("obs_service_status");
      const after = await invoke("obs_set_service_port", { port: before.port });
      await new Promise((r) => setTimeout(r, 100));
      const actual = await invoke("obs_service_status");
      return {
        before: connected,
        after,
        actual,
        socketOpen: socket.readyState === WebSocket.OPEN,
      };
    } finally {
      socket.close();
    }
  });
  console.log(JSON.stringify(result));
  assert.equal(
    result.after.clients,
    result.before.clients,
    "未改变端口时不应断开已连接的输出",
  );
  assert.equal(result.after.running, true);
  assert.equal(result.actual.clients, result.before.clients);
  assert.equal(result.socketOpen, true);
} finally {
  await b.close();
}
