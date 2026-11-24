import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveThemeResourceSource } from '../src/themes/themeRemoteCss.ts';
import { rebaseThemeResourceOrigin } from '../src/themes/themeResourceOrigin.ts';

test('旧快照素材映射保留完整远程来源，引用现有主题', () => {
 const aliases = JSON.parse(fs.readFileSync('src-tauri/style-distribution/catalog-assets.json', 'utf8'));
 const originals = JSON.parse(fs.readFileSync('resources/theme-catalog/legacy-assets.json', 'utf8'));
 const ids = new Set();
 for (const mode of ['native','blc','blc-open','laplace']) for (const entry of fs.readdirSync(`src-tauri/style-distribution/${mode}`,{withFileTypes:true})) {
   if (entry.isDirectory()) ids.add(JSON.parse(fs.readFileSync(`src-tauri/style-distribution/${mode}/${entry.name}/theme.json`,'utf8')).themeId);
 }
 assert.ok(Object.keys(aliases).length > 200);
 for (const [previous, original] of Object.entries(originals)) {
   const entry = aliases[previous];
   assert.ok(entry, previous);
   assert.equal(entry.path, previous);
   assert.ok(ids.has(entry.themeId), entry.themeId);
   assert.equal(entry.sourceUrl, resolveThemeResourceSource(original.sourceUrl));
   assert.match(entry.sourceUrl, /^(https?:\/\/|data:image\/svg\+xml;base64,)/);
   if(entry.sourceUrl.startsWith('data:'))assert.match(Buffer.from(entry.sourceUrl.split(',')[1],'base64').toString('utf8'), /<svg[\s>]/);
   assert.equal(entry.mediaType, original.mediaType);
 }
});

test('端口切换保留旧快照语义及内嵌素材，只重定向本机CSS地址', () => {
 const snapshot = { themeId:'laplace-builtin-bubble',revision:3,roomId:'123',settings:{sceneName:'blue'},css:'a{src:url(http://127.0.0.1:17920/theme-catalog/assets/catalog-1.ttf)}',document:{styles:{customCss:'b{background:url(data:image/png;base64,AQ==)}',baseCss:'c{src:url(http://localhost:17920/theme-assets/custom/catalog-2.ttf)}'}} };
 const before=structuredClone(snapshot);
 const result=rebaseThemeResourceOrigin(snapshot,'http://127.0.0.1:17925');
 assert.deepEqual(snapshot,before);
 assert.equal(result.themeId,snapshot.themeId);assert.equal(result.revision,3);assert.deepEqual(result.settings,snapshot.settings);
 assert.match(result.css,/17925\/theme-catalog\/assets/);
 assert.match(result.document.styles.baseCss,/17925\/theme-assets/);
 assert.equal(result.document.styles.customCss,snapshot.document.styles.customCss);
});
