import test from 'node:test';import assert from 'node:assert/strict';
import {exportThemeDocumentBytes,importThemePackageBytes} from '../src/themes/themeTransfer.ts';
import {createCustomThemeDocument} from '../src/themes/themeTypes.ts';
test('主题包展开共享与缓存文件，不携带本机引用且缺失素材失败',()=>{
 const d=createCustomThemeDocument({themeId:'portable',mode:'laplace',name:'portable'});
 d.assets=[{id:'s',path:'assets/a.png',name:'a.png',mediaType:'image/png',sharedResourceId:'shared'},{id:'r',path:'assets/b.gif',name:'b.gif',mediaType:'image/gif',cacheResourceId:'cache'}];
 assert.throws(()=>exportThemeDocumentBytes(d,{}),/素材|资源/);
 const decoded=importThemePackageBytes(exportThemeDocumentBytes(d,{'assets/a.png':new Uint8Array([1]),'assets/b.gif':new Uint8Array([2])}));
 assert.equal(decoded.document.assets.length,2);assert.ok(decoded.document.assets.every(a=>!a.sharedResourceId&&!a.cacheResourceId));assert.equal(decoded.assets['assets/b.gif'][0],2);
 assert.equal(d.assets[0].sharedResourceId,'shared');
});

test('完整主题包保留网络来源，不携带本地原文件路径',()=>{
 const d=createCustomThemeDocument({themeId:'local',mode:'native',name:'local'});
 d.assets=[{id:'l',path:'assets/a.svg',name:'a.svg',mediaType:'image/svg+xml',sourceUrl:'file:///C:/old/a.svg'},{id:'r',path:'assets/b.png',name:'b.png',mediaType:'image/png',sourceUrl:'https://example.com/b.png',cacheResourceId:'fixed'}];
 const decoded=importThemePackageBytes(exportThemeDocumentBytes(d,{'assets/a.svg':new Uint8Array([1]),'assets/b.png':new Uint8Array([2])}));
 assert.equal(decoded.document.assets[0].sourceUrl,undefined);assert.equal(decoded.document.assets[1].sourceUrl,'https://example.com/b.png');
});
