import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("草稿独立保留，应用统一更新引用", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /保存主题，再应用到现场、副窗口和 OBS/);
  assert.match(workspace, /const savedDocument = session\.dirty \|\| keepDraft \? await save\(keepDraft\) : session\.saved/);
  assert.match(workspace, /saveAndUpdateThemeReferences\(savedDocument/);
});

test("删除主题前检查正在使用的目标", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(workspace, /listThemeReferences/);
  assert.match(workspace, /正在用于/);
});

test("自定义主题提供保存、主题信息、删除和高级 CSS", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  const advanced = readUiSource("src/components/NativeThemeAdvancedEditor.tsx", "utf8");
  for (const label of ["保存", "主题信息", "删除"]) assert.match(source, new RegExp(label));
  assert.match(editor, /高级编辑/);
  assert.match(source, /deleteCustomTheme/);
  assert.match(source, /discardThemeSession/);
  assert.doesNotMatch(source, /部件样式/);
  assert.match(advanced, /NativeCssCodeEditor/);
  assert.match(advanced, /自定义 CSS/);
});

test("有未应用修改时先保存再更新全部引用", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /session\.dirty/);
  assert.match(source, /session\.dirty \|\| keepDraft \? await save\(keepDraft\) : session\.saved/);
  assert.match(source, /saveAndUpdateThemeReferences\(savedDocument/);
});

test("新主题应用沿用命名流程，保存后应用到选择的位置", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /setPendingApply\(true\)/);
  assert.match(source, /pendingApplyTarget.current = targetId/);
  assert.match(source, /publishToTarget\(saved.saved, pendingApplyTarget.current\)/);
});

test("主题级撤销重做入口已移除，代码编辑器保留独立历史", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeCssCodeEditor.tsx", "utf8");
  assert.doesNotMatch(source, /undoThemeEdit/);
  assert.doesNotMatch(source, /redoThemeEdit/);
  assert.match(editor, /sharedModels/);
  assert.match(editor, /sharedViewStates/);
  assert.doesNotMatch(source, /放弃未保存修改/);
  assert.doesNotMatch(source, /pendingThemeId/);
});

test("导入主题统一转换为可编辑的自定义主题", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /origin: "custom"/);
  assert.match(source, /permissionsForOrigin\("custom"\)/);
});

test("保存按主题引用更新目标，并为失败的引用更新提供重试", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /saveAndUpdateThemeReferences/);
  assert.match(source, /retryThemeReferences\(failedPublication/);
  assert.match(source, /重试更新/);
});

test("外部更新和删除保留草稿并提供恢复入口", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /externalThemeState/);
  assert.match(source, /subscribeThemeRepositoryChanges\(window, checkExternalTheme\)/);
  assert.match(source, /主题文件已在外部更新/);
  assert.match(source, /主题文件已被移除/);
  assert.match(source, />另存为恢复</);
  assert.match(source, />载入文件中的版本</);
});
