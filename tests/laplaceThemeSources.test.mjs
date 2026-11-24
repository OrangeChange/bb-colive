import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

let vite;
let sources;

test.before(async () => {
  vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-laplaceThemeSources.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, server: {watch:null, middlewareMode: true }, appType: "custom" });
  sources = await vite.ssrLoadModule("/src/themes/laplaceThemeSources.ts");
});

test.after(async () => vite?.close());

test("LAPLACE 目录保留 13 个列表项、15 份资源和 4 个精选来源的独立身份", () => {
  assert.equal(sources.LAPLACE_BUILTIN_THEME_SOURCES.length, 13);
  assert.equal(sources.LAPLACE_BUILTIN_RESOURCE_NAMES.length, 15);
  assert.equal(sources.LAPLACE_CURATED_THEME_SOURCES.length, 4);
  assert.ok(sources.LAPLACE_CURATED_THEME_SOURCES.every(item => item.origin === "builtin" && item.sourceKind === "curated"));
  assert.ok(sources.LAPLACE_BUILTIN_THEME_SOURCES.every(item => item.origin === "builtin" && item.sourceKind === "builtin"));
});

test("正式来源选择把内置与精选保持为 builtin，另存时才生成自定义副本", () => {
  const builtin = sources.createLaplaceCatalogTheme(sources.LAPLACE_BUILTIN_THEME_SOURCES[0], ".builtin{}", "now");
  const curated = sources.createLaplaceCatalogTheme(sources.LAPLACE_CURATED_THEME_SOURCES[0], ".curated{}", "now");
  assert.equal(builtin.origin, "builtin"); assert.equal(curated.origin, "builtin");
  const saved = sources.createLaplaceSavedCopy(curated, "custom-copy");
  assert.equal(saved.origin, "custom"); assert.equal(saved.themeId, "custom-copy");
  assert.equal(saved.styles.baseCss, ".curated{}"); assert.equal(saved.metadata.sourceUrl, sources.LAPLACE_CURATED_THEME_SOURCES[0].url);
});

test("用户网址生成自定义主题，缺失来源信息保持空值且采集时间不冒充发布日期", () => {
  const document = sources.createLaplaceRemoteTheme({
    id: "remote-1",
    url: "https://themes.example.test/chat/main.css",
    css: ".event{color:red}",
    metadata: { title: "远程主题" },
    fetchedAt: "2026-10-25T10:00:00.000Z",
  });
  assert.equal(document.origin, "custom");
  assert.equal(document.metadata.sourceUrl, "https://themes.example.test/chat/main.css");
  assert.equal(document.metadata.author, "");
  assert.equal(document.metadata.version, "");
  assert.equal(document.metadata.updatedAt, "");
  assert.equal(document.metadata.importedAt, "2026-10-25T10:00:00.000Z");
});

test("远程 CSS 的图片、字体和 import 相对地址按原网址解析", () => {
  const css = `@import "../base.css";\n@font-face{src:url(./font.woff2)}\n.a{background:url('../img/a.png')}\n.b{mask:url(#icon)}`;
  assert.equal(
    sources.resolveLaplaceRemoteCssUrls(css, "https://themes.example.test/chat/main.css"),
    `@import "https://themes.example.test/base.css";\n@font-face{src:url("https://themes.example.test/chat/font.woff2")}\n.a{background:url("https://themes.example.test/img/a.png")}\n.b{mask:url(#icon)}`,
  );
});

test("确认保存后仓库可重启读取；下载结果本身不保存也不发布", async () => {
  const writes = new Map();
  let publishCount = 0;
  const fetched = sources.createLaplaceRemoteTheme({ id: "saved", url: "https://example.test/a.css", css: ".a{}", metadata: null, fetchedAt: "now" });
  assert.equal(writes.size, 0);
  assert.equal(publishCount, 0);
  await sources.confirmLaplaceRemoteTheme(fetched, { saveThemeDocument: async value => writes.set(value.themeId, structuredClone(value)) });
  const restartedRepository = { loadThemeDocument: async id => structuredClone(writes.get(id)) };
  assert.equal((await restartedRepository.loadThemeDocument("saved")).styles.baseCss, ".a{}");
  assert.equal(publishCount, 0);
});

