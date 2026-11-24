import test from 'node:test';
import assert from 'node:assert/strict';
import { mockIPC, clearMocks } from '@tauri-apps/api/mocks';
import { installAppliedNativeThemeCss, updatePublishedNativeThemeScale } from '../src/themes/nativeThemeRuntime.ts';

test('副窗口缩放不改变主窗口样式，默认空样式清除旧主题', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  globalThis.window = {};
  const style = { textContent: 'live-original' };
  globalThis.document = { getElementById: () => style };
  const stores = new Map();
  const runtime = new Map([
    ['projection:target:windows', { css: '.event .username { background: #004dd673; }', displayScale: 1 }],
    ['activeCss:windows', '.event .username { background: #004dd673; }'],
    ['activeCss:live', ''],
  ]);
  stores.set('native-theme-runtime.local.json', runtime);
  stores.set('native-theme-bindings.local.json', new Map([
    ['bindings', [{ targetId: 'windows', targetKind: 'windows', themeId: 'custom', revision: 1 }]],
  ]));
  const notifications = [];
  mockIPC((command, args) => {
    if (command === 'get_app_data_directory') return 'C:/test-data';
    if (command === 'plugin:store|load') return args.path.split('/').at(-1);
    if (command === 'plugin:store|get') return [stores.get(args.rid)?.get(args.key), stores.get(args.rid)?.has(args.key) ?? false];
    if (command === 'plugin:store|set') { stores.get(args.rid).set(args.key, args.value); return; }
    if (command === 'plugin:store|save') return;
    if (command === 'plugin:event|emit') { notifications.push(args); return; }
    throw new Error(command);
  });
  try {
    await updatePublishedNativeThemeScale('windows', 'windows', 0.9);
    assert.equal(style.textContent, 'live-original');
    assert.equal(runtime.get('projection:target:windows').displayScale, 0.9);
    assert.deepEqual(notifications.map(item => item.event).sort(), [
      'native-theme-publication',
      'theme-bindings-changed',
    ]);
    await installAppliedNativeThemeCss('windows');
    assert.match(style.textContent, /:where\(\.theme-surface\.theme-target-windows\) :is\(\.event \.username\)/);
    await installAppliedNativeThemeCss('live');
    assert.equal(style.textContent, '');
  } finally {
    clearMocks();
    globalThis.window = previousWindow;
    globalThis.document = previousDocument;
  }
});
