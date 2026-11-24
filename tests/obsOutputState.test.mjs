import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { DEFAULT_EVENT_WINDOW_PREFERENCES as defaults } from "../src/windows/eventWindowPreferences.ts";
let createObsOutputState;
try {
  ({ createObsOutputState } = await import("../src/obs/obsOutputState.ts"));
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
const event = (id, extra = {}) => ({
  id,
  roomId: 1,
  ts: 1000,
  msgType: MsgType.Danmu,
  text: id,
  user: { uid: 1, uname: "u" },
  ...extra,
});
test("无连击ID的原始礼物合并汇总后，到期不被后续汇总复活", () => {
  const state = createObsOutputState(1, { ...defaults, eventExpiry: { enabled: true, seconds: 1 } });
  const gift = { id: 1, name: "gift", count: 1, totalRmb: 10, priceRmb: 10, paymentRmb: 10, coinType: "gold" };
  state.accept(event("gift", { msgType: MsgType.Gift, gift }), 1000);
  state.accept(event("summary-2", { msgType: MsgType.Gift, comboId: "source", isComboUpdate: true, gift: { ...gift, count: 2 } }), 1200);
  assert.equal(state.snapshot(1201).events[0].gift.count, 2);
  assert.equal(state.snapshot(2200).events.length, 0);
  state.accept(event("summary-3", { msgType: MsgType.Gift, comboId: "source", isComboUpdate: true, gift: { ...gift, count: 3 } }), 2300);
  assert.equal(state.snapshot(2301).events.length, 0);
});
test("过滤变化立即移除已隐藏行，不因可见列表满额保留退出", () => {
  const settings = { ...defaults, capacity: 2, display: { ...defaults.display, showPhoneNotVerified: true } };
  const state = createObsOutputState(1, settings);
  state.accept(event("old", { user: { uid: 1, uname: "a", phoneVerified: true } }), 1000);
  state.accept(event("hidden", { user: { uid: 2, uname: "b", phoneVerified: false } }), 1001);
  state.accept(event("new", { user: { uid: 3, uname: "c", phoneVerified: true } }), 1002);
  assert.deepEqual(state.snapshot(1003).events.map(x => x.id), ["hidden", "new"]);
  state.configure({ ...settings, display: { ...settings.display, showPhoneNotVerified: false } }, 1004);
  const next = state.snapshot(1005);
  assert.deepEqual(next.events.map(x => x.id), ["new"]);
  assert.deepEqual(next.immediateRemovalKeys, ["hidden"]);
});
test("不同事件共享协议ID时具有独立稳定的渲染标识", () => {
  const state = createObsOutputState(1, defaults);
  state.accept(event("same", { dedupe: "a" }), 1000);
  state.accept(event("same", { dedupe: "b" }), 1001);
  state.accept(event("same", { dedupe: "b" }), 1002);
  const rows = state.snapshot(1003).events;
  assert.equal(rows.length, 2);
  assert.equal(new Set(rows.map(row => row.reactKey ?? row.id)).size, 2);
  assert.deepEqual(state.snapshot(1004).events.map(row => row.reactKey ?? row.id), rows.map(row => row.reactKey ?? row.id));
});
test("统计更新不进入消息列表或占用可见容量", () => {
  const state = createObsOutputState(1, { ...defaults, capacity: 1 });
  state.accept(event("message"), 1000);
  for (const msgType of [MsgType.WatchedChange, MsgType.OnlineRank, MsgType.LikeUpdate, MsgType.FansUpdate]) {
    state.accept(event(`stat-${msgType}`, { msgType }), 1001);
  }
  assert.deepEqual(state.snapshot(1002).events.map(row => row.id), ["message"]);
});
test("隐藏的PK消息不占用OBS容量，控制删除返回立即移除身份", () => {
  const state = createObsOutputState(1, { ...defaults, capacity: 1 });
  state.accept(event("message"), 1000);
  state.accept(event("pk", { msgType: MsgType.Unknown, text: "PK_BATTLE_START_NEW" }), 1001);
  assert.deepEqual(state.snapshot(1002).events.map(row => row.id), ["message"]);
  state.accept(event("sc", { msgType: MsgType.SuperChat, sc: { price: 30, message: "test" } }), 1003);
  state.accept(event("delete", { msgType: MsgType.ScDeleted, scDeleteIds: ["sc"] }), 1004);
  assert.deepEqual(state.snapshot(1005).immediateRemovalKeys, ["sc"]);
});
test("中途接入只收到连击汇总时沿用现场降级显示", () => {
  const state = createObsOutputState(1, defaults);
  state.accept(event("combo", { msgType: MsgType.Gift, comboId: "combo-source", isComboUpdate: true,
    gift: { id: 1, name: "gift", count: 3, totalRmb: 30, priceRmb: 10, paymentRmb: 30, coinType: "gold" } }), 1000);
  assert.equal(state.snapshot(1001).events.length, 1);
  assert.equal(state.snapshot(1001).events[0].comboFinalized, true);
});
test("OBS严格N与到期独立处理，不修改输入历史", () => {
  assert.equal(typeof createObsOutputState, "function");
  const s = createObsOutputState(1, {
    ...defaults,
    capacity: 2,
    eventExpiry: { enabled: true, seconds: 1 },
  });
  const original = [event("1"), event("2"), event("3")];
  original.forEach((e) => s.accept(e, 1000));
  assert.deepEqual(
    s.snapshot(1500).events.map((e) => e.id),
    ["2", "3"],
  );
  assert.equal(original.length, 3);
  assert.equal(s.snapshot(2000).events.length, 0);
});
test("删除的SC不能因重推而复活；置顶独立于主区N且不因主题变更续时", () => {
  assert.equal(typeof createObsOutputState, "function");
  const settings = {
    ...defaults,
    capacity: 1,
    stickyEvents: { ...defaults.stickyEvents, obsEnabled: true },
  };
  const s = createObsOutputState(1, settings);
  const sc = event("sc", {
    msgType: MsgType.SuperChat,
    sc: { price: 30, message: "x" },
  });
  s.accept(sc, 1000);
  s.accept(event("later"), 1001);
  assert.equal(s.snapshot(1100).sticky.length, 1);
  const end = s.snapshot(1100).sticky[0].expiresAt;
  s.configure(
    { ...settings, display: { ...settings.display, eventPadding: 12 } },
    1200,
  );
  assert.equal(s.snapshot(1200).sticky[0].expiresAt, end);
  s.accept(
    event("delete", { msgType: MsgType.ScDeleted, scDeleteIds: ["sc"] }),
    1300,
  );
  s.accept(sc, 1400);
  assert.equal(s.snapshot(1400).sticky.length, 0);
  assert.ok(s.snapshot(1400).events.every((e) => e.id !== "sc"));
});

test('主区金额门槛不改变独立置顶门槛，过滤后再合并弹幕',()=>{
 const s=createObsOutputState(1,{...defaults,giftThreshold:100,mergeSameDanmu:true});
 s.accept(event('g',{msgType:MsgType.Gift,gift:{id:1,name:'g',count:1,total:30000,totalRmb:30,priceRmb:30,paymentRmb:30,coinType:'gold'}}),1000);
 assert.equal(s.snapshot(1001).events.length,0);assert.equal(s.snapshot(1001).sticky.length,1);
 const a=event('hidden',{text:'same',user:{uid:1,uname:'a',phoneVerified:false}});const b=event('visible',{text:'same',user:{uid:2,uname:'b',phoneVerified:true}});
 s.accept(a,1100);s.accept(b,1200);assert.equal(s.snapshot(1201).events.at(-1).danmuRepeatCount??1,1);
 s.configure({...defaults,giftThreshold:0,mergeSameDanmu:true,display:{...defaults.display,showPhoneNotVerified:true}},1300);
 assert.equal(s.snapshot(1301).events.find(e=>e.msgType===MsgType.Danmu).danmuRepeatCount ?? 1,1);
});

test('容量缩小后扩大不恢复已淘汰事件', () => {
  const settings = { ...defaults, capacity: 100 };
  const state = createObsOutputState(1, settings);
  for (let i = 0; i < 100; i++) state.accept(event(String(i)), 1000 + i);
  state.configure({ ...settings, capacity: 20 }, 1200);
  state.configure(settings, 1300);
  assert.deepEqual(state.snapshot(1301).events.map(x => x.id), Array.from({length:20}, (_,i)=>String(i+80)));
});

test('小容量期间接收新事件后扩大，不恢复已淘汰事件', () => {
  const settings = { ...defaults, capacity: 1 };
  const state = createObsOutputState(1, settings);
  state.accept(event('old'), 1000);
  state.accept(event('new'), 1001);
  state.configure({ ...settings, capacity: 50 }, 1002);
  assert.deepEqual(state.snapshot(1003).events.map(row => row.id), ['new']);
});
