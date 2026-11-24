import test from 'node:test';
import assert from 'node:assert/strict';
import { filterNativeFeedIndices } from '../src/themes/nativeFeedVisibility.ts';
import { createDefaultNativeEventVisibility } from '../src/themes/nativeComponentAppearance.ts';
import { MsgType } from '../src/protocol/types.ts';

test('关闭互动后不为隐藏事件创建虚拟行，保留上下文目标的原始下标', () => {
  const events = [{msgType:MsgType.Danmu}, ...Array.from({length:86}, () => ({msgType:MsgType.Interact, interactType:1})), {msgType:MsgType.Gift, gift:{coinType:'gold'}}];
  const indices = events.map((_,i) => i);
  assert.deepEqual(filterNativeFeedIndices(events, indices, createDefaultNativeEventVisibility()), [0,87]);
  assert.equal(filterNativeFeedIndices(events, indices, createDefaultNativeEventVisibility(), 'live'), indices);
  assert.equal(filterNativeFeedIndices(events, indices, undefined), indices);
});

test('主题子项开关覆盖系统和活动事件，启用互动后恢复原顺序', () => {
  const events = [{msgType:MsgType.Danmu},{msgType:MsgType.Interact,interactKind:'entry'},{msgType:MsgType.RoomBlock},{msgType:MsgType.AnchorLotAward}];
  const visibility = createDefaultNativeEventVisibility();
  visibility.categories.interaction = true;
  visibility.children.userMute = false;
  visibility.children.lottery = false;
  assert.deepEqual(filterNativeFeedIndices(events,[0,1,2,3],visibility),[0,1]);
  visibility.children.enter = false;
  assert.deepEqual(filterNativeFeedIndices(events,[0,1,2,3],visibility),[0]);
});
