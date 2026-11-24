import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
test('真实giftBridge关闭期间维护固定候选，ready只重播有效固定投影、撤回与切房清理',async()=>{
  const alias=fileURLToPath(new URL('./helpers/stickyBridgePorts.ts',import.meta.url));
  const vite=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-stickyBridge.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{watch:null,middlewareMode:true},logLevel:'silent',resolve:{alias:Object.fromEntries(['@tauri-apps/api/event','@tauri-apps/api/window','@tauri-apps/api/webviewWindow','@tauri-apps/api/core','@tauri-apps/plugin-store'].map(name=>[name,alias]))}});
  const originalNow=Date.now;let now=1700000000000;Date.now=()=>now;
  let stop, bridge;
  try {
    bridge=await vite.ssrLoadModule('/src/windows/giftBridge.ts');
    const {ports}=await vite.ssrLoadModule('/tests/helpers/stickyBridgePorts.ts');
    const {DEFAULT_EVENT_WINDOW_PREFERENCES:defaults}=await vite.ssrLoadModule('/src/windows/eventWindowPreferences.ts');
    stop=await bridge.startGiftBridge();
    bridge.switchGiftWindowRoom(1);bridge.setGiftWindowPreferences({...defaults,stickyEvents:{...defaults.stickyEvents,enabled:true}});
    const gift={id:'g',roomId:1,ts:now,msgType:1,gift:{id:1,name:'花',count:1,paymentRmb:30,totalRmb:30,coinType:'gold'}};
    await bridge.openGiftWindow();
    const requests=()=>ports.messages.filter(x=>x.name==='gift:ready-request');
    const ready=async()=>{const request=requests().at(-1);assert.ok(request);await ports.emitTo('main','gift:ready',request.payload);};
    await ready();bridge.publishGiftEvent(gift);await bridge.closeGiftWindow();
    now+=10000;bridge.publishGiftEvent({...gift,id:'closed',ts:now});
    now+=10000;await bridge.openGiftWindow();const begin=ports.messages.length;await ready();
    const replay=ports.messages.slice(begin);
    const snapshot=replay.find(x=>x.name==='event-window:sticky-snapshot').payload.events;
    assert.deepEqual(snapshot.map(x=>[x.id,x.firstOccurredAt]),[['g',1700000000000],['closed',1700000010000]]);
    assert.equal(replay.filter(x=>x.name==='gift:events').length,0);
    await bridge.closeGiftWindow();
    bridge.publishGiftEvent({id:'sc',roomId:1,ts:now,msgType:2,sc:{price:30,duration:120,message:'SC正文'}});
    bridge.publishGiftEvent({id:'del',roomId:1,ts:now,msgType:17,scDeleteIds:['sc']});
    now=1700000070000;await bridge.openGiftWindow();await ready();
    assert.deepEqual(ports.messages.filter(x=>x.name==='event-window:sticky-snapshot').at(-1).payload.events,[]);
    const {MsgType}=await vite.ssrLoadModule('/src/protocol/types.ts');
    const {selectStickyEvents}=await vite.ssrLoadModule('/src/windows/stickyEventModel.ts');
    for(const [msgType,time] of [[MsgType.AnchorLotStart,'maxTime'],[MsgType.RedPocketStart,'waitTime']]) {
      const startedAt=now;
      const first={id:`first-${msgType}`,roomId:1,ts:now,msgType,lottery:{id:9,[time]:120}};
      bridge.publishGiftEvent(first);await bridge.closeGiftWindow();
      now+=10000;bridge.publishGiftEvent({...first,id:`second-${msgType}`,ts:now});
      await bridge.openGiftWindow();await ready();
      const cards=selectStickyEvents(ports.messages.filter(x=>x.name==='event-window:sticky-snapshot').at(-1).payload.events,{...defaults.stickyEvents,enabled:true},now).filter(card=>card.event.msgType===msgType);
      assert.equal(cards.length,1);assert.equal(cards[0].expiresAt,startedAt+120000);
      bridge.publishGiftEvent({...first,id:`award-${msgType}`,msgType:msgType===MsgType.AnchorLotStart?MsgType.AnchorLotAward:MsgType.RedPocketWinner,ts:now});
    }
    bridge.publishGiftEvent({...gift,id:'new',ts:now});bridge.switchGiftWindowRoom(2);await ready();
    assert.deepEqual(ports.messages.filter(x=>x.name==='event-window:sticky-snapshot').at(-1).payload.events,[]);
    bridge.publishGiftEvent({...gift,id:'room2',roomId:2,ts:now});
    bridge.setGiftWindowPreferences(defaults);bridge.setGiftWindowPreferences({...defaults,stickyEvents:{...defaults.stickyEvents,enabled:true}});
    await bridge.closeGiftWindow();await bridge.openGiftWindow();await ready();
    assert.deepEqual(ports.messages.filter(x=>x.name==='event-window:sticky-snapshot').at(-1).payload.events,[]);
    await bridge.closeGiftWindow();
  } finally {await bridge?.closeGiftWindow();stop?.();Date.now=originalNow;await vite.close();}
});
