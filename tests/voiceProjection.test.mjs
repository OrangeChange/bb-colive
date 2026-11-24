import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { isVoiceEventEligible, getVoiceCategory } from "../src/voice/voiceProjection.ts";

const enabledEntrySettings = {
  eventEnabled: { danmu: false, interact: true, gift: false, blindBox: false, redPocket: false, anchorLottery: false, superChat: false, guard: false, system: false },
};

const ordinaryEntry = { msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 0 } };
const guardEntry = { msgType: MsgType.Interact, interactKind: "entry", user: { guardLevel: 1 } };

test("大航海进房共享只显示大航海进房规则", () => {
  assert.equal(isVoiceEventEligible(ordinaryEntry, enabledEntrySettings, true), false);
  assert.equal(isVoiceEventEligible(guardEntry, enabledEntrySettings, true), true);
});

test("语音分类覆盖可播报业务事件，统计和未知事件不进入", () => {
  assert.equal(getVoiceCategory({ msgType: MsgType.Danmu }), "danmu");
  assert.equal(getVoiceCategory({ msgType: MsgType.Gift }), "gift");
  assert.equal(getVoiceCategory({ msgType: MsgType.Gift, gift: { blindGiftName: "心动盲盒" } }), "blindBox");
  assert.equal(getVoiceCategory({ msgType: MsgType.SuperChat }), "superChat");
  assert.equal(getVoiceCategory({ msgType: MsgType.GuardBuy }), "guard");
  assert.equal(getVoiceCategory({ msgType: MsgType.GuardHonor }), "system");
  assert.equal(getVoiceCategory({ msgType: MsgType.RedPocketStart }), "redPocket");
  assert.equal(getVoiceCategory({ msgType: MsgType.AnchorLotStart }), "anchorLottery");
  assert.equal(getVoiceCategory({ msgType: MsgType.Unknown }), null);
  assert.equal(getVoiceCategory({ msgType: MsgType.OnlineRank }), null);
});

test("屏蔽大表情只排除独立大表情弹幕", () => {
  const settings = {
    eventEnabled: { danmu: true, interact: false, gift: false, blindBox: false, redPocket: false, anchorLottery: false, superChat: false, guard: false, system: false },
    blockBigEmoteDanmu: true,
  };
  assert.equal(isVoiceEventEligible({ msgType: MsgType.Danmu, emoticon: { url: "x", width: 162, height: 162 } }, settings, false), false);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.Danmu, text: "普通弹幕" }, settings, false), true);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.Danmu, text: "[笑]", emotes: { "[笑]": { url: "x", width: 20, height: 20 } } }, settings, false), true);
});

test("红包和天选使用独立播报开关", () => {
  const settings = {
    eventEnabled: { danmu: false, interact: false, gift: false, blindBox: false, redPocket: true, anchorLottery: false, superChat: false, guard: false, system: false },
    blockBigEmoteDanmu: false,
  };
  assert.equal(isVoiceEventEligible({ msgType: MsgType.RedPocketWinner }, settings, false), true);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.AnchorLotAward }, settings, false), false);
});

test("低价醒目留言和按天大航海可以独立屏蔽", () => {
  const base = {
    eventEnabled: { danmu: false, interact: false, gift: false, blindBox: false, redPocket: false, anchorLottery: false, superChat: true, guard: true, system: false },
    blockBigEmoteDanmu: false,
    blockLowPriceSuperChat: true,
    blockLowPriceGuard: true,
  };
  assert.equal(isVoiceEventEligible({ msgType: MsgType.SuperChat, sc: { price: 2 } }, base, false), false);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.SuperChat, sc: { price: 1.99 } }, base, false), true);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.SuperChat, sc: { price: 3 } }, base, false), true);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.GuardBuy, guard: { level: 1, count: 3, unit: "天" } }, base, false), false);
  assert.equal(isVoiceEventEligible({ msgType: MsgType.GuardBuy, guard: { level: 1, count: 1, unit: "月" } }, base, false), true);
});
