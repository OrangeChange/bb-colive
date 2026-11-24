import test from 'node:test';
import assert from 'node:assert/strict';
import { projectOpenLiveCallback } from '../src/compat/openlive/projection.ts';
import { projectCallback, DEFAULT_CONFIG } from '../src/compat/openlive/runtime/core.mjs';
import { isCompatibleThemeEventVisible } from '../src/themes/compatibleEventVisibility.ts';
import { MsgType } from '../src/protocol/eventTypeCodes.ts';

const blind = (hit, cost, count = 1) => ({
  id: 'opened-gift', roomId: 1, ts: 1000, msgType: MsgType.Gift,
  user: { uid: '1', uname: '用户' },
  gift: { id: 12, name: '实际礼物', count, price: hit * 1000, priceRmb: hit,
    total: cost * count * 1000, totalRmb: cost * count, paymentRmb: cost * count,
    coinType: 'gold', blindGiftName: '幸运盲盒', blindPriceRmb: cost, blindHitPriceRmb: hit },
});

test('开放版将盲盒投影为实际礼物，金额事实与开盒成本分离', () => {
  for (const [hit, cost, count] of [[100, 5, 1], [1, 100, 1], [10, 5, 3]]) {
    const event = blind(hit, cost, count);
    const original = structuredClone(event);
    const record = projectOpenLiveCallback(event, 1);
    assert.ok(record, '实际礼物不能被整条过滤');
    assert.equal(record.method, 'onAddGift');
    assert.equal(record.payload.giftName, '实际礼物');
    assert.equal(record.payload.num, count);
    assert.equal(record.payload.price, hit * count);
    assert.deepEqual(record.payload.bbPaidAmount, { unit: hit, cumulative: hit * count });
    assert.equal(record.payload.blindGiftName, undefined);
    const displayed = projectCallback(record, DEFAULT_CONFIG);
    assert.equal(displayed.type, 1);
    assert.equal(displayed.price, hit * count);
    assert.equal(displayed.giftName, '实际礼物');
    assert.deepEqual(event, original, '不能修改采集事实');
  }
});

test('盲盒使用开放版普通礼物分类，其他兼容模式保持现状', () => {
  const event = blind(100, 5);
  assert.equal(isCompatibleThemeEventVisible('blivechat-open', {}, event), true);
  assert.equal(isCompatibleThemeEventVisible('blivechat-open', { children: { normal: false } }, event), false);
  assert.equal(isCompatibleThemeEventVisible('blivechat', {}, event), false);
});