test("显式更新失败保留旧主题，乱序响应不能覆盖新选择，精选更新另存为自定义副本", async () => {
  const old = sources.createLaplaceRemoteTheme({ id: "old", url: "https://example.test/old.css", css: ".old{}", metadata: null, fetchedAt: "old" });
  const failed = await sources.updateLaplaceRemoteTheme(old, async () => { throw new Error("offline"); });
  assert.equal(failed.document.styles.baseCss, ".old{}");
  assert.match(failed.error, /offline/);

  const pending = new Map();
  const coordinator = sources.createLaplaceRemoteSourceCoordinator(url => new Promise(resolve => pending.set(url, resolve)));
  const first = coordinator.preview("https://example.test/first.css");
  const second = coordinator.preview("https://example.test/second.css");
  pending.get("https://example.test/second.css")({ css: ".second{}", metadata: null });
  await second;
  pending.get("https://example.test/first.css")({ css: ".first{}", metadata: null });
  await first;
  assert.equal(coordinator.getSnapshot().url, "https://example.test/second.css");
  assert.equal(coordinator.getSnapshot().css, ".second{}");

  const curated = sources.createLaplaceRemoteTheme({ id: "laplace-curated-gradient", url: sources.LAPLACE_CURATED_THEME_SOURCES[0].url, css: ".v1{}", metadata: null, fetchedAt: "old", curated: true });
  assert.equal(curated.origin, "builtin");
  const updated = await sources.updateLaplaceRemoteTheme(curated, async () => ({ css: ".v2{}", metadata: { title: "新版" } }), { id: "copy" });
  assert.equal(updated.document.themeId, "copy");
  assert.equal(updated.document.origin, "custom");
  assert.equal(updated.document.styles.baseCss, ".v2{}");
});

test("URL 更新只替换远程层和来源元数据，保留自定义编辑与资源", async () => {
  const current = sources.createLaplaceRemoteTheme({ id: "kept", url: "https://example.test/a.css", css: ".old{}", metadata: { title: "旧", author: "作者", version: "1" }, fetchedAt: "old" });
  current.settings = { showAvatar: false }; current.styles.visualCss = ".visual{}"; current.styles.customCss = ".custom{}"; current.assets = [{ id: "asset", name: "a", path: "assets/a.png", mediaType: "image/png" }];
  const result = await sources.updateLaplaceRemoteTheme(current, async () => ({ css: ".new{}", metadata: { title: "新", author: "新作者", version: "2" } }), { fetchedAt: "new" });
  assert.equal(result.document.themeId, "kept");
  assert.deepEqual(result.document.settings, { showAvatar: false });
  assert.equal(result.document.styles.visualCss, ".visual{}"); assert.equal(result.document.styles.customCss, ".custom{}");
  assert.deepEqual(result.document.assets, current.assets);
  assert.equal(result.document.styles.baseCss, ".new{}"); assert.equal(result.document.metadata.name, "新");
});

test("关闭来源弹窗会作废迟到结果，重开后只能接收新一代请求", async () => {
  const pending = new Map();
  const coordinator = sources.createLaplaceRemoteSourceCoordinator(url => new Promise(resolve => pending.set(url, resolve)));
  const old = coordinator.preview("https://example.test/old.css"); coordinator.cancel();
  const next = coordinator.preview("https://example.test/new.css");
  pending.get("https://example.test/old.css")({ css: ".old{}", metadata: null }); await old;
  assert.notEqual(coordinator.getSnapshot().css, ".old{}");
  pending.get("https://example.test/new.css")({ css: ".new{}", metadata: null }); await next;
  assert.equal(coordinator.getSnapshot().css, ".new{}");
});
