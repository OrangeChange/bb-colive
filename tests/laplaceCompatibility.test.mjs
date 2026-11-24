import assert from "node:assert/strict";
import test from "node:test";
import { GoldRankBroadcast } from "../src/protocol/proto.ts";
import {
  adaptLaplaceStateMessage,
  parseOnlineRankV3,
} from "../src/protocol/laplaceCompatibility.ts";

const encode = (value) => Buffer.from(GoldRankBroadcast.encode(value).finish()).toString("base64");

test("ONLINE_RANK_V3 输出 LAPLACE 在线榜，并优先使用 online_list", () => {
  const pb = encode({
    rankType: "online_rank",
    list: [{ uid: "9001", uname: "高能榜用户", score: "999" }],
    onlineList: [{
      uid: "9223372036854775807",
      face: "https://example.test/avatar.png",
      score: "12345",
      uname: "在线榜用户",
      rank: "2",
      guardLevel: "3",
      isMystery: true,
      uinfo: {
        uid: "9223372036854775807",
        base: { name: "在线榜用户", face: "https://example.test/avatar.png", isMystery: true },
        medal: {
          name: "本场牌",
          level: "28",
          ruid: "10086",
          guardLevel: "3",
          guardIcon: "https://example.test/guard.png",
          honorIcon: "https://example.test/honor.png",
        },
        wealth: { level: "57", dmIconKey: "ChronosWealth_4.png" },
        guard: { level: "3", expiredStr: "2026-10-01" },
      },
    }],
  });

  const update = adaptLaplaceStateMessage({ cmd: "ONLINE_RANK_V3", data: { pb } });
  assert.deepEqual(update, {
    type: "online-rank-update",
    message: "在线榜",
    list: [{
      uid: "9223372036854775807",
      face: "https://example.test/avatar.png",
      score: "12345",
      uname: "在线榜用户",
      rank: 2,
      guard_level: 3,
      is_mystery: true,
      uinfo: {
        uid: "9223372036854775807",
        base: { name: "在线榜用户", face: "https://example.test/avatar.png", is_mystery: true },
        medal: {
          name: "本场牌",
          level: "28",
          ruid: "10086",
          guard_level: "3",
          guard_icon: "https://example.test/guard.png",
          honor_icon: "https://example.test/honor.png",
        },
        wealth: { level: "57", dm_icon_key: "ChronosWealth_4.png" },
        guard: { level: "3", expired_str: "2026-10-01" },
      },
    }],
  });
});

test("非 online_rank 的 ONLINE_RANK_V3 使用高能榜 list", () => {
  const pb = encode({
    rankType: "gold-rank",
    list: [{ uid: "1", uname: "高能榜用户", score: "8", rank: "1" }],
    onlineList: [{ uid: "2", uname: "在线榜用户", score: "7", rank: "1" }],
  });

  assert.deepEqual(parseOnlineRankV3(pb), {
    type: "online-rank-update",
    message: "在线榜",
    list: [{
      uid: "1",
      face: "",
      score: "8",
      uname: "高能榜用户",
      rank: 1,
      guard_level: 0,
      is_mystery: false,
    }],
  });
});

test("ONLINE_RANK_COUNT 同时保留 online 与 count，且不互相兜底", () => {
  assert.deepEqual(adaptLaplaceStateMessage({
    cmd: "ONLINE_RANK_COUNT",
    data: { count: 88, count_text: "88", online_count: 98, online_count_text: "98" },
  }), {
    type: "online-update",
    online: 98,
    onlineText: "98",
    count: 88,
    countText: "88",
  });

  assert.deepEqual(adaptLaplaceStateMessage({
    cmd: "ONLINE_RANK_COUNT",
    data: { count: 88, count_text: "88" },
  }), {
    type: "online-update",
    count: 88,
    countText: "88",
  });
});

test("不支持 V2 或损坏的 V3，不抛错也不生成兼容状态", () => {
  assert.equal(adaptLaplaceStateMessage({ cmd: "ONLINE_RANK_V2", data: { pb: "AA==" } }), null);
  assert.equal(adaptLaplaceStateMessage({ cmd: "ONLINE_RANK_V3", data: { pb: "not-base64" } }), null);
  assert.equal(adaptLaplaceStateMessage({ cmd: "DANMU_MSG", data: {} }), null);
});
