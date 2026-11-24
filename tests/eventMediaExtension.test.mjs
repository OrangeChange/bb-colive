import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES, normalizeEventDisplayPreferences } from '../src/eventDisplaySettings.ts';
import { normalizeEventWindowPreferences } from '../src/windows/eventWindowPreferences.ts';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';

let vite, EventRow, preview;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-eventMediaExtension.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, esbuild: { jsx: "automatic" }, root: fileURLToPath(new URL('..', import.meta.url)), server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
  ({ EventRow } = await vite.ssrLoadModule('/src/components/EventRow.tsx'));
  preview = await vite.ssrLoadModule('/src/components/stylePreviewContext.ts');
});
after(async () => { await vite?.close(); });
const render = (ev, props = {}) => renderToStaticMarkup(React.createElement(EventRow, { ev, showTime: false, ...props }));

test('九框按事件里程碑和内部身份转换公开编号；旧档案使用基础框', () => {
  for (const [milestone, suffix] of [['standard', ''], ['thousand', '-1k'], ['tenThousand', '-10k'], [undefined, ''], ['unknown', '']]) {
    for (const [level, number] of [[1, 3], [2, 2], [3, 1]]) {
      const ev = getNativeEventSample('text');
      ev.user = { ...ev.user, guardLevel: level, guardMilestone: milestone, guardIconSet: 'enhanced' };
      for (const props of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
        const html = render(ev, props);
        assert.match(html, new RegExp(`src="/laplace/guard-icons/frame-${number}${suffix}\\.png"`));
        assert.match(html, new RegExp(`class="avatar-frame" data-level="${number}"`));
      }
    }
  }
});

test('头像框开关独立于身份徽标和文字模式，关闭头像时框消失', () => {
  const ev = getNativeEventSample('text'); ev.user.guardLevel = 1;
  assert.match(render(ev, { displayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showGuardIdentity: false, guardIdentityDisplayMode: 'text' } }), /avatar-frame/);
  for (const displayPreferences of [{ ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatarFrame: false }, { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatar: false }]) {
    assert.doesNotMatch(render(ev, { displayPreferences }), /avatar-frame/);
  }
  ev.user.guardLevel = 0;
  assert.doesNotMatch(render(ev), /avatar-frame/);
});

test('缺少远程头像与礼物图时全部布局使用内置媒体', () => {
  const text = getNativeEventSample('text'); delete text.user.avatar;
  const gift = getNativeEventSample('blind-gift');
  delete gift.gift.webp; delete gift.gift.gif; delete gift.gift.icon;
  delete gift.gift.blindWebp; delete gift.gift.blindGif; delete gift.gift.blindIcon;
  for (const props of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
    assert.match(render(text, props), /src="\/media\/noface.gif"/);
    const html = render(gift, props);
    assert.match(html, /src="\/laplace\/gifts\/gift-fallback.png"/);
    assert.match(html, /src="\/media\/blind-box-fallback.webp"/);
  }
  delete text.user;
  assert.doesNotMatch(render(text), /avatar-wrap/);
});

test('头像框偏好默认开启、归一化保留关闭、副窗传输和全部部件预览', () => {
  assert.equal(normalizeEventDisplayPreferences({}).showAvatarFrame, true);
  assert.equal(normalizeEventDisplayPreferences({ showAvatarFrame: false }).showAvatarFrame, false);
  assert.equal(normalizeEventDisplayPreferences({ showAvatarFrame: 'false' }).showAvatarFrame, true);
  assert.equal(normalizeEventWindowPreferences({ display: { showAvatarFrame: false } }).display.showAvatarFrame, false);
  for (const context of ['live', 'review', 'window-chat', 'window-pay']) {
    const input = { displayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, showAvatar: false, showAvatarFrame: false, maskUsername: true } };
    assert.equal(preview.resolveStylePreviewContext(context, 'current', input).displayPreferences.showAvatarFrame, false);
    assert.equal(preview.resolveStylePreviewContext(context, 'all', input).displayPreferences.showAvatarFrame, false);
    const current = preview.resolveStylePreviewContext(context, 'current', input).displayPreferences;
    const all = preview.resolveStylePreviewContext(context, 'all', input).displayPreferences;
    assert.equal(current.showAvatar, false);
    assert.equal(all.showAvatar, false);
    assert.equal(current.maskUsername, true);
    assert.equal(all.maskUsername, true);
    assert.equal(input.displayPreferences.showAvatar, false);
    assert.equal(input.displayPreferences.showAvatarFrame, false);
  }
});

test('所有内置框与媒体均随软件提供', () => {
  for (const number of [1, 2, 3]) for (const suffix of ['', '-1k', '-10k']) {
    assert.ok(existsSync(new URL(`../public/laplace/guard-icons/frame-${number}${suffix}.png`, import.meta.url)));
  }
  for (const path of ['media/noface.gif', 'media/blind-box-fallback.webp', 'laplace/gifts/gift-fallback.png']) {
    assert.ok(existsSync(new URL(`../public/${path}`, import.meta.url)));
  }
});

test('头像框设置持久化保留关闭，显示恢复不覆盖主题设置，完整恢复后开启', async () => {
  const savedStorage = globalThis.localStorage;
  const savedWindow = globalThis.window;
  const storage = new Map();
  globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
  globalThis.window = { localStorage: globalThis.localStorage };
  try {
    const { useGeneralSettings } = await vite.ssrLoadModule('/src/generalSettings.ts?task1-persist');
    const store = useGeneralSettings;
    store.getState().setEventDisplayPreference('showAvatarFrame', false);
    assert.equal(JSON.parse(storage.get('danmu-general-settings')).state.eventDisplayPreferences.showAvatarFrame, false);
    const options = store.persist.getOptions();
    const saved = options.partialize(store.getState());
    assert.equal(saved.eventDisplayPreferences.showAvatarFrame, false);
    const restored = options.merge(saved, store.getState());
    assert.equal(restored.eventDisplayPreferences.showAvatarFrame, false);
    const { createEventWindowPreferences } = await vite.ssrLoadModule('/src/windows/eventWindowPreferences.ts');
    assert.equal(createEventWindowPreferences(restored, { giftThreshold: 0, giftThresholdMode: 'unit' }).display.showAvatarFrame, false);
    store.getState().resetEventDisplay();
    assert.equal(store.getState().eventDisplayPreferences.showAvatarFrame, false);
    store.getState().setEventDisplayPreference('showAvatarFrame', false);
    store.getState().resetDanmu();
    assert.equal(store.getState().eventDisplayPreferences.showAvatarFrame, true);
  } finally { globalThis.localStorage = savedStorage; globalThis.window = savedWindow; }
});
