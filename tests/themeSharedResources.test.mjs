import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materializeCatalogAssets } from '../scripts/themeResourceBuild.mjs';
test('内置公共素材只存共享目录，独有素材保留主题目录',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theme-shared-'));
 await fs.mkdir(path.join(root,'source/assets'),{recursive:true});
 await fs.writeFile(path.join(root,'source/assets/font.woff2'),Buffer.from('wOF2shared'));
 await fs.writeFile(path.join(root,'source/assets/image.png'),Buffer.from('image'));
 const font={id:'assets/font.woff2',path:'assets/font.woff2',name:'font',mediaType:'font/woff2'};
 const image={id:'assets/image.png',path:'assets/image.png',name:'image',mediaType:'image/png'};
 const docs=[{assets:[font,image],directory:path.join(root,'out/a')},{assets:[font],directory:path.join(root,'out/b')}];
 await materializeCatalogAssets(docs,path.join(root,'source'),path.join(root,'out'));
 assert.equal(docs[0].assets[0].sharedResourceId,docs[1].assets[0].sharedResourceId);
 assert.ok(docs[0].assets[0].sharedResourceId);
 assert.equal(await fs.readFile(path.join(root,'out/shared-assets',docs[0].assets[0].sharedResourceId,'font.woff2'),'utf8'),'wOF2shared');
 for(const d of docs)await assert.rejects(fs.stat(path.join(d.directory,'assets/font.woff2')));
 assert.equal(await fs.readFile(path.join(root,'out/a/assets/image.png'),'utf8'),'image');
});

test('网络来源不进入主题或共享目录，内嵌素材仍保留本地身份',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'theme-origin-'));
 await fs.mkdir(path.join(root,'source/assets'),{recursive:true});
 await fs.writeFile(path.join(root,'source/assets/icon.svg'),'<svg/>');
 const docs=[{catalogKey:'test',assets:[{id:'font',path:'assets/network.woff2',name:'font',mediaType:'font/woff2'},{id:'icon',path:'assets/icon.svg',name:'icon',mediaType:'image/svg+xml'}],directory:path.join(root,'out/theme')}];
 await materializeCatalogAssets(docs,path.join(root,'source'),path.join(root,'out'),{themes:{test:{'assets/network.woff2':{kind:'remote',sourceUrl:'https://example.com/font.woff2',mediaType:'font/woff2'},'assets/icon.svg':{kind:'embedded',mediaType:'image/svg+xml'}}}});
 assert.equal(docs[0].assets[0].sourceUrl,'https://example.com/font.woff2');
 assert.equal(docs[0].assets[0].sharedResourceId,undefined);
 assert.equal(await fs.readFile(path.join(root,'out/theme/assets/icon.svg'),'utf8'),'<svg/>');
 await assert.rejects(fs.stat(path.join(root,'out/theme/assets/network.woff2')));
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(root,'out/shared-assets/index.json'),'utf8')),{});
});
