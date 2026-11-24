import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCatalogThemes} from '../src/themes/builtinThemeCatalog.ts';
import {createBuiltinCompatibleTheme} from '../src/themes/builtinThemeDefaults.ts';
import {createBuiltinNativeThemes} from '../src/themes/nativeBuiltinThemes.ts';
import {createThemeFromCss} from '../src/themes/themeImport.ts';

const source=JSON.parse(fs.readFileSync('tests/fixtures/laplace-theme-catalog.json','utf8'));

test('LAPLACE十三个内置模板逐项保留官方目录字段，不从CSS补写缺失版本',()=>{
 const documents=createCatalogThemes();assert.equal(source.length,13);
 for(const row of source){const d=documents.find(d=>d.themeId==='laplace-builtin-'+row.value);assert.ok(d,row.value);assert.equal(d.metadata.author,row.author,row.value+' author');assert.equal(d.metadata.originalAuthor,undefined,row.value+' no duplicate author');assert.equal(d.metadata.version,row.version,row.value+' version');assert.equal(d.metadata.updatedAt,row.updated,row.value+' date');assert.equal(d.metadata.importedAt,undefined);assert.equal(d.metadata.localModifiedAt,undefined)}
});

test('四模式内置主题只保留作者字段与固定ID',()=>{
 const docs=[...createBuiltinNativeThemes(),...['blivechat','blivechat-open','laplace'].map(createBuiltinCompatibleTheme),...createCatalogThemes()];assert.equal(docs.length,31);assert.equal(new Set(docs.map(d=>d.themeId)).size,31);
 for(const d of docs)assert.equal(d.metadata.originalAuthor,undefined,d.themeId);
 for(const mode of ['blivechat','blivechat-open'])assert.equal(docs.find(d=>d.mode===mode&&d.themeId.endsWith('-default')).metadata.author,'default');
});

test('四格式CSS导入保留明确author/version/updated和多人署名，导入时间独立',()=>{
 const css='/*\n @author 流泪喵喵头Serein、橙橙子君\n @version 1.7.0\n @updated May 18, 2025, 11:05:00 PM UTC+8\n*/\n.event{color:red}';
 for(const mode of ['native','blivechat','blivechat-open','laplace']){
  const d=createThemeFromCss({themeId:'metadata-'+mode,mode,name:'选择的名称',css,importedAt:'2026-11-09T00:00:00.000Z'});
  assert.equal(d.metadata.name,'选择的名称');assert.equal(d.metadata.author,'流泪喵喵头Serein、橙橙子君');assert.equal(d.metadata.originalAuthor,undefined);assert.equal(d.metadata.version,'1.7.0');assert.equal(d.metadata.updatedAt,'May 18, 2025, 11:05:00 PM UTC+8');assert.equal(d.metadata.importedAt,'2026-11-09T00:00:00.000Z');assert.equal(d.metadata.localModifiedAt,d.metadata.importedAt);assert.equal(d.styles.baseCss,css);assert.equal(d.styles.customCss,'');
 }
});

test('没有明确头部字段的CSS不把导入时间和普通署名冒充来源信息',()=>{
 const d=createThemeFromCss({themeId:'unmarked',mode:'laplace',name:'未标注',css:'/* 气泡 × 某主播 by 某作者 */\n.event{color:red}',importedAt:'2026-11-09T00:00:00.000Z'});
 assert.equal(d.metadata.author,'');assert.equal(d.metadata.version,'');assert.equal(d.metadata.updatedAt,'');assert.equal(d.metadata.originalAuthor,undefined);
});
