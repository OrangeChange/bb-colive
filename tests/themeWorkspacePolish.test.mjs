import { readUiSource } from "./helpers/readUiSource.mjs";
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const read=p=>readUiSource('src/components/'+p,'utf8');
test('管理工具条固定且内置主题删除有反馈',()=>{assert.match(read('themeWorkspace.css'),/\.theme-library-controls\{position:sticky;top:0/);assert.match(read('ThemeWorkspace.tsx'),/setError\(["']内置主题不能删除["']\)/)});
test('另存为独立且导出范围作为动作菜单',()=>{const h=read('ThemeEditorChrome.tsx');assert.match(h,/onClick=\{onSaveAs\}>[\s\S]*?另存为/);assert.doesNotMatch(h,/runAction\(onSaveAs\)/);assert.match(read('NativeThemeAdvancedEditor.tsx'),/<ThemeActionMenu label=["']导出 CSS["']/)});
test('容器提供文字部件导航而非生成额外字体规则',()=>{assert.match(read('CompatibleThemeEditor.tsx'),/容器控制布局，文字请分别编辑/);assert.match(read('CompatibleThemeEditor.tsx'),/\[\["username", ["']用户名["']\], \["message", ["']正文["']\]\]/)});
test('轻提示退出后移除并尊重减少动画偏好',()=>{assert.match(read('WorkspaceNotice.tsx'),/setExiting\(true\)/);assert.match(read('WorkspaceNotice.tsx'),/dismiss\.current\(\), 160/);assert.match(read('themeWorkspace.css'),/prefers-reduced-motion:reduce/)});

test('外部 HTML 预览说明输出范围和连接状态',()=>{
  const source=read('ThemeWorkspace.tsx');
  for(const text of ['外部 HTML 仅支持弹幕窗、收益窗和 OBS。','预览已就绪，可以另存为主题。','正在连接主题预览…']) assert.ok(source.includes(text));
  for(const text of ['SDK 可见预览已就绪','正在等待可见预览完成 SDK 握手','正在连接 SDK 预览','SDK 1.0.1 不提供菜单']) assert.ok(!source.includes(text));
});
