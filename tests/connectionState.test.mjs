import test from "node:test";
import assert from "node:assert/strict";
import { keepSameRoomGuardProfile, toClosedState } from "../src/stores/connectionState.ts";

test("手动断开只改变连接状态，保留当前主播上下文", () => {
  const previous = {
    status: "connected",
    roomId: 80397,
    shortId: 80397,
    title: "直播标题",
    anchorName: "阿梓",
    anchorFace: "https://example.com/face.jpg",
    roomIdInput: "80397",
    liveStatus: 1,
    message: "连接正常",
  };

  assert.deepEqual(toClosedState(previous), {
    ...previous,
    status: "closed",
    message: "已断开",
  });
  assert.equal(previous.status, "connected");
});

test("切换到其他房间时不沿用旧房间档位，同房间重连可以暂时沿用", () => {
  const profile = {
    roomId: 101,
    anchorUid: "7",
    anchorGuardAchieveLevel: 10000,
    milestone: "tenThousand",
    iconSet: "enhanced",
    source: "room-info",
  };
  const previous = { roomId: 101, roomGuardProfile: profile };

  assert.deepEqual(keepSameRoomGuardProfile(previous, 101), { roomGuardProfile: profile });
  assert.deepEqual(keepSameRoomGuardProfile(previous, 202), {});
});
