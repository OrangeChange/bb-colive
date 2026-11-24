import test from 'node:test';
import assert from 'node:assert/strict';
import { NATIVE_PART_SELECTORS, NATIVE_ROLE_SELECTORS, NATIVE_PART_ALIASES, NATIVE_EVENT_SCOPE_SELECTORS } from '../src/themes/nativeSemanticSelectors.ts';
import * as capabilities from '../src/themes/nativeThemeCapabilities.ts';

test('公共区域、普通事件与置顶事件使用独立选择器', () => {
  assert.equal(NATIVE_PART_SELECTORS.whole, '.event-area');
  assert.equal(NATIVE_PART_SELECTORS.list, '.event-list');
  assert.equal(NATIVE_PART_SELECTORS.sticky, '.sticky-area');
  assert.equal(NATIVE_PART_SELECTORS.row, '.event-list .event');
  assert.equal(NATIVE_PART_SELECTORS.stickyEvent, '.sticky-area .event.event-sticky');
  assert.equal(NATIVE_PART_SELECTORS.content, '.event .content');
  for (const selector of [...Object.values(NATIVE_PART_SELECTORS), ...Object.values(NATIVE_ROLE_SELECTORS)]) assert.ok(!selector.includes('['), selector);
});

test('公开身份使用原始公开等级，身份状态与徽章节点分开', () => {
  assert.equal(NATIVE_ROLE_SELECTORS.captain, '.event.guard-level-3');
  assert.equal(NATIVE_ROLE_SELECTORS.admiral, '.event.guard-level-2');
  assert.equal(NATIVE_ROLE_SELECTORS.viceroy, '.event.guard-level-1');
  assert.equal(NATIVE_ROLE_SELECTORS.anchor, '.event.streamer');
  assert.equal(NATIVE_ROLE_SELECTORS.admin, '.event.mod');
  assert.equal(NATIVE_PART_SELECTORS.anchorBadge, '.event .streamer-badge');
  assert.equal(NATIVE_PART_SELECTORS.adminBadge, '.event .mod-badge');
  assert.equal(NATIVE_ROLE_SELECTORS.normal, '.event:not(.guard-level-1, .guard-level-2, .guard-level-3, .streamer, .mod)');
});

test('公共价格、专属价格和译文互不混用', () => {
  assert.equal(NATIVE_PART_SELECTORS.price, '.event .price');
  assert.equal(NATIVE_PART_SELECTORS.priceUnit, '.event .price .price-unit');
  assert.equal(NATIVE_PART_SELECTORS.priceValue, '.event .price .price-value');
  assert.equal(NATIVE_PART_SELECTORS.giftPrice, '.event .price.gift-price');
  assert.equal(NATIVE_PART_SELECTORS.giftProfit, '.event .blind-profit');
  assert.equal(NATIVE_PART_SELECTORS.translation, '.bili-translation');
  assert.equal(NATIVE_PART_SELECTORS.repeatCount, '.event .repeat-count');
  assert.equal(NATIVE_PART_SELECTORS.guardHighlight, '.event .honor-highlight:not(.honor-milestone)');
});

test('能力表覆盖全部部件，文字徽章与图片分别声明属性所有权', () => {
  const parts = capabilities.NATIVE_PART_CAPABILITIES;
  assert.ok(parts);
  assert.deepEqual(Object.keys(parts).sort(), Object.keys(NATIVE_PART_SELECTORS).sort());
  assert.equal(parts.guardBadge.shape, 'switchable');
  assert.ok(capabilities.nativeVisualPropertiesForPart('guardBadge', 'text').includes('fontSize'));
  assert.ok(!capabilities.nativeVisualPropertiesForPart('guardBadge', 'image').includes('color'));
  assert.ok(capabilities.nativeVisualPropertiesForPart('anchorBadge', 'text').includes('fontSize'));
  assert.ok(!capabilities.nativeVisualPropertiesForPart('anchorBadge', 'text').includes('width'));
  assert.ok(!capabilities.nativeVisualPropertiesForPart('avatarFrame').includes('background'));
  assert.ok(!capabilities.nativeVisualPropertiesForPart('content').includes('width'));
  assert.ok(!capabilities.nativeVisualPropertiesForPart('price').includes('gap'));
  assert.ok(capabilities.nativeVisualPropertiesForPart('user').includes('gap'));
  for (const part of capabilities.NATIVE_SEMANTIC_PARTS) {
    assert.equal(part.selector, NATIVE_PART_SELECTORS[part.id]);
    assert.equal(part.capability, parts[part.id]);
  }
  assert.ok(capabilities.nativeVisualPartUsesGlobalScope('sticky'));
});

test('短类名限定在实际内容组内，公共节点均有导航或保存键映射', () => {
  for (const [id, selector] of Object.entries({
    guardDurationPrefix: '.event .guard-duration .prefix',
    guardDurationNumber: '.event .guard-duration .number',
    guardDurationUnit: '.event .guard-duration .unit',
    guardDaysPrefix: '.event .guard-companion-days .prefix',
    guardDaysNumber: '.event .guard-companion-days .number',
    guardDaysUnit: '.event .guard-companion-days .unit',
    lotteryCommandPrefix: '.event .lottery-command .prefix',
    lotteryCommandText: '.event .lottery-command .text',
    lotteryGiftPrefix: '.event .lottery-required-gift .prefix',
    lotteryGiftName: '.event .lottery-required-gift .gift-name',
    redpocketCommandPrefix: '.event .redpocket-command .prefix',
    redpocketCommandText: '.event .redpocket-command .text',
  })) assert.equal(NATIVE_PART_SELECTORS[id], selector);
  const ids = new Set(capabilities.NATIVE_SEMANTIC_PARTS.map(part => part.id));
  for (const id of Object.keys(NATIVE_PART_SELECTORS)) assert.ok(ids.has(id) || id in NATIVE_PART_ALIASES, id);
  for (const [alias, canonical] of Object.entries(NATIVE_PART_ALIASES)) {
    assert.equal(ids.has(alias), false);
    assert.equal(NATIVE_PART_SELECTORS[alias], NATIVE_PART_SELECTORS[canonical]);
  }
  for (const scope of capabilities.NATIVE_EVENT_SCOPES.flatMap(scope => [scope, ...(scope.children ?? [])])) assert.equal(typeof NATIVE_EVENT_SCOPE_SELECTORS[scope.id], 'string');
});
