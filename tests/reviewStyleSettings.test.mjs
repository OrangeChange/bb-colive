import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  DEFAULT_REVIEW_STYLE_SETTINGS,
  normalizeReviewStyleSettings,
  reviewDisplayPreferences,
} from "../src/reviewStyleSettings.ts";

test("回看默认样式独立且时间不属于显示开关", () => {
  const value = normalizeReviewStyleSettings(undefined);
  assert.equal(value.fontSize, 14);
  assert.equal(value.uniformTextColor, false);
  assert.equal(value.showLevelAndRank, true);
  assert.equal("showTime" in value, false);
  assert.notEqual(value, DEFAULT_REVIEW_STYLE_SETTINGS);
});
test("合并开关覆盖对应部件，不隐藏用户表情或改变头像框偏好", () => {
  const value = normalizeReviewStyleSettings({
    showAvatar: false,
    showAvatarFrame: true,
    showIcons: false,
    showLevelAndRank: false,
    showGuardIdentity: false,
  });
  const display = reviewDisplayPreferences(value);
  assert.equal(display.showAvatar, false);
  assert.equal(value.showAvatarFrame, true);
  assert.equal(display.showGiftImage, false);
  assert.equal(display.showEventIcon, false);
  assert.equal(display.showHonorLevel, false);
  assert.equal(display.showCurrentRank, false);
  assert.equal(display.showGuardIdentity, false);
  assert.equal(display.showAdminIdentity, true);
});
test("统一文字颜色使用已确认的三档明暗值", () => {
  const css = readFileSync(
    new URL("../src/archiveEventStyle.css", import.meta.url),
    "utf8",
  ).replace(/\s/g, "");
  for (const value of [
    "--review-name:rgb(7,16,29)",
    "--review-body:rgb(25,39,59)",
    "--review-secondary:rgb(75,85,99)",
    "--review-name:rgb(222,225,229)",
    "--review-body:rgb(205,212,221)",
    "--review-secondary:rgb(170,180,193)",
  ])
    assert.ok(css.includes(value));
});

test('回看价格梯度开关独立保存，旧设置保持固定配色', () => {
  assert.equal(normalizeReviewStyleSettings().usePriceGradient, false);
  assert.equal(normalizeReviewStyleSettings({ usePriceGradient: true }).usePriceGradient, true);
  assert.equal(normalizeReviewStyleSettings({ usePriceGradient: 'true' }).usePriceGradient, false);
});
