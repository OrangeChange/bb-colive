import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BUILTIN_THEME_CATALOG, createCatalogThemes, resolveCatalogRuntimeAssets } from "../src/themes/builtinThemeCatalog.ts";
import { createThemeRepository } from "../src/themes/themeRepository.ts";
import { applyThemeAssetUrls } from "../src/themes/themeAssets.ts";

test("全部目录CSS能够通过资源解析", () => {
  for (const document of createCatalogThemes()) {
    const entry = BUILTIN_THEME_CATALOG.find(item => item.id === document.themeId);
    document.styles.baseCss = fs.readFileSync(`resources/theme-catalog/${entry.file ?? entry.id}.css`, "utf8");
    assert.doesNotThrow(() => applyThemeAssetUrls(document, new Map()), entry.id);
  }
});

test("目录收录25款追加主题，跨格式同名主题保持独立", () => {
  const documents = createCatalogThemes();
  assert.equal(documents.length, 25);
  assert.equal(new Set(documents.map(item => item.themeId)).size, 25);
  assert.deepEqual(Object.fromEntries(["blivechat", "blivechat-open", "laplace"].map(mode => [mode, documents.filter(item => item.mode === mode).length])), { blivechat: 2, "blivechat-open": 6, laplace: 17 });
  for (const document of documents) {
    assert.deepEqual(document.permissions, { update: false, saveAs: true, delete: false });
    assert.equal(document.styles.customCss, "");
    const entry = BUILTIN_THEME_CATALOG.find(item => item.id === document.themeId);
    assert.ok(fs.statSync(`resources/theme-catalog/${entry.file ?? entry.id}.css`).size > 0);
  }
});

test("运行时以资源地址加载目录字体，草稿替换仍使用当前字节", async () => {
  const previous = globalThis.location;
  globalThis.location = { origin: "http://127.0.0.1:1437" };
  const document = { ...createCatalogThemes()[0], assets: [{ id: "assets/catalog-1.bin", path: "assets/catalog-1.bin", name: "字体", mediaType: "font/woff2" }] };
  let reads = 0;
  try {
    const urls = await resolveCatalogRuntimeAssets(document, {}, async () => { reads++; return new Uint8Array([1]); });
    assert.match(urls.get("assets/catalog-1.bin"), /\/theme-assets\/blivechat-classic\/catalog-1.bin\?revision=1$/);
    assert.equal(reads, 0);
    const changed = await resolveCatalogRuntimeAssets(document, { "assets/catalog-1.bin": new Uint8Array([2]) }, async () => new Uint8Array([2]));
    assert.equal(changed.get("assets/catalog-1.bin"), "data:font/woff2;base64,Ag==");
    const copy = await resolveCatalogRuntimeAssets({ ...document, origin: "custom", themeId: "copy" }, {}, async () => { throw Error("不应内嵌字体"); });
    assert.match(copy.get("assets/catalog-1.bin"), /\/theme-assets\/copy\/catalog-1.bin\?revision=1$/);
  } finally { globalThis.location = previous; }
});
