import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import postcss from 'postcss';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES } from '../src/eventDisplaySettings.ts';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';
import { DEFAULT_EVENT_STYLE_SETTINGS } from '../src/eventStyleSettings.ts';

let vite, EventRow, RankList, RankTopThree, settings, applyObservedGuardIcons, createEventAreaConfigCss;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-avatarFrameIntegration.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, hmr: false, watch: null }, logLevel: 'silent' });
  ({ EventRow } = await vite.ssrLoadModule('/src/components/EventRow.tsx'));
  ({ RankList } = await vite.ssrLoadModule('/src/components/RoomInsightsView.tsx'));
  ({ RankTopThree } = await vite.ssrLoadModule('/src/components/RankTopThree.tsx'));
  ({ useGeneralSettings: settings } = await vite.ssrLoadModule('/src/generalSettings.ts'));
  ({ applyObservedGuardIcons } = await vite.ssrLoadModule('/src/protocol/roomInsights.ts'));
  ({ createEventAreaConfigCss } = await vite.ssrLoadModule('/src/eventAreaStyleConfig.ts'));
});
after(async () => { await vite?.close(); });
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props));
// SSR消费初始快照；每个测试文件使用独立的内存store，不触及用户存储。
const preference = value => { settings.getInitialState().eventDisplayPreferences.showAvatarFrame = value; };

test('16/24/40头像按基准比例缩放，开启框不增加占位且绝对居中外绘', () => {
  const css = postcss.parse(readFileSync(new URL('../src/components/UserAvatar.css', import.meta.url), 'utf8'));
  let wrap;
  css.walkRules(rule => { if (rule.selector === '.user-avatar') wrap = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])); });
  assert.equal(wrap.position, 'relative');
  assert.equal(wrap.width, 'var(--avatar-size, calc(var(--event-font-size, 16px) * 24 / 16))');
  assert.equal(wrap.height, 'var(--avatar-height, var(--avatar-size, calc(var(--event-font-size, 16px) * 24 / 16)))');
  assert.equal(wrap.margin, undefined); assert.equal(wrap.padding, undefined);
  css.walkRules(rule => {
    if (rule.selector.includes('event-avatar-framed')) rule.walkDecls(/^margin|^padding/, decl => assert.match(decl.value, /^0(?:px)?$/, `${decl.prop}: ${decl.value}`));
  });
  let frame;
  css.walkRules(rule => { if (rule.selector.includes('.avatar-frame')) frame = Object.fromEntries(rule.nodes.filter(node => node.type === 'decl').map(node => [node.prop, node.value])); });
  assert.equal(frame.position, 'absolute');
  assert.equal(frame.width, '120%'); assert.equal(frame.height, '120%');
  assert.equal(frame.left, '-10%'); assert.equal(frame.top, '-10%');
  for (const [size, ratio] of [[16, 1], [24, 1.5], [40, 2.5]]) {
    const ev = getNativeEventSample('text'); ev.user.guardLevel = 1;
    for (const showAvatarFrame of [false, true]) {
      const html = render(EventRow, { ev, showTime: false, liveLayout: true, eventStyleSettings: { ...DEFAULT_EVENT_STYLE_SETTINGS, avatarSize: size }, displayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatarFrame } });
      assert.match(html, /avatar-wrap/);
      const config = createEventAreaConfigCss('avatar-test', { layout: 'live', settings: { ...DEFAULT_EVENT_STYLE_SETTINGS, avatarSize: size }, fontSize: 16, bigEmoteSize: 40, padding: 6, spacing: 0 });
      assert.match(config, new RegExp(`--event-config-avatar-scale:${ratio};`));
      assert.equal(html.includes('class="avatar-frame"'), showAvatarFrame);
    }
  }
});

test('前三框不被头像条的旧overflow裁切，占位尺寸保持', () => {
  const html = render(RankTopThree, { users: [{ uid: '1', name: '总督', rank: 1, guardLevel: 1 }], pending: false });
  assert.doesNotMatch(html, /overflow-hidden/);
  assert.match(html, /h-7 w-\[66px\]/);
  assert.match(html, /overflow-clip-margin:calc\(24px \* \.1\)/);
});

test('真实观众榜与大航海榜使用房间套系和公开身份，前三只加框不加徽章', () => {
  preference(true);
  for (const [milestone, suffix] of [['standard', ''], ['thousand', '-1k'], ['tenThousand', '-10k'], [undefined, '']]) {
    const users = applyObservedGuardIcons([1, 2, 3].map(level => ({ uid: String(level), name: '用户', rank: level, guardLevel: level, face: '/avatar.png', guardIconSet: 'enhanced' })), new Map(), milestone ? { milestone, iconSet: 'enhanced' } : undefined);
    for (const kind of ['contribution', 'guard']) {
      const html = render(RankList, { users, kind, showGuardIdentity: false });
      for (const level of [1, 2, 3]) assert.match(html, new RegExp(`src="/laplace/guard-icons/frame-${level}${suffix}\\.png"`));
      assert.doesNotMatch(html, /guard-badge/);
    }
    const top = render(RankTopThree, { users, pending: false });
    assert.equal((top.match(/class="avatar-frame"/g) ?? []).length, 3);
    assert.doesNotMatch(top, /guard-badge/);
    preference(false);
    assert.doesNotMatch(render(RankList, { users, kind: 'guard' }), /avatar-frame/);
    assert.doesNotMatch(render(RankTopThree, { users, pending: false }), /avatar-frame/);
    preference(true);
  }
});

test('无身份不补框，无头像使用共享内置回退', () => {
  preference(true);
  const users = [undefined, 0].map((guardLevel, index) => ({ uid: String(index), name: '无资料', rank: index + 1, guardLevel, guardIconSet: 'enhanced' }));
  const html = render(RankList, { users, kind: 'guard' });
  assert.doesNotMatch(html, /avatar-frame|guard-badge/);
  assert.equal((html.match(/src="\/media\/noface.gif"/g) ?? []).length, 2);
});
