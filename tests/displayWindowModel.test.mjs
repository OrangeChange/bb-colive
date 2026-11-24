import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import {
  DISPLAY_BUFFER_MAX,
  appendDisplayEvent,
  closeDisplaySession,
  createDisplaySession,
  isDisplayEvent,
  markDisplayReady,
  openDisplaySession,
  queueDisplayEvent,
  switchDisplayRoom,
} from "../src/windows/displayWindowModel.ts";

const event = (id, msgType) => ({ id, msgType, roomId: 1, ts: Number(id) });
const danmu = (id, text, extra = {}) => ({
  id,
  msgType: MsgType.Danmu,
  roomId: 1,
  ts: Number(id),
  user: { uid: id, uname: `用户${id}` },
  text,
  ...extra,
});

test("弹幕窗只接收弹幕和互动事件", () => {
  assert.equal(isDisplayEvent(event("1", MsgType.Danmu)), true);
  assert.equal(isDisplayEvent(event("2", MsgType.Interact)), true);
  assert.equal(isDisplayEvent(event("3", MsgType.Gift)), false);
  assert.equal(isDisplayEvent(event("4", MsgType.SuperChat)), false);
  assert.equal(isDisplayEvent(event("5", MsgType.GuardBuy)), false);
});

test("弹幕窗打开后 ready 前排队，ready 后按顺序取出", () => {
  const state = createDisplaySession();
  const first = event("1", MsgType.Danmu);
  const second = event("2", MsgType.Interact);

  assert.equal(queueDisplayEvent(state, first), false);
  openDisplaySession(state);
  assert.equal(queueDisplayEvent(state, first), true);
  assert.equal(queueDisplayEvent(state, second), true);
  assert.deepEqual(markDisplayReady(state), [first, second]);
  assert.deepEqual(state.pending, []);
  assert.equal(queueDisplayEvent(state, event("3", MsgType.Danmu)), false);
});

test("关闭弹幕窗会清空生命周期状态，重新打开不会恢复旧待发事件", () => {
  const state = createDisplaySession();
  openDisplaySession(state);
  queueDisplayEvent(state, event("1", MsgType.Danmu));
  closeDisplaySession(state);

  assert.deepEqual(state, { open: false, ready: false, pending: [], roomId: null, roomGeneration: 1 });
  openDisplaySession(state);
  assert.deepEqual(markDisplayReady(state), []);
});

test("切换到不同房间会清空待发事件，同房重连不触发房间切换", () => {
  const state = createDisplaySession();
  openDisplaySession(state, 100);
  queueDisplayEvent(state, event("1", MsgType.Danmu));

  assert.equal(switchDisplayRoom(state, 200), true);
  assert.equal(state.roomId, 200);
  assert.deepEqual(state.pending, []);
  assert.equal(switchDisplayRoom(state, 200), false);
});

test("切换房间后撤销 ready，新房间事件重新排队等待副窗口确认", () => {
  const state = createDisplaySession();
  openDisplaySession(state, 100);
  markDisplayReady(state);

  assert.equal(switchDisplayRoom(state, 200), true);
  assert.equal(state.ready, false);
  assert.equal(queueDisplayEvent(state, event("2", MsgType.Danmu)), true);
});

test("弹幕窗渲染缓存只保留最新的一段事件", () => {
  let events = [];
  for (let index = 0; index < DISPLAY_BUFFER_MAX + 2; index += 1) {
    events = appendDisplayEvent(events, event(String(index), MsgType.Danmu));
  }

  assert.equal(events.length, DISPLAY_BUFFER_MAX);
  assert.equal(events[0].id, "2");
  assert.equal(events.at(-1).id, String(DISPLAY_BUFFER_MAX + 1));
  assert.equal(appendDisplayEvent(events, event("gift", MsgType.Gift)), events);
});

test("副窗口在时间窗口内合并跨用户的相同文字弹幕并显示连击次数", () => {
  let events = [];
  events = appendDisplayEvent(events, danmu("1000", "同一句话", { user: { uid: "1", uname: "甲" } }), 300, {
    mergeSameDanmu: true,
    sameDanmuWindowSeconds: 8,
  });
  events = appendDisplayEvent(events, danmu("5000", "同一句话", { user: { uid: "2", uname: "乙" } }), 300, {
    mergeSameDanmu: true,
    sameDanmuWindowSeconds: 8,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].danmuRepeatCount, 2);
  assert.equal(events[0].user.uname, "甲");
  assert.equal(events[0].ts, 5000);
});

test("副窗口只对精确匹配的弹幕内容合并，表情来源不同不能合并", () => {
  let events = [];
  events = appendDisplayEvent(events, danmu("1000", "[笑]", {
    emotes: { "[笑]": { url: "https://example.com/a.png", width: 20, height: 20 } },
  }), 300, { mergeSameDanmu: true, sameDanmuWindowSeconds: 8 });
  events = appendDisplayEvent(events, danmu("2000", "[笑]", {
    emotes: { "[笑]": { url: "https://example.com/b.png", width: 20, height: 20 } },
  }), 300, { mergeSameDanmu: true, sameDanmuWindowSeconds: 8 });

  assert.equal(events.length, 2);
  assert.equal(events[0].danmuRepeatCount, undefined);
});

test("副窗口合并开关关闭或超出时间窗口时保留独立弹幕行", () => {
  let disabled = [];
  disabled = appendDisplayEvent(disabled, danmu("1000", "重复"), 300, {
    mergeSameDanmu: false,
    sameDanmuWindowSeconds: 8,
  });
  disabled = appendDisplayEvent(disabled, danmu("2000", "重复"), 300, {
    mergeSameDanmu: false,
    sameDanmuWindowSeconds: 8,
  });
  assert.equal(disabled.length, 2);

  let expired = [];
  expired = appendDisplayEvent(expired, danmu("1000", "重复"), 300, {
    mergeSameDanmu: true,
    sameDanmuWindowSeconds: 2,
  });
  expired = appendDisplayEvent(expired, danmu("4001", "重复"), 300, {
    mergeSameDanmu: true,
    sameDanmuWindowSeconds: 2,
  });
  assert.equal(expired.length, 2);
});

test('按配置容量投影一百条弹幕，不被默认五十条再次截断',async()=>{const{projectDisplayEvents}=await import('../src/windows/displayWindowModel.ts');const rows=Array.from({length:100},(_,i)=>danmu(String(1000+i),'内容'+i));assert.equal(projectDisplayEvents(rows,{mergeSameDanmu:false,sameDanmuWindowSeconds:8,showAutoDanmaku:true,capacity:100}).length,100);});
