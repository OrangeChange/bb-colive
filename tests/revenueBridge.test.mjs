import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

function appRevenueActions(dependencies) {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['runRevenueWindowOperation', 'toggleGiftWindow', 'toggleRevenueChildWithFeedback', 'setRevenueWindowModeWithFeedback'];
  const declarations = new Map();
  const visit = node => {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(tree))) declarations.set(node.name.getText(tree), node.getText(tree));
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const name of names) assert.equal(declarations.has(name), true, `App必须接入${name}`);
  const code = ts.transpileModule(names.map(name => `const ${declarations.get(name)};`).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(dependencies), `${code}; return {${names.join(',')}};`)(...Object.values(dependencies));
}

async function revenueRuntime() {
  const alias = fileURLToPath(new URL('./helpers/stickyBridgePorts.ts', import.meta.url));
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-revenueBridge.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, esbuild: { jsx: "automatic" }, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'silent', resolve: { alias: Object.fromEntries(['@tauri-apps/api/event', '@tauri-apps/api/window', '@tauri-apps/api/webviewWindow', '@tauri-apps/api/core', '@tauri-apps/plugin-store'].map(name => [name, alias])) } });
  const bridge = await server.ssrLoadModule('/src/windows/giftBridge.ts');
  const { nativeWindows, WebviewWindow, ports } = await server.ssrLoadModule('/tests/helpers/stickyBridgePorts.ts');
  const stop = await bridge.startGiftBridge();
  return { bridge, nativeWindows, WebviewWindow, ports, async finish() { nativeWindows.closeFailures.clear(); nativeWindows.createFailures.clear(); nativeWindows.closeGates.clear(); await bridge.closeGiftWindow(); stop(); await server.close(); } };
}

test('创建收益子窗优先避让存活弹幕窗，关闭时使用保存位置', async () => {
  for (const open of [false,true]) {
    const r = await revenueRuntime();
    try {
      const store = await r.ports.load('display-window.local.json');
      await store.set('geometry',{x:800,y:20,width:500,height:400});
      if (open) new r.WebviewWindow('display',{x:10,y:10,width:500,height:400});
      await r.bridge.setRevenueWindowMode('split'); await r.bridge.toggleRevenueChild('gift');
      const window = r.nativeWindows.windows.get('gift-only');
      assert.equal(window.options.x, open ? 518 : 492);
      assert.equal(window.options.height,240);
    } finally { await r.finish(); }
  }
});

test('旧默认三方窗整组更新为紧凑几何，手动布局不被重写', async () => {
  for (const manual of [false,true]) {
    const r = await revenueRuntime();
    try {
      const labels=['gift-only','superchat','guard'];
      for (const [i,label] of labels.entries()) {
        const store=await r.ports.load(`${label}-window.local.json`);
        await store.set('geometry',{x:manual && i===1 ? 1200 : 1550,y:10+i*360,width:360,height:360});
      }
      await r.bridge.setRevenueWindowMode('split'); await r.bridge.toggleRevenueChild('gift');
      for (const [i,label] of labels.entries()) {
        const geometry=await (await r.ports.load(`${label}-window.local.json`)).get('geometry');
        assert.equal(geometry.height,manual ? 360 : [240,200,160][i]);
        assert.equal(geometry.x,manual && i===1 ? 1200 : manual ? 1550 : 1242);
      }
    } finally { await r.finish(); }
  }
});

test('全部恢复收益列消费明确弹幕目标，各子窗不读取尚未移动的存活窗口', async () => {
  const r=await revenueRuntime();
  try {
    new r.WebviewWindow('display',{x:10,y:10,width:500,height:400});
    await r.bridge.resetGiftWindowGeometry({x:0,y:0,width:1000,height:1000,scaleFactor:1},{x:630,y:10,width:360,height:360});
    for(const [i,label] of ['gift-only','superchat','guard'].entries()) {
      const saved=await(await r.ports.load(`${label}-window.local.json`)).get('geometry');
      assert.deepEqual(saved,{x:322,y:[10,258,466][i],width:300,height:[240,200,160][i],custom:false});
    }
  } finally {await r.finish();}
});

