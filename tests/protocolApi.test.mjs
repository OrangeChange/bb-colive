import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname.replace(/^\//, "").replaceAll("/", "\\");

function httpFixturePlugin(data) {
  const moduleId = "\0review-room-info-http";
  return {
    name: "review-room-info-http-fixture",
    enforce: "pre",
    resolveId(source) {
      return source === "@tauri-apps/plugin-http" ? moduleId : null;
    },
    load(id) {
      if (id !== moduleId) return null;
      return `
        export async function fetch() {
          return {
            json: async () => ({ code: 0, data: ${JSON.stringify(data)} }),
          };
        }
      `;
    },
  };
}

function qrHttpCapturePlugin(calls) {
  const moduleId = "\0qr-http-capture";
  return {
    name: "qr-http-capture",
    enforce: "pre",
    resolveId(source) {
      return source === "@tauri-apps/plugin-http" ? moduleId : null;
    },
    load(id) {
      if (id !== moduleId) return null;
      return `
        export async function fetch(url, options = {}) {
          globalThis.__qrHttpCalls.push({ url, options });
          const path = new URL(url).pathname;
          const data = path.endsWith('/generate')
            ? { url: 'https://account.bilibili.com/h5/account-h5/auth/scan-web', qrcode_key: 'test-key' }
            : { code: 86101 };
          return {
            json: async () => ({ code: 0, data }),
            headers: { getSetCookie: () => [] },
          };
        }
      `;
    },
  };
}

test("getRoomInfo 从 room_info.title 读取直播标题", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolApi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [httpFixturePlugin({
      room_info: {
        title: "接口内嵌标题",
        user_cover: "https://example.com/live-cover.jpg",
      },
    })],
    ssr: { noExternal: true },
    server: {watch:null, middlewareMode: true },
  });

  try {
    const api = await server.ssrLoadModule("/src/protocol/api.ts?room-info-nested-title=1");
    const roomInfo = await api.getRoomInfo(1700301235);
    assert.equal(roomInfo.title, "接口内嵌标题");
    assert.equal(roomInfo.coverUrl, "https://example.com/live-cover.jpg");
  } finally {
    await server.close();
  }
});

test("getRoomInfo 在当前接口只返回 room_info.cover 时也读取直播封面", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolApi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [httpFixturePlugin({
      room_info: {
        title: "当前直播",
        cover: "https://example.com/current-cover.jpg",
      },
    })],
    ssr: { noExternal: true },
    server: {watch:null, middlewareMode: true },
  });

  try {
    const api = await server.ssrLoadModule("/src/protocol/api.ts?room-info-cover-fallback=1");
    const roomInfo = await api.getRoomInfo(1700301235);
    assert.equal(roomInfo.coverUrl, "https://example.com/current-cover.jpg");
  } finally {
    await server.close();
  }
});

test("getRoomInfo 解析主播大航海档位", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolApi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [httpFixturePlugin({
      room_info: { title: "乃琳直播间", room_id: 22625027, uid: 672342685 },
      guard_info: { count: 15487, anchor_guard_achieve_level: 10000 },
    })],
    ssr: { noExternal: true },
    server: {watch:null, middlewareMode: true },
  });

  try {
    const api = await server.ssrLoadModule("/src/protocol/api.ts?room-info-guard-level=1");
    const roomInfo = await api.getRoomInfo(22625027);
    assert.equal(roomInfo.roomGuardProfile.anchorGuardAchieveLevel, 10000);
    assert.equal(roomInfo.roomGuardProfile.guardCount, 15487);
    assert.equal(roomInfo.roomGuardProfile.milestone, "tenThousand");
    assert.equal(roomInfo.roomGuardProfile.iconSet, "enhanced");
  } finally {
    await server.close();
  }
});

test("getRoomInfo 兼容旧接口的顶层 title", async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolApi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [httpFixturePlugin({ title: "旧接口标题" })],
    ssr: { noExternal: true },
    server: {watch:null, middlewareMode: true },
  });

  try {
    const api = await server.ssrLoadModule("/src/protocol/api.ts?room-info-legacy-title=1");
    const roomInfo = await api.getRoomInfo(1700301235);
    assert.equal(roomInfo.title, "旧接口标题");
  } finally {
    await server.close();
  }
});

test("二维码生成和轮询请求都带有 Web 登录来源参数", async () => {
  const calls = [];
  globalThis.__qrHttpCalls = calls;
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolApi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false,
    appType: "custom",
    logLevel: "silent",
    plugins: [qrHttpCapturePlugin(calls)],
    ssr: { noExternal: true },
    server: {watch:null, middlewareMode: true },
  });

  try {
    const api = await server.ssrLoadModule("/src/protocol/api.ts?qr-source-parameter=1");
    await api.qrGenerate();
    await api.qrPoll("test-key");

    const generateUrl = new URL(calls[0].url);
    const pollUrl = new URL(calls[1].url);
    assert.equal(generateUrl.pathname, "/x/passport-login/web/qrcode/generate");
    assert.equal(pollUrl.pathname, "/x/passport-login/web/qrcode/poll");
    assert.equal(generateUrl.searchParams.get("source"), "main-fe-header");
    assert.equal(pollUrl.searchParams.get("source"), "main-fe-header");
  } finally {
    await server.close();
    delete globalThis.__qrHttpCalls;
  }
});

test("弹幕连接请求仅移除 DedeUserID，其他接口保留完整登录 Cookie", async () => {
  globalThis.__qrHttpCalls = [];
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolApi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root, configFile: false, appType: "custom", logLevel: "silent", plugins: [qrHttpCapturePlugin()], ssr: { noExternal: true }, server: {watch:null, middlewareMode: true } });
  try {
    const api = await server.ssrLoadModule("/src/protocol/api.ts?danmu-cookie=1");
    const cookie = "SESSDATA=session%2Cvalue; DedeUserID=123; bili_jct=csrf; DedeUserID__ckMd5=check; sid=abc";
    await api.getDanmuInfo(22625027, cookie, "a".repeat(32), "b".repeat(32));
    await api.getNav(cookie);
    const [danmu, nav] = globalThis.__qrHttpCalls;
    assert.equal(danmu.options.headers.Cookie, "SESSDATA=session%2Cvalue; bili_jct=csrf; DedeUserID__ckMd5=check; sid=abc");
    assert.equal(nav.options.headers.Cookie, cookie);
    await api.getDanmuInfo(80397, "SESSDATA=session; sid=abc", "a".repeat(32), "b".repeat(32));
    assert.equal(globalThis.__qrHttpCalls[2].options.headers.Cookie, "SESSDATA=session; sid=abc");
  } finally { await server.close(); delete globalThis.__qrHttpCalls; }
});
