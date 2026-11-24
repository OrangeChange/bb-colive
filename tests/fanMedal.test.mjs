import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const palettePath = `${root}/src/components/fanMedal.ts`;
const badgePath = `${root}/src/components/FanMedalBadge.tsx`;
const typesSource = readFileSync(`${root}/src/protocol/types.ts`, "utf8");
const adapterSource = readFileSync(`${root}/src/protocol/adapter.ts`, "utf8");

test("固定粉丝牌色阶覆盖图片中的 1-10 到 61+ 分档", () => {
  const source = existsSync(palettePath) ? readFileSync(palettePath, "utf8") : "";
  for (const color of [
    "#5762A799",
    "#C770A499",
    "#3FB4F699",
    "#4C7DFF99",
    "#A773F199",
    "#EC4F6E99",
    "#F5832FCC",
  ]) {
    assert.match(source, new RegExp(color.replace(/[#$]/g, "\\$&")));
  }
});

test("未点亮粉丝牌使用固定灰色方案", () => {
  const source = existsSync(palettePath) ? readFileSync(palettePath, "utf8") : "";
  assert.match(source, /#919298CC/);
  assert.match(source, /isLighted\s*===\s*false|!isLighted/);
});

test("粉丝牌模型保留是否点亮状态，并由统一组件渲染", () => {
  assert.match(typesSource, /isLighted\?:\s*boolean/);
  const source = existsSync(badgePath) ? readFileSync(badgePath, "utf8") : "";
  assert.match(source, /getFanMedalPalette/);
  assert.match(source, /border-0/);
  assert.match(source, /rounded-full/);
});

test("粉丝牌使用与身份徽章一致的紧凑尺寸", () => {
  const source = existsSync(badgePath) ? readFileSync(badgePath, "utf8") : "";
  assert.match(source, /h-\[18px\]/);
  assert.match(source, /px-1(?:\s|\")/);
  assert.match(source, /ui-type-micro/);
});

test("粉丝牌名称与等级之间使用空格而不是中点", () => {
  const source = existsSync(badgePath) ? readFileSync(badgePath, "utf8") : "";
  assert.doesNotMatch(source, />·\{medal\.level\}</);
  assert.match(source, /gap-1/);
  assert.match(source, /medal\.name[\s\S]*medal\.level/);
});

test("适配器从弹幕、V1 礼物和 V2 礼物保留粉丝牌点亮状态", () => {
  assert.match(adapterSource, /isLighted/);
  assert.match(adapterSource, /is_light/);
  assert.match(adapterSource, /isLight/);
});
