import test from 'node:test';
import assert from 'node:assert/strict';
import * as navigation from '../src/themes/compatibleVisualNavigation.ts';
import { LAPLACE_CAPABILITY } from '../src/compat/laplace/theme.ts';
import { OPENLIVE_CAPABILITY } from '../src/compat/openlive/theme.ts';
import { BLIVECHAT_CAPABILITY } from '../src/compat/blivechat/theme.ts';

for (const capability of [BLIVECHAT_CAPABILITY, OPENLIVE_CAPABILITY, LAPLACE_CAPABILITY]) {
  test(`${capability.mode}: 专属部件切换到弹幕后回到公共事件，保留身份`, () => {
    const part = capability.mode === 'laplace' ? 'guardType' : 'membershipSubtext';
    const result = navigation.resolveCompatibleNavigationSelection(
      { id: 'scope', part, placement: 'main', event: 'danmaku' },
      { event: 'guard', identity: 'captain', placement: 'main', part }, capability);
    assert.deepEqual(result, { event: 'danmaku', identity: 'captain', placement: 'main', part: 'event' });
  });
  test(`${capability.mode}: 公共用户名保留事件、身份和编辑目标`, () => {
    const current = { event: 'superchat', identity: 'captain', placement: 'main', part: 'username' };
    assert.deepEqual(navigation.resolveCompatibleNavigationSelection(
      { id: 'username', part: 'username', placement: 'main' }, current, capability), current);
  });
}

test('兼容默认公共事件不受能力表顺序影响', () => {
  for (const capability of [BLIVECHAT_CAPABILITY, OPENLIVE_CAPABILITY, LAPLACE_CAPABILITY]) {
    const selection = navigation.normalizeCompatibleNavigationSelection(capability, { event: 'all', identity: 'all', placement: 'main', part: 'event' });
    assert.equal(navigation.findCompatibleNavigation(capability, selection).item.id, 'main');
  }
});
test('同名正文优先当前 SC 入口，旧公共导航 ID 不覆盖事件路径', () => {
  const selection = { event: 'superchat', identity: 'captain', placement: 'main', part: 'message' };
  assert.equal(navigation.findCompatibleNavigation(OPENLIVE_CAPABILITY, selection, 'message').item.id, 'sc-message');
});
test('BLC 仅保留普通礼物范围并定位礼物入口', () => {
  const selection = { event: 'gift', identity: 'captain', placement: 'main', part: 'message' };
  assert.equal(navigation.normalizeCompatibleNavigationSelection(OPENLIVE_CAPABILITY, selection), selection);
  assert.equal(navigation.findCompatibleNavigation(OPENLIVE_CAPABILITY, selection).item.id, 'gift-message');
});
test('无导航旧部件不能成为独立编辑目标', () => {
  for (const [capability, part, event] of [[LAPLACE_CAPABILITY, 'badge', 'danmaku'], [LAPLACE_CAPABILITY, 'activity', 'redStart']]) {
    assert.equal(navigation.normalizeCompatibleNavigationSelection(capability, { part, event, identity: 'captain', placement: 'main' }).part, 'event');
  }
});

test('原生范围切换保留礼物子类，专属部件离开事件回公共行', async () => {
  const { normalizeNativeNavigationSelection, findNativeNavigation } = await import('../src/themes/nativeVisualNavigation.ts');
  assert.deepEqual(normalizeNativeNavigationSelection({ event: 'danmaku', identity: 'captain', part: 'guardName' }), { event: 'danmaku', identity: 'captain', part: 'row' });
  const gift = { event: 'blind', identity: 'captain', part: 'giftName' };
  assert.equal(normalizeNativeNavigationSelection(gift), gift);
  assert.equal(findNativeNavigation(gift).group.id, 'gift');
  const common = { event: 'guard', identity: 'admin', part: 'username' };
  assert.equal(normalizeNativeNavigationSelection(common), common);
});
test('原生重复价格入口只选择一个当前事件叶节点', async () => {
  const { findNativeNavigation } = await import('../src/themes/nativeVisualNavigation.ts');
  const active = findNativeNavigation({ event: 'superchat', identity: 'all', part: 'price' });
  assert.equal(active.group.id, 'superchat');
  assert.deepEqual(active.path, ['醒目留言', '价格', '价格整体']);
});

