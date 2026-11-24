import test from "node:test";
import assert from "node:assert/strict";
import {
  applyEventWindowBehaviorPreferences,
  applyNativeThemeProjectionToWindowPreferences,
  DEFAULT_EVENT_WINDOW_PREFERENCES,
  normalizeEventWindowPreferences,
} from "../src/windows/eventWindowPreferences.ts";

test('副窗口同步昵称并在主题投影更新后保留昵称',()=>{
 const names={'100':'发送昵称'};
 const received=normalizeEventWindowPreferences({...DEFAULT_EVENT_WINDOW_PREFERENCES,userNicknames:names});
 const projected=applyNativeThemeProjectionToWindowPreferences(received,{
  settings:received.eventStyleSettings,display:{...received.display,baseFontSize:16},displayScale:1,
 });
 assert.deepEqual(received.userNicknames,names);
 assert.deepEqual(projected.userNicknames,names);
});

test('副窗口投影与同步快照保留原生价格梯度和时间设置',()=>{
 const settings={...DEFAULT_EVENT_WINDOW_PREFERENCES.eventStyleSettings,display:{usePriceGradient:true,showTimestamp:true},priceGradient:{types:{normal:true,blind:false,superchat:true},bands:[{id:'base',min:0}],colors:{}}};
 const projection={settings,display:{...DEFAULT_EVENT_WINDOW_PREFERENCES.display,baseFontSize:16,showTimestamp:true},displayScale:1};
 const projected=applyNativeThemeProjectionToWindowPreferences(DEFAULT_EVENT_WINDOW_PREFERENCES,projection);
 const received=normalizeEventWindowPreferences(projected);
 for(const value of [projected,received]){assert.deepEqual(value.eventStyleSettings.priceGradient,settings.priceGradient);assert.equal(value.eventStyleSettings.display.usePriceGradient,true);assert.equal(value.display.showTimestamp,true);}
});

test("显示投影保留主题间距且同步软件动画行为", async () => {
  const { resolveEventDisplayPreferences } = await import("../src/eventDisplaySettings.ts");
  const theme = { ...DEFAULT_EVENT_WINDOW_PREFERENCES.display, eventSpacing: 13, eventPadding: 11, showAvatar: false };
  const software = { ...DEFAULT_EVENT_WINDOW_PREFERENCES.display, eventSpacing: 2, eventPadding: 3, eventAnimationPreset: "slide", eventAnimationDurationMs: 480 };
  const result = resolveEventDisplayPreferences(theme, software);
  assert.equal(result.eventSpacing, 13);
  assert.equal(result.eventPadding, 11);
  assert.equal(result.showAvatar, false);
  assert.equal(result.eventAnimationPreset, "slide");
  assert.equal(result.eventAnimationDurationMs, 480);
});

test("副窗口保留主题尺寸，不套用软件旧控件的尺寸上限", () => {
  const current = DEFAULT_EVENT_WINDOW_PREFERENCES;
  const projection = {
    displayScale: 1,
    settings: current.eventStyleSettings,
    display: { ...current.display, baseFontSize: 28, eventSpacing: 23, eventPadding: 18 },
  };
  const result = applyNativeThemeProjectionToWindowPreferences(current, projection);
  assert.equal(result.display.eventSpacing, 23);
  assert.equal(result.display.eventPadding, 18);
});

test("副窗口配置完整映射全局显示设置及当前场景阈值", async () => {
  const { createEventWindowPreferences } = await import("../src/windows/eventWindowPreferences.ts");
  assert.equal(typeof createEventWindowPreferences, "function");
  const defaults = DEFAULT_EVENT_WINDOW_PREFERENCES;
  const display = { ...defaults.display, showHonorLevel: true, guardIdentityDisplayMode: "text" };
  const settings = {
    windowEventFontSize: 25, liveScrollDirection: "top", liveContentAlignment: "top",
    windowAppearance: defaults.appearance, eventExpiry: defaults.eventExpiry,
    mergeSameDanmu: true, sameDanmuWindowSeconds: 13, showGiftWindowEffect: true, showGuardWindowEffect: true,
    displayWindowFilters: defaults.displayFilters, eventDisplayPreferences: display,
    eventStyleSettings: defaults.eventStyleSettings,
  };
  assert.deepEqual(createEventWindowPreferences(settings, { giftThreshold: 8, giftThresholdMode: "cumulative" }), {
    ...defaults, fontSize: 25, scrollDirection: "top", giftThreshold: 8,
    giftThresholdMode: "cumulative", mergeSameDanmu: true, sameDanmuWindowSeconds: 13,
    showGiftEffect: true, showGuardEffect: true, display,
  });
});

