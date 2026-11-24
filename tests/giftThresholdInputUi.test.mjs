import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("最低显示金额在现场工具栏和设置中复用同一个组件", () => {
  const input = read("src/components/GiftThresholdInput.tsx");
  const toolbar = read("src/components/LiveFilterBar.tsx");
  const settings = read("src/components/SettingsPanel.tsx");
  assert.match(input, /function GiftThresholdInput|export function GiftThresholdInput/);
  assert.match(input, /type="number"/);
  assert.match(input, /step/);
  assert.match(toolbar, /<GiftThresholdInput/);
  assert.match(settings, /<GiftThresholdInput/);
});

test("最低显示金额使用统一的数值归一化规则", async () => {
  const threshold = await import("../src/giftThreshold.ts");
  assert.equal(threshold.GIFT_THRESHOLD_INPUT_STEP, 0.5);
  assert.equal(threshold.normalizeGiftThreshold(-2), 0);
  assert.equal(threshold.normalizeGiftThreshold(12.345), 12.35);
  assert.equal(threshold.normalizeGiftThreshold(Number.NaN), 0);
});

test("最低显示金额输入框使用半元步进", () => {
  const input = read("src/components/GiftThresholdInput.tsx");
  assert.match(input, /GIFT_THRESHOLD_INPUT_STEP/);
  assert.match(input, /stepGiftThreshold/);
  assert.match(input, /step="any"/);
});

test("礼物阈值箭头基于当前值增减半元", async () => {
  const { stepGiftThreshold } = await import("../src/giftThreshold.ts");
  assert.equal(stepGiftThreshold(0.01, 1), 0.51);
  assert.equal(stepGiftThreshold(0.51, 1), 1.01);
  assert.equal(stepGiftThreshold(0.51, -1), 0.01);
  assert.equal(stepGiftThreshold(0.01, -1), 0);
});

test("最低显示金额明确区分单件和累计口径", () => {
  const input = read("src/components/GiftThresholdInput.tsx");
  assert.match(input, /mode === "cumulative"/);
  assert.match(input, /事件总额 ≥/);
  assert.match(input, /最低显示金额/);
});

test("礼物阈值数字输入明确使用数字字体", () => {
  const styles = read("src/App.css");
  assert.match(styles, /\.gift-threshold-input-field\s*\{[\s\S]*?font-family:\s*var\(--font-mono\)/);
});

test("紧凑礼物阈值输入框能容纳两位数两位小数", () => {
  const styles = read("src/App.css");
  assert.match(styles, /\.gift-threshold-input\.is-compact \.gift-threshold-input-control\s*\{[\s\S]*?width:\s*88px/);
});
