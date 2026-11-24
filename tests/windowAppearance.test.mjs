import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WINDOW_APPEARANCE,
  MIN_WINDOW_OPACITY,
  normalizeWindowAppearance,
  resolveWindowSurfaceColor,
  resolveWindowScheme,
  resolveWindowSurfaceOpacity,
} from "../src/windowAppearance.ts";

test("副窗口外观有统一默认值并限制到可用范围", () => {
  assert.deepEqual(DEFAULT_WINDOW_APPEARANCE, {
    material: 'glass',
    scheme: 'follow',
    glassTint: 0.18,
    solidOpacity: 1,
    surfaceColor: null,
    radius: 12,
  });
  assert.equal(MIN_WINDOW_OPACITY, 0);

  assert.deepEqual(normalizeWindowAppearance({
    opacity: -1,
    radius: -5,
    surfaceColor: { r: 300, g: -1, b: 80, a: 0.4 },
  }), {
    material: 'glass',
    scheme:'follow', glassTint:.18, solidOpacity:1,
    surfaceColor: { r: 255, g: 0, b: 80, a: 0.4 },
    radius: 0,
  });
});

test('旧版自定义值保持，自动底色随明暗变化', () => {
  const saved = { opacity: .82, radius: 8, surfaceColor: { r:21,g:26,b:32,a:1 } };
  const appearance = normalizeWindowAppearance(saved);
  assert.deepEqual(appearance, { material:'glass', scheme:'follow',glassTint:.18,solidOpacity:1,radius:8,surfaceColor:saved.surfaceColor });
  assert.deepEqual(resolveWindowSurfaceColor(appearance, 'light'), saved.surfaceColor);
  assert.deepEqual(resolveWindowSurfaceColor(appearance, 'dark'), saved.surfaceColor);
  assert.deepEqual(resolveWindowSurfaceColor(DEFAULT_WINDOW_APPEARANCE, 'light'), {r:255,g:255,b:255,a:1});
  assert.deepEqual(resolveWindowSurfaceColor(DEFAULT_WINDOW_APPEARANCE, 'dark'), {r:20,g:20,b:24,a:1});
  assert.equal(normalizeWindowAppearance({material:'transparent', ...saved}).material, 'transparent');
});


test('窗口明暗独立于内容，材质分别记住强度', () => {
  assert.equal(resolveWindowScheme('follow','dark'),'dark');
  assert.equal(resolveWindowScheme('light','dark'),'light');
  assert.equal(resolveWindowScheme('dark','light'),'dark');
  const value=normalizeWindowAppearance({scheme:'dark',material:'solid',solidOpacity:.8,glassTint:.12});
  assert.equal(resolveWindowSurfaceOpacity(value),.8);
  assert.equal(resolveWindowSurfaceOpacity({...value,material:'glass'}),.12);
  assert.equal(resolveWindowSurfaceOpacity({...value,material:'transparent'}),0);
  assert.equal(normalizeWindowAppearance({material:'solid',opacity:.7}).solidOpacity,.7);
});


test('自动表面颜色使用主题值，显式颜色优先', () => {
  const themed = {r:26,g:22,b:24,a:1};
  assert.deepEqual(resolveWindowSurfaceColor(DEFAULT_WINDOW_APPEARANCE,'dark',themed),themed);
  const chosen = {r:124,g:58,b:237,a:.6};
  assert.deepEqual(resolveWindowSurfaceColor({...DEFAULT_WINDOW_APPEARANCE,surfaceColor:chosen},'dark',themed),chosen);
});
