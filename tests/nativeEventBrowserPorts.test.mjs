import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeEventBrowserPorts } from './helpers/nativeEventBrowserPorts.ts';
import { createServer } from 'vite';
import { appendDisplayEvent } from '../src/windows/displayWindowModel.ts';
import { appendGiftWindowEvent } from '../src/windows/giftWindowModel.ts';
import { isEventWindowEventForRoom, acceptsEventWindowRoomState } from '../src/windows/eventWindowChannels.ts';
import { applyEventWindowPreferences, DEFAULT_EVENT_WINDOW_PREFERENCES } from '../src/windows/eventWindowPreferences.ts';
import { getNativeEventSample } from './fixtures/nativeEventSamples.ts';

test('窗口投递只到目标监听器，取消监听后不再收到事件', async () => {
  const ports = createNativeEventBrowserPorts('display');
  const received = [];
  const stop = await ports.listen('display:danmu', ({ payload }) => received.push(payload.id));
  await ports.emitTo('gift', 'display:danmu', { id: 'other' });
  await ports.emitTo('display', 'display:danmu', { id: 'current' });
  stop();
  await ports.emitTo('display', 'display:danmu', { id: 'stopped' });
  assert.deepEqual(received, ['current']);
});

test('几何存储按文件隔离，保存不写真实数据库', async () => {
  const ports = createNativeEventBrowserPorts('gift');
  const gift = await ports.load('gift-window.local.json');
  await gift.set('geometry', { x: 10, y: 20, width: 400, height: 500 });
  await gift.save();
  assert.deepEqual(await (await ports.load('gift-window.local.json')).get('geometry'), { x: 10, y: 20, width: 400, height: 500 });
  assert.equal(await (await ports.load('display-window.local.json')).get('geometry'), null);
});

test('诊断日志和关闭状态通过真实调用参数保留，未支持命令拒绝', async () => {
  const ports = createNativeEventBrowserPorts('display');
  assert.equal(await ports.invoke('append_log', { file: 'render', lines: 'actual DOM' }), null);
  await ports.invoke('set_window_diagnostic_close_state', { state: { instanceId: 'a', complete: true } });
  assert.deepEqual(await ports.invoke('read_window_diagnostic_close_states'), [{ instanceId: 'a', complete: true }]);
  assert.equal(ports.calls[0].args.lines, 'actual DOM');
  await assert.rejects(ports.invoke('unexpected'), /未支持/);
});

test('实际窗口消费规则隔离旧房事件并同步偏好快照', async () => {
  const ports = createNativeEventBrowserPorts('display');
  let room = { roomId: 6431492, generation: 1 };
  let rows = [];
  const preferences = { current: structuredClone(DEFAULT_EVENT_WINDOW_PREFERENCES) };
  await ports.listen('display:room-changed', ({ payload }) => {
    if (!acceptsEventWindowRoomState(room, payload)) return;
    room = payload; rows = [];
  });
  await ports.listen('event-window:preferences', ({ payload }) => applyEventWindowPreferences(preferences, payload));
  await ports.listen('display:danmu', ({ payload }) => {
    if (isEventWindowEventForRoom(payload, room.roomId)) rows = appendDisplayEvent(rows, payload);
  });
  await ports.emitTo('display', 'display:danmu', getNativeEventSample('text'));
  assert.equal(rows.length, 1);
  await ports.emitTo('display', 'display:room-changed', { roomId: 6431493, generation: 2 });
  await ports.emitTo('display', 'display:danmu', getNativeEventSample('text'));
  assert.equal(rows.length, 0);
  await ports.emitTo('display', 'event-window:preferences', { ...DEFAULT_EVENT_WINDOW_PREFERENCES, fontSize: 28, appearance: { ...DEFAULT_EVENT_WINDOW_PREFERENCES.appearance, material: 'solid', solidOpacity: 0 }, eventExpiry: { enabled: true, seconds: 1 } });
  assert.equal(preferences.current.fontSize, DEFAULT_EVENT_WINDOW_PREFERENCES.fontSize);
  assert.equal(preferences.current.appearance.solidOpacity, 0);
  assert.deepEqual(preferences.current.eventExpiry, { enabled: true, seconds: 1 });
  await ports.emitTo('display', 'display:danmu', { ...getNativeEventSample('text'), roomId: 6431493, id: 'room-b' });
  assert.deepEqual(rows.map(event => event.id), ['room-b']);
  assert.deepEqual(appendGiftWindowEvent([], getNativeEventSample('text')), []);
  assert.equal(appendGiftWindowEvent([], getNativeEventSample('normal-gift')).length, 1);
});

test('生产诊断 sender/receiver 经测试端口写入实际内容并完成接收屏障', async () => {
  const server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeEventBrowserPorts.test.mjs", configFile: 'tests/fixtures/nativeEvent.vite.config.mjs', server: {watch:null, middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true, include: [] } });
  const bridge = await server.ssrLoadModule('/src/diagnostics/windowDiagnosticBridge.ts');
  const ports = createNativeEventBrowserPorts('display');
  const receiver = bridge.createWindowDiagnosticReceiver({
    listen: (name, callback) => ports.listen(name, callback, 'main'), emitTo: ports.emitTo,
    getWindowLabels: async () => ['display'], recordApp: () => {},
    recordRender: input => ports.invoke('append_log', { file: 'render.log', lines: JSON.stringify(input) }),
    flushLogs: async () => ({ complete: true, pending: 0, droppedRecords: 0, writeFailures: 0 }),
  });
  const sender = bridge.createWindowDiagnosticSender({ ...ports, windowLabel: 'display', instanceId: 'fixture-instance', storeCloseState: state => ports.invoke('set_window_diagnostic_close_state', { state }) });
  try {
    await receiver.start(); await sender.start();
    sender.submitRender({ action: 'new', eventId: 'stable-room-b', text: '实际文本', imgs: ['/wealth-levels/1.png'], imgStates: ['loaded'] });
    assert.equal(await sender.drain(), true);
    const input = JSON.parse(ports.calls.find(call => call.command === 'append_log').args.lines);
    assert.equal(input.eventId, 'stable-room-b');
    assert.equal(input.text, '实际文本');
    assert.deepEqual(input.imgStates, ['loaded']);
    assert.equal(input.windowLabel, 'display');
    const states = await ports.invoke('read_window_diagnostic_close_states');
    assert.equal(states[0].complete, true);
    assert.equal(states[0].droppedRecords, 0);
  } finally { sender.stop(); receiver.stop(); await server.close(); }
});