test("副窗口默认使用单件价格阈值并能接收累计金额模式", () => {
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.giftThresholdMode, "unit");
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.scrollDirection, "bottom");
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.display.onlyGuardEntry, false);
  assert.equal(normalizeEventWindowPreferences({ giftThresholdMode: "cumulative" }).giftThresholdMode, "cumulative");
  assert.equal(normalizeEventWindowPreferences({ giftThresholdMode: "wrong" }).giftThresholdMode, "unit");
  assert.equal(normalizeEventWindowPreferences({ scrollDirection: "top" }).scrollDirection, "top");
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.eventExpiry.enabled, false);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.eventExpiry.seconds, 10);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.mergeSameDanmu, false);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.sameDanmuWindowSeconds, 8);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.displayFilters.danmu, true);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.displayFilters.interact, true);
  assert.equal(DEFAULT_EVENT_WINDOW_PREFERENCES.displayFilters.interactKinds.entry, true);
  assert.deepEqual(normalizeEventWindowPreferences({ eventExpiry: { enabled: true, seconds: 25 } }).eventExpiry, { enabled: true, seconds: 25 });
  assert.deepEqual(
    normalizeEventWindowPreferences({ mergeSameDanmu: true, sameDanmuWindowSeconds: 12 }),
    { ...DEFAULT_EVENT_WINDOW_PREFERENCES, mergeSameDanmu: true, sameDanmuWindowSeconds: 12 },
  );
  assert.equal(normalizeEventWindowPreferences({ sameDanmuWindowSeconds: 0 }).sameDanmuWindowSeconds, 1);
  assert.equal(normalizeEventWindowPreferences({ sameDanmuWindowSeconds: 999 }).sameDanmuWindowSeconds, 60);
  const filters = normalizeEventWindowPreferences({ displayFilters: { danmu: false, interactKinds: { like: false } } }).displayFilters;
  assert.equal(filters.danmu, false);
  assert.equal(filters.interactKinds.like, false);
  assert.equal(filters.interactKinds.follow, true);
});

test("副窗口收到合并设置后应立即更新事件处理快照", async () => {
  const preferencesRef = { current: DEFAULT_EVENT_WINDOW_PREFERENCES };
  const { applyEventWindowPreferences } = await import("../src/windows/eventWindowPreferences.ts");

  assert.equal(typeof applyEventWindowPreferences, "function");

  applyEventWindowPreferences(preferencesRef, {
    mergeSameDanmu: true,
    sameDanmuWindowSeconds: 8,
  });

  assert.equal(preferencesRef.current.mergeSameDanmu, true);
  assert.equal(preferencesRef.current.sameDanmuWindowSeconds, 8);
});

test("软件行为更新显示策略与动画但保留主题视觉字段", () => {
  const current = {
    ...DEFAULT_EVENT_WINDOW_PREFERENCES,
    displayScale: 1.25,
    fontSize: 20,
    display: {
      ...DEFAULT_EVENT_WINDOW_PREFERENCES.display,
      showAvatar: false,
      eventSpacing: 7,
      showAutoDanmaku: true,
      showPhoneNotVerified: false,
      onlyGuardEntry: false,
      eventAnimationPreset: "fade",
      eventAnimationDurationMs: 200,
    },
  };
  const incoming = {
    ...current,
    displayScale: 1,
    fontSize: 16,
    display: {
      ...current.display,
      showAvatar: true,
      eventSpacing: 0,
      showAutoDanmaku: false,
      showPhoneNotVerified: true,
      onlyGuardEntry: true,
      eventAnimationPreset: "slide",
      eventAnimationDurationMs: 480,
    },
  };

  const result = applyEventWindowBehaviorPreferences(current, incoming);

  assert.equal(result.displayScale, 1.25);
  assert.equal(result.fontSize, 20);
  assert.equal(result.display.showAvatar, false);
  assert.equal(result.display.eventSpacing, 7);
  assert.equal(result.display.showAutoDanmaku, false);
  assert.equal(result.display.showPhoneNotVerified, true);
  assert.equal(result.display.onlyGuardEntry, true);
  assert.equal(result.display.eventAnimationPreset, "slide");
  assert.equal(result.display.eventAnimationDurationMs, 480);
});

test("主题投影更新视觉字段但保留软件行为", () => {
  const current = {
    ...DEFAULT_EVENT_WINDOW_PREFERENCES,
    display: {
      ...DEFAULT_EVENT_WINDOW_PREFERENCES.display,
      showAutoDanmaku: false,
      showPhoneNotVerified: true,
      onlyGuardEntry: true,
      eventAnimationPreset: "slide",
      eventAnimationDurationMs: 480,
    },
  };
  const projection = {
    displayScale: 1.5,
    settings: current.eventStyleSettings,
    display: {
      ...current.display,
      baseFontSize: 22,
      showAvatar: false,
      showAutoDanmaku: true,
      showPhoneNotVerified: false,
      onlyGuardEntry: false,
      eventAnimationPreset: "fade",
      eventAnimationDurationMs: 200,
    },
  };

  const result = applyNativeThemeProjectionToWindowPreferences(current, projection);

  assert.equal(result.displayScale, 1.5);
  assert.equal(result.fontSize, 22);
  assert.equal(result.display.showAvatar, false);
  assert.equal(result.display.showAutoDanmaku, false);
  assert.equal(result.display.showPhoneNotVerified, true);
  assert.equal(result.display.onlyGuardEntry, true);
  assert.equal(result.display.eventAnimationPreset, "slide");
  assert.equal(result.display.eventAnimationDurationMs, 480);
});
