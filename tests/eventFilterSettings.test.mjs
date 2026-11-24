import test from "node:test";
import assert from "node:assert/strict";
import { MsgType } from "../src/protocol/types.ts";
import {
  DEFAULT_DISPLAY_WINDOW_FILTERS,
  INTERACT_KIND_OPTIONS,
  isDisplayWindowEventVisible,
  normalizeDisplayWindowFilters,
} from "../src/eventFilterSettings.ts";

const interact = (kind) => ({
  id: kind,
  msgType: MsgType.Interact,
  roomId: 1,
  ts: 1,
  interactKind: kind,
  text: kind,
});

test("弹幕窗筛选默认与主区域左侧的弹幕/互动分类一致", () => {
  assert.deepEqual(DEFAULT_DISPLAY_WINDOW_FILTERS, {
    danmu: true,
    interact: true,
    interactKinds: Object.fromEntries(INTERACT_KIND_OPTIONS.map(({ key }) => [key, true])),
  });
});

test("弹幕窗筛选复用互动六种二级分类，并保留未选中的设置", () => {
  const normalized = normalizeDisplayWindowFilters({
    danmu: false,
    interact: true,
    interactKinds: { entry: false, like: false },
  });

  assert.equal(normalized.danmu, false);
  assert.equal(normalized.interactKinds.entry, false);
  assert.equal(normalized.interactKinds.like, false);
  assert.equal(normalized.interactKinds.follow, true);
  assert.equal(normalized.interactKinds.mutualFollow, true);
});

test("弹幕窗筛选的一级关闭会隐藏事件，但不会清空二级选择", () => {
  const filters = normalizeDisplayWindowFilters({
    danmu: true,
    interact: false,
    interactKinds: { entry: false },
  });

  assert.equal(isDisplayWindowEventVisible({ msgType: MsgType.Danmu, text: "弹幕" }, filters), true);
  assert.equal(isDisplayWindowEventVisible(interact("entry"), filters), false);
  assert.equal(filters.interactKinds.entry, false);
});

test("弹幕窗互动二级筛选与主区域判断一致", () => {
  const filters = normalizeDisplayWindowFilters({
    interact: true,
    interactKinds: { follow: false },
  });

  assert.equal(isDisplayWindowEventVisible(interact("entry"), filters), true);
  assert.equal(isDisplayWindowEventVisible(interact("follow"), filters), false);
});

test("弹幕窗手机号验证开关与事件分类筛选同时生效", () => {
  const event = { msgType: MsgType.Danmu, text: "弹幕", user: { uid: "1", uname: "用户", phoneVerified: false } };
  const filters = normalizeDisplayWindowFilters({ danmu: true });
  assert.equal(isDisplayWindowEventVisible(event, filters, false), false);
  assert.equal(isDisplayWindowEventVisible(event, filters, true), true);
  assert.equal(isDisplayWindowEventVisible(event, { ...filters, danmu: false }, true), false);
});
