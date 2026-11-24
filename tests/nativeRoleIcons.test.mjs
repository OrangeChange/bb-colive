import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { DEFAULT_EVENT_DISPLAY_PREFERENCES, normalizeEventDisplayPreferences } from '../src/eventDisplaySettings.ts';
import { normalizeNativeThemeDisplaySettings } from '../src/themes/nativeComponentAppearance.ts';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';
import { nativeVisualPropertiesForPart, resolveNativePartShape } from '../src/themes/nativeThemeCapabilities.ts';

const display = normalizeNativeThemeDisplaySettings({ anchorIdentityDisplayMode: 'text', adminIdentityDisplayMode: 'icon' });
assert.equal(display.anchorIdentityDisplayMode, 'text', '主播形式需要独立保存');
assert.equal(normalizeEventDisplayPreferences(display).adminIdentityDisplayMode, 'icon');
assert.deepEqual(normalizeNativeThemeDisplaySettings(JSON.parse(JSON.stringify(display))), display);
assert.equal(resolveNativePartShape('anchorBadge', { event: 'all', display }), 'text');
assert.equal(resolveNativePartShape('adminBadge', { event: 'all', display }), 'image');
assert.ok(nativeVisualPropertiesForPart('adminBadge', 'image').includes('color'));
assert.ok(nativeVisualPropertiesForPart('adminBadge', 'image').includes('width'));
assert.ok(!nativeVisualPropertiesForPart('adminBadge', 'image').includes('fontSize'));
const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeRoleIcons.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, server: { middlewareMode: true, watch: null }, logLevel: 'silent' });
try {
  const { EventRow } = await server.ssrLoadModule('/src/components/EventRow.tsx');
  const event = structuredClone(getNativeEventSample('text'));
  event.user = { ...event.user, isAnchor: true, isAdmin: true };
  const render = (preferences = {}, props = {}) => renderToStaticMarkup(React.createElement(EventRow, {
    ev: event, liveLayout: true, displayPreferences: { ...DEFAULT_EVENT_DISPLAY_PREFERENCES, ...preferences }, ...props,
  }));
  assert.equal((render().match(/identity-icon/g) ?? []).length, 2);
  assert.equal((render({ anchorIdentityDisplayMode: 'text' }).match(/identity-icon/g) ?? []).length, 1);
  assert.doesNotMatch(render({ showAnchorIdentity: false, showAdminIdentity: false }), /identity-icon/);
  assert.equal((render({ showAnchorIdentity: false, showAdminIdentity: false }, { reviewLayout: true, archiveLayout: true }).match(/identity-icon/g) ?? []).length, 2);
  const honor = getNativeEventSample('honor');
  const renderHonor = props => renderToStaticMarkup(React.createElement(EventRow, { ev: honor, liveLayout: true, ...props }));
  assert.match(renderHonor({}), /src="[^"]*\/guard-honor\/1000\.png"/);
  assert.match(renderHonor({ archiveLayout: true, reviewLayout: true }), /src="[^"]*\/guard-honor\/1000\.png"/);
  console.log('身份形式保存、独立切换、隐藏与回看隔离通过');
} finally { await server.close(); }
