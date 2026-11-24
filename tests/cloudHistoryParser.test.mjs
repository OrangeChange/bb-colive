import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { source, envelope, page } from './helpers/cloudHistory.mjs';
import { createHistoryContext, encodeHistoryContext, decodeHistoryContext } from '../src/cloudSync/cloudHistoryContext.ts';
import { SendGiftV2, InteractWordV2 } from '../src/protocol/proto.ts';
let server, parseHistoryPage;
test.before(async () => {
  server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-cloudHistoryParser.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL('../', import.meta.url)), configFile: false,
    logLevel: 'silent', server: { middlewareMode: true, watch: null } });
  ({ parseHistoryPage } = await server.ssrLoadModule('/src/cloudSync/cloudHistoryParser.ts'));
});
test.after(async () => { await server?.close(); });
const parse = items => parseHistoryPage(page(items), createHistoryContext(source));

test('零输出资料跨页恢复与整页结果一致', () => {
  const items = [envelope('1', { cmd: 'ENTRY_EFFECT', data: { uid: '123', wealthy_info: { level: 8 } } }),
    envelope('2', { cmd: 'DANMU_MSG', info: [[], '合成文本', ['123', '合成用户'], [], []] })];
  const original = structuredClone(items), context = createHistoryContext(source);
  const whole = parseHistoryPage(page(items), context);
  const first = parse(items.slice(0, 1));
  const restored = decodeHistoryContext(encodeHistoryContext(first.nextContext), source);
  const second = parseHistoryPage(page(items.slice(1), '1'), restored);
  assert.deepEqual([...first.records, ...second.records], whole.records);
  assert.equal(encodeHistoryContext(second.nextContext), encodeHistoryContext(whole.nextContext));
  assert.equal(first.records[0].parseStatus, 'no-output');
  assert.equal(second.records[0].outputs[0].event.user.wealthLevel, 8);
  assert.deepEqual(items, original);
  assert.equal(context.lastSequence, '0');
  assert.equal(context.adapter.wealthByUid.size, 0);
});

test('固定接收时间和备用 ID，V2 多输出不合并连击，保留平台身份', () => {
  const pb = SendGiftV2.encode({ uid: 123, uname: '合成用户', gift: [
    { giftId: 1, name: '合成礼物', num: 1, itemId: '101' },
    { giftId: 1, name: '合成礼物', num: 1, itemId: '102' }] }).finish();
  const interact = InteractWordV2.encode({ uid: 123, msgType: 1, tsSec: 1700000000, tsNano: '1700000000000000000' }).finish();
  const items = [envelope('1', { cmd: 'WATCHED_CHANGE', data: { num: 1 } }),
    envelope('2', { cmd: 'SEND_GIFT_V2', data: { pb: Buffer.from(pb).toString('base64') } }),
    envelope('3', { cmd: 'INTERACT_WORD_V2', data: { pb: Buffer.from(interact).toString('base64') } }),
    envelope('4', { cmd: 'SUPER_CHAT_MESSAGE', data: { id: '9007199254740995', start_time: 1700000000, price: 30 } }),
    envelope('5', { cmd: 'SUPER_CHAT_MESSAGE_DELETE', data: { ids: ['9007199254740995'] } }),
    envelope('6', { cmd: 'SEND_GIFT', data: { uid: '123', giftId: 1, num: 1, combo_send: { combo_id: 'combo-a' } } })];
  const result = parse(items);
  assert.deepEqual(result, parse(items));
  assert.equal(result.records[0].outputs[0].event.ts, Date.parse(items[0].received_at));
  assert.equal(result.records[1].outputs.length, 2);
  assert.deepEqual(result.records[1].outputs.map(o => o.outputIndex), [0, 1]);
  assert.deepEqual(result.records[1].outputs.map(o => o.event.id), ['gift-v2:101', 'gift-v2:102']);
  assert.equal(result.records[5].outputs[0].event.comboId, 'combo-a');
  assert.equal(result.records[2].outputs[0].event.dedupe, 'interact-v2:123:1:1700000000000000000');
  assert.equal(result.records[3].outputs[0].event.id, '9007199254740995');
  assert.ok(JSON.stringify(result.records[4].outputs).includes('9007199254740995'));
  assert.equal(result.records[1].outputs[1].outputKey, JSON.stringify(['cloud-output', source.serverId, source.roomId, '2', 1]));
});

test('未知、有意忽略和失败独立分类，失败后继续下一条', () => {
  const items = [envelope('1', null), envelope('2', { cmd: 'SYNTHETIC_UNKNOWN' }),
    envelope('3', { cmd: 'ONLINE_RANK_V2' }), envelope('4', { cmd: 'SEND_GIFT_V2', data: {} }),
    envelope('5', { cmd: 'INTERACT_WORD_V2', data: { pb: '/w==' } }),
    envelope('6', null, { raw_payload: { kind: 'binary', encoding: 'base64', value: 'AA==', outer: {} } }),
    envelope('7', { cmd: 'WATCHED_CHANGE', data: { num: 2 } })];
  const records = parse(items).records;
  assert.deepEqual(records.map(r => r.parseStatus), ['unknown', 'unknown', 'no-output', 'failed', 'failed', 'failed', 'parsed']);
  assert.equal(records[1].outputs.length, 1);
  assert.deepEqual(records.slice(3, 6).map(r => r.failureReason), ['missing-protobuf', 'decode-failed', 'unsupported-binary']);
  assert.equal(records[6].outputs.length, 1);
  assert.equal(JSON.stringify(records).includes('raw_payload'), false);
});