test('BLC 旧点选键归并到相同来源节点的现有入口', () => {
  for (const capability of [BLIVECHAT_CAPABILITY, OPENLIVE_CAPABILITY]) {
    for (const [part, event, expected] of [['paidCard', 'superchat', 'card'], ['membership', 'guard', 'card'], ['paidContent', 'superchat', 'contentArea']]) {
      const selection = navigation.normalizeCompatibleNavigationSelection(capability, { part, event, identity: 'captain', placement: 'main', eventId: 'picked-1' });
      assert.equal(selection.part, expected);
      assert.equal(selection.eventId, 'picked-1');
      assert.equal(selection.event, event);
      assert.equal(selection.identity, 'captain');
    }
  }
});

test('主题 key 切换保留合法范围，清除旧事件实例和导航 ID', () => {
  const current = { sessionKey: 'blivechat-open|one', selection: { event: 'superchat', identity: 'captain', placement: 'main', part: 'message', eventId: 'old-event' }, navigationId: 'message' };
  const next = navigation.reconcileCompatibleNavigationSession(OPENLIVE_CAPABILITY, current, 'blivechat-open|two');
  assert.deepEqual(next.selection, { event: 'superchat', identity: 'captain', placement: 'main', part: 'message' });
  assert.equal(next.navigationId, 'sc-message');
  assert.equal(navigation.reconcileCompatibleNavigationSession(OPENLIVE_CAPABILITY, next, 'blivechat-open|two'), next);
});
test('模式切换校正旧模式部件和身份，不带入旧导航路径', () => {
  const current = { sessionKey: 'laplace|one', selection: { event: 'guard', identity: 'streamer', placement: 'main', part: 'guardType', eventId: 'old-event' }, navigationId: 'guard-type' };
  const next = navigation.reconcileCompatibleNavigationSession(OPENLIVE_CAPABILITY, current, 'blivechat-open|two');
  assert.deepEqual(next.selection, { event: 'guard', identity: 'streamer', placement: 'main', part: 'event' });
  assert.equal(next.navigationId, 'main');
});

test('LAPLACE 普通礼物分组保留实际礼物名称和所选范围', () => {
  const current = { event: 'gift-regular', identity: 'captain', placement: 'main', part: 'giftName' };
  assert.equal(navigation.normalizeCompatibleNavigationSelection(LAPLACE_CAPABILITY, current), current);
  assert.equal(navigation.findCompatibleNavigation(LAPLACE_CAPABILITY, current).item.part, 'giftName');
});
test('LAPLACE 红包组能定位仅开始事件支持的现有名称入口', () => {
  const current = { event: 'redpocket', identity: 'captain', placement: 'main', part: 'redTitle' };
  assert.equal(navigation.normalizeCompatibleNavigationSelection(LAPLACE_CAPABILITY, current), current);
  assert.equal(navigation.findCompatibleNavigation(LAPLACE_CAPABILITY, current).item.part, 'redTitle');
});


test('原生点选的具体开播事件保留实际目标范围', async () => {
  const { normalizeNativeNavigationSelection } = await import('../src/themes/nativeVisualNavigation.ts');
  const current = { event: 'liveStart', identity: 'ordinary', part: 'message' };
  assert.equal(normalizeNativeNavigationSelection(current), current);
});

test('原生红包中奖点选保留中奖部件，离开红包与天选才回公共行', async () => {
  const { normalizeNativeNavigationSelection, findNativeNavigation } = await import('../src/themes/nativeVisualNavigation.ts');
  const current = { event: 'redpocket', identity: 'captain', part: 'winnerUser' };
  assert.equal(normalizeNativeNavigationSelection(current), current);
  assert.equal(findNativeNavigation(current).item.id, 'winnerUser');
  assert.equal(normalizeNativeNavigationSelection({ ...current, event: 'danmaku' }).part, 'row');
});
