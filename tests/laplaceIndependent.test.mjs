import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

test('默认 CSS 保持已确认的样式基线', () => {
  const before = readFileSync('tests/fixtures/laplace-default-baseline.css', 'utf8');
  assert.equal(readFileSync('public/laplace/product/default.css', 'utf8').replaceAll('\r\n', '\n'), before.replaceAll('\r\n', '\n'));
});

test('产品框架不引用提取的滚动、动画和样式程序', () => {
  const source = readFileSync('src/compat/laplace/renderer/frame.tsx', 'utf8');
  for (const file of ['generated/flip.mjs', 'generated/scroll-area.mjs', 'generated/style-injector.mjs']) assert.equal(source.includes(file), false, file);
});

test('产品依赖图不包含 LAPLACE 提取程序', async () => {
  const { build } = createRequire(import.meta.url)('esbuild');
  const result = await build({ entryPoints: ['src/compat/laplace/renderer/product.tsx'], bundle: true, write: false, metafile: true, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' } });
  const extracted = Object.keys(result.metafile.inputs).filter(file => /vendor\/laplace\/(generated|original)\/.*\.(m?js|tsx?)$/.test(file));
  assert.deepEqual(extracted, []);
});

test('独立弹幕保留身份、回复及正文解析结构', async () => {
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { watch: null }, logLevel: 'error' });
  try {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup: render } = await import('react-dom/server');
    const { MessageEvent, LaplaceRenderContext } = await vite.ssrLoadModule('/src/compat/laplace/renderer/independent/message.tsx');
    const data = { type: 'message', id: 'message', uid: 1, username: '用户', origin: 2, originIdx: 0, timestampNormalized: 1700000000000, guardType: 3, userType: 1, phoneVerified: 1, currentRank: 2, medal: { level: 20, name: '粉丝牌', lightened: 1, guardType: 3 }, message: '文字[未闭合 ||剧透|| [表情]', bmotes: { '[表情]': { url: '/emote.png' } }, reply: { uid: 2, uname: '被回复用户', avatar: '/avatar.png' }, deleted: true, messageTrans: '译文' };
    const html = render(h(LaplaceRenderContext.Provider, { value: { settings: { showMedal: true, showCurrentRank: true, showSpoiler: true } } }, h(MessageEvent, { data, mode: 'dashboard' })));
    for (const value of ['用户','被回复用户','文字[未闭合','spoiler','bmote-wrap','fans-medal','mod-badge','guard-badge','current-rank--2']) assert.ok(html.includes(value), value);
    assert.equal(html.includes('[object Object]'), false);
    assert.equal(html.includes('class="message-translation"'), false);
    assert.equal(html.includes('>已撤回<'), false);
    const hidden = render(h(LaplaceRenderContext.Provider, { value: { settings: { showAvatar: false, showUsername: false } } }, h(MessageEvent, { data, mode: 'obs' })));
    assert.equal(hidden.includes('class="username"'), false);
    assert.equal(hidden.includes('class="avatar"'), false);
    const spoiler = render(h(MessageEvent, { data: { ...data, message: '||第一行|第二行||', deleted: false }, mode: 'obs' }));
    assert.ok(spoiler.includes('class="spoiler">第一行|第二行'));
    const open = render(h(MessageEvent, { data: { ...data, message: '||未结束', deleted: false }, mode: 'obs' }));
    assert.ok(open.includes('class="spoiler">未结束'));
    const remote = render(h(MessageEvent, { data: { ...data, avatar: 'https://i0.hdslb.com/bfs/face/example.jpg' }, mode: 'obs' }));
    assert.ok(remote.includes('example.jpg@320w_320h'));
    const groupMedal = render(h(LaplaceRenderContext.Provider, { value: { settings: { showMedal: true } } }, h(MessageEvent, { data: { ...data, medal: { name: '团体牌', level: 1, type: 1, guardType: 0, lightened: true } }, mode: 'obs' })));
    assert.ok(groupMedal.includes('fans-medal-has-guard--0'));
  } finally { await vite.close(); }
});

test('匿名回复保留用户名，空回复不生成回复节点', async () => {
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true }, server: { watch: null }, logLevel: 'error' });
  try {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup: render } = await import('react-dom/server');
    const { MessageEvent } = await vite.ssrLoadModule('/src/compat/laplace/renderer/independent/message.tsx');
    const base = { type: 'message', id: 'reply', uid: 1, username: '用户', message: '弹幕被打码的话就是我现在这个效果' };
    for (const mode of ['obs', 'dashboard']) {
      const html = render(h(MessageEvent, { data: { ...base, reply: { uid: 0, uname: 'ア***' } }, mode }));
      assert.ok(html.includes('ア***'), mode);
      assert.ok(html.includes('class="reply"'), mode);
      assert.equal(html.includes('has-reply'), false, '匿名回复沿用原项目的根节点 class');
      for (const reply of [undefined, {}]) {
        const empty = render(h(MessageEvent, { data: { ...base, reply }, mode }));
        assert.equal(empty.includes('class="reply"'), false, mode);
      }
    }
  } finally { await vite.close(); }
});

