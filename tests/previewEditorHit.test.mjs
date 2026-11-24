import test from 'node:test';
import assert from 'node:assert/strict';
import * as picker from '../public/previewEditorHit.mjs';
const element=(parent,selectors,box)=>({parentElement:parent,matches:s=>selectors.includes(s),closest(s){return this.matches(s)?this:parent?.closest(s)},getBoundingClientRect:()=>box});
test('子部件内部与父级内缘使用各自的命中区域',()=>{
 const root=element(null,['.event'],{left:0,top:0,right:300,bottom:80,width:300,height:80});
 const user=element(root,['.user'],{left:20,top:20,right:180,bottom:44,width:160,height:24});
 const name=element(user,['.name'],{left:20,top:20,right:100,bottom:44,width:80,height:24});
 const selectors={event:['.event'],userInfo:['.user'],username:['.name']};
 assert.equal(picker.pickPreviewEditorPart(name,selectors,{x:55,y:30}).part,'username');
 assert.equal(picker.pickPreviewEditorPart(name,selectors,{x:55,y:21}).part,'userInfo');
 assert.equal(picker.pickPreviewEditorPart(root,selectors,{x:1,y:30}).part,'event');
 assert.equal(picker.pickPreviewEditorPart(name,selectors,{x:301,y:30}),null);
});

test('不支持当前区域的部件不参与点选',()=>{
 const root=element(null,['.event'],{left:0,top:0,right:100,bottom:40,width:100,height:40});
 const meta=element(root,['.meta'],{left:0,top:0,right:100,bottom:40,width:100,height:40});
 assert.equal(picker.pickPreviewEditorPart(meta,{event:['.event'],meta:['.meta']},{x:30,y:20},part=>part!=='meta').part,'event');
});

test('窄置顶卡片中金额内部不被整张卡片抢选',()=>{
 const root=element(null,['.ticker'],{left:0,top:0,right:72,bottom:28,width:72,height:28});
 const price=element(root,['.price'],{left:24,top:4,right:62,bottom:24,width:38,height:20});
 const selectors={event:['.ticker'],amount:['.price']};
 assert.equal(picker.pickPreviewEditorPart(price,selectors,{x:40,y:14}).part,'amount');
 assert.equal(picker.pickPreviewEditorPart(price,selectors,{x:40,y:1}).part,'event');
});

test('点选框取当前软件配色，并按预览明暗解析强调色',async()=>{
 const {createRequire}=await import('node:module');
 const {JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
 const dom=new JSDOM(`<style>:root,:root[data-theme=pine]{--accent:#327369}:root[data-theme=pine].dark{--accent:#4c9a8d}:root[data-theme=sakura]{--accent:#e04e7e}:root[data-theme=sakura].dark{--accent:#fb7299}</style>`);
 const doc=dom.window.document;
 doc.documentElement.dataset.theme='pine';
 assert.equal(picker.previewEditorAccent(doc,'light'),'#327369');
 assert.equal(picker.previewEditorAccent(doc,'dark'),'#4c9a8d');
 doc.documentElement.dataset.theme='sakura';
 assert.equal(picker.previewEditorAccent(doc,'light'),'#e04e7e');
 assert.equal(picker.previewEditorAccent(doc,'dark'),'#fb7299');
 dom.window.close();
});
