import test from "node:test";
import assert from "node:assert/strict";

test("个性播报事件映射覆盖允许的业务分类", async () => {
  const { MsgType } = await import("../src/protocol/types.ts");
  const { getPersonalBroadcastRuleKey } = await import("../src/voice/personalBroadcastProjection.ts");
  const base = { id: "1", roomId: 1, ts: 1 };

  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Interact, interactKind: "follow" }, false), "interact-follow");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 1 } }, false), "interact-guard-entry");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 0 } }, true), null);
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Gift, gift: { blindGiftName: "盲盒" } }, false), "blind-box");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.RedPocketStart }, false), "red-pocket-start");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.AnchorLotStart }, false), "anchor-lottery-start");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.GuardBuy, guard: { level: 3 } }, false), "guard-governor");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Warning }, false), "system-warning");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.RedPocketWinner }, false), null);
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Danmu }, false), null);
});

test("只显示大航海进房只过滤普通进房，三档上舰各自映射", async () => {
  const { MsgType } = await import("../src/protocol/types.ts");
  const { getPersonalBroadcastRuleKey } = await import("../src/voice/personalBroadcastProjection.ts");
  const base = { id: "boundary", roomId: 1, ts: 1 };

  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 0 } }, false), "interact-entry");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 0 } }, true), null);
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 1 } }, true), "interact-guard-entry");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.GuardBuy, guard: { level: 1 } }, false), "guard-captain");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.GuardBuy, guard: { level: 2 } }, false), "guard-admiral");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.GuardBuy, guard: { level: 3 } }, false), "guard-governor");
  assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType: MsgType.GuardBuy }, false), null);
});

test("非目标活动、弹幕、大航海荣誉和统计消息均不触发", async () => {
  const { MsgType } = await import("../src/protocol/types.ts");
  const { getPersonalBroadcastRuleKey } = await import("../src/voice/personalBroadcastProjection.ts");
  const base = { id: "ignored", roomId: 1, ts: 1 };

  for (const msgType of [MsgType.RedPocketWinner, MsgType.AnchorLotAward, MsgType.Danmu, MsgType.GuardHonor, MsgType.WatchedChange]) {
    assert.equal(getPersonalBroadcastRuleKey({ ...base, msgType }, false), null, MsgType[msgType]);
  }
});
