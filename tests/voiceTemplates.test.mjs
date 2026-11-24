import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import { DEFAULT_INTERACT_VOICE_TEXTS, DEFAULT_INTERACT_VOICE_TEMPLATES, DEFAULT_VOICE_TEMPLATES, VOICE_INTERACT_TEMPLATE_KINDS } from "../src/voice/voiceTypes.ts";
import { DEFAULT_VOICE_SETTINGS } from "../src/voice/voiceSettings.ts";
import { renderVoiceEventTemplate, renderVoiceTemplate } from "../src/voice/voiceTemplates.ts";

test("语音模板只把动态字段替换为值，普通文字保持自由输入", () => {
  const result = renderVoiceTemplate([
    { kind: "field", field: "username" },
    { kind: "text", value: "老板，欢迎光临呀！" },
  ], { user: { uname: "小明" } });

  assert.equal(result.text, "小明老板，欢迎光临呀！");
  assert.deepEqual(result.omittedFields, []);
});

test("模板不把图片地址和空字段读出来", () => {
  const result = renderVoiceTemplate([
    { kind: "field", field: "username" },
    { kind: "text", value: "送出" },
    { kind: "field", field: "giftName" },
    { kind: "field", field: "quantity" },
  ], {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 2, icon: "https://example.test/gift.png" },
  });

  assert.equal(result.text, "小明送出小心心两个");
  assert.equal(result.text.includes("https://"), false);
});

test("用户名字段优先使用 UID 昵称，关闭朗读姓名时省略该字段", () => {
  const event = { msgType: MsgType.Danmu, user: { uid: "100", uname: "原用户名" }, text: "你好" };
  assert.equal(renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.danmu, event, [], { "100": "自定义昵称" }, true).text, "自定义昵称说：你好");
  assert.equal(renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.danmu, event, [], { "100": "自定义昵称" }, false).text, "说：你好");
});

test("礼物数量为一时不播报数量，多个时使用个数表达", () => {
  const one = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.gift, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 1 },
  });
  const many = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.gift, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 2 },
  });

  assert.equal(one.text, "感谢小明赠送小心心");
  assert.equal(many.text, "感谢小明赠送两个小心心");
});

test("礼物名称末尾的展示乘号不进入语音文案", () => {
  const one = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.gift, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "粉丝团灯牌×", count: 1 },
  });
  const many = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.gift, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心×", count: 3 },
  });

  assert.equal(one.text, "感谢小明赠送粉丝团灯牌");
  assert.equal(many.text, "感谢小明赠送三个小心心");
});

test("旧版礼物模板中礼物名与数量之间的静态乘号不进入语音文案", () => {
  const legacyTemplate = [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
    { kind: "text", value: "赠送" },
    { kind: "field", field: "giftName" },
    { kind: "text", value: "×" },
    { kind: "field", field: "quantity" },
  ];
  const one = renderVoiceTemplate(legacyTemplate, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "粉丝团灯牌", count: 1 },
  });
  const many = renderVoiceTemplate(legacyTemplate, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 3 },
  });

  assert.equal(one.text, "感谢小明赠送粉丝团灯牌");
  assert.equal(many.text, "感谢小明赠送三个小心心");
});

test("旧版大航海模板将月数放在类型前并省略重复单位", () => {
  const legacyTemplate = [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
    { kind: "text", value: "开通" },
    { kind: "field", field: "guardName" },
    { kind: "text", value: "，" },
    { kind: "field", field: "months" },
    { kind: "text", value: "个月" },
  ];
  const one = renderVoiceTemplate(legacyTemplate, {
    msgType: MsgType.GuardBuy,
    user: { uname: "小明" },
    guard: { level: 1, count: 1 },
  });
  const many = renderVoiceTemplate(legacyTemplate, {
    msgType: MsgType.GuardBuy,
    user: { uname: "小明" },
    guard: { level: 1, count: 3 },
  });

  assert.equal(one.text, "感谢小明开通舰长");
  assert.equal(many.text, "感谢小明开通三个月舰长");
});

