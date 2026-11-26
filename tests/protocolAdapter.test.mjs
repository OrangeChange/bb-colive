import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { InteractWordV2, SendGiftV2 } from "../src/protocol/proto.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
let server;
let adapt;

test('V2支付读取原始总金额，盲盒不使用开出价值，缺失保持未知', () => {
  for (const [totalCoin,blindGift,want] of [[30000,undefined,30],[9000,{giftId:2,name:'盲盒',price:9000},9],[undefined,undefined,undefined],[0,undefined,undefined]]) {
    const item={giftId:1,name:'礼物',num:1,price:30000,coinType:'gold',...(totalCoin!==undefined?{totalCoin}:{})};
    const pb=SendGiftV2.encode({uid:123,uname:'用户',gift:[item],...(blindGift?{blindGift}:{})}).finish();
    const event=adapt({cmd:'SEND_GIFT_V2',data:{pb:Buffer.from(pb).toString('base64')}},{roomId:1,anchorUid:'9'});
    assert.equal(event.gift.paymentRmb,want);
    assert.equal(event.gift.priceRmb,30);
  }
});

test('手机号验证来自原始数组位置，0与1保留为布尔值，未知不误判且无嵌套资料仍可读取', () => {
  for (const [flag,want] of [[0,false],[1,true],[undefined,undefined],[null,undefined],[2,undefined]]) {
    const author=[123,'用户'];author[6]=flag;
    const result=adapt({cmd:'DANMU_MSG',info:[[],'你好',author,[],[]]}, {roomId:1,anchorUid:'9'});
    assert.equal(result.user.phoneVerified,want);
  }
});

test('弹幕自动标记来自原始非零字段，不按内容猜测', () => {
  for (const [flag, expected] of [[undefined, false], [0, false], [2, true], [1, true]]) {
    const meta = []; meta[9] = flag;
    const event = adapt({cmd:'DANMU_MSG',info:[meta,'国庆快乐呀！',[123,'用户'],[],[]]}, {roomId:1,anchorUid:'9'});
    assert.equal(event.isAutoDanmaku, expected);
    assert.equal(event.danmakuSendType,flag);
  }
});

test('大航海缺失头像时复用当前连接已观测头像，原报文头像优先', () => {
  const ctx = {roomId:1,anchorUid:'9'};
  const meta = []; meta[15] = {user:{base:{face:'https://example.com/avatar.png'}}};
  adapt({cmd:'DANMU_MSG',info:[meta,'你好',[123,'用户'],[],[]]},ctx);
  const toast = {cmd:'USER_TOAST_MSG_V2',data:{sender_uinfo:{uid:123,base:{name:'用户',face:''}},guard_info:{guard_level:3},pay_info:{price:168000}}};
  assert.equal(adapt(toast,ctx).user.avatar,'https://example.com/avatar.png');
  assert.equal(adapt(toast,{roomId:2,anchorUid:'9'}).user.avatar,undefined);
  toast.data.sender_uinfo.base.face = 'https://example.com/new.png';
  assert.equal(adapt(toast,ctx).user.avatar,'https://example.com/new.png');
});

test.before(async () => {
  server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-protocolAdapter.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, root, logLevel: "silent", server: { middlewareMode: true, watch: null } });
  ({ adapt } = await server.ssrLoadModule("/src/protocol/adapter.ts"));
});

test.after(async () => {
  await server?.close();
});

const adapterSource = readFileSync(new URL("../src/protocol/adapter.ts", import.meta.url), "utf8");
const protoSource = readFileSync(new URL("../src/protocol/proto.ts", import.meta.url), "utf8");

