import { readUiSource } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=readUiSource('src/components/ThemeWorkspace.tsx','utf8');
test('主题工具栏顺序与视觉顺序相同',()=>{const bar=source.slice(source.indexOf('<div className="theme-library-toolbar">'),source.indexOf('{manageMode &&'));assert.ok(bar.indexOf('theme-category-tabs')<bar.indexOf('theme-library-search'));});
test('主题搜索无匹配时使用搜索空状态',()=>{assert.match(source,/themeSearch\.trim\(\)\s*\?\s*["']没有找到匹配的主题["']\s*:\s*["']这个分类还没有主题["']/);});
test('相同工作区提示也会开启新的显示周期',()=>{assert.match(source,/revision:\s*current\.revision\s*\+\s*1/);assert.match(source,/<WorkspaceNotice key=\{notice\.revision\}/);});
