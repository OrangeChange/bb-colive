import { readUiSource } from "./helpers/readUiSource.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { projectNativeTheme } from "../src/themes/nativeThemeProjection.ts";
import { applyEventWindowBehaviorPreferences, applyNativeThemeProjectionToWindowPreferences, DEFAULT_EVENT_WINDOW_PREFERENCES } from "../src/windows/eventWindowPreferences.ts";

test("原生主题只保存唯一基准字号，大表情尺寸由视觉模型管理", () => {
  const theme = createBuiltinNativeTheme("native-default");
  assert.equal(theme.settings.display.showAvatar, true);
  assert.equal(theme.settings.display.guardIdentityDisplayMode, "icon");
  assert.equal(theme.settings.display.baseFontSize, 16);
  assert.equal("eventFontSize" in theme.settings.display, false);
  assert.equal("windowEventFontSize" in theme.settings.display, false);
  assert.equal("bigEmoteWidth" in theme.settings.display, false);
  assert.equal("windowBigEmoteWidth" in theme.settings.display, false);
  assert.equal(projectNativeTheme(theme).display.showGiftImage, true);
});

test("旧主题字号只在读取时归一为单一基准字段", async () => {
  const { normalizeNativeThemeDisplaySettings } = await import("../src/themes/nativeComponentAppearance.ts");
  const normalized = normalizeNativeThemeDisplaySettings({ eventFontSize: 18, windowEventFontSize: 22 });
  assert.equal(normalized.baseFontSize, 18);
  assert.equal("eventFontSize" in normalized, false);
  assert.equal("windowEventFontSize" in normalized, false);
});

test("软件设置不再提供元素外观的第二套入口", () => {
  const panel = readUiSource("src/components/SettingsPanel.tsx", "utf8");
  for (const label of ["显示大航海标记", "显示荣耀等级", "显示榜单排名", "显示房管标记", "显示主播标记", "显示头像", "显示头像框", "显示粉丝牌", "仅显示主播粉丝牌", "隐藏未点亮粉丝牌", "显示礼物图片"]) {
    assert.doesNotMatch(panel, new RegExp(`<SettingSwitch label="${label}"`));
  }
  assert.doesNotMatch(panel, /事件个性化设置/);
  assert.doesNotMatch(panel, /ThemeWorkspace|编辑样式|主题、元素显示和外观/);
});

test("样式是左侧导航中的一级主工作区", () => {
  const mainView = readUiSource("src/components/mainView.ts", "utf8");
  const sidebar = readUiSource("src/components/Sidebar.tsx", "utf8");
  const app = readUiSource("src/App.tsx", "utf8");
  assert.match(mainView, /"style"/);
  assert.match(sidebar, /activeMainView === "style"/);
  assert.match(app, /mainView !== "style"/);
  assert.match(app, /<StylePanel/);
});

test("样式工作区预留兼容分类并由原生主题共用完整编辑器", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  const app = readUiSource("src/App.tsx", "utf8");
  assert.match(workspace, /THEME_CATEGORIES/);
  for (const mode of ["native", "blivechat", "blivechat-open", "laplace"]) assert.match(workspace, new RegExp(mode));
  assert.match(workspace, /CompatibleThemeEditor/);
  assert.match(workspace, /if \(!active \|\| initialized\) return/);
  assert.match(workspace, /NativeThemeEditor/);
  assert.match(editor, /NativeThemeBasicSettings/);
  assert.match(app, /<RightWorkbench[\s\S]*?active=\{phase === "loggedIn"\}/);
  assert.doesNotMatch(app, /active=\{phase === "loggedIn" && mainView !== "style"\}/);
});

test("筛选和动画留在软件设置，回看不进入主题编辑器", () => {
  const panel = readUiSource("src/components/SettingsPanel.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.match(panel, /显示自动弹幕/);
  assert.match(panel, /显示未验证手机号用户弹幕/);
  assert.match(panel, /事件动画/);
  assert.doesNotMatch(editor, /事件动画/);
  assert.doesNotMatch(editor, /\["review", ["']回看["']\]/);
});

test("OBS 快照保存主题元素显示并交给真实事件行", () => {
  const snapshot = readUiSource("src/obs/nativeObsTheme.ts", "utf8");
  const renderer = readUiSource("src/obs/ObsOutputView.tsx", "utf8");
  assert.match(snapshot, /display: projection\.display/);
  assert.match(renderer, /displayPreferences=\{effectiveDisplay\}/);
  assert.match(renderer, /eventFontSize=\{snapshot\.eventFontSize\}/);
});

test("软件行为设置更新不会覆盖副窗口已发布主题视觉", () => {
  const theme = createBuiltinNativeTheme("native-default");
  theme.settings.display.baseFontSize = 24;
  theme.settings.display.showAvatar = false;
  const themed = applyNativeThemeProjectionToWindowPreferences(
    structuredClone(DEFAULT_EVENT_WINDOW_PREFERENCES),
    projectNativeTheme(theme),
  );

  const next = applyEventWindowBehaviorPreferences(themed, {
    ...DEFAULT_EVENT_WINDOW_PREFERENCES,
    scrollDirection: "top",
    giftThreshold: 100,
    fontSize: 16,
    display: { ...DEFAULT_EVENT_WINDOW_PREFERENCES.display, showAvatar: true },
  });

  assert.equal(next.scrollDirection, "top");
  assert.equal(next.giftThreshold, 100);
  assert.equal(next.fontSize, 24);
  assert.equal(next.display.showAvatar, false);
});
