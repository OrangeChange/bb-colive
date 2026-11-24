import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { componentRuntime, findElement } from './helpers/componentRuntime.mjs';
import { createRevenueWindowSelection, changeRevenueWindowSelection } from '../src/windows/giftWindowModel.ts';

let vite, Sidebar, SettingsPanel, createDefaultSceneSettings;
const savedMatchMedia = globalThis.matchMedia;
before(async () => {
  globalThis.matchMedia = query => ({matches:false,media:query,addEventListener(){},removeEventListener(){}});
  vite = await createServer({configFile:false,esbuild:{jsx:"automatic"},cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-revenueSidebar.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL('..', import.meta.url)), server: {watch:null,middlewareMode:true, hmr:false, ws:false}, appType:'custom', logLevel:'silent' });
  ({ Sidebar } = await vite.ssrLoadModule('/src/components/Sidebar.tsx'));
  ({ SettingsPanel } = await vite.ssrLoadModule('/src/components/SettingsPanel.tsx'));
  ({ createDefaultSceneSettings } = await vite.ssrLoadModule('/src/components/sceneSettings.ts'));
});
after(async () => {
  if (!vite) return;
  try {
    const { getConnectionRuntime } = await vite.ssrLoadModule('/src/archive/connectionRuntime.ts');
    await getConnectionRuntime()?.dispose('shutdown');
  } finally {
    await vite.close();
    if (savedMatchMedia === undefined) delete globalThis.matchMedia;
    else globalThis.matchMedia = savedMatchMedia;
  }
});

test('真实Settings SSR总关时禁用礼物窗锁定并保留状态，总开后恢复可用', () => {
  for (const mode of ['combined', 'split']) for (const giftLocked of [false, true]) {
    const render = giftOpen => renderToStaticMarkup(React.createElement(SettingsPanel, {
      sceneSettings:createDefaultSceneSettings(), diagnosticMarkers:[], diagnosticStatus:null,
      revenueSelection:{...createRevenueWindowSelection(),mode,open:giftOpen},
      displayOpen:false,displayLocked:false,giftOpen,giftLocked,
    }));
    const lock = html => html.slice(html.indexOf('data-settings-search="gift-window-lock"')).match(/<button[^>]*>/)?.[0];
    const closed = lock(render(false));
    assert.match(closed, /disabled=""/);
    assert.match(closed, new RegExp(`aria-checked="${giftLocked}"`));
    const opened = lock(render(true));
    assert.doesNotMatch(opened, /disabled=""/);
    assert.match(opened, new RegExp(`aria-checked="${giftLocked}"`));
  }
});

