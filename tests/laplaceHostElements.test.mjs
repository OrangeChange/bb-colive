import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let vite, projection, defaults;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-laplaceHostElements.test.mjs", configFile: false, esbuild: { jsx: 'automatic' }, server: { middlewareMode: true, watch: null }, optimizeDeps: {include:[], noDiscovery: true }, appType: 'custom', logLevel: 'silent' });
  projection = await vite.ssrLoadModule('/src/compat/laplace/projection.ts');
  ({ createDefaultCompatibleThemeSettings: defaults } = await vite.ssrLoadModule('/src/themes/compatThemeSettings.ts'));
});
after(async () => { await vite?.close(); });

test('宿主保留未知点亮，显隐不改头像、用户名或勋章事实', () => {
  const settings = { ...defaults('laplace'), showMedal: true };
  const events = [true, false, undefined].map((lightened, originIdx) => ({ type: 'message', origin: 22, originIdx, username: '名字', avatar: 'avatar.png', medal: { name: '牌', lightened } }));
  const original = structuredClone(events);
  const result = projection.laplaceHostElementPresentation(settings, events);
  assert.equal(result.settings.showMedalLightenedOnly, false);
  assert.match(result.css, /\.fans-medal-lightened--false/);
  assert.match(result.css, /\.fans-medal-lightened--0/);
  assert.doesNotMatch(result.css, /lightened--unknown/);
  assert.deepEqual(events, original);
});

test('来源数字未点亮不显示，canonical 未知点亮不被来源缺省零覆盖', async () => {
  const { MsgType } = await vite.ssrLoadModule('/src/protocol/eventTypeCodes.ts');
  const event = { id: 'source', roomId: 22, ts: 1, msgType: MsgType.Danmu, user: { uid: '1', uname: '名字', medal: { name: '牌', level: 1, isCurrentRoom: true } }, laplace: { sourceMode: 'direct', event: { type: 'message', medal: { name: '牌', level: 1, lightened: 0, room: 99 } } } };
  const original = structuredClone(event);
  const row = projection.projectLaplaceEvent(event, { roomId: 22, generation: 0 }, 1, 1).event;
  assert.equal(row.medal.lightened, undefined);
  assert.equal(row.bbHostMedalCurrentRoom, true);
  assert.deepEqual(event, original);
});

test('仅当前房间采用目标投影归属，未知与他房隐藏但不删除事件', async () => {
  const { MsgType } = await vite.ssrLoadModule('/src/protocol/eventTypeCodes.ts');
  const rows = [true, false, undefined].map((isCurrentRoom, index) => ({ ...projection.projectLaplaceEvent({ id: String(index), roomId: 22, ts: 1, msgType: MsgType.Danmu, text: '正文', user: { uid: '1', uname: '名字', medal: { name: '牌', level: 1, isCurrentRoom } } }, { roomId: 22, generation: 0 }, index, 1).event, originIdx: index }));
  const result = projection.laplaceHostElementPresentation({ ...defaults('laplace'), showMedal: true, showMedalCurrentRoomOnly: true }, rows);
  assert.doesNotMatch(result.css, /origin-index--0/);
  assert.match(result.css, /origin-index--1/);
  assert.match(result.css, /origin-index--2/);
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.medal.name === '牌'));
});

test('非经典范围补齐 dashboard 元素闸，经典范围保留来源范围', () => {
  const settings = { ...defaults('laplace'), showAvatar: false, showUsername: false, showMedal: false, showModBadge: false };
  const result = projection.laplaceHostElementPresentation(settings, []);
  for (const selector of ['.avatar', '.username', '.reply-username', '.fans-medal', '.mod-badge-wrap']) assert.ok(result.css.includes(selector));
  const classic = projection.laplaceHostElementPresentation({ ...settings, classicElementScope: true }, []);
  assert.doesNotMatch(classic.css, /\.avatar|\.username/);
  assert.match(classic.css, /\.fans-medal/);
  assert.match(classic.css, /\.mod-badge-wrap/);
});

