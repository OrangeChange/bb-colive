import test from 'node:test';import assert from 'node:assert/strict';
import {nativeVisualCodeDefault} from '../src/themes/nativeThemeDefaults.ts';
import {createBuiltinNativeTheme} from '../src/themes/nativeBuiltinThemes.ts';
const settings=createBuiltinNativeTheme('native-default').settings;
const target=part=>({event:'all',identity:'all',part});
test('继承文字行高与基准字号比例一致',()=>assert.equal(nativeVisualCodeDefault(target('event'),'lineHeight',settings),1.25));
test('头像和礼物图片使用一点五倍基准字号',()=>{for(const part of ['avatar','giftImage'])assert.deepEqual(nativeVisualCodeDefault(target(part),'width',settings),{mode:'base-relative',ratio:1.5})});

import {readFileSync} from 'node:fs';
import postcss from 'postcss';
test('活动媒体独立跨行，隐藏头像后不保留空列',()=>{
 const root=postcss.parse(readFileSync(new URL('../src/eventStyle.css',import.meta.url),'utf8'));const rules=[];root.walkRules(rule=>rules.push(rule));
 assert(rules.some(r=>r.selector.replace(/\s+/g,' ')==='.event:is(.lottery-start, .redpocket-start) > .avatar-wrap'&&r.nodes.some(d=>d.prop==='grid-row'&&d.value==='1 / span 2')));
 assert(rules.some(r=>r.selector.replace(/\s+/g,' ')==='.event:is(.lottery-start, .redpocket-start):not(:has(> .avatar-wrap)) .content'&&r.nodes.some(d=>d.prop==='grid-column'&&d.value==='1/-1')));
});
test('开奖类别标题使用辅助字阶，保留独立正文摘要',()=>{
 const root=postcss.parse(readFileSync(new URL('../src/eventStyle.css',import.meta.url),'utf8'));const rules=[];root.walkRules(r=>{if(r.selector==='.event .result-title')rules.push(r)});
 assert(rules.some(r=>r.nodes.some(d=>d.prop==='font-size'&&d.value==='var(--native-meta)')));
});