test('真实设置将子窗放进分窗组，总开名称保留，显示方式复用标准设置行', () => {
  const html = renderToStaticMarkup(React.createElement(SettingsPanel, {
    sceneSettings:createDefaultSceneSettings(), diagnosticMarkers:[], diagnosticStatus:null,
    revenueSelection:{...createRevenueWindowSelection(),mode:'split'},
    displayOpen:false,displayLocked:false,giftOpen:false,giftLocked:false,
  }));
  assert.match(html, /data-settings-search="gift-window-mode"[^>]*><span class="settings-control-label ui-type-control text-t2">显示方式<\/span>/);
  const giftSection = html.slice(html.indexOf('data-settings-anchor="gift"'),html.indexOf('data-settings-section="interaction"'));
  assert.equal((giftSection.match(/aria-label=["']开启收益窗["']/g) ?? []).length,1);
  assert.match(giftSection, /class="settings-subsection-title" data-settings-level="2">[\s\S]*?收益窗<\/div>/);
  const group = giftSection.slice(giftSection.indexOf('aria-label="分窗"'));
  assert.ok(group.length > 0, '子开关归属分窗组');
  for (const label of ['礼物窗','醒目留言窗','大航海窗']) assert.match(group,new RegExp(`aria-label="${label}"`));
  assert.match(giftSection, /role="radiogroup" aria-label=["']显示方式["']/);
  assert.match(giftSection, /checked="" value="split"[\s\S]*?分窗显示<\/span>/);
});

test('真实Sidebar总入口使用组合窗口，子窗使用礼盒、气泡金额和标准锚', () => {
  const html = renderToStaticMarkup(React.createElement(Sidebar, {
    revenueSelection:{...createRevenueWindowSelection(),mode:'split'}, onToggleGift(){}, onToggleRevenueChild(){},
  }));
  const icon = label => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>([\\s\\S]*?)</button>`))?.[1];
  const revenue = icon('打开收益窗');
  assert.ok(revenue, '总入口名为收益窗');
  assert.match(revenue, /lucide-wallet/);
  assert.match(icon('礼物窗：已关闭'), /lucide-gift/);
  assert.match(icon('醒目留言窗：已关闭'), /lucide-message-square-quote/);
  assert.match(icon('大航海窗：已关闭'), /lucide-ship/);
});

test('真实Sidebar SSR将SVG子按钮和共享锁定放在礼物展开栏内，总关仍可达', () => {
  const selection = {...createRevenueWindowSelection(), mode:'split'};
  const html = renderToStaticMarkup(React.createElement(Sidebar, {revenueSelection:selection, onToggleGift(){}, onToggleGiftLock(){}, onToggleRevenueChild(){}}));
  const group = html.match(/<div[^>]*aria-label=["']收益分窗["'][^>]*>([\s\S]*?)<\/div>/)?.[1];
  assert.ok(group, '礼物入口内需要收益展开栏');
  for (const name of ['礼物','醒目留言','大航海']) assert.match(group, new RegExp(`aria-label="${name}窗：已关闭"[^>]*>[\\s\\S]*?<svg`));
  assert.match(group, /aria-label=["']锁定收益窗（鼠标穿透）["']/);
  const lock = group.match(/<button[^>]*aria-label=["']锁定收益窗（鼠标穿透）["'][^>]*>/)?.[0];
  assert.match(lock, /disabled=""/);
  assert.match(html, /sidebar-gift-controls[^" >]*[^">]*has-lock[^">]*has-revenue/);
  assert.doesNotMatch(group, /<span[^>]*>SC<\/span>|>航海<|>礼物</);
});

function harness() {
  const voice = {enabled:false, personalBroadcast:{enabled:false}, setVoiceSettings(){}};
  const runtime = componentRuntime('src/components/Sidebar.tsx', {
    './railPrimitives': {railButton:'rail',railButtonIdle:'idle',railButtonDisabled:'disabled'},
    '../voice/voiceSettings.ts': {useVoiceSettings: fn => fn(voice)},
    '../voice/voiceRuntime.ts': {voiceController:{start(){},stop(){}}},
  });
  let selection = {...createRevenueWindowSelection(),mode:'split'};
  let locked = false;
  const props = () => ({revenueSelection:selection,giftOpen:selection.open,giftLocked:locked,
    onToggleGift(){selection=changeRevenueWindowSelection(selection,{type:'toggle'});},
    onToggleRevenueChild(kind){selection=changeRevenueWindowSelection(selection,{type:'child',kind});},
    onToggleGiftLock(){locked=!locked;}});
  const render = () => {const tree=runtime.render('Sidebar',props()); runtime.effects(); return tree;};
  const root = tree => findElement(tree, node => node.props?.className?.includes('sidebar-gift-controls'));
  const button = (tree,label) => findElement(root(tree), node => node.type==='button' && node.props['aria-label']===label);
  return {runtime,render,root,button};
}

test('总关禁用锁定且保留三个子按钮，总开后锁定可操作，再总关保留锁定状态', () => {
  const h = harness();
  try {
    let tree = h.render();
    h.root(tree).props.onFocusCapture();
    tree = h.render();
    let lock = h.button(tree, '锁定收益窗（鼠标穿透）');
    assert.equal(lock.props.disabled, true);
    assert.match(lock.props.className, /disabled/);
    assert.equal(lock.props.onClick, undefined);
    for (const name of ['礼物', '醒目留言', '大航海']) {
      assert.equal(h.button(tree, `${name}窗：已关闭`).props.disabled, false);
    }
    h.button(tree, '打开收益窗').props.onClick();
    tree = h.render();
    lock = h.button(tree, '锁定收益窗（鼠标穿透）');
    assert.equal(lock.props.disabled, false);
    lock.props.onClick();
    tree = h.render();
    assert.equal(h.button(tree, '解锁收益窗').props['aria-pressed'], true);
    h.button(tree, '关闭收益窗').props.onClick();
    tree = h.render();
    lock = h.button(tree, '解锁收益窗');
    assert.equal(lock.props.disabled, true);
    assert.equal(lock.props.onClick, undefined);
    assert.equal(lock.props['aria-pressed'], true);
    assert.doesNotMatch(lock.props.className, /bg-accent-subtle/);
    h.button(tree, '大航海窗：已关闭').props.onClick();
    tree = h.render();
    assert.equal(h.button(tree, '解锁收益窗').props.disabled, false);
  } finally { h.runtime.close(); }
});

test('总关时hover/focus展开，子开关与总开关保留最近组合并共享锁定', () => {
  const h=harness();
  try {
    let tree=h.render();
    h.root(tree).props.onMouseEnter();
    tree=h.render(); assert.match(h.root(tree).props.className,/is-revealed/);
    h.button(tree,'醒目留言窗：已关闭').props.onClick();
    tree=h.render(); assert.equal(h.button(tree,'醒目留言窗：已开启').props['aria-pressed'],true);
    h.button(tree,'锁定收益窗（鼠标穿透）').props.onClick();
    tree=h.render(); assert.equal(h.button(tree,'解锁收益窗').props['aria-pressed'],true);
    h.button(tree,'关闭收益窗').props.onClick();
    tree=h.render(); assert.ok(h.button(tree,'醒目留言窗：已关闭'));
    h.root(tree).props.onFocusCapture();
    tree=h.render(); assert.match(h.root(tree).props.className,/is-revealed/);
    h.button(tree,'打开收益窗').props.onClick();
    tree=h.render(); assert.ok(h.button(tree,'醒目留言窗：已开启'));
    assert.ok(h.button(tree,'礼物窗：已关闭')); assert.ok(h.button(tree,'大航海窗：已关闭'));
  } finally {h.runtime.close();}
});

test('离开展开栏延迟收起，栏内焦点转移不收起，卸载清理计时', context => {
  context.mock.timers.enable({apis:['setTimeout']});
  const h=harness();
  try {
    let tree=h.render(); h.root(tree).props.onFocusCapture(); tree=h.render();
    h.root(tree).props.ref.current={contains: node => node==='child'};
    h.root(tree).props.onBlurCapture({relatedTarget:'child'});
    context.mock.timers.tick(220);
    tree=h.render(); assert.match(h.root(tree).props.className,/is-revealed/);
    h.root(tree).props.onMouseLeave(); context.mock.timers.tick(219);
    assert.match(h.root(h.render()).props.className,/is-revealed/);
    context.mock.timers.tick(1); assert.doesNotMatch(h.root(h.render()).props.className,/is-revealed/);
  } finally {h.runtime.close();}
});
