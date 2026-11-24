import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
let server;
let adapt;
let MsgType, EventRow;
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

test.before(async () => {
  server = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-redPocketAdapter.test.mjs",
    root,
    configFile: false,
    logLevel: "silent",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
  });
  ({ EventRow } = await server.ssrLoadModule("/src/components/EventRow.tsx"));
  ({ adapt } = await server.ssrLoadModule("/src/protocol/adapter.ts"));
  ({ MsgType } = await server.ssrLoadModule("/src/protocol/types.ts"));
});

test.after(async () => {
  await server?.close();
});

const context = { roomId: 22625027, anchorUid: "999", keepRaw: false };

const lifecycle = JSON.parse(readFileSync(new URL("./fixtures/redPocketLifecycle.json", import.meta.url), "utf8"));

test("红包 NEW/V2_NEW 是重复送出提示，不生成投喂事件", () => {
  for (const cmd of ["POPULARITY_RED_POCKET_NEW", "POPULARITY_RED_POCKET_V2_NEW"]) {
    assert.equal(adapt({ ...lifecycle.new, cmd }, { ...context, roomId: lifecycle.roomId }), null, cmd);
  }
});

test("同一红包无论通知先后，都只保留开始事件和正确奖池金额", () => {
  for (const order of [[lifecycle.new, lifecycle.start], [lifecycle.start, lifecycle.new]]) {
    const events = order.flatMap(message => adapt(message, { ...context, roomId: lifecycle.roomId }) ?? []);
    assert.equal(events.length, 1);
    assert.equal(events[0].msgType, MsgType.RedPocketStart);
    assert.equal(events[0].pocket.lotId, 28877957);
    assert.equal(events[0].lottery.totalPrice / 1000, 2);
    assert.equal(events[0].laplace.event.priceNormalized, 2);
    assert.equal(events[0].gift, undefined);
  }
});

test("红包开奖与普通礼物保留独立事件及原金额单位", () => {
  const winner = adapt({ cmd: "POPULARITY_RED_POCKET_V2_WINNER_LIST", data: {
    lot_id: 28877957, total_num: 1, winner_info: [{ uid: 1, uname: "中奖用户" }],
  } }, context);
  assert.equal(winner.msgType, MsgType.RedPocketWinner);
  assert.equal(winner.pocket.lotId, 28877957);
  const gift = adapt({ cmd: "SEND_GIFT", data: {
    uid: 1, uname: "礼物用户", giftId: 1, giftName: "普通礼物", price: 100,
    coin_type: "gold", num: 2, total_coin: 200, timestamp: 1793580326,
  } }, context);
  assert.equal(gift.msgType, MsgType.Gift);
  assert.equal(gift.gift.priceRmb, 0.1);
  assert.equal(gift.gift.totalRmb, 0.2);
});

test("红包 V2_START 保留奖励礼物名称和数量", () => {
  const result = adapt({
    cmd: "POPULARITY_RED_POCKET_V2_START",
    data: {
      lot_id: 28527188,
      sender_uid: 275695700,
      sender_name: "查无此意的昵称",
      total_price: 10000,
      last_time: 300,
      awards: [{ gift_id: 0, gift_name: "电池红包", num: 50 }],
    },
  }, context);

  assert.equal(result.msgType, MsgType.RedPocketStart);
  assert.deepEqual(result.lottery.awards, [
    { id: 0, name: "电池红包", count: 50 },
  ]);
});

test("红包开始行展示 V2_START 提供的奖励列表", () => {
  const ev = adapt({ cmd: "POPULARITY_RED_POCKET_V2_START", data: {
    lot_id: 28527188, sender_uid: 275695700, sender_name: "查无此意的昵称",
    total_price: 10000, last_time: 300,
    awards: [{ gift_id: 0, gift_name: "电池红包", num: 50 }, { gift_id: 1, gift_name: "小心心", num: 1 }],
  } }, context);
  for (const props of [{ liveLayout: true }, { reviewLayout: true, archiveLayout: true }, {}]) {
    const html = renderToStaticMarkup(React.createElement(EventRow, { ev, showTime: false, ...props }));
    assert.match(html, /class="redpocket-awards"><span class="prefix">奖励<\/span>/);
    assert.match(html, /class="redpocket-name">电池红包<\/span>/);
    assert.match(html, /class="number quantity-number">50<\/span>/);
    assert.match(html, /class="redpocket-name">小心心<\/span>/);
  }
});


test("红包V1/V2数组名单从公开用户资料读取头像并同步Laplace", () => {
  for (const cmd of ["POPULARITY_RED_POCKET_WINNER_LIST", "POPULARITY_RED_POCKET_V2_WINNER_LIST"]) {
    const event = adapt({cmd,data:{lot_id:99,total_num:1,awards:{8:{award_name:"电池"}},winner_info:[
      [123,"中奖观众",0,8,false,null,0,0,{uid:123,base:{name:"中奖观众",face:"https://example.com/public.jpg",origin_info:{face:"https://example.com/original.jpg"}}},0]
    ]}},context);
    assert.equal(event.lottery.winners[0].avatar,"https://example.com/public.jpg");
    assert.equal(event.lottery.winners[0].uid,"123");
    assert.equal(event.lottery.winners[0].awardName,"电池");
    assert.equal(event.laplace.event.list[0][2],"https://example.com/public.jpg");
  }
});
test("旧红包元组不把bag_id当头像，对象头像仍保留", () => {
  const event=adapt({cmd:"POPULARITY_RED_POCKET_WINNER_LIST",data:{winner_info:[[1,"旧观众",23,8],{uid:2,uname:"新观众",face:"https://example.com/face.jpg"}]}},context);
  assert.equal(event.lottery.winners[0].avatar,undefined);
  assert.equal(event.lottery.winners[1].avatar,"https://example.com/face.jpg");
  assert.equal(event.laplace.event.list[0][2],null);
  assert.equal(event.laplace.event.list[1][2],"https://example.com/face.jpg");
});
