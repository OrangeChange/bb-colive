import test from "node:test";
import assert from "node:assert/strict";
import { getAnchorCardView } from "../src/components/anchorCard.ts";

const current = {
  uname: "主播A",
  face: "a.png",
  roomId: 101,
  live: true,
};
const target = {
  roomIdInput: "202",
  realRoomId: 202,
  uname: "主播B",
  face: "b.png",
  liveStatus: 1,
  lastConnectedAt: 2,
};

test("连接中选择其他主播时，主播卡显示待切换目标", () => {
  assert.deepEqual(getAnchorCardView(true, current, target, null), {
    uname: "主播B",
    face: "b.png",
    roomId: 202,
    live: true,
  });
});

test("没有待切换目标时，连接中的主播卡显示当前连接", () => {
  assert.deepEqual(getAnchorCardView(true, current, null, target), current);
});
