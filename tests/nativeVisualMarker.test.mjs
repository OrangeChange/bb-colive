import test from "node:test";
import assert from "node:assert/strict";
import { formatNativeVisualMarker, parseNativeVisualMarker } from "../src/themes/nativeVisualMarker.ts";

test("可视化 CSS 使用紧凑可读标记", () => {
  assert.equal(formatNativeVisualMarker("common", "gift|captain|price"), "visual:common|gift|captain|price");
  assert.deepEqual(parseNativeVisualMarker(" visual:dark|superchat|ordinary|message "), { scheme: "dark", targetKey: "superchat|ordinary|message" });
});

test("旧编码标记不再作为可视化 CSS 处理", () => {
  assert.equal(parseNativeVisualMarker("danmu-visual:all%7Call%7Cmessage"), undefined);
});