test("大航海一个月时省略月数，多个月时放在类型前", () => {
  const one = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.guard, {
    msgType: MsgType.GuardBuy,
    user: { uname: "小明" },
    guard: { level: 1, count: 1 },
  });
  const many = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.guard, {
    msgType: MsgType.GuardBuy,
    user: { uname: "小明" },
    guard: { level: 1, count: 3 },
  });

  assert.equal(one.text, "感谢小明开通舰长");
  assert.equal(many.text, "感谢小明开通三个月舰长");
});

test("默认模板覆盖九类事件且盲盒数量位于盲盒名称之前", () => {
  for (const category of ["danmu", "interact", "gift", "blindBox", "redPocket", "anchorLottery", "superChat", "guard", "system"]) {
    assert.ok(DEFAULT_VOICE_TEMPLATES[category], category);
  }

  const result = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.blindBox, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", blindGiftName: "心动盲盒", count: 3 },
  });
  assert.equal(result.text, "小明赠送的三个心动盲盒，开出小心心");
  assert.equal(result.text.includes("×"), false);
});

test("红包和天选默认模板按事件生成可播报说明", () => {
  const redPocket = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.redPocket, {
    msgType: MsgType.RedPocketStart,
    user: { uname: "小明" },
    lottery: { awardName: "瓜子红包", awardNum: 2, totalPrice: 2000 },
  });
  const anchorLottery = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.anchorLottery, {
    msgType: MsgType.AnchorLotStart,
    lottery: { awardName: "限定礼物", awardNum: 1 },
  });

  assert.equal(redPocket.text, "小明发送了2元的红包");
  assert.equal(anchorLottery.text, "主播开启了天选，奖品是限定礼物");
});

test("最终默认模板的红包、天选与互动结构符合约定", () => {
  assert.deepEqual(DEFAULT_VOICE_TEMPLATES.redPocket, [
    { kind: "field", field: "username" },
    { kind: "text", value: "发送了" },
    { kind: "field", field: "amount" },
    { kind: "text", value: "的红包" },
  ]);
  assert.deepEqual(DEFAULT_VOICE_TEMPLATES.anchorLottery, [
    { kind: "text", value: "主播开启了" },
    { kind: "text", value: "天选" },
    { kind: "text", value: "，" },
    { kind: "text", value: "奖品是" },
    { kind: "field", field: "giftName" },
  ]);
  for (const template of Object.values(DEFAULT_INTERACT_VOICE_TEMPLATES)) {
    assert.deepEqual(template.slice(0, 1), [{ kind: "field", field: "username" }]);
    assert.equal(template[1].kind, "text");
    assert.equal(template.some((segment) => segment.kind === "field" && segment.field === "content"), false);
  }
});

test("醒目留言默认模板包含金额并保持约定顺序", () => {
  const result = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.superChat, {
    msgType: MsgType.SuperChat,
    user: { uname: "小明" },
    text: "支持主播",
    sc: { price: 30, message: "支持主播", duration: 30 },
  });

  assert.deepEqual(DEFAULT_VOICE_TEMPLATES.superChat, [
    { kind: "field", field: "username" },
    { kind: "text", value: "发送" },
    { kind: "field", field: "amount" },
    { kind: "text", value: "醒目留言：" },
    { kind: "field", field: "content" },
  ]);
  assert.equal(result.text, "小明发送30元醒目留言：支持主播");
});

test("九类默认模板按业务文案生成数量、金额和陪伴天数", () => {
  const gift = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.gift, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 3, totalRmb: 1.5 },
  });
  const blindBox = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.blindBox, {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", blindGiftName: "心动盲盒", count: 3, blindPriceRmb: 9, blindHitPriceRmb: 2 },
  });
  const redPocket = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.redPocket, {
    msgType: MsgType.RedPocketStart,
    user: { uname: "小明" },
    lottery: { awardName: "", awardNum: 0, totalPrice: 3000 },
  });
  const anchorLottery = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.anchorLottery, {
    msgType: MsgType.AnchorLotStart,
    lottery: { awardName: "限定礼物", awardNum: 1 },
  });
  const guard = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.guard, {
    msgType: MsgType.GuardBuy,
    user: { uname: "小明" },
    text: "今天是TA陪伴主播的第365天",
    guard: { level: 1, count: 3 },
  });

  assert.equal(gift.text, "感谢小明赠送三个小心心，价值1.5元");
  assert.equal(blindBox.text, "小明赠送的三个心动盲盒，开出小心心，价值6元");
  assert.equal(redPocket.text, "小明发送了3元的红包");
  assert.equal(anchorLottery.text, "主播开启了天选，奖品是限定礼物");
  assert.equal(guard.text, "感谢小明开通三个月舰长，已陪伴主播三百六十五天");
});

