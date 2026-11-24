import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  resetEventDisplayPreferenceValues,
  resetEventFilterPreferenceValues,
  useGeneralSettings,
} from "../src/generalSettings.ts";
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from "../src/eventDisplaySettings.ts";
import { createDefaultSceneSettings } from "../src/components/sceneSettings.ts";
import { createDefaultEventStyleSettings } from "../src/eventStyleSettings.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("事件筛选恢复默认保留现场左右分类和布局", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const body = source.match(/const resetFilters = \(\) => \{([\s\S]*?)\n  \};/u)?.[1];
  assert.ok(body, "存在事件筛选恢复函数");
  let scene = createDefaultSceneSettings();
  scene.filters.left.danmu = false;
  scene.filters.left.interactKinds.entry = false;
  scene.filters.right.giftKinds.free = false;
  scene.filters.right.guard = false;
  scene.layoutMode = "partition";
  scene.leftRatio = 0.65;
  scene.giftThreshold = 99;
  scene.giftThresholdMode = "cumulative";
  scene.audienceFilters = {
    showCrossRoomEvents: false, minimumWealthLevel: 20, minimumCurrentRoomMedalLevel: 10,
  };
  const before = structuredClone(scene);
  const store = useGeneralSettings;
  const initial = store.getState();
  try {
    store.setState({ eventDisplayPreferences: {
      ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
      showAutoDanmaku: false, showPhoneNotVerified: true, onlyGuardEntry: true,
      showAvatar: false,
    } });
    new Function("createDefaultSceneSettings", "setSceneSettings", "resetEventFiltersSettings", body)(
      createDefaultSceneSettings,
      (update) => { scene = update(scene); },
      () => store.getState().resetEventFilters(),
    );
    assert.deepEqual(scene.filters, before.filters);
    assert.equal(scene.layoutMode, before.layoutMode);
    assert.equal(scene.leftRatio, before.leftRatio);
    const defaults = createDefaultSceneSettings();
    assert.equal(scene.giftThreshold, defaults.giftThreshold);
    assert.equal(scene.giftThresholdMode, defaults.giftThresholdMode);
    assert.deepEqual(scene.audienceFilters, defaults.audienceFilters);
    assert.equal(store.getState().eventDisplayPreferences.showAutoDanmaku, true);
    assert.equal(store.getState().eventDisplayPreferences.showPhoneNotVerified, false);
    assert.equal(store.getState().eventDisplayPreferences.onlyGuardEntry, false);
    assert.equal(store.getState().eventDisplayPreferences.showAvatar, false);
  } finally {
    store.setState(initial, true);
  }
});

test("事件显示恢复默认保留旧配置回看字号和完整样式", () => {
  const store = useGeneralSettings;
  const initial = store.getState();
  const style = createDefaultEventStyleSettings();
  style.avatarSize = 32;
  style.reviewAvatarSize = 36;
  style.fontWeight = 500;
  style.textStroke = { enabled: true, width: 2 };
  style.roles.normal.content = { r: 12, g: 34, b: 56, a: 1 };
  try {
    store.setState({
      eventFontSize: 22,
      windowEventFontSize: 24,
      eventStyleSettings: style,
      favoriteEditOnAdd: true,
      liveScrollDirection: "top",
      eventWindowCapacity: 12,
      eventDisplayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
        onlyGuardEntry: true, showAvatar: false, eventAnimationDurationMs: 480 },
    });
    store.getState().resetEventDisplay();
    const reset = store.getState();
    assert.equal(reset.eventFontSize, 22);
    assert.equal(reset.windowEventFontSize, 24);
    assert.deepEqual(reset.eventStyleSettings, style);
    assert.equal(reset.favoriteEditOnAdd, false);
    assert.equal(reset.liveScrollDirection, "bottom");
    assert.equal(reset.eventWindowCapacity, 50);
    assert.equal(reset.eventDisplayPreferences.onlyGuardEntry, true);
    assert.equal(reset.eventDisplayPreferences.showAvatar, false);
    assert.equal(reset.eventDisplayPreferences.eventAnimationDurationMs, 200);
    store.getState().setEventWindowCapacity(12);
    store.getState().resetWindows();
    assert.equal(store.getState().eventWindowCapacity, 12);
  } finally {
    store.setState(initial, true);
  }
});

test("通用设置状态包含全局头像、回看头像和事件样式", () => {
  const source = read("src/generalSettings.ts");
  const style = read("src/eventStyleSettings.ts");
  for (const name of ["avatarSize", "reviewAvatarSize"]) assert.match(style, new RegExp(name));
  for (const name of ["eventStyleSettings", "resetDanmu", "resetEventDisplay", "resetEventFilters"]) {
    assert.match(source, new RegExp(name));
  }
});

