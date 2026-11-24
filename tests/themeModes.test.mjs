import test from "node:test";
import assert from "node:assert/strict";
import { THEME_MODES, canApplyThemeMode, getThemeModeDefinition } from "../src/themes/themeModes.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";

test("四种样式模式使用稳定标识并开放共用编辑与目标底座", () => {
  assert.deepEqual(THEME_MODES, ["native", "blivechat", "blivechat-open", "laplace"]);
  assert.deepEqual(getThemeModeDefinition("native").targets, ["live", "windows", "obs"]);
  assert.equal(getThemeModeDefinition("native").editable, true);
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    assert.equal(getThemeModeDefinition(mode).editable, true);
    assert.deepEqual(getThemeModeDefinition(mode).targets, ["live", "windows", "obs"]);
  }
});

test("模式能力允许三版绑定展示目标但排除回看", () => {
  assert.equal(canApplyThemeMode("native", "live"), true);
  assert.equal(canApplyThemeMode("laplace", "live"), true);
  assert.equal(canApplyThemeMode("blivechat", "obs"), true);
  assert.equal(canApplyThemeMode("blivechat-open", "review"), false);
});

test("内置原生主题具有稳定身份和只读权限", () => {
  const first = createBuiltinNativeTheme("native-default");
  const second = createBuiltinNativeTheme("native-default");
  assert.equal(first.themeId, "native-default");
  assert.equal(second.themeId, first.themeId);
  assert.equal(first.mode, "native");
  assert.equal(first.origin, "builtin");
  assert.equal(first.permissions.update, false);
  assert.equal(first.permissions.saveAs, true);
  assert.equal(first.permissions.delete, false);
});

test("未知内置主题不会退回到另一套默认主题", () => {
  assert.throws(() => createBuiltinNativeTheme("missing"), /未知的内置原生主题/);
});
