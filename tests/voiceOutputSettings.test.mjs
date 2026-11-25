import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => readUiSource(new URL(`../${path}`, import.meta.url), "utf8");

test("设置分类将语音与播报放在副窗口之后", () => {
  const source = read("src/components/settingsNavigation.ts");
  assert.match(source, /id: "voice"/);
  assert.match(source, /label: ["']语音与播报["']/);
  assert.ok(source.indexOf('id: "windows"') < source.indexOf('id: "voice"'));
});

test("声音输出只在设置的语音分类中呈现", () => {
  const settingsSource = read("src/components/SettingsPanel.tsx");
  const voiceSource = read("src/components/VoicePanel.tsx");
  assert.match(settingsSource, /声音输出/);
  assert.match(settingsSource, /收听范围/);
  assert.match(settingsSource, /主播设备/);
  assert.match(settingsSource, /观众设备/);
  assert.match(settingsSource, /跟随系统默认设备/);
  assert.match(settingsSource, /SettingsListSelect/);
  assert.doesNotMatch(voiceSource, /<SectionHeading>声音输出<\/SectionHeading>/);
});

test("声音输出下拉复用统一选择控件与滚动列表", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const listSelectSource = read("src/components/SettingsListSelect.tsx");
  assert.match(source, /SharedSettingsListSelect[\s\S]*?ariaLabel=["']主播输出设备["']/);
  assert.match(source, /SharedSettingsListSelect[\s\S]*?ariaLabel=["']观众输出设备["']/);
  assert.match(listSelectSource, /<UiSelect/);
  assert.match(read("src/components/ui/Select.tsx"), /<SelectContent/);
  assert.match(listSelectSource, /onFocus\?: \(\) => void/);
  assert.match(listSelectSource, /onFocus=\{onFocus\}/);
  assert.doesNotMatch(source, /<select[\s\S]*?主播输出设备/);
  const select = read("src/components/shadcn/select.tsx");
  assert.match(select, /data-slot="select-item"[\s\S]*text-sm/);
  assert.match(select, /overflow-y-auto/);
});

test("保存的设备暂时不可用时不会伪装成跟随系统默认设备", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const listSelectSource = read("src/components/SettingsListSelect.tsx");
  assert.match(listSelectSource, /!options.some\(\(option\) => option.value === value\)/);
  assert.match(listSelectSource, /设备不可用/);
  assert.match(listSelectSource, /label: ["']设备不可用["'][\s\S]*title: value/);
});

test("输出设备不被初始化逻辑写死，播放时保留跟随系统默认设备的语义", () => {
  const source = read("src/voice/voiceRuntime.ts");
  assert.match(source, /listDevices/);
  assert.doesNotMatch(source, /initializeAudioOutputSettings/);
  const rust = read("src-tauri/src/lib.rs");
  assert.match(rust, /host\.default_output_device\(\)/);
  assert.match(rust, /fn output_device\(id: Option<&str>\)/);
});

test("输出设备目标允许空 ID 交给后端按系统默认设备解析", async () => {
  const { resolveOutputTargets } = await import("../src/voice/audioOutput.ts");
  assert.deepEqual(resolveOutputTargets({ scope: "host", monitorDeviceId: null }), []);
  assert.deepEqual(resolveOutputTargets({ scope: "both", monitorDeviceId: null, streamDeviceId: null }), []);
});

test("三种恢复默认边界互不覆盖", async () => {
  const {
    DEFAULT_VOICE_SETTINGS,
    resetVoicePanelSettings,
    resetPersonalBroadcastSettings,
    resetVoiceOutputSettings,
    resetEventInteractionSettings,
    resetVoiceSettingsSection,
  } = await import("../src/voice/voiceSettings.ts");
  const current = {
    ...DEFAULT_VOICE_SETTINGS,
    engine: "fish-audio",
    outputScope: "both",
    monitorDeviceId: "host-device",
    streamDeviceId: "stream-device",
    personalBroadcast: {
      ...DEFAULT_VOICE_SETTINGS.personalBroadcast,
      enabled: true,
      promptIntervalSeconds: 2,
    },
  };
  assert.equal(resetVoicePanelSettings(current).engine, DEFAULT_VOICE_SETTINGS.engine);
  assert.equal(resetVoicePanelSettings(current).outputScope, "both");
  assert.equal(resetVoicePanelSettings(current).personalBroadcast.enabled, true);
  assert.equal(resetPersonalBroadcastSettings(current).engine, "fish-audio");
  assert.equal(resetPersonalBroadcastSettings(current).personalBroadcast.enabled, false);
  assert.equal(resetVoiceOutputSettings(current).engine, "fish-audio");
  assert.equal(resetVoiceOutputSettings(current).outputScope, DEFAULT_VOICE_SETTINGS.outputScope);
  assert.equal(resetVoiceOutputSettings(current).personalBroadcast.enabled, true);
  const interactionReset = resetEventInteractionSettings({
    ...current,
    userNicknames: { "7": "昵称" },
    speakUsername: false,
    shortcutActions: ["mark"],
  });
  assert.equal(interactionReset.userNicknames && Object.keys(interactionReset.userNicknames).length, 0);
  assert.equal(interactionReset.speakUsername, true);
  assert.deepEqual(interactionReset.shortcutActions, DEFAULT_VOICE_SETTINGS.shortcutActions);
  assert.equal(interactionReset.outputScope, "both");
  assert.equal(interactionReset.engine, "fish-audio");
  const sectionReset = resetVoiceSettingsSection({
    ...current,
    userNicknames: { "7": "昵称" },
    speakUsername: false,
  });
  assert.equal(sectionReset.userNicknames && Object.keys(sectionReset.userNicknames).length, 0);
  assert.equal(sectionReset.speakUsername, true);
  assert.equal(sectionReset.engine, "fish-audio");
  assert.equal(sectionReset.personalBroadcast.enabled, true);
});

test("设计契约记录个性播报一级面板和声音输出唯一归属", () => {
  const design = read("docs/specifications/DESIGN.md");
  const ux = read("docs/specifications/UX-CONTRACT.md");
  assert.match(design, /个性播报.*语音.*同级|语音.*个性播报.*同级/);
  assert.match(design, /设置.*语音与播报.*声音输出/);
  assert.match(ux, /PersonalBroadcastPanel/);
  assert.match(ux, /声音输出.*设置.*语音与播报/);
});
