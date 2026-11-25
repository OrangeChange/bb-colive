import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import * as messages from "../src/i18n/index.ts";

test("界面语言可切换，参数和中文默认值保持原样", () => {
  assert.equal(typeof messages.setUiLanguage, "function");
  try {
    assert.equal(messages.getUiLanguage(), "zh-CN");
    messages.setUiLanguage("en");
    assert.equal(messages.uiText("common.cancel"), "Cancel");
    assert.equal(messages.uiText("common.personalBroadcast"), "Custom audio");
    assert.ok(messages.uiText("themePackageCodec.decodeThemePackage", { name: "$&{name}.png" }).includes("$&{name}.png"));
    messages.setUiLanguage("ja");
    assert.equal(messages.uiText("common.cancel"), "キャンセル");
    messages.setUiLanguage("zh-Hant");
    assert.equal(messages.uiText("common.apply"), "套用");
    messages.setUiLanguage("unsupported");
    assert.equal(messages.getUiLanguage(), "zh-CN");
  } finally { messages.setUiLanguage("zh-CN"); }
});

test("固定选项的已有引用随语言切换更新", async () => {
  assert.equal(typeof messages.setUiLanguage, "function");
  const { SETTINGS_SECTIONS } = await import("../src/components/settingsNavigation.ts");
  try {
    assert.equal(SETTINGS_SECTIONS.find(x => x.id === "review").label, "回看");
    messages.setUiLanguage("en");
    assert.equal(SETTINGS_SECTIONS.find(x => x.id === "review").label, "Stream history");
    assert.ok(Object.keys(SETTINGS_SECTIONS).length > 0);
  } finally { messages.setUiLanguage("zh-CN"); }
});

test("切换语言保留兼容主题的注册选择器及身份标识", async () => {
  const { OPENLIVE_CAPABILITY: capability } = await import("../src/compat/openlive/theme.ts");
  const selectors = JSON.stringify(capability.eventSelectorsByPlacement);
  const source = JSON.stringify(capability.sourceEventSelectorsByPlacement);
  const identityPriority = [...capability.identityPriority];
  try {
    messages.setUiLanguage("en");
    assert.equal(capability.identityLabels.streamer, "Streamer");
    assert.equal(JSON.stringify(capability.eventSelectorsByPlacement), selectors);
    messages.setUiLanguage("ja");
    assert.equal(JSON.stringify(capability.sourceEventSelectorsByPlacement), source);
    assert.deepEqual(capability.identityPriority, identityPriority);
    assert.equal(capability.identityLabels.streamer, "配信者");
  } finally { messages.setUiLanguage("zh-CN"); }
});

test("独立更新窗口可读取界面语言，安装计划传递所选语言", () => {
  const helper = fs.readFileSync("src-tauri/src/updates/helper.rs", "utf8");
  const commands = fs.readFileSync("src-tauri/src/updates/commands.rs", "utf8");
  assert.match(helper, /generate_handler!\[[\s\S]*crate::get_ui_language/);
  assert.match(helper, /set_language\(plan\.ui_language/);
  assert.match(commands, /plan\.ui_language = Some\(crate::ui_messages::language\(\)/);
});
