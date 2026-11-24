import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalUserThemeAsset, themeAssetReference, themeAssetFontAlias, themeAssetExample, findThemeAssetUsages } from '../src/themes/themeAssetPresentation.ts';
const image = { id: 'user', name: 'cover.png', path: 'assets/cover.png', mediaType: 'image/png' };
test('只展示本地用户素材，排除内置、共享、缓存与远程素材', () => {
  assert.equal(isLocalUserThemeAsset(image), true);
  for (const patch of [{ id: 'assets/catalog-cover' }, { id: 'catalog-cover' }, { sharedResourceId: 'shared' }, { cacheResourceId: 'cache' }, { path: 'https://example.com/a.png' }, { path: 'file:///a.png' }]) assert.equal(isLocalUserThemeAsset({ ...image, ...patch }), false);
});
test('引用只包含 URL，图片示例独立生成', () => {
  assert.equal(themeAssetReference(image), 'url("assets/cover.png")');
  assert.equal(themeAssetExample(image), 'background-image: url("assets/cover.png");');
});
test('字体别名来自文件名，支持编辑、空值回退和 CSS 字符串转义', () => {
  const font = { ...image, name: '我的字体.woff2', path: 'assets/font.woff2', mediaType: 'font/woff2' };
  assert.equal(themeAssetFontAlias(font), '我的字体');
  assert.match(themeAssetExample(font, '标题字体'), /font-family: "标题字体"/);
  assert.match(themeAssetExample(font, ' '), /font-family: "我的字体"/);
  assert.ok(themeAssetExample(font, 'A"B\\C\nD').includes('A\\"B\\\\C\\a D'));
});
test('移除影响包含每层实际 URL 引用位置，排除注释、字符串与远程同名 URL', () => {
  const usages = findThemeAssetUsages({ baseCss: '.base { background: url(assets/cover.png) }', visualCss: '.visual {\n background: url("./assets/cover.png")\n}', customCss: '/* url(assets/cover.png) */\n.a { content: "url(assets/cover.png)"; background: url(https://example.com/assets/cover.png) }\n.b { background:\n url(assets/cover.png); }' }, image);
  assert.deepEqual(usages, [{ layer: 'baseCss', line: 1, context: '.base' }, { layer: 'visualCss', line: 2, context: '.visual' }, { layer: 'customCss', line: 4, context: '.b' }]);
});
test('未完成的 CSS 仍显示引用行号', () => {
  assert.deepEqual(findThemeAssetUsages({ baseCss: '', visualCss: '', customCss: '.a {\nbackground: url(assets/cover.png);' }, image), [{ layer: 'customCss', line: 2, context: '未完成的 CSS' }]);
});