test('子窗关闭后立即重开等待保存和诊断完成后的实际销毁', async () => {
  const r = await revenueRuntime(); let release;
  try {
    await r.bridge.setRevenueWindowMode('split');
    await r.bridge.toggleRevenueChild('gift');
    const old = r.nativeWindows.windows.get('gift-only');
    r.nativeWindows.closeGates.set('gift-only', new Promise(resolve => { release = resolve; }));
    let closed = false, reopened = false;
    const close = r.bridge.toggleRevenueChild('gift').then(() => { closed = true; });
    const reopen = r.bridge.toggleRevenueChild('gift').then(() => { reopened = true; });
    while (!r.nativeWindows.closeRequested.has('gift-only')) await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false, '关闭请求返回不等于销毁完成');
    assert.equal(reopened, false, '重开必须等待旧实例销毁');
    release(); await close; await reopen;
    assert.notEqual(r.nativeWindows.windows.get('gift-only'), old);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift']);
  } finally { release?.(); await r.finish(); }
});

test('异步创建失败发布实际子窗组合并允许点击重试', async () => {
  const r = await revenueRuntime();
  try {
    await r.bridge.setRevenueWindowMode('split');
    await r.bridge.toggleRevenueChild('gift');
    r.nativeWindows.createFailures.add('superchat');
    await assert.rejects(r.bridge.toggleRevenueChild('superchat'), /醒目留言窗.*重试/);
    assert.deepEqual(r.bridge.getRevenueWindowSelection(), { mode: 'split', open: true, selected: ['gift'], remembered: ['gift'] });
    r.nativeWindows.createFailures.clear();
    await r.bridge.toggleRevenueChild('superchat');
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat']);
  } finally { await r.finish(); }
});

test('实际窗口已销毁但销毁通知缺失时，总关和随后模式切换仍能完成', { timeout: 30000 }, async () => {
  const r = await revenueRuntime();
  try {
    await r.bridge.setRevenueWindowMode('split');
    await r.bridge.toggleRevenueChild('gift');
    r.nativeWindows.silentDestroyed.add('gift-only');
    await r.bridge.closeGiftWindow();
    assert.equal(r.bridge.isGiftWindowOpen(), false);
    await r.bridge.setRevenueWindowMode('combined');
    await r.bridge.openGiftWindow();
    assert.deepEqual([...r.nativeWindows.windows.keys()], ['gift']);
  } finally { r.nativeWindows.silentDestroyed.clear(); await r.finish(); }
});

test('实际窗口已创建但创建通知缺失时，后续子窗控制不被阻塞', { timeout: 30000 }, async () => {
  const r = await revenueRuntime();
  try {
    r.nativeWindows.silentCreated.add('gift-only');
    await r.bridge.setRevenueWindowMode('split');
    await r.bridge.toggleRevenueChild('gift');
    await r.bridge.toggleRevenueChild('superchat');
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat']);
  } finally { r.nativeWindows.silentCreated.clear(); await r.finish(); }
});

test('窗口关闭未完成时给出可重试错误，后续其他子窗仍可控制', { timeout: 30000 }, async () => {
  const r = await revenueRuntime(); let release;
  try {
    await r.bridge.setRevenueWindowMode('split');
    await r.bridge.toggleRevenueChild('gift');
    r.nativeWindows.closeGates.set('gift-only', new Promise(resolve => { release = resolve; }));
    await assert.rejects(r.bridge.toggleRevenueChild('gift'), /礼物窗.*重试/);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift']);
    await r.bridge.toggleRevenueChild('superchat');
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat']);
  } finally { release?.(); r.nativeWindows.closeGates.clear(); await r.finish(); }
});

