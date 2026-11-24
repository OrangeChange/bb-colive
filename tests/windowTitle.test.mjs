import test from "node:test";
import assert from "node:assert/strict";
import { getWindowTitle } from "../src/windowTitle.ts";

test("已连接直播时，窗口标题把主播和状态放在软件名之前", () => {
  assert.equal(
    getWindowTitle({ status: "connected", anchorName: "符瑶koritsu", liveStatus: 1 }),
    "符瑶koritsu · 直播中 · BB CoLive",
  );
});

test("连接生命周期状态使用稳定的窗口标题", () => {
  assert.equal(getWindowTitle({ status: "connecting", anchorName: "阿梓" }), "阿梓 · 连接中 · BB CoLive");
  assert.equal(getWindowTitle({ status: "reconnecting", anchorName: "阿梓" }), "阿梓 · 重连中 · BB CoLive");
  assert.equal(getWindowTitle({ status: "closed", anchorName: "阿梓" }), "阿梓 · 未连接 · BB CoLive");
  assert.equal(getWindowTitle({ status: "closed", roomId: 80397 }), "BB CoLive");
  assert.equal(getWindowTitle({ status: "error", anchorName: "阿梓" }), "阿梓 · 连接失败 · BB CoLive");
});

test("窗口标题能区分轮播、未开播和未知直播状态", () => {
  assert.equal(getWindowTitle({ status: "connected", anchorName: "主播", liveStatus: 2 }), "主播 · 轮播 · BB CoLive");
  assert.equal(getWindowTitle({ status: "connected", anchorName: "主播", liveStatus: 0 }), "主播 · 未开播 · BB CoLive");
  assert.equal(getWindowTitle({ status: "connected", roomId: 12345 }), "房间 12345 · 已连接 · BB CoLive");
  assert.equal(getWindowTitle({ status: "idle" }), "BB CoLive");
});