test('连接和账号切换不沿用财富资料，进度使用扫描终点', () => {
  for (const changed of [{ connection_id: 'new' }, { login_account_uid: '10' }]) {
    const result = parseHistoryPage(page([
      envelope('1', { cmd: 'ENTRY_EFFECT', data: { uid: '123', wealthy_info: { level: 8 } } }),
      envelope('3', { cmd: 'DANMU_MSG', info: [[], '合成文本', ['123', '合成用户'], [], []] }, changed)], '0', '10'), createHistoryContext(source));
    assert.equal(result.records[1].outputs[0].event.user.wealthLevel, undefined);
    assert.equal(result.nextContext.lastSequence, '10');
    assert.equal(parseHistoryPage(page([], '10', '15'), result.nextContext).nextContext.lastSequence, '15');
  }
});

test('页面结构错误在适配前拒绝且不修改输入', () => {
  const good = page([envelope('1', { cmd: 'WATCHED_CHANGE', data: { num: 1 } })]);
  for (const mutate of [v => v.items[0].server_id = 'other', v => v.items.push(v.items[0]),
    v => v.items[0].server_sequence = '2', v => v.boundary.rangesComplete = false,
    v => v.items[0].received_at = 'invalid', v => v.boundary.expectedCursor = '1']) {
    const input = structuredClone(good); mutate(input);
    const before = structuredClone(input), context = createHistoryContext(source), saved = encodeHistoryContext(context);
    assert.throws(() => parseHistoryPage(input, context));
    assert.deepEqual(input, before);
    assert.equal(encodeHistoryContext(context), saved);
  }
});

test('所有分页切点恢复一致，质量依据和输出不共享输入容器', () => {
  const items = [envelope('1', { cmd: 'ENTRY_EFFECT', data: { uid: '123', wealthy_info: { level: 8 } } }),
    envelope('2', { cmd: 'SYNTHETIC_UNKNOWN' }, { quality_flags: [{ kind: 'synthetic' }] }),
    envelope('4', { cmd: 'DANMU_MSG', info: [[], '合成文本', ['123', '合成用户'], [], []] }),
    envelope('7', { cmd: 'ROOM_ADMINS', uids: [123] })];
  const whole = parse(items);
  for (let cut = 1; cut < items.length; cut++) {
    const first = parse(items.slice(0, cut)), after = items[cut - 1].server_sequence;
    const second = parseHistoryPage(page(items.slice(cut), after), decodeHistoryContext(encodeHistoryContext(first.nextContext), source));
    assert.deepEqual([...first.records, ...second.records], whole.records);
    assert.equal(encodeHistoryContext(second.nextContext), encodeHistoryContext(whole.nextContext));
  }
  whole.records[1].evidence.qualityFlags[0].kind = 'changed';
  whole.records[3].outputs[0].event.raw.uids.push(456);
  assert.equal(items[1].quality_flags[0].kind, 'synthetic');
  assert.deepEqual(items[3].raw_payload.value.uids, [123]);
});

test('转换失败丢弃候选连接资料，下一条可继续使用已成功资料', () => {
  const metadata = [];
  metadata[15] = { extra: 'null' };
  const result = parse([
    envelope('1', { cmd: 'ENTRY_EFFECT', data: { uid: '123', wealthy_info: { level: 8 } } }),
    envelope('2', { cmd: 'DANMU_MSG', info: [metadata, '合成文本', ['123', '合成用户'], [], []] }, { connection_id: 'failed-new' }),
    envelope('3', { cmd: 'DANMU_MSG', info: [[], '合成文本', ['123', '合成用户'], [], []] })]);
  assert.equal(result.records[1].failureReason, 'adapter-failed');
  assert.equal(result.records[2].outputs[0].event.user.wealthLevel, 8);
});

test('一万用户上下文解析一百条记录，不保存原始命令', t => {
  const context = createHistoryContext(source);
  context.connectionId = 'connection-test'; context.loginAccountUid = '9';
  for (let i = 1; i <= 10000; i++) {
    context.adapter.avatarsByUid.set(String(i), `https://example.test/${i}.png`);
    context.adapter.wealthByUid.set(String(i), { wealthLevel: i % 10 + 1 });
  }
  const items = Array.from({ length: 100 }, (_, i) => envelope(String(i + 1),
    { cmd: 'WATCHED_CHANGE', data: { num: i }, syntheticRawMarker: 'not-persisted' }));
  const start = performance.now();
  const result = parseHistoryPage(page(items), context);
  const elapsed = performance.now() - start, encoded = encodeHistoryContext(result.nextContext);
  assert.equal(result.records.length, 100);
  assert.equal(result.nextContext.adapter.avatarsByUid.size, 10000);
  assert.equal(encoded.includes('syntheticRawMarker'), false);
  assert.equal(JSON.stringify(result.records).includes('syntheticRawMarker'), false);
  t.diagnostic(`10000 users / 100 records: ${elapsed.toFixed(1)} ms; context ${Buffer.byteLength(encoded)} bytes`);
});