test("全局事件设置包含默认底部滚动和仅显示大航海进房开关", () => {
  const display = read("src/eventDisplaySettings.ts");
  const general = read("src/generalSettings.ts");
  assert.match(display, /onlyGuardEntry/);
  assert.match(display, /onlyGuardEntry:\s*false/);
  assert.match(general, /liveScrollDirection/);
  assert.match(general, /liveScrollDirection:\s*[\"']bottom[\"']/);
});

test("通用设置包含默认关闭的静默自启和启动自动连接", () => {
  const general = read("src/generalSettings.ts");
  for (const name of ["startOnBoot", "autoConnectOnStartup", "setStartOnBoot", "setAutoConnectOnStartup"]) {
    assert.match(general, new RegExp(name));
  }
  assert.match(general, /startOnBoot:\s*false/);
  assert.match(general, /autoConnectOnStartup:\s*false/);
  assert.match(general, /partialize:[\s\S]*startOnBoot:[\s\S]*autoConnectOnStartup/);
  assert.match(general, /autoConnectOnStartup:\s*saved\.autoConnectOnStartup === true/);
});

test("回看设置默认优先当前主播，并且持久化与恢复默认均覆盖该选项", () => {
  const general = read("src/generalSettings.ts");
  for (const name of ["reviewOpenCurrentOwner", "setReviewOpenCurrentOwner", "resetReview"]) {
    assert.match(general, new RegExp(name));
  }
  assert.match(general, /reviewOpenCurrentOwner:\s*true/);
  assert.match(general, /partialize:[\s\S]*reviewOpenCurrentOwner/);
  assert.match(general, /reviewOpenCurrentOwner:\s*saved\.reviewOpenCurrentOwner !== false/);
  assert.match(general, /defaultReviewSectionSettings[\s\S]*reviewOpenCurrentOwner:\s*defaultGeneralSettings\.reviewOpenCurrentOwner/);
  const generalDefaults = general.match(/const defaultGeneralSectionSettings = \{[\s\S]*?\n\};/u)?.[0] ?? "";
  assert.doesNotMatch(generalDefaults, /reviewOpenCurrentOwner/);
  assert.match(general, /resetGeneral:\s*\(\) => set\(\{ \.\.\.defaultGeneralSectionSettings \}\)/);
});

test("回看档案保留时长默认永久保留，并纳入回看分类恢复默认", () => {
  const general = read("src/generalSettings.ts");
  assert.match(general, /reviewArchiveRetentionDays:\s*number \| null/);
  assert.match(general, /reviewArchiveRetentionDays:\s*null/);
  assert.match(general, /setReviewArchiveRetentionDays/);
  assert.match(general, /defaultReviewSectionSettings[\s\S]*reviewArchiveRetentionDays/);
});

test("回看支持按主播覆盖保留策略，并纳入持久化与恢复默认", () => {
  const general = read("src/generalSettings.ts");
  assert.match(general, /reviewOwnerRetentionDays:\s*Record<string, number \| null>/);
  assert.match(general, /setReviewOwnerRetentionDays/);
  assert.match(general, /reviewOwnerRetentionDays:\s*\{\}/);
  assert.match(general, /partialize:[\s\S]*reviewOwnerRetentionDays/);
  assert.match(general, /resetReview:[\s\S]*reviewOwnerRetentionDays:\s*\{\}/);
});

test("回看主播置顶状态是本地偏好，并纳入持久化与恢复默认", () => {
  const general = read("src/generalSettings.ts");
  assert.match(general, /reviewPinnedOwnerRoomIds:\s*number\[\]/);
  assert.match(general, /setReviewOwnerPinned/);
  assert.match(general, /reviewPinnedOwnerRoomIds:\s*\[\]/);
  assert.match(general, /partialize:[\s\S]*reviewPinnedOwnerRoomIds/);
  assert.match(general, /resetReview:[\s\S]*reviewPinnedOwnerRoomIds:\s*\[\]/);
});

test("事件显示恢复默认保留事件筛选分类", () => {
  const current = {
    ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
    showAutoDanmaku: false,
    showPhoneNotVerified: true,
    onlyGuardEntry: true,
    showAvatar: false,
    eventAnimationPreset: "slide",
    eventAnimationDurationMs: 480,
  };
  const reset = resetEventDisplayPreferenceValues(current);
  assert.equal(reset.showAutoDanmaku, false);
  assert.equal(reset.showPhoneNotVerified, true);
  assert.equal(reset.onlyGuardEntry, true);
  assert.equal(reset.showAvatar, false);
  assert.equal(reset.eventAnimationPreset, DEFAULT_EVENT_DISPLAY_PREFERENCES.eventAnimationPreset);
  assert.equal(reset.eventAnimationDurationMs, DEFAULT_EVENT_DISPLAY_PREFERENCES.eventAnimationDurationMs);
});

test("事件筛选恢复默认只恢复本分类三个字段", () => {
  const current = {
    ...DEFAULT_EVENT_DISPLAY_PREFERENCES,
    showAutoDanmaku: false,
    showPhoneNotVerified: true,
    onlyGuardEntry: true,
    showAvatar: false,
    eventAnimationPreset: "slide",
    eventAnimationDurationMs: 480,
  };
  const reset = resetEventFilterPreferenceValues(current);
  assert.equal(reset.showAutoDanmaku, DEFAULT_EVENT_DISPLAY_PREFERENCES.showAutoDanmaku);
  assert.equal(reset.showPhoneNotVerified, DEFAULT_EVENT_DISPLAY_PREFERENCES.showPhoneNotVerified);
  assert.equal(reset.onlyGuardEntry, DEFAULT_EVENT_DISPLAY_PREFERENCES.onlyGuardEntry);
  assert.equal(reset.showAvatar, false);
  assert.equal(reset.eventAnimationPreset, "slide");
  assert.equal(reset.eventAnimationDurationMs, 480);
});
