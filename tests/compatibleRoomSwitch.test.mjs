import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('兼容主题现场和副窗口跟随切房，OBS 保持独立房间', async () => {
  const vite = await createServer({ configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
  try {
    const { createCompatibleThemeModeAdapter } = await vite.ssrLoadModule('/src/themes/themeModeAdapters.ts');
    const modes = [
      ['laplace', 'resolvePublishedLaplaceRender'],
      ['blivechat', 'resolvePublishedBlivechatRender'],
      ['blivechat-open', 'resolvePublishedOpenLiveRender'],
    ];
    for (const [mode, resolver] of modes) {
      const directory = mode === 'blivechat-open' ? 'openlive' : mode;
      const resolve = (await vite.ssrLoadModule(`/src/compat/${directory}/runtime.tsx`))[resolver];
      const document = createCompatibleThemeModeAdapter(mode).createBuiltinTheme();
      const event = { id: 'current-room', roomId: 2, ts: 1700000000000, msgType: 0, text: '切房后的弹幕', user: { uid: '1', uname: '用户', phoneVerified: true } };
      for (const target of ['live', 'windows']) {
        const current = { document, context: { target, targetId: target, roomId: '1', displayScale: 1 } };
        const render = resolve(current, { target, targetId: target, roomId: 2, placement: 'main' });
        assert.equal(render.eventDecision(event), 'render', `${mode}/${target}: 当前房间事件应显示`);
        assert.ok(render.listSurface.project(event, 1), `${mode}/${target}: 当前房间事件应进入渲染器`);
        for (const paid of [
          { ...event, id: 'current-gift', msgType: 1, gift: { id: 1, name: '礼物', count: 1, price: 30000, total: 30000, totalRmb: 30, paymentRmb: 30, coinType: 'gold' } },
          { ...event, id: 'current-sc', msgType: 2, sc: { price: 30, message: '留言', duration: 60 } },
        ]) {
          assert.equal(render.eventDecision(paid), 'render', `${mode}/${target}: 切房后的付费事件应显示`);
          assert.ok(render.listSurface.project(paid, 2), `${mode}/${target}: 付费事件应进入渲染器`);
        }
        assert.equal(render.eventDecision({ ...event, id: 'old-room', roomId: 1 }), 'omit', `${mode}/${target}: 不显示旧房间事件`);
      }
      const current = { document, context: { target: 'obs', targetId: 'obs-room', roomId: '1', displayScale: 1 } };
      const mismatched = resolve(current, { target: 'obs', targetId: 'obs-room', roomId: 2, placement: 'main' });
      assert.equal(mismatched.eventDecision(event), 'omit', `${mode}/obs: 不跟随现场换房`);
      const bound = resolve(current, { target: 'obs', targetId: 'obs-room', roomId: 1, placement: 'main' });
      const ownEvent = { ...event, id: 'obs-bound-room', roomId: 1 };
      assert.equal(bound.eventDecision(ownEvent), 'render', `${mode}/obs: 继续显示绑定房间`);
      assert.ok(bound.listSurface.project(ownEvent, 1), `${mode}/obs: 绑定房间事件应进入渲染器`);
      assert.equal(bound.eventDecision(event), 'omit', `${mode}/obs: 排除其他房间事件`);
    }
  } finally {
    await vite.close();
  }
});
