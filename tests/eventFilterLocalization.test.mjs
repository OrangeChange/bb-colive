import test from 'node:test';
import assert from 'node:assert/strict';
import { setUiLanguage } from '../src/i18n/index.ts';
import { INTERACT_KIND_OPTIONS, GIFT_KIND_OPTIONS } from '../src/events/eventView.ts';

test('现场与设置共用的事件细项随界面语言即时切换', () => {
  const interactKeys = INTERACT_KIND_OPTIONS.map(option => option.key);
  const giftKeys = GIFT_KIND_OPTIONS.map(option => option.key);
  try {
    for (const [language, entry, free] of [
      ['en', 'Room entry', 'Free gifts'],
      ['zh-CN', '进房', '免费礼物'],
    ]) {
      setUiLanguage(language);
      assert.equal(INTERACT_KIND_OPTIONS[0].label, entry);
      assert.equal(GIFT_KIND_OPTIONS[0].label, free);
      assert.deepEqual(INTERACT_KIND_OPTIONS.map(option => option.key), interactKeys);
      assert.deepEqual(GIFT_KIND_OPTIONS.map(option => option.key), giftKeys);
    }
    for (const language of ['ja', 'zh-Hant']) {
      setUiLanguage(language);
      assert.notEqual(INTERACT_KIND_OPTIONS[0].label, '进房');
      assert.notEqual(GIFT_KIND_OPTIONS[0].label, '免费礼物');
      assert.ok([...INTERACT_KIND_OPTIONS, ...GIFT_KIND_OPTIONS].every(option => option.label && !option.label.startsWith('eventView.')));
    }
  } finally { setUiLanguage('zh-CN'); }
});
