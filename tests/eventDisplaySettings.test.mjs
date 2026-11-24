import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("全局事件显示设置包含字号、身份和礼物图片开关", () => {
  const source = read("src/eventDisplaySettings.ts");
  const general = read("src/generalSettings.ts");
  for (const name of [
    "showAvatar",
    "showGuardIdentity",
    "showAdminIdentity",
    "showAnchorIdentity",
    "showFanMedal",
    "showGiftImage",
  ]) {
    assert.match(source, new RegExp(name));
  }
  for (const name of ["eventFontSize", "windowEventFontSize"]) assert.match(general, new RegExp(name));
  assert.doesNotMatch(read("src/components/SettingsPanel.tsx"), /大表情尺寸|自定义大表情宽度/);
  assert.match(source, /DEFAULT_EVENT_FONT_SIZE\s*=\s*16/);
});

test("荣耀等级默认隐藏，可独立打开，旧设置缺少该字段时仍保持关闭", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  const panel = read("src/components/NativeThemeBasicSettings.tsx");
  const eventRow = read("src/components/EventRow.tsx");
  assert.equal(settings.DEFAULT_EVENT_DISPLAY_PREFERENCES.showHonorLevel, false);
  assert.equal(settings.normalizeEventDisplayPreferences({}).showHonorLevel, false);
  assert.equal(settings.normalizeEventDisplayPreferences({ showHonorLevel: true }).showHonorLevel, true);
  assert.match(panel, /\["showHonorLevel", "荣耀勋章"\]/);
  assert.match(eventRow, /preferences\.showHonorLevel[\s\S]*\{user\.wealthLevel\}/);
  assert.match(eventRow, /getWealthMedalAssetPath\(user\.wealthLevel\)/);
  assert.match(eventRow, /src=\{wealthLevelAssetPath\}/);
  assert.doesNotMatch(eventRow, /src=\{user\.wealthIconUrl\}/);
  assert.match(eventRow, /alt=\{`荣耀等级 \$\{user\.wealthLevel\}级`\}/);
});

test("榜单排名默认隐藏，可由设置打开，旧设置缺少该字段时仍保持关闭", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  const panel = read("src/components/NativeThemeBasicSettings.tsx");
  assert.equal(settings.DEFAULT_EVENT_DISPLAY_PREFERENCES.showCurrentRank, false);
  assert.equal(settings.normalizeEventDisplayPreferences({}).showCurrentRank, false);
  assert.equal(settings.normalizeEventDisplayPreferences({ showCurrentRank: true }).showCurrentRank, true);
  assert.match(panel, /\["showCurrentRank", "当前排行"\]/);
});

test("大航海身份样式默认图标，旧设置和无效值保持图标模式", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  const panel = read("src/components/NativeThemeBasicSettings.tsx");
  assert.equal(settings.DEFAULT_EVENT_DISPLAY_PREFERENCES.guardIdentityDisplayMode, "icon");
  assert.equal(settings.normalizeEventDisplayPreferences({}).guardIdentityDisplayMode, "icon");
  assert.equal(settings.normalizeEventDisplayPreferences({ guardIdentityDisplayMode: "text" }).guardIdentityDisplayMode, "text");
  assert.equal(settings.normalizeEventDisplayPreferences({ guardIdentityDisplayMode: "unexpected" }).guardIdentityDisplayMode, "icon");
  assert.match(panel, /大航海身份形式/);
});

test("大表情判断只保留为回看筛选使用的纯函数，不属于全局显示偏好", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  assert.equal(Object.prototype.hasOwnProperty.call(settings.DEFAULT_EVENT_DISPLAY_PREFERENCES, "showBigEmote"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(settings.normalizeEventDisplayPreferences({ showBigEmote: false }), "showBigEmote"), false);
  assert.equal(settings.shouldShowBigEmote(undefined, false), true);
  assert.equal(settings.shouldShowBigEmote({ url: "https://example.com/big.png" }, false), false);
  assert.equal(settings.shouldShowBigEmote({ url: "https://example.com/big.png" }, true), true);
});

