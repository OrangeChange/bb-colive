import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeFallbackPreviewCandidates } from '../src/preview/sourcePreviewGeneration.ts';
import { DEFAULT_STYLE_PREVIEW_POLICY, projectSourcePreviewFact, selectStylePreviewEvents } from '../src/preview/stylePreviewPolicy.ts';
import { projectBlivechatEvent } from '../src/compat/blivechat/projection.ts';
import { projectOpenLiveEvent } from '../src/compat/openlive/projection.ts';
import { createBlivechatSimulation } from '../public/blivechatSimulation.mjs';
import { createOpenLiveSimulation } from '../public/openlive/simulation.mjs';
import { BlivechatRuntime } from '../src/compat/blivechat/runtime/core.mjs';
import { projectCallback, DEFAULT_CONFIG } from '../src/compat/openlive/runtime/core.mjs';
import { MsgType } from '../src/protocol/types.ts';
import {createBlivechatFixedPreviewRecords} from '../src/compat/blivechat/previewRecords.mjs';

const sources = [
  ['blivechat', createBlivechatSimulation, projectBlivechatEvent],
  ['blivechat-open', createOpenLiveSimulation, projectOpenLiveEvent],
];
const policy = { ...DEFAULT_STYLE_PREVIEW_POLICY, giftThreshold: 0 };
function renderRecord(source, record) {
  if (source === 'blivechat-open') return projectCallback(record, DEFAULT_CONFIG);
  const runtime = new BlivechatRuntime({ config: { minGiftPrice: 0 } });
  runtime.receive(record);
  return runtime.snapshot().messages[0];
}

for(const [source,,project] of sources)test(`${source}盲盒遵循兼容模式的普通礼物规则`,()=>{
 const event={id:'blind',roomId:1,ts:1,msgType:MsgType.Gift,gift:{id:1,name:'礼物',count:2,total:10000,totalRmb:10,coinType:'gold',blindGiftName:'盲盒',blindPriceRmb:5}};
 const record=project(event,{roomId:1,generation:0},1,1);
 if(source==='blivechat')assert.equal(record,null);
 else {assert.equal(record.method,'onAddGift');assert.equal(record.payload.giftName,'礼物');assert.equal(record.payload.num,2);assert.equal(record.payload.blindGiftName,undefined);}
});

test('开放版银瓜子在生成边界分开免费瓜子和付款，实际卡片金额为零', () => {
  const generator = createOpenLiveSimulation({ random: () => 0, now: () => 1000 });
  const gifts = createBlivechatFixedPreviewRecords('blivechat-open').filter(record=>record.method==='onAddGift').map(record=>structuredClone(record.payload??record.data));
  const originalGifts=structuredClone(gifts);
  for (const [name, freeCoin, count] of [['辣条', 100, 10], ['小心心', 0, 1]]) {
    const gift = gifts.find(item => item.giftName === name && item.coinType === 'silver');
    const record = generator.next({ types: { gift: true }, gifts: [gift] });
    assert.equal(record.payload.totalCoin, 0);
    assert.equal(record.payload.totalFreeCoin, freeCoin);
    assert.equal(record.payload.num, count);
    assert.equal(projectCallback(record, DEFAULT_CONFIG).price, 0);
    assert.equal(projectSourcePreviewFact(record, 'blivechat-open').gift.paymentRmb, 0);
  }
  const gold = gifts.find(item => item.giftName === '比心' && item.num === 2);
  const record = generator.next({ types: { gift: true }, gifts: [gold] });
  assert.equal(projectCallback(record, DEFAULT_CONFIG).price, 1);
  assert.equal(record.payload.num, 2);
  assert.deepEqual(gifts, originalGifts);
});

test('开放版大航海保留审核样例的用户名、购买等级和金额', () => {
  const generator = createOpenLiveSimulation({ random: () => 0, now: () => 1000 });
  for (const [level, amount, title] of [[1, 19998, '兔宝的神奇口袋'], [2, 1998, '3Shain'], [3, 198, '海式']]) {
    const record = generator.next({ types: { member: true }, guards: [level] });
    const message = projectCallback(record, DEFAULT_CONFIG);
    assert.equal(message.privilegeType, level);
    assert.equal(message.price, amount);
    assert.equal(message.title, title);
    assert.equal(record.payload.authorName, title);
  }
});

const text = (id, ts) => ({ id, roomId: 1, ts, msgType: MsgType.Danmu, text: id });
const dynamic = { target: 'windows', mode: 'simulation', displayAll: true, now: 1000 };
test('退休集合仅清理已离开当前输入的ID，扩容不会复活当前输入中的旧事件', () => {
  const input = [text('a', 100), text('b', 200), text('c', 300)];
  const settings = { ...policy, capacity: 1 };
  const first = selectStylePreviewEvents(input, settings, dynamic);
  assert.deepEqual([...first.retiredMainIds], ['a', 'b']);
  const retained = [input[1], input[2], text('d', 400)];
  const second = selectStylePreviewEvents(retained, { ...settings, capacity: 10 }, dynamic, first.retiredMainIds);
  assert.deepEqual(second.events.map(event => event.id), ['c', 'd']);
  assert.deepEqual([...second.retiredMainIds], ['b']);
  assert.deepEqual([...first.retiredMainIds], ['a', 'b']);
  const empty = selectStylePreviewEvents([], settings, dynamic, second.retiredMainIds);
  assert.equal(empty.retiredMainIds.size, 0);
});

test('被筛选的当前输入保留退休身份，取消筛选后不会复活', () => {
  const hidden = text('hidden', 100);
  const settings = { ...policy, capacity: 10, filters: { ...policy.filters, left: { ...policy.filters.left, danmu: false } } };
  const filtered = selectStylePreviewEvents([hidden], settings, { ...dynamic, displayAll: false }, new Set(['hidden', 'gone']));
  assert.deepEqual([...filtered.retiredMainIds], ['hidden']);
  const shown = selectStylePreviewEvents([hidden], policy, dynamic, filtered.retiredMainIds);
  assert.equal(shown.events.length, 0);
});

test('预览持续生成时退休集合有界，现场预览不施加容量裁剪', () => {
  let input = [], retired = new Set();
  for (let index = 1; index <= 30; index++) {
    input = [...input, text(String(index), index)].slice(-5);
    const selected = selectStylePreviewEvents(input, { ...policy, capacity: 2 }, dynamic, retired);
    retired = selected.retiredMainIds;
    assert.ok(retired.size <= input.length);
  }
  const live = selectStylePreviewEvents(input, { ...policy, capacity: 1 }, { ...dynamic, target: 'live' });
  assert.deepEqual(live.events.map(event => event.id), ['26', '27', '28', '29', '30']);
});