test('正式 runtime 使用输出房间，来源 room 不覆盖 canonical 未知归属', async () => {
  const { resolvePublishedLaplaceRender } = await vite.ssrLoadModule('/src/compat/laplace/runtime.tsx');
  const { MsgType } = await vite.ssrLoadModule('/src/protocol/eventTypeCodes.ts');
  const settings = { ...defaults('laplace'), showMedal: true, showMedalCurrentRoomOnly: true };
  const current = { document: { mode: 'laplace', settings, styles: { baseCss: '', visualCss: '', customCss: '' } }, context: { target: 'obs', roomId: '22' } };
  const event = { id: 'source', roomId: 22, ts: 1, msgType: MsgType.Danmu, user: { uid: '1', uname: '名字', medal: { name: '牌', level: 1 } }, laplace: { sourceMode: 'direct', event: { type: 'message', medal: { name: '牌', level: 1, room: 22 } } } };
  for (const target of ['live', 'obs']) for (const medal of [event.user.medal, undefined]) {
    const render = resolvePublishedLaplaceRender(current, { target, roomId: 22 });
    const row = render.listSurface.project({ ...event, user: { ...event.user, medal } }, 7);
    assert.equal(row.origin, 22);
    assert.equal(row.username, '名字');
    const presentation = projection.laplaceHostElementPresentation(render.listSurface.config, [row]);
    assert.match(presentation.css, /origin-index--7/);
  }
});

test('原粉丝牌组件在两种模式都保留 unknown，宿主标记不进入来源白名单', async () => {
  const { FansMedal, LaplaceRenderContext } = await vite.ssrLoadModule('/src/compat/laplace/renderer/independent/primitives.tsx');
  const { pickLaplaceRendererEvent } = await vite.ssrLoadModule('/src/compat/laplace/renderer/bridge.ts');
  const presentation = projection.laplaceHostElementPresentation(defaults('laplace'), []);
  for (const mode of ['dashboard', 'obs']) {
    const html = renderToStaticMarkup(createElement(LaplaceRenderContext.Provider, { value: { settings: presentation.settings } }, createElement(FansMedal, { mode, data: { medal: { name: '未知牌', level: 1 } } })));
    assert.match(html, /fans-medal-lightened--unknown/);
    assert.match(html, /未知牌/);
  }
  assert.equal('bbHostMedalCurrentRoom' in pickLaplaceRendererEvent({ type: 'message', bbHostMedalCurrentRoom: true }), false);
});

test('基础页可切换仅当前房间，粉丝牌关闭时保留从属选择', async () => {
  await vite.ssrLoadModule('/src/compat/laplace/register.tsx');
  const { getCompatibleThemeEditingSurface } = await vite.ssrLoadModule('/src/components/CompatibleThemePreview.tsx');
  let settings = { ...defaults('laplace'), showMedal: true };
  const nodes = element => !element || typeof element !== 'object' ? [] : [element, ...[element.props?.children].flat(Infinity).flatMap(nodes)];
  const toggle = label => {
    const basic = getCompatibleThemeEditingSurface('laplace').renderBasicControls({ document: { settings }, onSettingsChange: next => { settings = next; } });
    return nodes(basic.type(basic.props)).find(node => node.props?.label === label);
  };
  toggle('仅当前房间粉丝牌').props.onChange();
  assert.equal(settings.showMedalCurrentRoomOnly, true);
  toggle('粉丝牌').props.onChange();
  assert.equal(toggle('仅当前房间粉丝牌').props.disabled, true);
  assert.equal(settings.showMedalCurrentRoomOnly, true);
});


test('主播和房管标记独立控制', () => {
  const settings = defaults('laplace');
  assert.equal(settings.showAnchorBadge, true);
  assert.equal(settings.showMedal, true);
  const anchor = projection.laplaceHostElementPresentation({...settings,showAnchorBadge:false}, []);
  assert.match(anchor.css, /\.streamer-badge-wrap/);
  assert.doesNotMatch(anchor.css, /\.mod-badge-wrap/);
  const mod = projection.laplaceHostElementPresentation({...settings,showModBadge:false}, []);
  assert.match(mod.css, /\.mod-badge-wrap/);
  assert.doesNotMatch(mod.css, /\.streamer-badge-wrap/);
});