test("事件显示设置提供共享的事件间距选项，并保持默认值为6px", () => {
  const source = read("src/eventDisplaySettings.ts");
  const panel = read("src/components/SettingsPanel.tsx");
  const editor = read("src/components/NativeThemeVisualEditor.tsx");
  assert.match(source, /eventSpacing/);
  assert.match(source, /DEFAULT_EVENT_SPACING\s*=\s*6/);
  assert.match(editor, /ThemeVisualPropertyField/);
  const fields = read("src/components/ThemeVisualPropertyField.tsx");
  for (const property of ["paddingX", "paddingY", "gap"]) assert.match(fields, new RegExp(`${property}:`));
});

test("粉丝牌筛选只保留当前主播且可隐藏未点亮粉丝牌", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  const current = { name: "本场牌", level: 5, isCurrentRoom: true, isLighted: true };
  const other = { name: "其他牌", level: 5, isCurrentRoom: false, isLighted: true };
  const unlit = { name: "未点亮", level: 1, isCurrentRoom: true, isLighted: false };

  assert.equal(settings.shouldShowFanMedal(current, { ...settings.DEFAULT_EVENT_DISPLAY_PREFERENCES, onlyAnchorFanMedal: true }), true);
  assert.equal(settings.shouldShowFanMedal(other, { ...settings.DEFAULT_EVENT_DISPLAY_PREFERENCES, onlyAnchorFanMedal: true }), false);
  assert.equal(settings.shouldShowFanMedal(unlit, { ...settings.DEFAULT_EVENT_DISPLAY_PREFERENCES, hideUnlitFanMedal: true }), false);
  assert.equal(settings.shouldShowFanMedal({ ...current, isLighted: undefined }, { ...settings.DEFAULT_EVENT_DISPLAY_PREFERENCES, hideUnlitFanMedal: true }), true);
});

test("回看大表情固定使用小表情大小", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
});

test("事件间距默认为6px，并将输入限制在 0 到 16px", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  assert.equal(settings.DEFAULT_EVENT_SPACING, 6);
  assert.equal(settings.clampEventSpacing(-1), 0);
  assert.equal(settings.clampEventSpacing(7), 7);
  assert.equal(settings.clampEventSpacing(17), 16);
  assert.equal(settings.clampEventSpacing(Number.NaN), 6);
  assert.equal(settings.normalizeEventDisplayPreferences({ eventSpacing: 5 }).eventSpacing, 5);
  assert.equal(settings.normalizeEventDisplayPreferences({ eventSpacing: "5" }).eventSpacing, 6);
});

test("事件显示提供默认内边距和安全的动画预设", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  assert.equal(settings.DEFAULT_EVENT_PADDING, 8);
  assert.equal(settings.clampEventPadding(-1), 0);
  assert.equal(settings.clampEventPadding(7), 7);
  assert.equal(settings.clampEventPadding(17), 16);
  assert.equal(settings.clampEventPadding(Number.NaN), 8);
  assert.equal(settings.normalizeEventDisplayPreferences({ eventPadding: 9 }).eventPadding, 9);
  assert.equal(settings.normalizeEventDisplayPreferences({ eventAnimationPreset: "slide" }).eventAnimationPreset, "slide");
  assert.equal(settings.normalizeEventDisplayPreferences({ eventAnimationPreset: "unexpected" }).eventAnimationPreset, "fade");
  assert.deepEqual(settings.EVENT_ANIMATION_PRESET_OPTIONS.map((item) => item.value), ["none", "fade", "lift", "scale", "slide"]);
});

