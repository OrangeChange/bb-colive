import test from "node:test";
import assert from "node:assert/strict";
import { windowDiagnosticRuntime, mountFloatingWindow } from './helpers/windowDiagnosticRuntime.mjs';
import { DEFAULT_EVENT_WINDOW_PREFERENCES, EVENT_WINDOW_PREFERENCES_EVENT } from '../src/windows/eventWindowPreferences.ts';
import { MsgType } from '../src/protocol/types.ts';
import {
  isEventWindowEventForRoom,
  isEventWindowRoomStatePayload,
} from "../src/windows/eventWindowChannels.ts";

test("副窗口房间握手只接受带房间号和切换序号的状态", () => {
  assert.equal(isEventWindowRoomStatePayload({ roomId: 123, generation: 4 }), true);
  assert.equal(isEventWindowRoomStatePayload({ roomId: null, generation: 0 }), true);
  assert.equal(isEventWindowRoomStatePayload({ roomId: "123", generation: 4 }), false);
  assert.equal(isEventWindowRoomStatePayload({ roomId: 123 }), false);
  assert.equal(isEventWindowRoomStatePayload({ roomId: 123, generation: -1 }), false);
});

test("副窗口只接收当前房间的事件，旧房间事件被丢弃", () => {
  assert.equal(isEventWindowEventForRoom({ roomId: 123 }, 123), true);
  assert.equal(isEventWindowEventForRoom({ roomId: 122 }, 123), false);
  assert.equal(isEventWindowEventForRoom({ roomId: 123 }, null), false);
});

test("同房关闭重开后，旧代次在途事件不能进入新窗口", () => {
  assert.equal(isEventWindowEventForRoom({ roomId: 123, __roomGeneration: 4 }, 123, 5), false);
  assert.equal(isEventWindowEventForRoom({ roomId: 123, __roomGeneration: 5 }, 123, 5), true);
  assert.equal(isEventWindowEventForRoom({ roomId: 124, __roomGeneration: 5 }, 123, 5), false);
});

test('两窗同房档位晚到回刷已有行和后续事件，旧房档位不串房', async () => {
  for (const label of ['display', 'gift']) {
    const runtime = await windowDiagnosticRuntime(label); let cleanup;
    try {
      cleanup = await mountFloatingWindow(runtime);
      const name = label === 'display' ? 'display:danmu' : 'gift:events';
      const event = (id) => ({ id, roomId: 11, ts: 1000, msgType: label === 'display' ? MsgType.Danmu : MsgType.Gift, user: { uid: '1', uname: '用户', guardLevel: 1 }, text: id });
      await runtime.port.emitTo(label, `${label}:room-changed`, { roomId: 11, generation: 1 });
      await runtime.port.emitTo(label, name, event('first'));
      const first = runtime.port.states[0].value[0];
      const arrivalTimes = runtime.port.refs.find(ref => ref.current instanceof WeakMap && ref.current.has(first)).current;
      const firstArrival = arrivalTimes.get(first);
      const profile = { roomId: 11, milestone: 'tenThousand', iconSet: 'enhanced', source: 'room-info' };
      await runtime.port.emitTo(label, `${label}:room-changed`, { roomId: 11, generation: 1, roomGuardProfile: profile });
      assert.equal(runtime.port.states[0].value.length, 1);
      assert.equal(runtime.port.states[0].value[0].id, first.id);
      assert.equal(runtime.port.states[0].value[0].user.guardMilestone, 'tenThousand');
      assert.equal(arrivalTimes.get(runtime.port.states[0].value[0]), firstArrival);
      await runtime.port.emitTo(label, name, event('second'));
      assert.equal(runtime.port.states[0].value[1].user.guardMilestone, 'tenThousand');
      await runtime.port.emitTo(label, `${label}:room-changed`, { roomId: 22, generation: 2 });
      await runtime.port.emitTo(label, `${label}:room-changed`, { roomId: 11, generation: 1, roomGuardProfile: profile });
      assert.equal(runtime.port.states[0].value.length, 0);
    } finally { await cleanup?.(); await runtime.finish(); }
  }
});

test('实际两窗切房后拒绝旧房事件；旧房迟到诊断保留原关联', async () => {
  for (const label of ['display', 'gift']) {
    const runtime = await windowDiagnosticRuntime(label); let cleanup;
    try {
      cleanup = await mountFloatingWindow(runtime, false, true);
      await runtime.port.emitTo(label, EVENT_WINDOW_PREFERENCES_EVENT, DEFAULT_EVENT_WINDOW_PREFERENCES);
      await runtime.port.rerender();
      assert.equal(runtime.port.calls.some(call => call.command === 'set_floating_window_material'), true);
      const ready = () => runtime.port.messages.filter((message) => message.name === `${label}:ready`);
      const retry = [...runtime.port.intervals.values()][0];
      assert.equal(retry.delay, 500);
      const before = ready().length; retry.callback();
      assert.equal(ready().length, before + 1);
      const eventName = label === 'display' ? 'display:danmu' : 'gift:events';
      const event = (id, roomId) => ({ id, roomId, ts: 1000, msgType: label === 'display' ? MsgType.Danmu : MsgType.Gift, text: id, user: { uid: '1', uname: '用户', guardLevel: 0 }, gift: { id: 1, name: '礼物', count: 1, price: 100, total: 100, coinType: 'gold' } });
      await runtime.port.emitTo(label, `${label}:room-changed`, { roomId: 11, generation: 1 });
      await runtime.port.emitTo(label, eventName, event('old', 11));
      assert.equal(runtime.port.states[0].value.length, 1);
      await runtime.port.emitTo(label, `${label}:room-changed`, { roomId: 22, generation: 2 });
      await runtime.port.emitTo(label, `${label}:ready-ack`, { roomId: 22, generation: 2 });
      assert.equal(runtime.port.intervals.size, 0);
      await runtime.port.emitTo(label, eventName, event('late', 11));
      await runtime.port.emitTo(label, eventName, event('new', 22));
      assert.deepEqual(runtime.port.states[0].value.map((event) => event.id), ['new']);
      const { recordWindowDiagnostic } = await runtime.server.ssrLoadModule('/src/windows/windowDiagnostics.ts');
      recordWindowDiagnostic({ windowLabel: label, action: 'layout', outcome: 'old-render', roomId: 11, connectionId: 'connect-old', eventId: 'old' });
      await runtime.receiver.flush();
      const late = runtime.records().find((record) => record.outcome === 'old-render');
      assert.equal(late.roomId, 11); assert.equal(late.connectionId, 'connect-old'); assert.equal(late.eventId, 'old');
      assert.equal(late.sessionId, 'launch-window-test');
    } finally { await cleanup?.(); await runtime.finish(); }
  }
});
