import test from 'node:test';
import assert from 'node:assert/strict';
import { windowDiagnosticRuntime, mountFloatingWindow } from './helpers/windowDiagnosticRuntime.mjs';
import { MsgType } from '../src/protocol/types.ts';
import { readFileSync } from 'node:fs';

test('副窗具有显示和原生材质权限，偏好同步前不显示', async () => {
  const capabilities = JSON.parse(readFileSync(new URL('../src-tauri/capabilities/display-window.json', import.meta.url), 'utf8'));
  const runtime = await windowDiagnosticRuntime('gift-only'); let cleanup;
  try {
    let shown = false;
    runtime.port.window.show = async () => {
      if (!capabilities.windows.includes('gift-only') || !capabilities.permissions.includes('core:window:allow-show')) throw new Error('window.show not allowed');
      shown = true;
    };
    cleanup = await mountFloatingWindow(runtime);
    assert.equal(shown, false);
    assert.ok(capabilities.permissions.includes('core:window:allow-set-effects'));
  } finally { await cleanup?.(); await runtime.finish(); }
});

test('三个收益子窗可恢复紧凑尺寸，不被组合窗最小高度拒绝', async () => {
  for (const [label, height] of [['gift-only', 160], ['superchat', 160], ['guard', 120]]) {
    const runtime = await windowDiagnosticRuntime(label); let cleanup;
    try {
      const store = await runtime.port.load(`${label}-window.local.json`);
      await store.set('geometry', { x: 400, y: 10, width: 300, height });
      cleanup = await mountFloatingWindow(runtime);
      assert.ok(runtime.port.calls.some(call => call.command === 'setSize' && call.width === 300 && call.height === height), label);
    } finally { await cleanup?.(); await runtime.finish(); }
  }
});

test('恢复布局保存原生读回的实际尺寸位置，不把请求值当作成功结果', async () => {
  const runtime=await windowDiagnosticRuntime('gift-only'); let cleanup;
  try {
    cleanup=await mountFloatingWindow(runtime);
    runtime.port.window.innerSize=async()=>({width:310,height:245});
    runtime.port.window.outerPosition=async()=>({x:490,y:12});
    await runtime.port.emitTo('gift-only','gift-only:reset-geometry',{width:300,height:240,x:492,y:10,center:false});
    const saved=await (await runtime.port.load('gift-only-window.local.json')).get('geometry');
    assert.deepEqual(saved,{width:310,height:245,x:490,y:12});
  } finally { await cleanup?.(); await runtime.finish(); }
});

test('实际三副窗按类别显示普通与固定事件，切房清空，关闭保存独立几何和诊断', async () => {
  for(const [label,type] of [['gift-only',MsgType.Gift],['superchat',MsgType.SuperChat],['guard',MsgType.GuardBuy]]) {
    const runtime=await windowDiagnosticRuntime(label); let cleanup;
    try {
      const store=await runtime.port.load(`${label}-window.local.json`);
      const geometry={x:-1000,y:40,width:500,height:450}; await store.set('geometry',geometry);
      cleanup=await mountFloatingWindow(runtime);
      assert.ok(runtime.port.calls.some(c=>c.command==='setPosition'&&c.x===geometry.x&&c.y===geometry.y));
      assert.ok(runtime.port.calls.some(c=>c.command==='setSize'&&c.width===geometry.width&&c.height===geometry.height));
      const {DEFAULT_EVENT_WINDOW_PREFERENCES:p}=await runtime.server.ssrLoadModule('/src/windows/eventWindowPreferences.ts');
      await runtime.port.emitTo(label,'event-window:preferences',{...p,stickyEvents:{...p.stickyEvents,enabled:true}});
      const room={roomId:11,generation:1};
      await runtime.port.emitTo(label,`${label}:room-changed`,room);
      const events=[MsgType.Gift,MsgType.SuperChat,MsgType.GuardBuy].map(msgType=>({id:String(msgType),msgType,roomId:11,ts:Date.now(),gift:{paymentRmb:30,totalRmb:30},sc:{price:30,duration:120},guard:{priceRmb:198}}));
      for(const event of events)await runtime.port.emitTo(label,`${label}:events`,event);
      assert.deepEqual(runtime.port.states[0].value.map(e=>e.msgType),[type]);
      await runtime.port.emitTo(label,'event-window:sticky-snapshot',{...room,events});
      assert.deepEqual(runtime.port.states[1].value.map(e=>e.msgType),[type]);
      await runtime.port.emitTo(label,`${label}:room-changed`,{roomId:22,generation:2});
      await runtime.port.emitTo(label,`${label}:events`,events[0]);
      assert.equal(runtime.port.states[0].value.length,0); assert.equal(runtime.port.states[1].value.length,0);
      await runtime.port.close({preventDefault(){}});
      assert.ok(runtime.port.calls.some(c=>c.command==='save'&&c.file===`${label}-window.local.json`));
      assert.deepEqual(await store.get('geometry'),geometry);
      assert.equal(runtime.port.destroyed,true);
      assert.equal((await runtime.receiver.flush()).windowFlush.complete,true);
    } finally { await cleanup?.(); await runtime.finish(); }
  }
});
