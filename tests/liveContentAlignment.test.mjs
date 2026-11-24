import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { isLaplaceRenderMessage } from '../src/compat/laplace/renderer/bridge.ts';
import { resolveFeedContentAlignment, getFeedStackAlignment } from '../src/events/feedScroll.ts';
import { createEventWindowPreferences, normalizeEventWindowPreferences } from '../src/windows/eventWindowPreferences.ts';

const saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
globalThis.window = { localStorage: globalThis.localStorage };
const { useGeneralSettings } = await import('../src/generalSettings.ts');

test('内容对齐独立于最新位置，缺失字段默认顶部', () => {
  const store = useGeneralSettings;
  const initial = store.getState();
  const { merge, partialize } = store.persist.getOptions();
  try {
    assert.equal(initial.liveContentAlignment, 'top');
    for (const direction of ['top', 'bottom']) {
      assert.equal(merge({ liveScrollDirection: direction }, initial).liveContentAlignment, 'top');
      for (const alignment of ['top', 'bottom']) {
        const state = merge({ liveScrollDirection: direction, liveContentAlignment: alignment }, initial);
        assert.equal(state.liveContentAlignment, alignment);
        assert.equal(state.liveScrollDirection, direction);
        store.setState(state);
        store.getState().setLiveContentAlignment(alignment);
        assert.equal(store.getState().liveScrollDirection, direction);
        assert.equal(partialize(store.getState()).liveContentAlignment, alignment);
        const preferences = createEventWindowPreferences(store.getState(), { giftThreshold: 0, giftThresholdMode: 'unit' });
        assert.equal(preferences.contentAlignment, alignment);
        assert.equal(normalizeEventWindowPreferences(preferences).contentAlignment, alignment);
        assert.equal(getFeedStackAlignment(direction, alignment), alignment === 'bottom' ? 'end' : 'start');
      }
    }
    store.getState().resetEventDisplay();
    assert.equal(store.getState().liveContentAlignment, 'top');
  } finally { store.setState(initial, true); }
});

test('OBS 礼物特效独立保存，不改变现场和收益窗开关', () => {
  const store = useGeneralSettings, initial = store.getState();
  const { merge, partialize } = store.persist.getOptions();
  try {
    assert.equal(initial.showObsGiftEffect, false);
    store.setState({ showLiveGiftEffect: true, showGiftWindowEffect: true });
    store.getState().setShowObsGiftEffect(true);
    assert.equal(store.getState().showLiveGiftEffect, true);
    assert.equal(store.getState().showGiftWindowEffect, true);
    assert.equal(partialize(store.getState()).showObsGiftEffect, true);
    assert.equal(merge({ showObsGiftEffect: true }, initial).showObsGiftEffect, true);
    assert.equal(merge({}, initial).showObsGiftEffect, false);
  } finally { store.setState(initial, true); }
});

test('BLC 两版宿主的短列表布局使用独立对齐值', () => {
  for (const [file, name] of [['../vendor/blivechat/host/entry.js', 'updateHostStyle'], ['../src/compat/openlive/runtime/entry.mjs', 'updateTicker']]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    const start = source.indexOf(`function ${name}(`);
    const end = source.indexOf('\n}', start) >= 0 && name === 'updateHostStyle' ? source.indexOf('\n}', start) + 2 : source.indexOf('\nasync function applyPresentation', start);
    for (const direction of ['top', 'bottom']) for (const contentAlignment of ['top', 'bottom']) {
      const hostStyle = { textContent: '' };
      const context = { EVENT_TRANSITION_CSS: "", COMPATIBLE_RECALL_CSS: "", hostStyle, hostOptions: { tickerEnabled: true, managed: true, direction }, presentation: { position: 'top', contentAlignment }, document: { documentElement: { dataset: {} }, querySelector: () => null } };
      vm.runInNewContext(`${source.slice(start, end)};${name}()`, context);
      assert.match(hostStyle.textContent, new RegExp(`margin-top:\\s*${contentAlignment === 'bottom' ? 'auto' : '0'}\\s*!important`));
    }
  }
});

test('LAPLACE 桥接受四种位置与对齐组合', () => {
  for (const direction of ['top', 'bottom']) for (const contentAlignment of ['top', 'bottom']) {
    assert.equal(isLaplaceRenderMessage({ channel: 'bb-laplace', version: 1, type: 'render', generation: 0, sequence: 1, events: [], stickyEvents: [], settings: {}, css: { cloud: '', remote: '', custom: '' }, preview: false, scrollable: true, rate: 0, direction, contentAlignment }), true);
  }
});

 test('四版缺失对齐默认顶部，显式对齐独立', () => {
 for (const mode of ['native','blivechat','blivechat-open','laplace']) for (const direction of ['top','bottom']) {
 const expected="top";
 assert.equal(resolveFeedContentAlignment(mode,direction),expected);
 for(const alignment of ['top','bottom']) assert.equal(resolveFeedContentAlignment(mode,direction,alignment),alignment);
 const legacy=normalizeEventWindowPreferences({scrollDirection:direction});assert.equal(legacy.contentAlignment,"top");
 }
 });

