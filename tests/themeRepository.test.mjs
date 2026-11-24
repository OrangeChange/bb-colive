import test from "node:test";
import assert from "node:assert/strict";
import { createThemeRepository } from "../src/themes/themeRepository.ts";
import { createCustomThemeDocument, toThemeSummary } from "../src/themes/themeTypes.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import fs from "node:fs";

function memoryPort(initial = []) {
  const documents = new Map(initial.map(document => [document.themeId, structuredClone(document)]));
  const calls = { list: 0, read: 0, write: 0, remove: 0, lastWriteOptions: undefined };
  return {
    calls,
    async list() { calls.list += 1; return [...documents.values()].map(({ settings: _s, styles: _c, assets: _a, permissions: _p, metadata, ...item }) => ({ ...item, ...metadata })); },
    async read(themeId) { calls.read += 1; return structuredClone(documents.get(themeId)); },
    async write(document, options) { calls.write += 1; calls.lastWriteOptions = structuredClone(options); documents.set(document.themeId, structuredClone(document)); },
    async remove(themeId) { calls.remove += 1; documents.delete(themeId); },
  };
}

test("主题摘要只为有远程来源的主题提供更新网址", () => {
  const document = createBuiltinNativeTheme("native-default");
  assert.equal(toThemeSummary(document).sourceUrl, undefined);
  document.metadata.sourceUrl = "https://example.com/style.css";
  assert.equal(toThemeSummary(document).sourceUrl, document.metadata.sourceUrl);
});

test("旧CSS主题的空设置在读取时补齐，保留CSS且不改写原文件", async () => {
  const document = createCustomThemeDocument({ themeId: "old-css", mode: "native", name: "旧CSS" });
  document.styles.customCss = ".message{font-size:23px}";
  const port = memoryPort([document]);
  const repository = createThemeRepository(port, []);
  const loaded = await repository.loadThemeDocument("old-css");
  assert.equal(loaded.settings.fontFamily, "MiSans");
  assert.equal(loaded.styles.customCss, document.styles.customCss);
  assert.equal(port.calls.write, 0);
  assert.deepEqual((await port.read("old-css")).settings, {});
});

test("主题列表只读取轻量索引", async () => {
  const port = memoryPort([createCustomThemeDocument({ themeId: "one", mode: "native", name: "一" })]);
  const repository = createThemeRepository(port, [createBuiltinNativeTheme("native-default")]);
  const summaries = await repository.listThemeSummaries();
  assert.deepEqual(summaries.map(item => item.themeId), ["one"]);
  assert.equal(port.calls.list, 1);
  assert.equal(port.calls.read, 0);
});

test("程序目录中的内置主题文件优先于代码默认值且列表不重复", async () => {
  const packaged = createBuiltinNativeTheme("native-default");
  packaged.metadata = { ...packaged.metadata, version: "1.1.0" };
  const port = memoryPort([packaged]);
  const repository = createThemeRepository(port, [createBuiltinNativeTheme("native-default")]);

  const summaries = await repository.listThemeSummaries();
  const loaded = await repository.loadThemeDocument("native-default");

  assert.deepEqual(summaries.map(item => item.themeId), ["native-default"]);
  assert.equal(loaded.metadata.version, "1.1.0");
});

test("发布目录中的原生默认主题与程序默认值一致", () => {
  const root = "src-tauri/style-distribution/native/原生默认";
  const manifest = JSON.parse(fs.readFileSync(`${root}/theme.json`, "utf8"));
  const settings = JSON.parse(fs.readFileSync(`${root}/settings.json`, "utf8"));
  const builtin = createBuiltinNativeTheme("native-default");
  assert.deepEqual(manifest, {
    themeId: builtin.themeId,
    mode: builtin.mode,
    origin: builtin.origin,
    metadata: builtin.metadata,
    assets: builtin.assets,
    revision: builtin.revision,
  });
  assert.deepEqual(settings, builtin.settings);
});

test("保存主题把资源变化和另存来源传到同一次存储写入", async () => {
  const port = memoryPort();
  const repository = createThemeRepository(port, []);
  const custom = createCustomThemeDocument({ themeId: "copy", mode: "native", name: "副本" });
  await repository.saveThemeDocument(custom, {
    sourceThemeId: "source",
    assetChanges: { "assets/new.png": new Uint8Array([1]), "assets/old.png": null },
  });
  assert.equal(port.calls.lastWriteOptions.sourceThemeId, "source");
  assert.deepEqual([...port.calls.lastWriteOptions.assetChanges["assets/new.png"]], [1]);
  assert.equal(port.calls.lastWriteOptions.assetChanges["assets/old.png"], null);
});

test("内置主题可保存个人调整且不能删除，自定义主题可保存删除", async () => {
  const port = memoryPort();
  const repository = createThemeRepository(port, [createBuiltinNativeTheme("native-default")]);
  await repository.saveThemeDocument(createBuiltinNativeTheme("native-default"));
  await assert.rejects(() => repository.deleteCustomTheme("native-default"), /内置主题不能删除/);
  const custom = createCustomThemeDocument({ themeId: "custom", mode: "native", name: "自定义" });
  await repository.saveThemeDocument(custom);
  assert.equal(port.calls.write, 2);
  await repository.deleteCustomTheme("custom");
  assert.equal(port.calls.remove, 1);
});

test("缺失的内置文件不以代码默认值掩盖", async () => {
 const port = memoryPort();
 const repository = createThemeRepository(port, [createBuiltinNativeTheme("native-default")]);
 assert.deepEqual(await repository.listThemeSummaries(), []);
 await assert.rejects(repository.loadThemeDocument("native-default"), /主题不存在/);
});
