import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");

test("登录后的侧栏隐藏常驻用户名，并在头像悬停时显示登录状态", () => {
  assert.match(source, /aria-label=\{`已登录：\$\{session\.uname\}，打开用户菜单`\}/);
  assert.match(source, /title=\{`已登录：\$\{session\.uname\}`\}/);
  assert.doesNotMatch(source, /max-w-14 truncate ui-type-meta text-t3">\{session\.uname\}<\/span>/);
});

test("弹幕窗和礼物窗右键只请求对应设置，并保留左侧主题快捷入口", () => {
  assert.match(source, /onOpenDisplaySettings/);
  assert.match(source, /onOpenGiftSettings/);
  assert.match(source, /onContextMenu=\{\(event\) => \{ event\.preventDefault\(\); onOpenDisplaySettings\?\.\(\); \}\}/);
  assert.match(source, /onContextMenu=\{\(event\) => \{ event\.preventDefault\(\); onOpenGiftSettings\?\.\(\); \}\}/);
  assert.match(source, /ThemeQuickToggle/);
  assert.match(source, /useTheme/);
  assert.match(source, /配色：/);
  assert.match(source, /深浅色：/);
});

test("深浅模式快捷按钮按当前状态显示系统、日、月图标", () => {
  assert.match(source, /function IconSun\(\)/);
  assert.match(source, /function IconMoon\(\)/);
  assert.match(source, /function IconSystem\(\)/);
  assert.match(source, /mode === "system" \? <IconSystem \/> : mode === "light" \? <IconSun \/> : <IconMoon \/>/);
  assert.doesNotMatch(source, /function IconContrast\(\)/);
});

test("语音图标使用折中宽度的中心话筒主体", () => {
  const iconVoice = source.match(/function IconVoice\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(iconVoice, "语音图标实现尚未找到");
  assert.match(iconVoice, /<LucideMic\b/);
  assert.doesNotMatch(iconVoice, /M9 5\.5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0v-6Z/);
});

test("个性播报入口使用可识别的音频波形图标", () => {
  const icon = source.match(/function IconAudioWaveform\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(icon, "个性播报音频波形图标实现尚未找到");
  assert.match(source, /mainTitle="个性播报（提示音）"[\s\S]*?mainIcon=\{<IconAudioWaveform \/>\}/);
  assert.match(icon, /<LucideAudioLines\b/);
  assert.doesNotMatch(icon, /function IconPromptSound/);
});

test("语音快捷开关与个性播报使用完全相同的铃铛图标", () => {
  const voiceToggle = source.match(/mainView="voice"[\s\S]*?toggleIcon=\{<IconBell muted=\{!voiceEnabled\} \/>\}/)?.[0];
  const personalToggle = source.match(/mainView="personal"[\s\S]*?toggleIcon=\{<IconBell muted=\{!personalBroadcastEnabled\} \/>\}/)?.[0];
  assert.match(source, /function IconBell\(/);
  assert.ok(voiceToggle, "语音快捷开关尚未复用铃铛图标");
  assert.ok(personalToggle, "个性播报快捷开关实现尚未找到");
  assert.doesNotMatch(source, /function IconSpeaker\(/);
});

test("语音侧栏入口悬停展开快捷播报开关，并与副窗口展开条对齐", () => {
  const css = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(source, /useVoiceSettings/);
  assert.match(source, /voiceController/);
  assert.match(source, /sidebar-feature-controls/);
  assert.match(source, /sidebar-feature-toggle/);
  assert.match(source, /setVoiceSettings\(\{ enabled: false \}\)/);
  assert.match(source, /setVoiceSettings\(\{ enabled: true \}\)/);
  assert.match(source, /voiceController\.stop\(\)/);
  assert.match(source, /voiceController\.start\(\)/);
  assert.match(source, /aria-pressed=\{enabled\}/);
  assert.match(css, /\.sidebar-feature-controls\.has-toggle::before[\s\S]*?width: 112px[\s\S]*?height: 48px/);
  assert.match(css, /\.sidebar-feature-toggle[\s\S]*?left: calc\(100% \+ 20px\)/);
});

test("个性播报快捷开关使用独立铃铛图标，并与语音共享完全相同的展开容器", () => {
  const css = fs.readFileSync(new URL("../src/App.css", import.meta.url), "utf8");
  assert.match(source, /function IconBell\(/);
  assert.match(source, /mainView="personal"[\s\S]*?toggleIcon=\{<IconBell muted=\{!personalBroadcastEnabled\} \/>\}/);
  assert.match(source, /setVoiceSettings\(\{ personalBroadcast: \{ \.\.\.personalBroadcast, enabled: !personalBroadcastEnabled \} \}\)/);
  assert.match(source, /aria-pressed=\{enabled\}/);
  assert.match(css, /\.sidebar-feature-controls\.has-toggle\.is-revealed \.sidebar-feature-toggle/);
});
