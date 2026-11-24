import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewWindow } from '../public/previewWindow.mjs';

const records = count => Array.from({length: count}, (_, index) => ({payload:{id:String(index)}}));
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('窗口保留完整记录，替换轮次后只呈现最新请求', async () => {
  const calls = [], renderer = {onMessageLeave() {}}, scroller = {querySelectorAll: () => [], getBoundingClientRect: () => ({top:0})};
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const window = createPreviewWindow({renderer, scroller, hydrate: async batch => { calls.push(batch.map(item => item.payload.id)); if (calls.length === 1) await gate; }, afterRender: async () => {}});
  const old = window.replace(records(571));
  await tick();
  const next = window.replace(records(80));
  release();
  assert.equal(await old, false);
  assert.equal(await next, true);
  assert.equal(window.records.length, 80);
  assert.equal(window.start, 20);
  assert.equal(calls.at(-1)[0], '20');
  assert.equal(calls.at(-1).length, 60);
});

test('窗口回收不触发离场，真实删除保留原处理', async () => {
  let leaves = 0, completed = 0;
  const renderer = {onMessageLeave(_node, done) { leaves++; done(); }};
  const node = {dataset:{compatibleEventId:'110'},getBoundingClientRect:()=>({top:0,bottom:10})};
  const scroller = {querySelectorAll:()=>[node],getBoundingClientRect:()=>({top:0})};
  const window = createPreviewWindow({renderer,scroller,hydrate:async () => {renderer.onMessageLeave(node,()=>completed++);},afterRender:async()=>{}});
  await window.replace(records(120));
  await window.move('backward');
  assert.equal(leaves, 1);
  assert.equal(completed, 2);
  renderer.onMessageLeave(node,()=>completed++);
  assert.equal(leaves, 2);
});

test('有限集合反复到达首末边界不扩容、不改变排序', async () => {
  const api = await import('../src/compat/blivechat/previewRecords.mjs');
  assert.equal(typeof api.createBlivechatFixedPreviewRecords, 'function');
  for (const mode of ['blivechat','blivechat-open']) {
    const samples = api.createBlivechatFixedPreviewRecords(mode), batches = [];
    const window = createPreviewWindow({renderer:{},scroller:{querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0})},hydrate:async batch=>batches.push(batch),afterRender:async()=>{}});
    await window.replace(samples);
    for (let round=0;round<3;round++) {
      assert.equal(await window.move('backward'),false);
      assert.equal(await window.move('forward'),false);
    }
    assert.equal(window.start,0);
    assert.equal(batches.length,1);
    assert.deepEqual(window.records,samples);
  }
});

test('点选只定位实际事件一次，节点重建后重新标记且不滚动', async () => {
  const {createRequire} = await import('node:module');
  const {JSDOM} = createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
  const api = await import('../public/previewWindow.mjs');
  assert.equal(typeof api.markPreviewEditorSelection, 'function');
  const dom = new JSDOM('<div data-compatible-event-id="first"><span class="name"></span></div><div data-compatible-event-id="picked"><span class="name"></span></div>');
  const doc = dom.window.document, calls=[];
  for (const node of doc.querySelectorAll('.name')) node.scrollIntoView=()=>calls.push(node.closest('[data-compatible-event-id]').dataset.compatibleEventId);
  const selection={eventId:'picked',part:'username',focusSelectors:['.name','.name'],pickEnabled:true};
  api.markPreviewEditorSelection(doc,selection,{scroll:true,schedule:fn=>fn()});
  assert.deepEqual(calls,['picked']);
  assert.equal(doc.querySelectorAll('[data-compatible-editor-selected]').length,2);
  doc.querySelector('[data-compatible-event-id="picked"]').innerHTML='<span class="name"></span>';
  api.markPreviewEditorSelection(doc,selection,{scroll:false,schedule:fn=>fn()});
  assert.equal(doc.querySelectorAll('[data-compatible-editor-selected]').length,2);
  assert.deepEqual(calls,['picked']);
  dom.window.close();
});

test('有限预览从首条打开，历史窗口仍默认从末尾打开', async () => {
  const batches=[],scroller={scrollTop:100,querySelectorAll:()=>[],getBoundingClientRect:()=>({top:0})};
  const window=createPreviewWindow({renderer:{},scroller,hydrate:async batch=>batches.push(batch),afterRender:async()=>{}});
  await window.replace(records(80),{fromStart:true});
  assert.equal(window.start,0);
  assert.equal(batches.at(-1)[0].payload.id,'0');
  assert.equal(scroller.scrollTop,0);
  await window.replace(records(80));
  assert.equal(window.start,20);
});

test('点选身份从实际事件容器读取并沿用身份优先级', async () => {
  const {createRequire}=await import('node:module');
  const {JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
  const api=await import('../public/previewWindow.mjs');
  const {OPENLIVE_CAPABILITY}=await import('../src/compat/openlive/theme.ts');
  assert.equal(typeof api.previewEditorIdentity,'function');
  const dom=new JSDOM('<div data-compatible-event-id="captain" privilegeType="3" is-owner="false" is-admin="false"><span id="name"></span></div>');
  const node=dom.window.document.querySelector('#name');
  const selection={identityPriority:OPENLIVE_CAPABILITY.identityPriority,scopeSelectors:{identities:OPENLIVE_CAPABILITY.identitySelectors}};
  assert.equal(api.previewEditorIdentity(node,selection),'captain');
  node.parentElement.setAttribute('is-admin','true');
  assert.equal(api.previewEditorIdentity(node,selection),'captain');
  assert.equal(api.previewEditorIdentity(node,{...selection,identityPriority:['moderator','captain','guard','normal']}),'moderator');
  dom.window.close();
});

test('静态点选切换只恢复高亮，不重新定位相同部件',async()=>{
 const api=await import('../public/previewWindow.mjs');
 assert.equal(typeof api.previewEditorSelectionNeedsScroll,'function');
 const selected={part:'username',scope:{eventType:'superchat',identity:'all',placement:'main'},focusSelectors:['.sc #author-name'],pickEnabled:true,reveal:true};
 const still={...selected,pickEnabled:false,reveal:false};
 assert.equal(api.previewEditorSelectionNeedsScroll(selected,still),false);
 assert.equal(api.previewEditorSelectionNeedsScroll(still,selected),false);
 assert.equal(api.previewEditorSelectionNeedsScroll(selected,{...selected,eventId:'middle'}),true);
 assert.equal(api.previewEditorSelectionNeedsScroll(selected,{...selected,part:'avatar',focusSelectors:['.sc #author-photo']}),true);
});
