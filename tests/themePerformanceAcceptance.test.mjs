import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import { createThemeSessionHost } from "../src/themes/themeEditorSession.ts";
import { createCustomThemeDocument } from "../src/themes/themeTypes.ts";
import fs from "node:fs";
import { createServer } from "vite";

test("连续编辑不复制素材清单也不写入仓库", async () => {
  const document = createCustomThemeDocument({ themeId: "large", mode: "native", name: "大型主题" });
  document.assets = Array.from({ length: 10000 }, (_, index) => ({ path: `assets/${index}.webp` }));
  let writes = 0;
  const host = createThemeSessionHost({
    async loadThemeDocument() { return document; },
    async saveThemeDocument() { writes += 1; },
  });
  const session = await host.openThemeSession("large");
  const assets = session.document.assets;
  host.updateThemeDraft(session, value => ({ ...value, metadata: { ...value.metadata, name: "修改一" } }));
  host.updateThemeDraft(session, value => ({ ...value, metadata: { ...value.metadata, name: "修改二" } }));
  assert.equal(session.document.assets, assets);
  assert.equal(session.undo[0].document.assets, assets);
  assert.equal(writes, 0);
});

test("同一进程只在首次访问主题目录时执行旧目录迁移", () => {
  const source = fs.readFileSync("src-tauri/src/theme_store.rs", "utf8");
  assert.match(source, /PREPARED_THEME_ROOT/);
  assert.match(source, /Mutex<Option<PathBuf>>/);
});

test("重复打开同一主题复用会话且不重复读取文档", async () => {
  const document = createCustomThemeDocument({ themeId: "repeat", mode: "native", name: "重复主题" });
  let reads = 0;
  const host = createThemeSessionHost({
    async loadThemeDocument() { reads += 1; return document; },
    async saveThemeDocument() {},
  });
  const first = await host.openThemeSession("repeat");
  const second = await host.openThemeSession("repeat");
  assert.equal(first, second);
  assert.equal(reads, 1);
});

test("三版来源列表持有一万条历史时只向渲染器交付有界窗口", async () => {
  const vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-themePerformanceAcceptance.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, server: {watch:null, middlewareMode: true }, appType: "custom", logLevel: "silent" });
  const { planBlivechatEventWindow } = await vite.ssrLoadModule("/src/compat/blivechat/BlivechatSourceSurface.tsx");
  const { planLaplaceProductWindow } = await vite.ssrLoadModule("/src/compat/laplace/LaplaceProductSurface.tsx");
  const events = Array.from({ length: 10_000 }, (_, index) => ({
    id: `event-${index}`,
    reactKey: `event-${index}`,
    roomId: 1,
    ts: index,
    msgType: 0,
    text: `正文 ${index}`,
  }));
  const blivechat = planBlivechatEventWindow(events, { direction: "bottom", followingLatest: true });
  const blivechatLocated = planBlivechatEventWindow(events, { direction: "bottom", followingLatest: false, targetId: "event-1234" });
  const laplace = planLaplaceProductWindow(events, { direction: "bottom", followingLatest: true });
  const laplaceLocated = planLaplaceProductWindow(events, { direction: "bottom", followingLatest: false, targetId: "event-1234" });
  assert.deepEqual([blivechat.events.length, blivechat.end], [60, 10_000]);
  assert.equal(blivechatLocated.events.some(event => event.reactKey === "event-1234"), true);
  assert.deepEqual([laplace.events.length, laplace.end], [80, 10_000]);
  assert.equal(laplaceLocated.events.some(event => event.reactKey === "event-1234"), true);
  await vite.close();
});
