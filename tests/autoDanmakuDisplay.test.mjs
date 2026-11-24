import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test('自动弹幕显示偏好默认开启，关闭只隐藏已标记弹幕；公共子类不影响其他事件', async () => {
  const vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-autoDanmakuDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent'});
  try {
    const settings = await vite.ssrLoadModule('/src/eventDisplaySettings.ts');
    const {publicEventClass} = await vite.ssrLoadModule('/src/events/publicEventStyle.ts');
    const {MsgType} = await vite.ssrLoadModule('/src/protocol/types.ts');
    assert.equal(settings.normalizeEventDisplayPreferences({}).showAutoDanmaku,true);
    const off = settings.normalizeEventDisplayPreferences({showAutoDanmaku:false});
    for (const [flag,want] of [[true,false],[false,true],[undefined,true]]) {
      const event={msgType:MsgType.Danmu,isAutoDanmaku:flag};
      assert.equal(settings.shouldShowAutoDanmaku(event,off.showAutoDanmaku),want);
      assert.equal(publicEventClass(event),flag===true?'type-chat chat-auto':'type-chat');
    }
    assert.equal(settings.shouldShowAutoDanmaku({msgType:MsgType.Gift,isAutoDanmaku:true},false),true);
  } finally {await vite.close();}
});

test('现场切换开关重建索引，回看显示过滤不改导出默认投影，副窗同步关闭偏好',async()=>{
  const vite=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-autoDanmakuDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent'});
  try {
    const {updateEventProjection}=await vite.ssrLoadModule('/src/events/eventView.ts');
    const {projectArchiveEvents}=await vite.ssrLoadModule('/src/archive/archiveProjection.ts');
    const {normalizeEventWindowPreferences}=await vite.ssrLoadModule('/src/windows/eventWindowPreferences.ts');
    const {EventRow}=await vite.ssrLoadModule('/src/components/EventRow.tsx');
    const {MsgType}=await vite.ssrLoadModule('/src/protocol/types.ts');
    const events=[{id:'auto',msgType:MsgType.Danmu,roomId:1,ts:1000,text:'口令',isAutoDanmaku:true},{id:'old',msgType:MsgType.Danmu,roomId:1,ts:2000,text:'口令'}];
    const filters={danmu:true,interact:true};
    const on=updateEventProjection(null,events,'left',filters,0,1,{},'unit',false,true);
    const off=updateEventProjection(on,events,'left',filters,0,1,{},'unit',false,false);
    assert.deepEqual(off.indices,[1]);assert.equal(off.filteredByReason['auto-danmaku'],1);
    assert.deepEqual(updateEventProjection(off,events,'left',filters,0,1,{},'unit',false,true).indices,[0,1]);
    const records=events.map((event,index)=>({eventKey:event.id,sessionId:'s',roomId:1,ordinal:index,eventTs:event.ts,primaryCategory:'danmu',payloadJson:JSON.stringify(event)}));
    assert.deepEqual(projectArchiveEvents(records,{showAutoDanmaku:false}).map(row=>row.eventKey),['old']);
    assert.equal(projectArchiveEvents(records).length,2);
    const copied=JSON.parse(JSON.stringify(normalizeEventWindowPreferences({display:{showAutoDanmaku:false}})));
    assert.equal(normalizeEventWindowPreferences(copied).display.showAutoDanmaku,false);
    for (const layout of [{liveLayout:true},{reviewLayout:true},{}]) {
      const html=renderToStaticMarkup(React.createElement(EventRow,{ev:events[0],...layout}));
      assert.match(html,/type-chat chat-auto/);
    }
  } finally {await vite.close();}
});

test('弹幕窗先过滤后合并；开关切换重新投影，相同自动与普通消息仍合并',async()=>{
  const vite=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-autoDanmakuDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent'});
  try {
    const {projectDisplayEvents}=await vite.ssrLoadModule('/src/windows/displayWindowModel.ts');
    const {MsgType}=await vite.ssrLoadModule('/src/protocol/types.ts');
    const events=[{id:'auto',msgType:MsgType.Danmu,roomId:1,ts:1000,text:'口令',isAutoDanmaku:true},{id:'normal',msgType:MsgType.Danmu,roomId:1,ts:2000,text:'口令'}];
    const settings={mergeSameDanmu:true,sameDanmuWindowSeconds:8};
    const off=projectDisplayEvents(events,{...settings,showAutoDanmaku:false});
    assert.equal(off.length,1);assert.equal(off[0].id,'normal');assert.equal(off[0].danmuRepeatCount,undefined);
    const on=projectDisplayEvents(events,{...settings,showAutoDanmaku:true});
    assert.equal(on.length,1);assert.equal(on[0].danmuRepeatCount,2);
    assert.equal(events.length,2);assert.equal(events[0].danmuRepeatCount,undefined);
  } finally {await vite.close();}
});