test("INTERACT_WORD_V2 重推使用稳定去重键而不是随机事件 ID", () => {
  assert.match(protoSource, /tsNano:\s*\{\s*id:\s*15/);
  assert.match(adapterSource, /interactWordV2DedupeKey/);
  assert.match(adapterSource, /dedupe:\s*interactWordV2DedupeKey\(v\)/);
});

test("INTERACT_WORD_V2 没有纳秒时间时仍以秒级时间作为稳定回退", () => {
  assert.match(adapterSource, /value\.tsNano\?\.trim\(\)\s*\|\|\s*\(Number\.isFinite\(value\.tsSec\)/);
});

test("INTERACT_WORD_V2 的 uinfo.wealth.level 映射为用户荣耀等级", () => {
  const payload = InteractWordV2.encode({
    uid: "789",
    msgType: 1,
    uinfo: { wealth: { level: 17, dmIconKey: "ChronosWealth_4.png" } },
  }).finish();
  const decoded = InteractWordV2.decode(payload);
  assert.equal(decoded.uinfo.wealth.level, 17);
  assert.equal(decoded.uinfo.wealth.dmIconKey, "ChronosWealth_4.png");
  assert.match(protoSource, /wealth:\s*\{\s*id: 4,\s*type: 'WealthInfo'/);
  assert.match(protoSource, /WealthInfo:\s*\{\s*fields:\s*\{\s*level:\s*\{\s*id: 1,\s*type: 'int32'/);
  assert.match(adapterSource, /wealth:\s*wealthInfoFromPayload\(uinfo\.wealth\)/);
  assert.match(readFileSync(new URL("../src/protocol/types.ts", import.meta.url), "utf8"), /wealthLevel\?: number/);
});

const makeAdapterContext = (roomGuardProfile) => ({
  roomId: 645306,
  anchorUid: "100",
  keepRaw: false,
  ...(roomGuardProfile ? { roomGuardProfile } : {}),
});

const makeDanmu = (uid, { wealth, wealthLevel, iconKey, accountLevel = 60 } = {}) => {
  const meta = [];
  meta[4] = Date.now();
  meta[5] = `danmu-${uid}`;
  meta[15] = {
    extra: JSON.stringify({
      content: "test",
      ...(iconKey ? { icon: { prefix: { resource: iconKey } } } : {}),
    }),
    user: { wealth },
  };
  const info = [meta, "test", [uid, "viewer", 0], [], [accountLevel, 0]];
  info[7] = 0;
  if (wealthLevel !== undefined) info[16] = [wealthLevel];
  return { cmd: "DANMU_MSG", info };
};

test("DANMU_MSG 从 info[16][0] 捕获荣耀等级与 ChronosWealth 图标键，不误用 info[4]", () => {
  const event = adapt(makeDanmu(123, {
    wealthLevel: 17,
    iconKey: "ChronosWealth_4.png",
    accountLevel: 60,
  }), makeAdapterContext());

  assert.equal(event.user.wealthLevel, 17);
  assert.equal(event.user.wealthIconKey, "ChronosWealth_4.png");

  const noWealth = adapt(makeDanmu(456, { accountLevel: 60 }), makeAdapterContext());
  assert.equal(noWealth.user.wealthLevel, undefined);

  const nestedWealth = adapt(makeDanmu(789, {
    wealth: { level: 19, dm_icon_key: "ChronosWealth_4.png" },
    accountLevel: 60,
  }), makeAdapterContext());
  assert.equal(nestedWealth.user.wealthLevel, 19);
});

test("DANMU_MSG 保留 LAPLACE 兼容所需的用户资料字段和粉丝牌字段", () => {
  const event = makeDanmu(123);
  event.info[7] = 3;
  event.info[3] = [24, "本场牌", "主播"];
  event.info[0][15].user = {
    ...event.info[0][15].user,
    currentRank: 4,
    phoneVerified: 1,
    sendType: 2,
    userLevel: 38,
    userLevelBorder: 10512625,
    medal: {
      name: "本场牌",
      level: 24,
      ruid: "100",
      guard_level: 3,
      type: 0,
    },
  };

  const user = adapt(event, makeAdapterContext()).user;
  assert.equal(user.currentRank, 4);
  assert.equal(user.phoneVerified, true);
  assert.equal(user.sendType, 2);
  assert.equal(user.userLevel, 38);
  assert.equal(user.userLevelBorder, 10512625);
  assert.equal(user.medal.guardLevel, 1);
  assert.equal(user.medal.type, 0);
});

test("DANMU_MSG 从真实 info[4][4] 保留 currentRank，不交换榜单值", () => {
  for (const currentRank of [0, 1, 2, 3]) {
    const event = makeDanmu(`rank-${currentRank}`);
    event.info[4] = [20, 0, 5805790, ">50000", currentRank];

    const user = adapt(event, makeAdapterContext()).user;
    assert.equal(user.currentRank, currentRank);
  }
});

test("DANMU_MSG 从 info[4] 保留用户等级及等级边框", () => {
  const event = makeDanmu(123, { accountLevel: 38 });
  event.info[4] = [38, 10512625];
  delete event.info[0][15].user.userLevel;
  delete event.info[0][15].user.userLevelBorder;

  const user = adapt(event, makeAdapterContext()).user;
  assert.equal(user.userLevel, 38);
  assert.equal(user.userLevelBorder, 10512625);
});

test("DANMU_MSG 兼容真实粉丝牌字段 typ", () => {
  const event = makeDanmu(123);
  event.info[3] = [24, "本场牌", "主播"];
  event.info[0][15].user.medal = {
    name: "本场牌",
    level: 24,
    ruid: "100",
    guard_level: 3,
    typ: 0,
  };

  const user = adapt(event, makeAdapterContext()).user;
  assert.equal(user.medal.type, 0);
});

test("同一直播间的弹幕、SC 和礼物 V2 统一使用 roomGuardProfile，不依赖各事件是否带 guard_icon", () => {
  const roomGuardProfile = {
    roomId: 645306,
    anchorUid: "100",
    anchorGuardAchieveLevel: 10000,
    milestone: "tenThousand",
    iconSet: "enhanced",
    source: "room-info",
  };
  const ctx = makeAdapterContext(roomGuardProfile);
  const danmu = makeDanmu(123);
  danmu.info[7] = 3;
  danmu.info[3] = [24, "本场牌", "主播"];
  danmu.info[0][15].user.medal = {
    name: "本场牌", level: 24, ruid: "100", guard_level: 3,
    guard_icon: "https://i0.hdslb.com/bfs/live/current-room-captain.png",
  };
  const danmuUser = adapt(danmu, ctx).user;
  const scUser = adapt({
    cmd: "SUPER_CHAT_MESSAGE",
    data: { id: 1, uid: 123, user_info: { uname: "viewer", guard_level: 3 }, price: 30, message: "test" },
  }, ctx).user;
  const giftPayload = SendGiftV2.encode({
    uid: "123",
    uname: "viewer",
    guardLevel: 3,
    gift: [{ giftId: "1", name: "小花", num: 1, price: 100, totalCoin: 100, coinType: "gold" }],
  }).finish();
  const giftUser = adapt({
    cmd: "SEND_GIFT_V2",
    data: { pb: Buffer.from(giftPayload).toString("base64") },
  }, ctx).user;

  for (const user of [danmuUser, scUser, giftUser]) {
    assert.equal(user.guardMilestone, "tenThousand");
    assert.equal(user.guardIconSet, "enhanced");
  }
});

test("其他主播粉丝牌的 guard_icon 只被拒绝为 URL，不会改变当前直播间图标套系", () => {
  const ctx = makeAdapterContext({
    roomId: 645306,
    anchorUid: "100",
    anchorGuardAchieveLevel: 1000,
    milestone: "thousand",
    iconSet: "enhanced",
    source: "room-info",
  });
  const event = makeDanmu(123);
  event.info[7] = 3;
  event.info[0][15].user.medal = {
    name: "其他房间牌", level: 24, ruid: "200", guard_level: 3,
    guard_icon: "https://i0.hdslb.com/bfs/live/foreign-room-captain.png",
  };
  const user = adapt(event, ctx).user;
  assert.equal(user.guardIconUrl, undefined);
  assert.equal(user.guardMilestone, "thousand");
  assert.equal(user.guardIconSet, "enhanced");
});

test("事件从当前主播粉丝牌的 guard_icon 捕获大航海图标，拒绝其他主播粉丝牌图标", () => {
  const iconUrl = "https://i0.hdslb.com/bfs/live/room-captain.png";
  const medal = (ruid) => ({
    name: "本场牌",
    level: 24,
    ruid: String(ruid),
    guard_level: 3,
    guard_icon: iconUrl,
  });

  const danmu = makeDanmu(123);
  danmu.info[3] = [24, "本场牌", "主播"];
  danmu.info[7] = 3;
  danmu.info[0][15].user.medal = medal(100);
  assert.equal(adapt(danmu, makeAdapterContext()).user.guardIconUrl, iconUrl);

  const gift = adapt({
    cmd: "SEND_GIFT",
    data: {
      uid: 124, uname: "viewer", giftId: 1, giftName: "test", num: 1,
      price: 100, coin_type: "gold", total_coin: 100,
      sender_uinfo: { medal: medal(100) },
    },
  }, makeAdapterContext());
  assert.equal(gift.user.guardIconUrl, iconUrl);

  const interact = adapt({
    cmd: "INTERACT_WORD",
    data: { uid: 126, uname: "viewer", privilege_type: 3, msg_type: 1, uinfo: { medal: medal(100) } },
  }, makeAdapterContext());
  assert.equal(interact.user.guardIconUrl, iconUrl);

  const superChat = adapt({
    cmd: "SUPER_CHAT_MESSAGE",
    data: { id: 1, uid: 127, user_info: { uname: "viewer", guard_level: 3 }, medal_info: medal(100), price: 30, message: "test" },
  }, makeAdapterContext());
  assert.equal(superChat.user.guardIconUrl, iconUrl);

  const guardRenewal = adapt({
    cmd: "USER_TOAST_MSG_V2",
    data: {
      sender_uinfo: { uid: 128, base: { name: "viewer" }, medal: medal(100) },
      guard_info: { guard_level: 3, start_time: 1 }, pay_info: { price: 198000 }, toast_msg: "开通舰长",
    },
  }, makeAdapterContext());
  assert.equal(guardRenewal.user.guardIconUrl, iconUrl);

  const like = adapt({
    cmd: "LIKE_INFO_V3_CLICK",
    data: { uid: 129, uinfo: { base: { name: "viewer" } }, fans_medal: medal(100) },
  }, makeAdapterContext());
  assert.equal(like.user.guardIconUrl, iconUrl);

  const otherRoom = makeDanmu(125);
  otherRoom.info[3] = [24, "其他房间牌", "其他主播"];
  otherRoom.info[7] = 3;
  otherRoom.info[0][15].user.medal = medal(200);
  assert.equal(adapt(otherRoom, makeAdapterContext()).user.guardIconUrl, undefined);
});

test("同一连接内已观测的大航海图标按用户 UID 补给后续无图标事件", () => {
  const ctx = makeAdapterContext();
  const iconUrl = "https://i0.hdslb.com/bfs/live/user-specific-guard-icon.png";
  const first = makeDanmu(123);
  first.info[3] = [24, "本场牌", "主播"];
  first.info[7] = 3;
  first.info[0][15].user.medal = {
    name: "本场牌", level: 24, ruid: "100", guard_level: 3, guard_icon: iconUrl,
  };
  assert.equal(adapt(first, ctx).user.guardIconUrl, iconUrl);

  const later = makeDanmu(123);
  later.info[7] = 3;
  assert.equal(adapt(later, ctx).user.guardIconUrl, iconUrl);

  const otherRoom = { ...makeAdapterContext(), roomId: 999, anchorUid: "200" };
  const sameUidInOtherRoom = makeDanmu(123);
  sameUidInOtherRoom.info[7] = 3;
  assert.equal(adapt(sameUidInOtherRoom, otherRoom).user.guardIconUrl, undefined);
});

test("ENTRY_EFFECT 的等级与图标 URL 会补充同连接后续弹幕及礼物用户", () => {
  const ctx = makeAdapterContext();
  const iconUrl = "https://i0.hdslb.com/bfs/live/wealth-level-17.png";

  assert.equal(adapt({
    cmd: "ENTRY_EFFECT",
    data: {
      uid: 123,
      wealthy_info: { level: 17, dm_icon_key: "ChronosWealth_4.png" },
      wealth_style_info: { url: iconUrl },
    },
  }, ctx), null);

  const danmu = adapt(makeDanmu(123, { iconKey: "ChronosWealth_4.png" }), ctx);
  assert.equal(danmu.user.wealthLevel, 17);
  assert.equal(danmu.user.wealthIconUrl, iconUrl);

  const anotherUser = adapt(makeDanmu(456, { wealthLevel: 17 }), ctx);
  assert.equal(anotherUser.user.wealthIconUrl, iconUrl);

  const gift = adapt({
    cmd: "SEND_GIFT",
    data: { uid: 123, uname: "viewer", giftId: 1, giftName: "test", num: 1, price: 100, coin_type: "gold", total_coin: 100 },
  }, ctx);
  assert.equal(gift.user.wealthLevel, 17);
  assert.equal(gift.user.wealthIconUrl, iconUrl);
  assert.equal(JSON.parse(JSON.stringify(gift)).user.wealthIconUrl, iconUrl);
});

test("ENTRY_EFFECT_MUST_RECEIVE 在 wealthy_info 缺失时使用 uinfo.wealth", () => {
  const ctx = makeAdapterContext();
  const iconUrl = "https://i0.hdslb.com/bfs/live/wealth-level-5.png";
  assert.equal(adapt({
    cmd: "ENTRY_EFFECT_MUST_RECEIVE",
    data: {
      uid: 321,
      wealthy_info: null,
      uinfo: { wealth: { level: 5, dm_icon_key: "ChronosWealth_4.png" } },
      wealth_style_info: { url: iconUrl },
    },
  }, ctx), null);

  const event = adapt(makeDanmu(321), ctx);
  assert.equal(event.user.wealthLevel, 5);
  assert.equal(event.user.wealthIconUrl, iconUrl);
});

test("INTERACT_WORD_V2 的财富等级及 dm_icon_key 可供后续事件复用", () => {
  const ctx = makeAdapterContext();
  const payload = InteractWordV2.encode({
    uid: "789",
    msgType: 1,
    tsSec: 1789991983,
    uinfo: {
      uid: "789",
      base: { name: "viewer" },
      wealth: { level: 25, dmIconKey: "ChronosWealth_4.png" },
    },
  }).finish();
  const interact = adapt({ cmd: "INTERACT_WORD_V2", data: { pb: Buffer.from(payload).toString("base64") } }, ctx);

  assert.equal(interact.user.wealthLevel, 25);
  assert.equal(interact.user.wealthIconKey, "ChronosWealth_4.png");
  const danmu = adapt(makeDanmu(789), ctx);
  assert.equal(danmu.user.wealthLevel, 25);
  assert.equal(danmu.user.wealthIconKey, "ChronosWealth_4.png");
});

 test('来源字段独立于raw保留，SC缺dmscore仍准入，删除读取嵌套ids', () => {
  const ctx={roomId:1,anchorUid:'9',keepRaw:false};
  const change=adapt({cmd:'ROOM_CHANGE',data:{title:'标题',area_name:'子区',parent_area_name:'父区'}},ctx);
  assert.equal(change.laplace.event.message,'标题');
  assert.equal(change.laplace.event.parentArea,'父区');
  assert.equal(change.raw,undefined);
  const sc=adapt({cmd:'SUPER_CHAT_MESSAGE',data:{id:42,start_time:1793459532,price:30,message:'正文',user_info:{uname:'用户'}}},ctx);
  assert.equal(sc.laplace.event.scId,42);
  assert.equal(sc.laplace.event.timestampNormalized,1793459532000);
  const deletion=adapt({cmd:'SUPER_CHAT_MESSAGE_DELETE',data:{data:{ids:[42]}}},ctx);
  assert.deepEqual(deletion.laplace.deleteIds,['42']);
 });
test('礼物保留其他主播粉丝牌及V2独立勋章块，不授予当前房间身份',()=>{
 for(const payload of [
  {userInfo:{medal:{name:'其他主播牌',level:25,ruid:'200',guardLevel:1}}},
  {medalBlock:{name:'其他主播牌',level:25,anchorUid:'200',guardLevel:1}},
 ]){
  const pb=SendGiftV2.encode({uid:123,uname:'用户',...payload,gift:[{giftId:1,name:'小花',num:1,price:100,totalCoin:100,coinType:'gold'}]}).finish();
  const e=adapt({cmd:'SEND_GIFT_V2',data:{pb:Buffer.from(pb).toString('base64')}},{roomId:1,anchorUid:'100'});
  assert.equal(e.user.medal.name,'其他主播牌');assert.equal(e.user.medal.level,25);assert.equal(e.user.medal.isCurrentRoom,false);assert.equal(e.user.guardLevel,0);assert.equal(e.user.guardIconUrl,undefined);
 }
});
test('V2礼物读取报文自带荣耀等级、牌类型和点亮状态',()=>{
 const pb=SendGiftV2.encode({uid:123,uname:'用户',wealth:{level:42},userInfo:{medal:{name:'本场牌',level:25,ruid:'100',type:1,isLighted:1,guardIconUrl:'https://example.com/guard.png',guardLevel:3}},gift:[{giftId:1,name:'小花',num:1,price:100,totalCoin:100,coinType:'gold'}]}).finish();
 const e=adapt({cmd:'SEND_GIFT_V2',data:{pb:Buffer.from(pb).toString('base64')}},{roomId:1,anchorUid:'100'});
 assert.equal(e.user.wealthLevel,42);assert.equal(e.user.medal.type,1);assert.equal(e.user.medal.isLighted,true);assert.equal(e.user.guardIconUrl,'https://example.com/guard.png');
});
test('互动V2点亮状态使用实际字段8，不将大航海字段9当点亮状态',()=>{
 for(const light of [0,1]){
  const medal=Buffer.concat([InteractWordV2.lookupType('MedalInfo').encode({anchorUid:'100',level:20,name:'本场牌'}).finish(),Buffer.from([64,light])]);
  const pb=Buffer.concat([InteractWordV2.encode({uid:123,uname:'用户',msgType:1}).finish(),Buffer.from([74,medal.length]),medal]);
  const e=adapt({cmd:'INTERACT_WORD_V2',data:{pb:Buffer.from(pb).toString('base64')}},{roomId:1,anchorUid:'100'});
  assert.equal(e.user.medal.isLighted,Boolean(light));
 }
});
test('真实礼物报文的粉丝牌进入公共事件组件，并服从归属及点亮开关',async()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/native-gift-user-medal.json',import.meta.url),'utf8'));
 const e=adapt(fixture.message,fixture.context);assert.equal(e.user.uid,fixture.expected.uid);assert.deepEqual(e.user.medal,fixture.expected.medal);
 const React=await import('react');const{renderToStaticMarkup}=await import('react-dom/server');const{EventRow}=await server.ssrLoadModule('/src/components/EventRow.tsx');const{DEFAULT_EVENT_DISPLAY_PREFERENCES:prefs}=await server.ssrLoadModule('/src/eventDisplaySettings.ts');
 for(const liveLayout of [false,true]){
  const render=extra=>renderToStaticMarkup(React.createElement(EventRow,{ev:e,liveLayout,animateOnMount:false,displayPreferences:{...prefs,showFanMedal:true,onlyAnchorFanMedal:false,hideUnlitFanMedal:false,...extra}}));
  assert.match(render({}),/fan-medal/);assert(render({}).includes(e.user.medal.name));assert(!render({onlyAnchorFanMedal:true}).includes('fan-medal'));
 }
});

test('粉丝牌保留数组与JSON载荷的主播归属，不用牌名推断', () => {
 const medal=[25,'牌子','所属主播',123];medal[12]=456;
 const chat=adapt({cmd:'DANMU_MSG',info:[[],'你好',[99,'用户'],medal,[]]}, {roomId:1,anchorUid:'9'});
 assert.equal(chat.user.medal.anchorUid,'456');
 assert.equal(chat.user.medal.anchorRoomId,123);
 const gift=adapt({cmd:'SEND_GIFT',data:{uid:99,uname:'用户',giftName:'礼物',giftId:1,num:1,price:100,coin_type:'gold',sender_uinfo:{medal:{medal_name:'牌子',medal_level:25,target_id:456,anchor_uname:'所属主播',anchor_roomid:123}}}},{roomId:1,anchorUid:'9'});
 assert.equal(gift.user.medal.anchorUid,'456');
 assert.equal(gift.user.medal.anchorName,'所属主播');
 assert.equal(gift.user.medal.anchorRoomId,123);
});
