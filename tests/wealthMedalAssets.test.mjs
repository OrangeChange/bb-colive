import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const helperUrl = new URL("../src/wealthMedalAssets.ts", import.meta.url);
let getWealthMedalAssetPath;
let maxBundledWealthMedalLevel;
if (existsSync(fileURLToPath(helperUrl))) {
  const helper = await import(helperUrl.href);
  getWealthMedalAssetPath = helper.getWealthMedalAssetPath;
  maxBundledWealthMedalLevel = helper.MAX_BUNDLED_WEALTH_MEDAL_LEVEL;
}

test("每个已核验并本地打包的荣耀等级都映射到对应图片", () => {
  assert.equal(typeof getWealthMedalAssetPath, "function");
  assert.equal(maxBundledWealthMedalLevel, 80);

  const assetsDir = fileURLToPath(new URL("../public/wealth-levels/", import.meta.url));
  assert.ok(existsSync(assetsDir), "本地荣耀等级图片目录应存在");
  const files = readdirSync(assetsDir).sort();
  assert.equal(files.length, 80, "应包含已核验的 1–80 级图片");

  for (let level = 1; level <= maxBundledWealthMedalLevel; level += 1) {
    const expectedExtension = level === 80 ? "webp" : "png";
    const expectedPath = `/wealth-levels/${level}.${expectedExtension}`;
    assert.equal(getWealthMedalAssetPath(level), expectedPath);
    assert.ok(existsSync(new URL(`../public${expectedPath}`, import.meta.url)), `${level} 级图片应存在`);
  }
});

test("不支持的等级不生成图片路径", () => {
  assert.equal(typeof getWealthMedalAssetPath, "function");
  assert.equal(getWealthMedalAssetPath(undefined), undefined);
  assert.equal(getWealthMedalAssetPath(0), undefined);
  assert.equal(getWealthMedalAssetPath(80.5), undefined);
  assert.equal(getWealthMedalAssetPath(81), undefined);
});
