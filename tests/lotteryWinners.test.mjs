import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';

let vite, EventRow;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-lotteryWinners.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
  ({ EventRow } = await vite.ssrLoadModule('/src/components/EventRow.tsx'));
});
after(async () => { await vite?.close(); });
const render = (ev, props = {}) => renderToStaticMarkup(React.createElement(EventRow, { ev, showTime: false, ...props }));
const interactive = { liveLayout: true, allowWinnerExpansion: true, onUserFilter: () => {} };

test('无名单不以奖品数量补造展开入口或中奖人数', () => {
  const ev = getNativeEventSample('lottery-result'); ev.lottery.winners = []; ev.lottery.awardNum = 999;
  assert.doesNotMatch(render(ev, interactive), /winner-list|winner-count|999/);
});

test('一人和大名单均可展开实际收到的每一位，保留开奖摘要', () => {
  for (const key of ['lottery-result', 'pocket-result']) for (const count of [1, 160]) {
    const ev = getNativeEventSample(key);
    ev.lottery.winners = Array.from({ length: count }, (_, i) => ({ uid: `winner-${i}`, uname: `获奖观众${i}` }));
    for (const layout of [{ liveLayout: true }, { reviewLayout: true }]) {
      const html = render(ev, { ...layout, allowWinnerExpansion: true, onUserFilter: () => {} });
      assert.match(html, /class="winner-list"/);
      assert.match(html, new RegExp(`名单（${count}人）`));
      assert.equal((html.match(/class="winner-list-item"/g) ?? []).length, count);
      assert.match(html, new RegExp(`获奖观众${count - 1}`));
      assert.match(html, /获得|中奖信息/);
      assert.doesNotMatch(html, /完整名单|全部中奖/);
    }
  }
});

test('缺少用户名以实际UID辨认，不补造头像身份', () => {
  const ev = getNativeEventSample('lottery-result'); delete ev.user;
  ev.lottery.winners = [{ uid: '987654', uname: '' }];
  const html = render(ev, interactive);
  assert.match(html, /UID 987654/);
  assert.match(html, /筛选该用户/);
  assert.match(html, /winner-avatar/);
  assert.doesNotMatch(html, /guard-badge|fan-medal/);
});

test('缺少UID的中奖者仅显示文字，不发送无目标筛选', () => {
  const ev = getNativeEventSample('lottery-result'); delete ev.user;
  ev.lottery.winners = [{ uid: '', uname: '仅有用户名' }, { uid: '', uname: '' }];
  const html = render(ev, interactive);
  assert.match(html, /<span class="username">仅有用户名<\/span>/);
  assert.match(html, /<span class="username">未知用户<\/span>/);
  assert.doesNotMatch(html, /<button/);
});

test('只读宿主默认提供实际名单，名单用户名不绑定筛选', () => {
  const ev = getNativeEventSample('lottery-result');
  for (const props of [{}, { liveLayout: true }, { reviewLayout: true }]) {
    const html = render(ev, props);
    assert.match(html, /winner-list|<summary/);
    assert.doesNotMatch(html, /<button/);
    assert.match(html, /3 人/);
  }
});

test('宿主允许展开且无筛选回调时名单用户名为非交互文字', () => {
  const html = render(getNativeEventSample('lottery-result'), { liveLayout: true, allowWinnerExpansion: true });
  assert.match(html, /class="winner-list"/);
  assert.match(html, /<span class="username">另一位中奖者<\/span>/);
  assert.doesNotMatch(html, /<button/);
});

test('宿主关闭展开时即使有筛选回调也不提供名单入口', () => {
  assert.doesNotMatch(render(getNativeEventSample('lottery-result'), { ...interactive, allowWinnerExpansion: false }), /winner-list|<summary/);
});

test('天选开始有条件才输出资格文案节点，各布局保留原字段', () => {
  const ev = getNativeEventSample('lottery-start');
  for (const props of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
    ev.lottery.requireText = '粉丝牌等级至少5级';
    assert.match(render(ev, props), /class="lottery-requirement"[^>]*>[\s\S]*?粉丝牌等级至少5级/);
    delete ev.lottery.requireText;
    assert.doesNotMatch(render(ev, props), /lottery-requirement/);
  }
});
