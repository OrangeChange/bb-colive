import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {getNativeEventSample} from './fixtures/nativeEventSamples.ts';
let vite,EventRow;
before(async()=>{vite=await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeArchiveAppearance.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,server:{middlewareMode:true,watch:null},logLevel:'silent'});({EventRow}=await vite.ssrLoadModule('/src/components/EventRow.tsx'));});
after(async()=>{await vite?.close();});
const render=(ev,props={})=>renderToStaticMarkup(React.createElement(EventRow,{ev,reviewLayout:true,...props}));
test('回看保留原紧凑正文和右侧时间，不生成默认卡片表头',()=>{
 const html=render(getNativeEventSample('normal-gift'));
 assert.doesNotMatch(html,/class="event-card|class="event-header/);
 assert.match(html,/data-event-surface="archive"/);
 assert.match(html,/event-surface-archive/);
 assert.match(html,/class="event-body"/);
 assert.match(html,/<time class="time w-\[72px\]/);
});
test('购买等级、完整身份和回看范围分别输出，保留有效身份属性',()=>{
 const ev=getNativeEventSample('guard-admiral');ev.user.guardLevel=1;
 const html=render(ev);
 assert.match(html,/guard-purchase-level-2/);
 assert.match(html,/guard-level-3/);
 assert.match(html,/data-event-role="captain"/);
 assert.doesNotMatch(html,/event-identity-/);
 assert.match(html,/event-surface-archive/);
 assert.doesNotMatch(render(ev,{reviewLayout:false}),/event-surface-archive/);
});
test('回看盲盒文案跟随默认样式，不带来源括号',()=>{
 const ev=getNativeEventSample('normal-gift');ev.gift.blindGiftName='盲盒';ev.gift.blindPriceRmb=9;
 assert.doesNotMatch(render(ev),/（|）/);
});
test('新默认规则排除回看，回看字体与布局独立',()=>{
 const css=readFileSync('src/eventStyle.css','utf8').replace(/\s+/g,' ').replace(/\s*([:;,{}])\s*/g,'$1');
 assert.doesNotMatch(css,/event-surface-archive|\.review/);
 assert.match(readFileSync("src/themes/nativeDefaultStyle.generated.css","utf8"),/:where\(\.theme-surface\)/);
 const archive=readFileSync('src/archiveEventStyle.css','utf8');
 assert.match(archive,/font-weight:\s*500/);
 assert.match(archive,/display:\s*flex/);
});
test('警告和切断试看背景明暗均为50%',async()=>{
 const {default:postcss}=await import('postcss');
 const root=postcss.parse(readFileSync('src/eventStyle.css','utf8'));
 for(const name of ['live-warning','live-cutoff']){
  const backgrounds=[];
  root.walkRules(rule=>{if(rule.selector.includes(`.${name}`))rule.walkDecls('background',d=>backgrounds.push(d.value.replace(/\s+/g,'')));});
  assert.equal(backgrounds.length,2);
  assert.match(backgrounds[0], /#[a-f0-9]{6}80\)/);
  assert.match(backgrounds[1], /rgba\([^)]*,0\.5\)/);
  for(const value of backgrounds)assert.ok(value.includes('var(--event-background,'));
 }
});

test('回看区域不继承新默认的内留白与行间隔',()=>{
 for(const file of ['ReviewSessionTimeline','ReviewOwnerEventResults','ReviewFavoritesPanel']){
  const source=readFileSync(`src/components/${file}.tsx`,'utf8');
  assert.match(source,/event-area review/);
  assert.doesNotMatch(source,/EventAreaStyleConfig/);
 }
});

test('试看事件框与置顶共用30%填充，回看不使用该填充',()=>{
 const css=readFileSync('src/eventStyle.css','utf8').replace(/\s+/g,' ').replace(/\s*([:;,{}])\s*/g,'$1');
 assert.equal((css.match(/--native-tint:30%/g)||[]).length,2);
 assert.match(css,/event-sticky[^}]*background:var\(--event-background,var\(--native-fill\)\)/);
});
