import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

test('未验证手机号显示默认关闭，已验证和未知保留，开启恢复且两个子类可共存',async()=>{
  const vite=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-phoneVerificationDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent'});
  try {
    const prefs=await vite.ssrLoadModule('/src/eventDisplaySettings.ts');
    const {EventRow}=await vite.ssrLoadModule('/src/components/EventRow.tsx');
    const {MsgType}=await vite.ssrLoadModule('/src/protocol/types.ts');
    assert.equal(prefs.normalizeEventDisplayPreferences({}).showPhoneNotVerified,false);
    for (const [flag,want] of [[false,false],[true,true],[undefined,true]]) {
      const ev={id:'phone',msgType:MsgType.Danmu,roomId:1,ts:1,text:'你好',user:{uid:'1',uname:'用户',guardLevel:0,phoneVerified:flag},isAutoDanmaku:true};
      assert.equal(prefs.shouldShowPhoneNotVerified(ev,false),want);
      assert.equal(prefs.shouldShowPhoneNotVerified(ev,true),true);
      for(const layout of [{liveLayout:true},{reviewLayout:true},{}]) {
        const html=renderToStaticMarkup(React.createElement(EventRow,{ev,...layout}));
        assert.equal(html.includes('chat-phone-unverified'),flag===false);
        assert.match(html,/type-chat chat-auto/);
      }
    }
    assert.equal(prefs.shouldShowPhoneNotVerified({msgType:MsgType.Gift,user:{phoneVerified:false}},false),true);
  } finally {await vite.close();}
});

test('显示与自动开关独立、过滤在合并前且开关重投影；回看不改变默认导出',async()=>{
  const vite=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-phoneVerificationDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent'});
  try {
    const {projectDisplayEvents}=await vite.ssrLoadModule('/src/windows/displayWindowModel.ts');
    const {updateEventProjection}=await vite.ssrLoadModule('/src/events/eventView.ts');
    const {projectArchiveEvents}=await vite.ssrLoadModule('/src/archive/archiveProjection.ts');
    const {normalizeEventWindowPreferences}=await vite.ssrLoadModule('/src/windows/eventWindowPreferences.ts');
    const events=[false,true,undefined].flatMap((phoneVerified,index)=>[false,true].map((isAutoDanmaku,auto)=>({id:`${index}-${auto}`,msgType:0,roomId:1,ts:1000+index*10+auto,text:'同文',user:{uid:'1',uname:'用户',guardLevel:0,phoneVerified},isAutoDanmaku})));
    for (const [showPhoneNotVerified,showAutoDanmaku,want] of [[false,false,2],[false,true,4],[true,false,3],[true,true,6]]) {
      const rows=projectDisplayEvents(events,{mergeSameDanmu:true,sameDanmuWindowSeconds:8,showPhoneNotVerified,showAutoDanmaku});
      assert.equal(rows.length,1);assert.equal(rows[0].danmuRepeatCount,want);
    }
    const on=updateEventProjection(null,events,'left',{danmu:true},0,1,{},'unit',false,true,true);
    const off=updateEventProjection(on,events,'left',{danmu:true},0,1,{},'unit',false,true,false);
    assert.deepEqual(off.indices,[2,3,4,5]);
    const records=events.map((event,index)=>({eventKey:event.id,sessionId:'s',roomId:1,ordinal:index,eventTs:event.ts,primaryCategory:'danmu',payloadJson:JSON.stringify(event)}));
    assert.equal(projectArchiveEvents(records,{showPhoneNotVerified:false}).length,4);
    assert.equal(projectArchiveEvents(records).length,6);
    assert.equal(normalizeEventWindowPreferences({display:{showPhoneNotVerified:true}}).display.showPhoneNotVerified,true);
  } finally {await vite.close();}
});