test("事件动画持续时长可调，并让退出动画与进入动画一致", async () => {
  const settings = await import("../src/eventDisplaySettings.ts");
  assert.equal(settings.DEFAULT_EVENT_ANIMATION_DURATION_MS, 200);
  assert.equal(settings.EVENT_ANIMATION_DURATION_STEP_MS, 50);
  assert.equal(settings.normalizeEventAnimationDuration(-1), 0);
  assert.equal(settings.normalizeEventAnimationDuration(333), 333);
  assert.equal(settings.normalizeEventAnimationDuration(10_000), 10_000);
  assert.equal(settings.normalizeEventDisplayPreferences({ eventAnimationDurationMs: 333 }).eventAnimationDurationMs, 333);
  assert.equal(settings.getEventAnimationDuration("none", 600), 0);
  assert.equal(settings.getEventAnimationDuration("slide", 240), 240);
  assert.equal(settings.getEventAnimationExitDuration("slide", 240), settings.getEventAnimationDuration("slide", 240));
  assert.equal(settings.getEventAnimationExitDuration("slide", 0.5), 0.5);
});

test("现场和副窗口不再从独立大表情宽度生成渲染值", () => {
  const presentation = read("src/themes/nativeThemeTargetPresentation.ts");
  const preview = read("src/components/stylePreviewContext.ts");
  const area = read("src/eventAreaStyleConfig.ts");
  assert.doesNotMatch(area, /bigEmoteWidth|bigEmoteSize|--big-emote-size:/);
  const css = read("src/eventStyle.css");
  const largeEmote = css.match(/\.event \.big-emote\s*\{([^}]+)\}/)?.[1];
  assert.ok(largeEmote);
  assert.match(largeEmote, /var\(--big-emote-size, calc\(var\(--event-font-size, 16px\) \* 40 \/ 16\)\)/);
  assert.doesNotMatch(presentation, /bigEmoteWidth/);
  assert.doesNotMatch(presentation, /projection\.display\.bigEmoteWidth/);
  assert.doesNotMatch(preview, /input\.windowBigEmoteWidth|resolveReviewBigEmoteWidth/);
});

test("回看不再提供大表情尺寸设置", () => {
  const editor = read("src/components/NativeThemeBasicSettings.tsx");
  assert.doesNotMatch(editor, /label="大表情尺寸"|自定义大表情宽度|reviewBigEmoteMode === "custom"/);
});

test("通用设置状态提供现场和副窗口的分类级恢复接口", () => {
  const general = read("src/generalSettings.ts");
  assert.match(general, /resetLive: \(\) => void/);
  assert.match(general, /resetWindows: \(\) => void/);
  assert.match(general, /resetLive: \(\) => set\(/);
  assert.match(general, /resetWindows: \(\) => set\(/);
});

test("事件显示偏好通过主桥接同步到弹幕窗和礼物窗", () => {
  const app = readApplicationSources();
  const display = read("src/windows/displayBridge.ts");
  const gift = read("src/windows/giftBridge.ts");
  const windowSource = read("src/windows/FloatingEventWindow.tsx");
  assert.match(app, /setDisplayWindowPreferences/);
  assert.match(app, /setGiftWindowPreferences/);
  assert.match(display, /EVENT_WINDOW_PREFERENCES_EVENT/);
  assert.match(gift, /EVENT_WINDOW_PREFERENCES_EVENT/);
  assert.match(windowSource, /listen<.*EventWindowPreferences/);
  assert.match(windowSource, /displayPreferences/);
});

test("礼物单价阈值通过窗口偏好同步到礼物窗", () => {
  const app = readApplicationSources();
  const preferences = read("src/windows/eventWindowPreferences.ts");
  const giftBridge = read("src/windows/giftBridge.ts");
  const windowSource = read("src/windows/FloatingEventWindow.tsx");
  const giftWindowModel = read("src/windows/giftWindowModel.ts");
  assert.match(app, /giftThreshold/);
  assert.match(preferences, /giftThreshold/);
  assert.match(giftBridge, /giftThreshold/);
  assert.match(windowSource, /isGiftWindowEventVisible/);
  assert.match(giftWindowModel, /isPaidEventVisibleAtThreshold/);
});
