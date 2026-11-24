import test from "node:test";
import assert from "node:assert/strict";
import { pointerRatio, trackPosition } from "../src/colorPickerGeometry.ts";

test("色板圆点使用轨道自身边界，端点中心不超出轨道", () => {
  assert.equal(trackPosition(0, 100, 200), 100);
  assert.equal(trackPosition(1, 100, 200), 300);
  assert.equal(trackPosition(0.5, 100, 200), 200);
});

test("点击位置按同一轨道边界换算比例", () => {
  assert.equal(pointerRatio(100, 100, 200), 0);
  assert.equal(pointerRatio(300, 100, 200), 1);
  assert.equal(pointerRatio(200, 100, 200), 0.5);
});
