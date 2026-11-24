import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from '../vendor/blivechat/node_modules/jsdom/lib/api.js';
import { createServer } from 'vite';

test('事件追加复用目标渲染配置，发布新主题与切房立即失效', async () => {
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleRenderMemo.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  const module = await vite.ssrLoadModule('/src/compat/CompatibleEventRenderer.tsx');
  const dom = new JSDOM('<div id="root"></div>');
  const previous = { window: globalThis.window, document: globalThis.document, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  let calls = 0, resolved;
  const stop = module.installCompatibleEventRenderResolver(() => { calls++; return () => null; });
  const root = createRoot(dom.window.document.getElementById('root'));
  function Host({ room, count, target = 'live', targetId = 'live', placement = 'main' }) {
    resolved = module.useCompatibleEventRender({ target, targetId, roomId: room, placement });
    return React.createElement('span', null, count);
  }
  try {
    await act(async () => root.render(React.createElement(Host, { room: 1, count: 1 })));
    const first = resolved;
    await act(async () => root.render(React.createElement(Host, { room: 1, count: 2 })));
    assert.equal(resolved, first);
    assert.equal(calls, 1);
    await act(async () => module.notifyCompatibleEventRenderChanged());
    assert.notEqual(resolved, first);
    assert.equal(calls, 2);
    await act(async () => root.render(React.createElement(Host, { room: 2, count: 2 })));
    assert.equal(calls, 3);
    await act(async () => root.render(React.createElement(Host, { room: 2, count: 2, target: 'windows' })));
    assert.equal(calls, 4);
    await act(async () => root.render(React.createElement(Host, { room: 2, count: 2, target: 'windows', placement: 'sticky' })));
    assert.equal(calls, 5);
    await act(async () => root.render(React.createElement(Host, { room: 2, count: 2, target: 'windows', placement: 'sticky', targetId: 'other' })));
    assert.equal(calls, 6);
  } finally {
    await act(async () => root.unmount());
    stop(); Object.assign(globalThis, previous); dom.window.close(); await vite.close();
  }
});

test('历史事件分类只计算一次，新事件对象和新设置分别重新判断', async () => {
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleRenderMemo.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom', logLevel: 'silent' });
  try {
    const { memoizeCompatibleEventDecision } = await vite.ssrLoadModule('/src/compat/CompatibleEventRenderer.tsx');
    let calls = 0;
    const decide = memoizeCompatibleEventDecision(event => { calls++; return event.msgType === 0 ? 'render' : 'omit'; });
    const history = Array.from({length: 10000}, (_, id) => ({ id: String(id), msgType: 0 }));
    for(let batch = 0; batch < 4; batch++) history.forEach(event => assert.equal(decide(event), 'render'));
    assert.equal(calls, 10000);
    assert.equal(decide({...history[0], msgType: 1}), 'omit');
    assert.equal(calls, 10001);
    const changedSettings = memoizeCompatibleEventDecision(() => 'fallback');
    assert.equal(changedSettings(history[0]), 'fallback');
  } finally { await vite.close(); }
});