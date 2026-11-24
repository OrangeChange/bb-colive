import { readUiSource } from "./helpers/readUiSource.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
let generateCustomPalette, contrastRatio;
try { ({ generateCustomPalette, contrastRatio } = await import('../src/customPalette.ts')); } catch (error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
test('自定义主题为常用及极端颜色生成可读的深浅配色',()=>{
 assert.equal(typeof generateCustomPalette,'function');
 for(const seed of ['#ff0000','#ffff00','#0000ff','#7c3aed','#888888','#ffffff','#000000','#e04e7e'])for(const scheme of ['light','dark']){
  const c=generateCustomPalette(seed,scheme);
  for(const bg of ['--bg','--surface','--surface-raised'])for(const text of ['--text-1','--text-2','--text-3'])assert(contrastRatio(c[text],c[bg])>=4.5,`${seed} ${scheme} ${text} ${bg}`);
  for(const bg of ['--accent-solid','--accent-solid-hover','--accent-solid-active'])assert(contrastRatio(c['--accent-fg'],c[bg])>=4.5,`${seed} ${scheme} ${bg}`);
  assert.equal(c['--accent'],seed.toLowerCase());
 }
});

test('实心控件保留白色前景，并采用已确认的浅蓝配色',()=>{
 for(const scheme of ['light','dark']) {
  const c=generateCustomPalette('#cfe8ff',scheme);
  assert.equal(c['--accent-fg'],'#ffffff');
  const solid=c['--accent-solid'].match(/[\d.]+/g).map(Number);assert(solid[2]-solid[0]>=80,'浅蓝按钮保持鲜明蓝色');
  for(const seed of ['#f5c542','#808080','#ffffff','#000000','#00ffaa','#e04e7e']) {
   const palette=generateCustomPalette(seed,scheme);
   assert.equal(palette['--accent-fg'],'#ffffff');
   for(const state of ['--accent-solid','--accent-solid-hover','--accent-solid-active'])assert(contrastRatio('#ffffff',palette[state])>=4.5,`${seed} ${scheme} ${state}`);
  }
 }
});

test('强调文字在软件各层表面和强调浅底上保持可读',()=>{
 for(const seed of ['#fce9f2','#20df40','#808080','#f5c542','#00ffaa','#000000','#ffffff'])for(const scheme of ['light','dark']){
  const c=generateCustomPalette(seed,scheme);
  const channels=value=>value.startsWith('#') ? value.slice(1).match(/../g).map(part=>parseInt(part,16)) : value.match(/[\d.]+/g).slice(0,3).map(Number);
  for(const bg of ['--bg','--surface','--surface-raised']){
   assert(contrastRatio(c['--accent-text'],c[bg])>=4.5,`${seed} ${scheme} ${bg}`);
   const base=channels(c[bg]),accent=channels(c['--accent']);
   const tint=`rgb(${base.map((v,i)=>Math.round(v*.85+accent[i]*.15)).join(',')})`;
   assert(contrastRatio(c['--accent-text'],tint)>=4.5,`${seed} ${scheme} tinted ${bg}`);
  }
 }
});

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import * as custom from '../src/customPalette.ts';
import { componentRuntime } from './helpers/componentRuntime.mjs';
function themeStore(saved) {
 let text=saved ? JSON.stringify({state:saved,version:0}) : null;
 const storage={getItem:()=>text,setItem:(_key,value)=>{text=value},removeItem:()=>{text=null}};
 const load=()=>componentRuntime('src/theme.ts',{
  zustand:{create},'zustand/middleware':{persist:(config,options)=>persist(config,{...options,storage:createJSONStorage(()=>storage)})},
  './customPalette.ts':custom,
 }).exports.useTheme;
 return {load};
}
test('樱花粉默认，左侧按樱花粉、青瓷绿、自定义循环且保存主色',()=>{
 const f=themeStore(), store=f.load();assert.equal(store.getState().palette,'sakura');
 for(const palette of ['pine','custom','sakura']){store.getState().cyclePalette();assert.equal(store.getState().palette,palette);}
 store.getState().setCustomColor('#7c3aed');store.getState().setPalette('custom');
 assert.equal(f.load().getState().customColor,'#7c3aed');assert.equal(f.load().getState().palette,'custom');
});
test('已有青瓷绿选择保留，自定义主色使用默认值补齐',()=>{
 const store=themeStore({palette:'pine',mode:'dark'}).load();assert.equal(store.getState().palette,'pine');assert.equal(store.getState().mode,'dark');assert.equal(store.getState().customColor,custom.DEFAULT_CUSTOM_COLOR);
});

test('自定义主色的浅底保持透明混色，不变成实心种子色',()=>{
 for(const seed of ['#cfe8ff','#fb7299','#000000'])for(const scheme of ['light','dark']){
  const palette=generateCustomPalette(seed,scheme);
  assert.match(palette['--accent-subtle'],/^rgba\(/);
  assert.ok(palette['--accent-subtle'].endsWith(scheme==='dark'?', 0.14)':', 0.1)'));
 }
});

import {readFileSync} from 'node:fs';
import postcss from 'postcss';
test('预设配色采用候选 A，亮绿指示与状态文字分开',()=>{
 const root=postcss.parse(readUiSource('src/App.css','utf8'));
 const tokens=selector=>Object.fromEntries(root.nodes.find(n=>n.selector?.replace(/\s/g,'')===selector.replace(/\s/g,'')).nodes.filter(n=>n.type==='decl').map(n=>[n.prop,n.value]));
 const pink=tokens(':root,\n:root[data-theme="sakura"]'),green=tokens(':root[data-theme="pine"]');
 assert.equal(pink['--accent'],'#fb7299');assert.equal(pink['--accent-solid'],'#d43870');
 assert.equal(green['--accent'],'#4c9a8d');assert.equal(green['--accent-solid'],'#388174');
 for(const c of [pink,green])assert(contrastRatio(c['--accent-fg'],c['--accent-solid'])>=4.5);
 const status=root.nodes.filter(n=>n.selector===':root').flatMap(n=>n.nodes).filter(n=>n.prop?.startsWith('--status-success'));
 assert.deepEqual(Object.fromEntries(status.map(n=>[n.prop,n.value])),{'--status-success':'#15803d','--status-success-indicator':'#16a34a'});
});
