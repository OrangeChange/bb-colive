import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createCatalogThemes } from '../src/themes/builtinThemeCatalog.ts';
import { createBuiltinNativeThemes } from '../src/themes/nativeBuiltinThemes.ts';
import { createBuiltinCompatibleTheme } from '../src/themes/builtinThemeDefaults.ts';

test('分发目录包含四类全部内置主题及声明素材', () => {
  const expected = { native: 3, blc: 3, 'blc-open': 8, laplace: 18 };
  const ids = new Set();
  const defaults = [...createBuiltinNativeThemes(), ...['blivechat','blivechat-open','laplace'].map(createBuiltinCompatibleTheme)];
  const expectedIds = new Set([...defaults, ...createCatalogThemes()].map(item => item.themeId));
  expectedIds.add("blivechat-open-yt");
  for (const [mode, count] of Object.entries(expected)) {
    const root = path.resolve('src-tauri/style-distribution', mode);
    const themes = fs.readdirSync(root, { withFileTypes: true }).filter(item => item.isDirectory() && !item.name.startsWith('.'));
    assert.equal(themes.length, count, mode);
    for (const item of themes) {
      const directory = path.join(root, item.name);
      const document = JSON.parse(fs.readFileSync(path.join(directory, 'theme.json'), 'utf8'));
      const storedName = { 'native-card': '卡片', 'native-bubble': '轻量气泡' }[document.themeId] ?? document.metadata.name;
      assert.equal(item.name, storedName, `${document.themeId} 保留既有主题目录`);
      assert.equal(document.origin, 'builtin');
      const original = defaults.find(item => item.themeId === document.themeId);
      if (original) {
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(directory, 'settings.json'),'utf8')), original.settings);
        assert.ok(fs.readFileSync(path.join(directory,'base.css'),'utf8') === original.styles.baseCss, document.themeId+' 基础CSS与分发来源一致');
      }
      assert.ok(!ids.has(document.themeId), document.themeId);
      ids.add(document.themeId);
      for (const file of ['settings.json', 'base.css', 'visual.css', 'custom.css', ...document.assets.filter(asset=>!asset.sharedResourceId).map(asset => asset.path)]) {
        assert.ok(fs.statSync(path.join(directory, file)).isFile(), `${document.themeId}/${file}`);
      }
      for (const asset of document.assets.filter(asset=>asset.sharedResourceId)) {
        assert.ok(fs.statSync(path.resolve('src-tauri/style-distribution/shared-assets',asset.sharedResourceId,path.basename(asset.path))).isFile());
        assert.equal(fs.existsSync(path.join(directory,asset.path)),false);
      }
    }
  }
  assert.equal(ids.size, 32);
  assert.deepEqual(ids, expectedIds);
  const openRoot = path.resolve('src-tauri/style-distribution/blc-open');
  assert.equal(fs.readFileSync(path.join(openRoot, '原版YT风格/base.css'), 'utf8'), fs.readFileSync(path.join(openRoot, '经典/base.css'), 'utf8'));
});
