import test from 'node:test';
import assert from 'node:assert/strict';
import {zipSync} from 'fflate';
import {createCustomThemeDocument} from '../src/themes/themeTypes.ts';
import {exportThemeDocumentBytes,importThemeEntriesBytesAsync} from '../src/themes/themeTransfer.ts';
test('主题合集逐项恢复并保留坏项结果',async()=>{
 const entries={};for(const mode of ['native','blivechat','blivechat-open','laplace']){const d=createCustomThemeDocument({themeId:mode,mode,name:mode});d.styles.customCss='.message{color:red}';entries[(mode==='native'?'浅色/深色-':'')+mode+'.zip']=exportThemeDocumentBytes(d);}
 entries['bad.zip']=new Uint8Array([1,2]);const results=await importThemeEntriesBytesAsync(zipSync(entries));assert.equal(results.length,5);assert.deepEqual(results.filter(x=>x.value).map(x=>x.value.document.mode),['native','blivechat','blivechat-open','laplace']);assert.ok(results.at(-1).error);assert.equal(results[0].value.document.styles.customCss,'.message{color:red}');
});
