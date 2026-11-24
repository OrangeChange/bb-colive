import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateBrandStorage } from '../src/brandMigration.ts';
test('品牌状态复制不覆盖新值，也不删除原值', () => {
  const values = new Map([['danmu-app.scene-settings.v1','scene'],['danmu-app:display-window-locked','true'],['bb-colive:display-window-locked','false'],['theme','dark']]);
  const storage = { get length() { return values.size; }, key: i => [...values.keys()][i] ?? null, getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v) };
  migrateBrandStorage(storage);
  assert.equal(storage.getItem('bb-colive.scene-settings.v1'),'scene');
  assert.equal(storage.getItem('bb-colive:display-window-locked'),'false');
  assert.equal(storage.getItem('danmu-app.scene-settings.v1'),'scene');
  assert.equal(storage.getItem('theme'),'dark');
});
