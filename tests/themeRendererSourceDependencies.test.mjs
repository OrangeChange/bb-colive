import test from 'node:test';
import assert from 'node:assert/strict';
import { createBuiltinCompatibleTheme } from '../src/themes/builtinThemeDefaults.ts';
import { composeOpenLiveThemeCss } from '../src/compat/openlive/css.ts';
import { localizeThemeResources } from '../src/themes/themeResourceDependencies.ts';

test('开放版渲染器原始基础层原样保留，自定义层依赖仍本地化', async () => {
  const document = createBuiltinCompatibleTheme('blivechat-open');
  document.origin = 'custom';
  document.styles.customCss = '.event{background:url(https://test/probe.svg)}';
  const requests = [];
  const result = await localizeThemeResources(document, 'file:///theme.css', { load: async url => {
    requests.push(url);
    assert.equal(url, 'https://test/probe.svg');
    return { asset: { id:'probe', cacheResourceId:'probe', name:'probe.svg', path:'', mediaType:'image/svg+xml' } };
  } });
  assert.equal(result.document.styles.baseCss, document.styles.baseCss);
  assert.deepEqual(requests, ['https://test/probe.svg']);
  assert.match(result.document.styles.customCss, /assets\/probe.svg/);
});

test('开放版用户基础层依然按文件来源解析相对字体', async () => {
  const document = createBuiltinCompatibleTheme('blivechat-open');
  document.origin = 'custom';
  document.styles.baseCss = '@font-face{font-family:UserFont;src:url(../font.woff2)}';
  const requests = [];
  const result = await localizeThemeResources(document, 'https://test/styles/theme.css', { load: async url => {
    requests.push(url);
    return { asset: {id:'font', cacheResourceId:'font', name:'font.woff2', path:'', mediaType:'font/woff2'} };
  } });
  assert.deepEqual(requests, ['https://test/font.woff2']);
  assert.match(result.document.styles.baseCss, /assets\/font.woff2/);
});

test('开放版导出的分层基础 CSS 保留引擎原文，只收集用户依赖', async () => {
  const document = createBuiltinCompatibleTheme('blivechat-open');
  document.origin = 'custom';
  document.styles.baseCss = composeOpenLiveThemeCss({...document,styles:{...document.styles,customCss:'.event{background:url(https://test/exported.svg)}'}});
  const requests = [];
  const result = await localizeThemeResources(document, 'file:///theme.css', {load: async url => {
    requests.push(url);
    assert.equal(url, 'https://test/exported.svg');
    return {asset:{id:'exported',cacheResourceId:'exported',name:'exported.svg',path:'',mediaType:'image/svg+xml'}};
  }});
  assert.ok(!result.document.styles.baseCss.includes('url(../fonts/element-icons.woff)'));
  assert.deepEqual(requests,['https://test/exported.svg']);
  assert.match(result.document.styles.baseCss,/assets\/exported.svg/);
});
