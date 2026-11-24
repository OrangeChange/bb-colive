import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createLaplaceRemoteTheme} from '../src/themes/laplaceThemeSources.ts';
import {localizeThemeResources} from '../src/themes/themeResourceDependencies.ts';
import postcss from 'postcss';

test('开放版仿微信使用完整 CSS 而不是未展开的生成器模板',async()=>{
 const css=await fs.readFile('resources/theme-catalog/blivechat-open-wechat.css','utf8');
 assert.doesNotThrow(()=>postcss.parse(css));
 assert.ok(!css.includes('${typeSelector}'));
});
test('内置橙子色块保留来源导入而不展开字体声明',async()=>{
 const raw=await fs.readFile('public/laplace/templates/orange-block.css','utf8');
 assert.equal(await fs.readFile('resources/theme-catalog/laplace-builtin-orange-block.css','utf8'),raw);
});
test('网址主题保存来源文本与相对引用原文',()=>{
 const css='/* source */\n@import "./font.css" screen;\n.a{background:url(./a.png)}';
 const d=createLaplaceRemoteTheme({id:'x',url:'https://example.test/theme.css',baseUrl:'https://cdn.example.test/dir/theme.css',css,metadata:null,fetchedAt:'2026-11-11'});
 assert.equal(d.styles.baseCss,css);
});
test('保存远程引用不改原始CSS字面内容',async()=>{
 const css='@import url(\'./font.css\') screen;\n.a{background:url( ./a.png )}';
 const d=createLaplaceRemoteTheme({id:'x',url:'https://example.test/theme.css',css,metadata:null,fetchedAt:'2026-11-11'});
 const result=await localizeThemeResources(d,'https://example.test/theme.css',{load(){throw Error('保存不应下载网络资源')}},'preserve');
 assert.equal(result.document.styles.baseCss,css);
});

test('重定向后的相对资源只在运行副本中解析',async()=>{
 const {routeThemeRemoteUrls}=await import('../src/themes/themeRemoteCss.ts');
 const css='@import "./font.css"; .a{background:url(./a.png)}';
 const document=createLaplaceRemoteTheme({id:'x',url:'https://example.test/old.css',baseUrl:'https://cdn.example.test/dir/theme.css',css,metadata:null,fetchedAt:'2026-11-11'});
 const actual=routeThemeRemoteUrls(document,'http://127.0.0.1:17926');
 assert.equal(document.styles.baseCss,css);
 assert.ok(actual.styles.baseCss.includes(encodeURIComponent('https://cdn.example.test/dir/font.css')));
 assert.ok(actual.styles.baseCss.includes(encodeURIComponent('https://cdn.example.test/dir/a.png')));
});
