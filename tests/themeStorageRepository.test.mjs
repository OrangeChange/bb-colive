import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createThemeRepository } from '../src/themes/themeRepository.ts';
import { createBuiltinNativeTheme } from '../src/themes/nativeBuiltinThemes.ts';

test('磁盘内置文档恢复只读权限，另存把来源目录交给原子保存', async () => {
 const builtin=createBuiltinNativeTheme('native-default');
 const {permissions,...stored}=builtin;
 let saved;
 const repository=createThemeRepository({list:async()=>[],read:async()=>stored,write:async(document,options)=>{saved={document,options};},remove:async()=>{}},[builtin]);
 assert.deepEqual((await repository.loadThemeDocument(builtin.themeId)).permissions,permissions);
 const copy={...builtin,themeId:'copy',origin:'custom'};
 const options={sourceThemeId:builtin.themeId,assetChanges:{'assets/new.png':new Uint8Array([1])}};
 await repository.saveThemeDocument(copy,options);
 assert.equal(saved.options.sourceThemeId,builtin.themeId);
 assert.deepEqual(saved.options.assetChanges,options.assetChanges);
 assert.ok(!fs.existsSync('public/theme-catalog'));
});

