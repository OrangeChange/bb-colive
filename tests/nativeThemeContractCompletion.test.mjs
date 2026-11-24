import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { nativeVisualPropertiesForPart } from "../src/themes/nativeThemeCapabilities.ts";

test("原生内置主题使用约定作者", () => {
  const source = readUiSource("src/themes/nativeBuiltinThemes.ts", "utf8");
  assert.match(source, /author:\s*["']橙橙子君["']/);
});

test("文字部件可以编辑垂直外边距", () => {
  assert.equal(nativeVisualPropertiesForPart("message").includes("marginY"), true);
});

test("主题主页只展示作者和版本号", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  assert.match(workspace, /作者：\{item\.author/);
  assert.match(workspace, /版本：\{item\.version/);
  for (const label of ["来源地址", "作者更新时间", "本地修改时间", "导入时间"]) assert.doesNotMatch(editor, new RegExp(label));
});