test('关闭拒绝保留存活窗口状态与最近组合，重试可以完成', async () => {
  const r = await revenueRuntime();
  try {
    await r.bridge.setRevenueWindowMode('split');
    await r.bridge.toggleRevenueChild('gift'); await r.bridge.toggleRevenueChild('superchat');
    r.nativeWindows.closeFailures.add('superchat');
    await assert.rejects(r.bridge.closeGiftWindow(), /醒目留言窗.*重试/);
    assert.deepEqual(r.bridge.getRevenueWindowSelection(), { mode: 'split', open: true, selected: ['superchat'], remembered: ['superchat'] });
    assert.equal(r.nativeWindows.windows.has('superchat'), true);
    r.nativeWindows.closeFailures.clear(); await r.bridge.closeGiftWindow();
    assert.equal(r.bridge.isGiftWindowOpen(), false);
    await r.bridge.openGiftWindow();
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['superchat']);
  } finally { await r.finish(); }
});

test('模式切换关闭失败不创建另一模式窗口，保留实际模式后可重试', async () => {
  const r = await revenueRuntime();
  try {
    await r.bridge.setRevenueWindowMode('split'); await r.bridge.toggleRevenueChild('gift');
    r.nativeWindows.closeFailures.add('gift-only');
    await assert.rejects(r.bridge.setRevenueWindowMode('combined'), /礼物窗.*重试/);
    assert.equal(r.nativeWindows.windows.has('gift'), false);
    assert.equal(r.bridge.getRevenueWindowSelection().mode, 'split');
    r.nativeWindows.closeFailures.clear(); await r.bridge.setRevenueWindowMode('combined');
    assert.deepEqual([...r.nativeWindows.windows.keys()], ['gift']);
  } finally { await r.finish(); }
});

test('新创建失败后总开可重试', async () => {
  const r = await revenueRuntime();
  try {
    r.nativeWindows.createFailures.add('gift');
    await assert.rejects(r.bridge.openGiftWindow(), /收益窗.*重试/);
    assert.equal(r.bridge.isGiftWindowOpen(), false);
    r.nativeWindows.createFailures.clear(); await r.bridge.openGiftWindow();
    const existing = r.nativeWindows.windows.get('gift');
    await existing.close();
    assert.equal(r.bridge.isGiftWindowOpen(), false);
  } finally { await r.finish(); }
});

test('总开部分创建失败的重试完成原目标组合，不因总开状态短路', async () => {
  const r = await revenueRuntime();
  try {
    await r.bridge.setRevenueWindowMode('split');
    r.nativeWindows.createFailures.add('superchat');
    const failure = await r.bridge.openGiftWindow().catch(error => error);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift']);
    assert.equal(typeof failure.retry, 'function');
    r.nativeWindows.createFailures.clear(); await failure.retry();
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat', 'guard']);
  } finally { await r.finish(); }
});

test('getByLabel复用句柄正确监听原生销毁并同步总开关', async () => {
  const r = await revenueRuntime();
  try {
    const existing = new r.WebviewWindow('gift');
    await r.bridge.openGiftWindow();
    assert.equal(r.bridge.isGiftWindowOpen(), true);
    await existing.close();
    assert.equal(r.bridge.isGiftWindowOpen(), false);
  } finally { await r.finish(); }
});

test('App总开与侧栏/设置回调呈现原生失败，并使用失败目标重试', async () => {
  const r = await revenueRuntime(); let failure;
  try {
    const actions = appRevenueActions({
      useCallback: fn => fn, setRevenueWindowFailure: value => { failure = value; },
      RevenueWindowOperationError: r.bridge.RevenueWindowOperationError,
      isGiftWindowOpen: r.bridge.isGiftWindowOpen, openGiftWindow: r.bridge.openGiftWindow,
      closeGiftWindow: r.bridge.closeGiftWindow, toggleRevenueChild: r.bridge.toggleRevenueChild,
      setRevenueWindowMode: r.bridge.setRevenueWindowMode,
    });
    await actions.setRevenueWindowModeWithFeedback('split');
    r.nativeWindows.createFailures.add('superchat'); await actions.toggleGiftWindow();
    assert.match(failure.message, /醒目留言窗.*重试/);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift']);
    r.nativeWindows.createFailures.clear(); await actions.runRevenueWindowOperation(failure.retry);
    assert.equal(failure, null);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat', 'guard']);
    r.nativeWindows.closeFailures.add('guard'); await actions.toggleRevenueChildWithFeedback('guard');
    assert.match(failure.message, /大航海窗.*重试/);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat', 'guard']);
    r.nativeWindows.closeFailures.clear(); await actions.runRevenueWindowOperation(failure.retry);
    assert.deepEqual(r.bridge.getRevenueWindowSelection().selected, ['gift', 'superchat']);
  } finally { await r.finish(); }
});

