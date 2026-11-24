import assert from "node:assert/strict";
import test from "node:test";
import { createThemeSessionHost } from "../src/themes/themeEditorSession.ts";
import { createThemeRepository } from "../src/themes/themeRepository.ts";
import { createBuiltinCompatibleThemes, COMPATIBLE_THEME_MODES, getThemeModeAdapter } from "../src/themes/themeModeAdapters.ts";

function createMemoryPort(initial = []) {
  const stored = new Map(initial.map(document => [document.themeId, structuredClone(document)]));
  return {
    stored,
    port: {
      async list() { return []; },
      async read(themeId) { return structuredClone(stored.get(themeId)); },
      async write(document) { stored.set(document.themeId, structuredClone(document)); },
      async remove(themeId) { stored.delete(themeId); },
    },
  };
}

test("同模式主题的设置和 CSS 草稿互不共享", async () => {
  const builtins = createBuiltinCompatibleThemes();
  const source = builtins.find(theme => theme.mode === "laplace");
  const { port } = createMemoryPort(builtins);
  const repository = createThemeRepository(port, builtins);
  const host = createThemeSessionHost(repository, {
    createId: () => "laplace-copy",
    now: () => "2026-10-24T00:00:00.000Z",
  });
  const builtinSession = await host.openThemeSession(source.themeId);
  const copySession = await host.saveThemeSessionAs(builtinSession, { name: "LAPLACE 副本", author: "Orange" });

  host.updateThemeDraft(copySession, document => ({
    ...document,
    settings: { ...document.settings, showSpoiler: false },
    styles: { ...document.styles, customCss: ".event { color: red; }" },
  }));

  assert.equal(builtinSession.document.settings.showSpoiler, true);
  assert.equal(builtinSession.document.styles.customCss, "");
  assert.equal(copySession.document.settings.showSpoiler, false);
  assert.equal(copySession.document.styles.customCss, ".event { color: red; }");
});

test("两份同模式自定义主题保存并丢弃缓存后可分别重开", async () => {
  const builtins = createBuiltinCompatibleThemes();
  const source = builtins.find(theme => theme.mode === "laplace");
  const { port, stored } = createMemoryPort(builtins);
  const repository = createThemeRepository(port, builtins);
  const ids = ["laplace-a", "laplace-b"];
  const host = createThemeSessionHost(repository, { createId: () => ids.shift(), now: () => "2026-10-24T00:00:00.000Z" });
  const builtin = await host.openThemeSession(source.themeId);
  const first = await host.saveThemeSessionAs(builtin, { name: "A", author: "Orange" });
  const second = await host.saveThemeSessionAs(builtin, { name: "B", author: "Orange" });
  host.updateThemeDraft(first, document => ({ ...document, settings: { ...document.settings, showSpoiler: false }, styles: { ...document.styles, customCss: ".a{}" } }));
  host.updateThemeDraft(second, document => ({ ...document, settings: { ...document.settings, showSpoiler: true }, styles: { ...document.styles, customCss: ".b{}" } }));
  await host.saveThemeSession(first);
  await host.saveThemeSession(second);
  host.discardThemeSession(first.themeId);
  host.discardThemeSession(second.themeId);
  assert.equal((await host.openThemeSession("laplace-a")).document.styles.customCss, ".a{}");
  assert.equal((await host.openThemeSession("laplace-b")).document.styles.customCss, ".b{}");
  assert.equal((await host.openThemeSession("laplace-a")).document.settings.showSpoiler, false);
  assert.equal((await host.openThemeSession("laplace-b")).document.settings.showSpoiler, true);
  assert.equal(stored.size, builtins.length + 2);
});

test("三版未保存会话都能从草稿列表找回且不写仓库", async () => {
  const builtins = COMPATIBLE_THEME_MODES.map(mode => getThemeModeAdapter(mode).createBuiltinTheme());
  const { port, stored } = createMemoryPort();
  const repository = createThemeRepository(port, builtins);
  const host = createThemeSessionHost(repository);
  const sessions = builtins.map(theme => host.createNewThemeSession({
    ...structuredClone(theme), themeId: `draft-${theme.mode}`, origin: "custom",
    metadata: { ...theme.metadata, name: `${theme.metadata.name}草稿` },
  }, theme.themeId));
  assert.deepEqual(host.listDraftThemeSummaries().map(item => item.themeId).sort(), sessions.map(item => item.themeId).sort());
  for (const session of sessions) assert.equal(await host.openThemeSession(session.themeId), session);
  assert.equal(stored.size, 0);
});

test("草稿改名后摘要立即更新，原生草稿预览直接读取会话文档", () => {
  const builtins = createBuiltinCompatibleThemes();
  const native = { ...structuredClone(builtins[0]), themeId: "draft-native", mode: "native", metadata: { ...builtins[0].metadata, name: "旧名称" } };
  let repositoryLoads = 0;
  const host = createThemeSessionHost({
    async loadThemeDocument() { repositoryLoads += 1; throw new Error("不应读取仓库"); },
    async saveThemeDocument() {},
  });
  const session = host.createNewThemeSession(native, "native-default");
  host.updateThemeDraft(session, document => ({ ...document, metadata: { ...document.metadata, name: "新名称" } }));
  assert.equal(host.listDraftThemeSummaries()[0].name, "新名称");
  assert.equal(host.getDraftThemeDocument("draft-native").metadata.name, "新名称");
  assert.equal(repositoryLoads, 0);
});

test("读取内置主题得到独立副本，个人调整与另存副本互不影响", async () => {
  const builtins = createBuiltinCompatibleThemes();
  const { port, stored } = createMemoryPort(builtins);
  const repository = createThemeRepository(port, builtins);
  const first = await repository.loadThemeDocument("blivechat-default");
  const second = await repository.loadThemeDocument("blivechat-default");
  first.settings.showGiftName = true;
  first.styles.customCss = ".gift { display: none; }";
  assert.equal(second.settings.showGiftName, false);
  assert.equal(second.styles.customCss, "");
  await repository.saveThemeDocument(first);
  assert.equal((await repository.loadThemeDocument(first.themeId)).styles.customCss, ".gift { display: none; }");
  assert.equal(second.styles.customCss, "");
  assert.equal(builtins.find(theme => theme.themeId === first.themeId).styles.customCss, "");

  const custom = {
    ...second,
    themeId: "blivechat-custom",
    origin: "custom",
    permissions: { update: true, saveAs: true, delete: true },
  };
  await repository.saveThemeDocument(custom);
  assert.equal(stored.get("blivechat-custom").mode, "blivechat");
});
