import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultEventStyleSettings } from "../src/eventStyleSettings.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../src/eventDisplaySettings.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { projectNativeTheme } from "../src/themes/nativeThemeProjection.ts";
import { resolveLiveNativeThemePresentation } from "../src/themes/nativeThemeTargetPresentation.ts";
import { baseRelativeNativeLength, fixedNativeLength, resolveNativeLength } from "../src/themes/nativeComponentAppearance.ts";

test("现场主题投影不改写回看使用的默认设置", () => {
  const reviewStyle = createDefaultEventStyleSettings();
  const reviewDisplay = structuredClone(DEFAULT_EVENT_DISPLAY_PREFERENCES);
  const defaults = { eventFontSize: 18, displayPreferences: reviewDisplay, eventStyleSettings: reviewStyle };
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.display.baseFontSize = 28;
  theme.settings.display.showTimestamp = true;
  theme.settings.fontFamily = "Microsoft YaHei UI";

  const live = resolveLiveNativeThemePresentation(defaults, projectNativeTheme(theme));

  assert.equal(live.eventFontSize, 28);
  assert.equal(live.displayPreferences.showTimestamp, true);
  assert.equal(live.eventStyleSettings.fontFamily, "Microsoft YaHei UI");
  assert.equal(defaults.eventFontSize, 18);
  assert.equal(reviewDisplay.showTimestamp, DEFAULT_EVENT_DISPLAY_PREFERENCES.showTimestamp);
  assert.equal(reviewStyle.fontFamily, createDefaultEventStyleSettings().fontFamily);
});

test("主题基准字号改变时只重算相对字号，固定像素保持原值", () => {
  assert.equal(resolveNativeLength(baseRelativeNativeLength(14 / 16), 20), 17.5);
  assert.equal(resolveNativeLength(fixedNativeLength(14), 20), 14);
});

test("目标显示缩放独立于主题数值并支持 100%、125% 和 150%", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.display.baseFontSize = 16;
  const projection = projectNativeTheme(theme);
  const defaults = {
    eventFontSize: 18,
    displayPreferences: structuredClone(DEFAULT_EVENT_DISPLAY_PREFERENCES),
    eventStyleSettings: createDefaultEventStyleSettings(),
  };

  assert.equal(resolveLiveNativeThemePresentation(defaults, projection, 1).displayScale, 1);
  assert.equal(resolveLiveNativeThemePresentation(defaults, projection, 1.25).displayScale, 1.25);
  assert.equal(resolveLiveNativeThemePresentation(defaults, projection, 1.5).displayScale, 1.5);
  assert.equal(resolveLiveNativeThemePresentation(defaults, projection, 1.5).eventFontSize, 16);
});
