import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

test('开放版从固定 MIT 源码构建，不发布部署版模块加载器', () => {
  const provenance = JSON.parse(readFileSync(new URL('../public/openlive/provenance.json', import.meta.url), 'utf8'));
  assert.equal(provenance.repository, 'https://github.com/DoodleBears/blivechat');
  assert.equal(provenance.commit, '0da8c94d40a8791bb212985f6ac0ae55765c3a03');
  assert.equal(provenance.license, 'MIT');
  const html = readFileSync(new URL('../public/openlive/renderer.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /vendor\.js|loader\.js|components\.js/);
  assert.match(readFileSync(new URL('../public/openlive/LICENSE', import.meta.url), 'utf8'), /MIT License/);
  for (const file of ['vendor.js', 'loader.js', 'components.js']) {
    assert.equal(existsSync(new URL('../public/openlive/' + file, import.meta.url)), false, file);
  }
});
