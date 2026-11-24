import test from "node:test";
import assert from "node:assert/strict";
import { applyThemeColorPickerChange, inferThemeColorFormat, parseThemeColor, serializeThemeColor } from "../src/components/themeColorValue.ts";

test("颜色值统一解析 HEX RGBA 与 HSLA 并保留透明度", () => {
  assert.deepEqual(parseThemeColor("#ff804080"), { r: 255, g: 128, b: 64, a: 128 / 255 });
  assert.deepEqual(parseThemeColor("rgba(255, 128, 64, 0.5)"), { r: 255, g: 128, b: 64, a: 0.5 });
  assert.deepEqual(parseThemeColor("hsla(20, 100%, 62.5%, 0.5)"), { r: 255, g: 128, b: 64, a: 0.5 });
});

test("颜色值按选择格式输出且 HEX 使用八位透明通道", () => {
  const color = { r: 255, g: 128, b: 64, a: 0.5 };
  assert.equal(serializeThemeColor(color, "hex"), "#ff804080");
  assert.equal(serializeThemeColor(color, "rgba"), "rgba(255, 128, 64, 0.5)");
  assert.equal(serializeThemeColor(color, "hsla"), "hsla(20.1, 100%, 62.55%, 0.5)");
});

test("颜色格式识别不把透明关键字伪装成具体格式", () => {
  assert.equal(inferThemeColorFormat("#ffffff"), "hex");
  assert.equal(inferThemeColorFormat("rgba(1, 2, 3, 0.4)"), "rgba");
  assert.equal(inferThemeColorFormat("hsl(20, 30%, 40%)"), "hsla");
  assert.equal(inferThemeColorFormat("transparent"), undefined);
});

test("透明状态操作色板会恢复可见且透明度操作仍使用选定值", () => {
  const transparent = { r: 255, g: 255, b: 255, a: 0 };
  const selected = { r: 140, g: 66, b: 66, a: 0 };
  assert.deepEqual(applyThemeColorPickerChange(transparent, selected, true), { ...selected, a: 1 });
  assert.deepEqual(applyThemeColorPickerChange(transparent, { ...selected, a: 0.35 }, false), { ...selected, a: 0.35 });
  assert.deepEqual(applyThemeColorPickerChange({ ...selected, a: 0.4 }, { ...selected, a: 0.4 }, true), { ...selected, a: 0.4 });
});

test('不透明色板输出 RGB 和 HSL，不包含 A 通道', () => {
  const color={r:255,g:128,b:64,a:0.5};
  assert.equal(serializeThemeColor(color,'rgba',true),'rgb(255, 128, 64)');
  assert.equal(serializeThemeColor(color,'hsla',true),'hsl(20.1, 100%, 62.55%)');
  assert.equal(serializeThemeColor(color,'hex',true),'#ff8040');
});
