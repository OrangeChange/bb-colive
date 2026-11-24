import test from "node:test";
import assert from "node:assert/strict";
import { createCustomThemeDocument } from "../src/themes/themeTypes.ts";
import { createThemeFromCss, installImportedThemePackage } from "../src/themes/themeImport.ts";

function importedTheme(revision = 99) {
  const document = createCustomThemeDocument({ themeId: "theme-a", mode: "native", name: "导入主题" });
  document.revision = revision;
  document.assets = [{ id: "cover", name: "封面", path: "cover.webp", mediaType: "image/webp" }];
  return document;
}

test("覆盖导入按本地修订递增并原子保存资源但不发布运行目标", async () => {
  const saves = [];
  const publications = [];
  let discarded = "";
  const result = await installImportedThemePackage(
    { document: importedTheme(), assets: { "cover.webp": new Uint8Array([1, 2, 3]) } },
    {
      load: async () => ({ ...importedTheme(), revision: 4 }),
      save: async (document, options) => { saves.push({ document: structuredClone(document), options }); },
      bindings: async () => [
        { targetId: "live", targetKind: "live", themeId: "theme-a", revision: 4 },
        { targetId: "obs-one", targetKind: "obs", themeId: "theme-a", revision: 4 },
      ],
      publish: async (document, binding) => { publications.push([document.revision, binding.targetId]); },
      discardSession: themeId => { discarded = themeId; },
    },
  );

  assert.equal(result.document.revision, 5);
  assert.equal(saves.length, 1);
  assert.deepEqual([...saves[0].options.assetChanges["cover.webp"]], [1, 2, 3]);
  assert.deepEqual(publications, []);
  assert.equal(discarded, "theme-a");
});

test("首次导入建立本地修订一", async () => {
  let savedRevision = 0;
  const result = await installImportedThemePackage(
    { document: importedTheme(12), assets: {} },
    {
      load: async () => { throw new Error("missing"); },
      save: async document => { savedRevision = document.revision; },
      bindings: async () => [],
      publish: async () => {},
      discardSession: () => {},
    },
  );
  assert.equal(savedRevision, 1);
  assert.equal(result.document.revision, 1);
});

test("四种格式的 CSS 文件统一写入基础层", () => {
  for (const mode of ["native", "blivechat", "blivechat-open", "laplace"]) {
  const document = createThemeFromCss({
    themeId: "css-one",
    mode,
    name: "本地样式",
    css: ".event { color: red; }",
    importedAt: "2026-10-23T00:00:00.000Z",
  });
  assert.equal(document.mode, mode);

  assert.equal(document.styles.baseCss, ".event { color: red; }");
  assert.equal(document.styles.visualCss, "");
  assert.equal(document.styles.customCss, "");
  assert.equal(document.metadata.version, "");
  assert.equal(document.metadata.importedAt, "2026-10-23T00:00:00.000Z");
  }
});

test("错误CSS在创建主题之前提示语法错误", () => {
  for (const mode of ["native", "blivechat", "blivechat-open", "laplace"]) {
    assert.throws(() => createThemeFromCss({
      themeId: "invalid-css", mode, name: "无效样式",
      css: ".message { color:", importedAt: "2026-11-05T00:00:00.000Z",
    }), /Unclosed block/);
  }
});