test("红包和天选开奖结果使用默认结果模板", () => {
  assert.equal(renderVoiceEventTemplate({
    msgType: MsgType.RedPocketWinner,
  }, DEFAULT_VOICE_SETTINGS).text, "红包开奖了");
  assert.equal(renderVoiceEventTemplate({
    msgType: MsgType.AnchorLotAward,
  }, DEFAULT_VOICE_SETTINGS).text, "天选开奖了");
});

test("礼物相关自定义模板中的乘号也不会进入语音内容", () => {
  const result = renderVoiceTemplate([
    { kind: "field", field: "username" },
    { kind: "text", value: "赠送" },
    { kind: "field", field: "giftName" },
    { kind: "text", value: "×" },
    { kind: "field", field: "quantity" },
  ], {
    msgType: MsgType.Gift,
    user: { uname: "小明" },
    gift: { name: "小心心", count: 2 },
  });

  assert.equal(result.text.includes("×"), false);
});

test("互动六个子分类都使用用户名和原始互动文案", () => {
  for (const kind of VOICE_INTERACT_TEMPLATE_KINDS) {
    const result = renderVoiceTemplate(DEFAULT_INTERACT_VOICE_TEMPLATES[kind], {
      msgType: MsgType.Interact,
      interactKind: kind,
      user: { uname: "小明" },
      text: "不应覆盖模板中的互动原文",
    });
    assert.equal(result.text, `小明${DEFAULT_INTERACT_VOICE_TEXTS[kind]}`);
  }
});

test("红包和天选结果使用可自定义的结果模板", () => {
  const settings = {
    ...DEFAULT_VOICE_SETTINGS,
    redPocketResultTemplate: [{ kind: "text", value: "红包结果自定义" }],
    anchorLotteryResultTemplate: [{ kind: "text", value: "天选结果自定义" }],
  };
  assert.equal(renderVoiceEventTemplate({ msgType: MsgType.RedPocketWinner }, settings).text, "红包结果自定义");
  assert.equal(renderVoiceEventTemplate({ msgType: MsgType.AnchorLotAward }, settings).text, "天选结果自定义");
});

test("大航海的开通时长支持天数，陪伴天数独立播报", () => {
  const result = renderVoiceTemplate(DEFAULT_VOICE_TEMPLATES.guard, {
    msgType: MsgType.GuardBuy,
    user: { uname: "小明" },
    text: "已陪伴主播3天",
    guard: { level: 1, count: 3, unit: "天" },
  });
  assert.equal(result.text, "感谢小明开通三天舰长，已陪伴主播三天");
});

test("大航海默认模板的陪伴天数字段自身包含天，不额外追加固定单位", () => {
  assert.equal(DEFAULT_VOICE_TEMPLATES.guard.some((segment) => segment.kind === "text" && segment.value === "天"), false);
  const result = renderVoiceTemplate([
    { kind: "field", field: "companionDays" },
  ], {
    msgType: MsgType.GuardBuy,
    text: "已陪伴主播365天",
    guard: { level: 1, count: 1 },
  });

  assert.equal(result.text, "三百六十五天");
});

test("数量播报按数位读取中文数字，百位以上最高位的二读作两", () => {
  const renderQuantity = (count) => renderVoiceTemplate([
    { kind: "field", field: "quantity" },
  ], {
    msgType: MsgType.Gift,
    gift: { name: "小心心", count },
  }).text;

  assert.equal(renderQuantity(2), "两个");
  assert.equal(renderQuantity(20), "二十个");
  assert.equal(renderQuantity(29), "二十九个");
  assert.equal(renderQuantity(102), "一百零二个");
  assert.equal(renderQuantity(200), "两百个");
  assert.equal(renderQuantity(2345), "两千三百四十五个");
  assert.equal(renderQuantity(10010), "一万零一十个");
});
