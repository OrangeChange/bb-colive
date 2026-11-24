import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

let vite;
test.after(async () => { await vite?.close(); });

async function modules() {
  vite ??= await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-sessionRestore.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    esbuild: { jsx: "automatic" },
    server: {watch:null, middlewareMode: true },
    logLevel: "silent",
  });
  return {
    login: await vite.ssrLoadModule("/src/protocol/login.ts"),
    store: await vite.ssrLoadModule("/src/stores/session.ts"),
    screen: await vite.ssrLoadModule("/src/components/LoginCard.tsx"),
  };
}

const cachedSession = {
  cookie: "SESSDATA=test",
  refreshToken: "refresh",
  mid: "100",
  uname: "测试用户",
  savedAt: 1,
};

test("缓存验证请求失败时保留会话并返回暂时无法验证", async () => {
  const { login } = await modules();
  const result = await login.resolveCachedSession(cachedSession, async () => {
    throw new Error("network unavailable");
  });
  assert.deepEqual(result, { kind: "unavailable", session: cachedSession });
});

test("服务器明确未登录时才判定缓存失效", async () => {
  const { login } = await modules();
  const result = await login.resolveCachedSession(cachedSession, async () => null);
  assert.deepEqual(result, { kind: "invalid" });
});

test("暂时无法验证页面提供重试和重新登录且不显示二维码", async () => {
  const { screen } = await modules();
  const html = renderToStaticMarkup(React.createElement(screen.SessionUnavailablePanel, {
    message: "登录状态暂时无法确认，请检查网络后重试",
    onRetry() {},
    onRelogin() {},
  }));
  assert.match(html, />重试</);
  assert.match(html, />重新登录</);
  assert.doesNotMatch(html, /<canvas/);
});