test('特效弹幕根节点跟随有效深浅模式', async () => {
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true }, server: { watch: null }, logLevel: 'error' });
  try {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup: render } = await import('react-dom/server');
    const { LaplaceEventRenderer: Event, LaplaceRenderContext } = await vite.ssrLoadModule('/src/compat/laplace/renderer/independent/index.tsx');
    for (const mode of ['obs', 'dashboard']) for (const colorScheme of ['light', 'dark']) {
      const html = render(h(LaplaceRenderContext.Provider, { value: { settings: { colorScheme } } }, h(Event, { data: { type: 'effect-message', id: 'effect', uid: 1, username: '用户', guardType: 1, messageRaw: { action: '投喂', name: '礼物', num: 1, text: '留言' } }, mode })));
      const rootClasses = html.match(/<div class="([^"]*)"/)[1].split(' ');
      assert.equal(rootClasses.includes('dark'), colorScheme === 'dark', `${mode}/${colorScheme}`);
      assert.ok(rootClasses.includes('event--effect-message'));
      assert.ok(rootClasses.includes('event--message'));
    }
  } finally { await vite.close(); }
});

test('独立互动、系统及开奖保留文案和名单头像', async () => {
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true }, server: { watch: null }, logLevel: 'error' });
  try {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup: render } = await import('react-dom/server');
    const { LaplaceEventRenderer: Event } = await vite.ssrLoadModule('/src/compat/laplace/renderer/independent/index.tsx');
    const { setLaplaceEventMedia } = await vite.ssrLoadModule('/src/compat/laplace/renderer/eventMedia.ts');
    setLaplaceEventMedia([{ list: [{ uid: 2, face: '/winner.jpg' }] }], true);
    const base = { id: 'event', uid: 1, username: '用户', origin: 2, originIdx: 0, timestampNormalized: 1700000000000 };
    const draw = data => render(h(Event, { data: { ...base, ...data }, mode: 'obs' }));
    assert.ok(draw({ type: 'interaction', action: 2 }).includes('关注直播间'));
    assert.ok(draw({ type: 'live-warning', message: '警告原因' }).includes('警告原因'));
    const result = draw({ type: 'lottery-result', message: '天选时刻中奖名单', list: [{ uid: 2, uname: '中奖用户', face: '/winner.jpg' }] });
    assert.ok(result.includes('rewards-items-mask')); assert.ok(result.includes('/winner.jpg'));
    const rawWinner = draw({ type: 'red-envelope-result', list: [[2, '中奖用户', 12345]] });
    assert.equal(rawWinner.includes('src="12345"'), false);
    const many = Array.from({ length: 20 }, (_, index) => ({ uid: index + 1, uname: `用户${index}` }));
    assert.equal((draw({ type: 'lottery-result', list: many }).match(/class="rewards-item-wrap list-item-wrap"/g) || []).length, 15);
    assert.equal((draw({ type: 'red-envelope-result', list: many.map(user => [user.uid, user.uname]) }).match(/class="rewards-item-wrap list-item-wrap"/g) || []).length, 12);
    const start = draw({ type: 'lottery-start', rewardName: '奖品', giftName: '礼物', giftPriceNormalized: 30, messageToJoin: '口令' });
    for (const value of ['奖品','口令','lottery-start-details-requirements']) assert.ok(start.includes(value), value);
    const red = draw({ type: 'red-envelope-start', list: [], icon: '/custom-red.png' });
    assert.ok(red.includes('/custom-red.png'));
    assert.equal(draw({ type: 'notice' }), ''); assert.equal(draw({ type: 'mvp' }), '');
  } finally { await vite.close(); }
});

test('独立付费事件保留盲盒、SC译文和大航海月份', async () => {
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, optimizeDeps: { noDiscovery: true }, server: { watch: null }, logLevel: 'error' });
  try {
    const { createElement: h } = await import('react');
    const { renderToStaticMarkup: render } = await import('react-dom/server');
    const { LaplaceEventRenderer: Event, LaplaceRenderContext } = await vite.ssrLoadModule('/src/compat/laplace/renderer/independent/index.tsx');
    const base = { id: 'paid', uid: 1, username: '用户', origin: 2, originIdx: 0, timestampNormalized: 1700000000000 };
    const draw = data => render(h(LaplaceRenderContext.Provider, { value: { settings: {} } }, h(Event, { data: { ...base, ...data }, as: 'normal', mode: 'obs' })));
    const gift = draw({ type: 'gift', message: '实际礼物', giftAmount: 2, priceNormalized: 20, coinType: 'gold', blindGift: { original_gift_name: '盲盒', gift_tip_price: 30000, original_gift_price: 10000 } });
    for (const value of ['event--gift', 'gift-blind-name', '盲盒', 'price-blind-result', 'gift-details-figure']) assert.ok(gift.includes(value), value);
    const openPlatformGuard = draw({ type: 'toast', message: '舰长', toastType: 3, toastAmount: 1, toastAmountUnit: '月', mockPrice: true });
    assert.ok(openPlatformGuard.includes('toast-details-action">开通'));
    assert.equal(openPlatformGuard.includes('special-blind-box'), false);
    const sc = draw({ type: 'superchat', message: '正文', messageTrans: '译文', transMark: 1, priceNormalized: 30 });
    assert.ok(sc.includes('message-translation')); assert.ok(sc.includes('译文'));
    const toast = draw({ type: 'toast', toastType: 3, toastAmount: 2, toastAmountUnit: '月', toastName: '舰长', message: '<%用户%> 开通了舰长', priceNormalized: 276 });
    for (const value of ['toast-details-type','toast-details-figure','toast-details-unit']) assert.ok(toast.includes(value), value);
  } finally { await vite.close(); }
});


