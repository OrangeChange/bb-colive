import test from "node:test";
import assert from "node:assert/strict";
import {
  NATIVE_EVENT_SCOPES,
  NATIVE_IDENTITY_SCOPES,
  NATIVE_SEMANTIC_PARTS,
} from "../src/themes/nativeThemeCapabilities.ts";
import { NATIVE_PART_SELECTORS } from "../src/themes/nativeSemanticSelectors.ts";

test("原生主题声明完整事件和身份作用域", () => {
  assert.deepEqual(NATIVE_EVENT_SCOPES.map(item => item.id), [
    "all", "danmaku", "interaction", "gift", "superchat", "guard", "system",
  ]);
  assert.deepEqual(NATIVE_IDENTITY_SCOPES.map(item => item.id), [
    "all", "ordinary", "captain", "admiral", "viceroy", "anchor", "admin",
  ]);
  assert.deepEqual(NATIVE_EVENT_SCOPES.find(item => item.id === "gift")?.children?.map(item => item.id), [
    "free", "normal", "blind", "redpocket", "lottery",
  ]);
});

test("语义部件覆盖 146 编辑器使用的真实事件区域", () => {
  const ids = new Set(NATIVE_SEMANTIC_PARTS.map(item => item.id));
  for (const id of [
    "whole", "list", "row", "sticky", "user", "avatarFrame", "avatar",
    "username", "medal", "medalName", "medalLevel", "guardBadge", "anchorBadge",
    "adminBadge", "honor", "rank", "message", "reply", "translation", "content",
    "timestamp", "eventIcon", "giftImage", "giftName", "giftCount", "giftPrice",
    "giftProfit", "lotteryPrize", "lotteryCommand", "redpocketAwards", "winnerList",
  ]) assert.equal(ids.has(id), true, `缺少语义部件 ${id}`);
  for (const part of NATIVE_SEMANTIC_PARTS) assert.equal(typeof NATIVE_PART_SELECTORS[part.id], "string");
});

test("第一阶段只开放原生模式的真实编辑能力", async () => {
  const { getNativeThemeCapability } = await import("../src/themes/nativeThemeCapabilities.ts");
  assert.equal(getNativeThemeCapability("native").editable, true);
  assert.equal(getNativeThemeCapability("blivechat").editable, false);
  assert.equal(getNativeThemeCapability("blivechat-open").editable, false);
  assert.equal(getNativeThemeCapability("laplace").editable, false);
});
