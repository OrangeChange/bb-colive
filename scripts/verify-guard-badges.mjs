// 在已开启 9223 调试端口的开发版 WebView 中渲染真实组件；不写入事件或设置。
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
const targets = await (await fetch('http://localhost:9223/json/list')).json();
const target = targets.find(t => t.type === 'page' && /localhost:1420\/$/.test(t.url));
assert.ok(target, '请先启动带调试端口的开发版');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map();
ws.onmessage = ({ data }) => {
  const result = JSON.parse(data);
  if (!pending.has(result.id)) return;
  const { resolve, reject } = pending.get(result.id);
  pending.delete(result.id);
  result.error ? reject(result.error) : resolve(result.result);
};
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    ws.send(JSON.stringify({ id: requestId, method, params }));
  });
}
async function evaluate(expression) {
  const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
try {
  await evaluate(`(async () => {
    const React = (await import('/node_modules/.vite/deps/react.js')).default;
    const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
    const {GuardIdentityBadge} = await import('/src/components/GuardIdentityBadge.tsx');
    const {EventRow} = await import('/src/components/EventRow.tsx');
    const {RankUserRow} = await import('/src/components/RoomInsightsView.tsx');
    const {DEFAULT_EVENT_DISPLAY_PREFERENCES} = await import('/src/eventDisplaySettings.ts');
    const {MsgType} = await import('/src/protocol/types.ts');
    document.getElementById('guard-badge-verification')?.remove();
    const host = document.createElement('section');
    host.id = 'guard-badge-verification';
    host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#131b18;color:white;padding:24px;overflow:auto';
    document.body.append(host);
    const root = createRoot(host);
    window.__guardVerification = {host, root};
    window.__guardVerification.render = (mode) => {
      const h = React.createElement;
      const children = [h('h2', {key:'title'}, '大航海身份验收 · ' + mode)];
      for (const [label, file] of [['舰长','captain'],['提督','admiral'],['总督','governor']]) {
        const guardLevel = label === '舰长' ? 1 : label === '提督' ? 2 : 3;
        children.push(h('div', {key:label, style:{display:'flex',alignItems:'center',gap:12}}, label + '：缺图 / 普通失败 / 增强失败 / 指定图片',
          ...[undefined, '/guard-identities/nonexistent.png', '/guard-identities/nonexistent.png', '/guard-identities/'+file+'.png?original'].map((iconUrl,i) => h(GuardIdentityBadge,{key:i,label,iconUrl,mode,guardLevel,iconSet:i===2?'enhanced':'base',textClassName:'text-t1'}))));
      }
      for (const liveLayout of [true,false]) {
        children.push(h('h3',{key:'layout'+liveLayout},liveLayout?'现场布局':'回看与副窗口布局'));
        for (const msgType of [MsgType.Danmu,MsgType.Interact,MsgType.Gift,MsgType.SuperChat,MsgType.GuardBuy]) {
          children.push(h(EventRow,{key:liveLayout+'-'+msgType,liveLayout,showTime:false,
            ev:{id:'verification-'+msgType,roomId:1,ts:Date.now(),msgType,user:{uid:'test',uname:'缺图用户',guardLevel:1},text:'身份图标验收'},
            displayPreferences:{...DEFAULT_EVENT_DISPLAY_PREFERENCES,guardIdentityDisplayMode:mode}}));
        }
      }
      for (const kind of ['guard','contribution']) children.push(h(RankUserRow,{key:kind,kind,
        user:{uid:'test',name:'缺图榜单用户',rank:1,guardLevel:2},guardIdentityDisplayMode:mode}));
      root.render(h(React.Fragment,null,...children));
    };
    window.__guardVerification.render('icon');
  })()`);
  for (const mode of ['icon', 'text', 'icon']) {
    await evaluate(`window.__guardVerification.render('${mode}')`);
    let state;
    for (let attempt = 0; attempt < 40; attempt++) {
      state = await evaluate(`(() => {
        const nodes=[...window.__guardVerification.host.querySelectorAll('[aria-label^="大航海身份："]')];
        return {count:nodes.length,images:nodes.filter(n=>n.tagName==='IMG').length,
          loaded:nodes.filter(n=>n.tagName==='IMG'&&n.complete&&n.naturalWidth>0).length,
          texts:nodes.filter(n=>n.tagName==='SPAN').length,
          original:nodes.filter(n=>n.tagName==='IMG'&&n.src.endsWith('?original')).length,
          standard:nodes.filter(n=>n.tagName==='IMG'&&n.src.includes('/standard-')).length,
          enhancedFallback:nodes.filter(n=>n.tagName==='IMG'&&/\\/guard-identities\\/(captain|admiral|governor)\\.png$/.test(n.src)).length,
          widths:nodes.filter(n=>n.tagName==='IMG').map(n=>n.getBoundingClientRect().width)};
      })()`);
      if (state.count === 24 && (mode === 'icon' ? state.loaded === 24 : state.texts === 24)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(state.count, 24);
    if (mode === 'icon') {
      assert.equal(state.images, 24);
      assert.equal(state.loaded, 24);
      assert.equal(state.standard, 18);
      assert.equal(state.enhancedFallback, 3);
      assert.equal(state.texts, 0);
      assert.equal(state.original, 3);
      assert.ok(state.widths.every(w=>w>0&&w<=36));
    } else {
      assert.equal(state.images, 0);
      assert.equal(state.texts, 24);
    }
    console.log(mode, state);
  }
  if (process.argv[2]) {
    const {data} = await command('Page.captureScreenshot', {format:'png'});
    writeFileSync(process.argv[2], Buffer.from(data,'base64'));
    console.log('截图：', process.argv[2]);
  }
} finally {
  await evaluate('window.__guardVerification?.root.unmount(); window.__guardVerification?.host.remove(); delete window.__guardVerification');
  ws.close();
}