test('实际收益bridge分类隔离、ready快照、旧握手、总关记忆、锁定继承及回执共享', async () => {
  const alias=fileURLToPath(new URL('./helpers/stickyBridgePorts.ts',import.meta.url));
  const server=await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-revenueBridge.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},root:fileURLToPath(new URL('..',import.meta.url)),server:{middlewareMode:true, watch: null},logLevel:'silent',resolve:{alias:Object.fromEntries(['@tauri-apps/api/event','@tauri-apps/api/window','@tauri-apps/api/webviewWindow','@tauri-apps/api/core','@tauri-apps/plugin-store'].map(name=>[name,alias]))}});
  let bridge,stop;
  try {
    bridge=await server.ssrLoadModule('/src/windows/giftBridge.ts');
    const {ports}=await server.ssrLoadModule('/tests/helpers/stickyBridgePorts.ts');
    const {DEFAULT_EVENT_WINDOW_PREFERENCES:p}=await server.ssrLoadModule('/src/windows/eventWindowPreferences.ts');
    stop=await bridge.startGiftBridge();
    bridge.setGiftWindowPreferences({...p,stickyEvents:{...p.stickyEvents,enabled:true}});
    bridge.switchGiftWindowRoom(11);
    await bridge.setRevenueWindowMode('split'); await Promise.all([bridge.openGiftWindow(),bridge.openGiftWindow()]);
    assert.equal(bridge.isGiftWindowOpen(),true);
    const labels=['gift-only','superchat','guard'];
    const request=label=>ports.messages.filter(m=>m.target===label && m.name===`${label}:ready-request`).at(-1).payload;
    const ready=label=>ports.emitTo('main',`${label}:ready`,request(label));
    const now=Date.now();
    const events=[{id:'gift',msgType:1,gift:{paymentRmb:30,totalRmb:30}}, {id:'sc',msgType:2,sc:{price:30,duration:120}}, {id:'guard',msgType:3,guard:{priceRmb:198}}].map(e=>({...e,ts:now,roomId:11}));
    for(const event of events)bridge.publishGiftEvent(event);
    for(const label of labels)await ready(label);
    for(const [index,label] of labels.entries()) {
      assert.deepEqual(ports.messages.filter(m=>m.target===label && m.name===`${label}:events`).flatMap(m=>[m.payload].flat()).map(event=>event.id),[events[index].id]);
      assert.deepEqual(ports.messages.filter(m=>m.target===label && m.name==='event-window:sticky-snapshot').at(-1).payload.events.map(e=>e.id),[events[index].id]);
    }
    bridge.toggleGiftWindowLock();
    await bridge.toggleRevenueChild('guard'); await bridge.toggleRevenueChild('guard'); await ready('guard');
    assert.equal(ports.messages.filter(m=>m.target==='guard' && m.name==='guard:lock').at(-1).payload,true);
    await ports.emitTo('main','guard:lock-state',false);
    assert.equal(bridge.isGiftWindowLocked(),false);
    const old=request('superchat'); bridge.switchGiftWindowRoom(22);
    const begin=ports.messages.length; await ports.emitTo('main','superchat:ready',old);
    assert.equal(ports.messages.slice(begin).some(m=>m.name==='superchat:ready-ack'),false);
    for(const label of labels) { await ready(label); assert.deepEqual(ports.messages.filter(m=>m.target===label&&m.name==='event-window:sticky-snapshot').at(-1).payload.events,[]); }
    await bridge.toggleRevenueChild('superchat'); await bridge.closeGiftWindow(); await bridge.openGiftWindow();
    assert.deepEqual(bridge.getRevenueWindowSelection().selected,['gift','guard']);
    await bridge.setRevenueWindowMode('combined'); assert.equal(bridge.isGiftWindowOpen(),true);
  } finally { await bridge?.closeGiftWindow(); stop?.(); await server.close(); }
});
