import test from "node:test";
import assert from "node:assert/strict";
import { moveTemplateSegment } from "../src/voice/templateEditor.ts";
import * as templateEditor from "../src/voice/templateEditor.ts";

test("模板编辑器会为模块之间和首尾补出可编辑文字区", () => {
  const segments = [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
  ];

  assert.equal(typeof templateEditor.ensureTemplateTextGaps, "function");
  const next = templateEditor.ensureTemplateTextGaps(segments);

  assert.deepEqual(next, [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
    { kind: "text", value: "" },
  ]);
  assert.deepEqual(segments, [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
  ]);
});

test("模板编辑器会在相邻动态字段之间补出文字输入区", () => {
  const next = templateEditor.ensureTemplateTextGaps([
    { kind: "field", field: "quantity" },
    { kind: "field", field: "giftName" },
  ]);

  assert.deepEqual(next, [
    { kind: "text", value: "" },
    { kind: "field", field: "quantity" },
    { kind: "text", value: "" },
    { kind: "field", field: "giftName" },
    { kind: "text", value: "" },
  ]);
});

test("模板编辑器会把连续文字合并为一个可编辑文字区", () => {
  const next = templateEditor.ensureTemplateTextGaps([
    { kind: "text", value: "感谢" },
    { kind: "text", value: "小明" },
  ]);

  assert.deepEqual(next, [{ kind: "text", value: "感谢小明" }]);
});

test("天选模板可以保留相邻固定文字片段，供界面分别编辑", () => {
  const next = templateEditor.ensureTemplateTextGaps([
    { kind: "text", value: "主播开启了" },
    { kind: "text", value: "天选" },
    { kind: "text", value: "，" },
    { kind: "text", value: "奖品是" },
    { kind: "field", field: "giftName" },
  ], true);

  assert.deepEqual(next, [
    { kind: "text", value: "主播开启了" },
    { kind: "text", value: "天选" },
    { kind: "text", value: "，" },
    { kind: "text", value: "奖品是" },
    { kind: "field", field: "giftName" },
    { kind: "text", value: "" },
  ]);
});

test("模板编辑器可移动任意片段并保留字段内容", () => {
  const segments = [
    { kind: "text", value: "感谢" },
    { kind: "field", field: "username" },
    { kind: "text", value: "赠送" },
  ];

  assert.deepEqual(moveTemplateSegment(segments, 1, 0), [
    { kind: "field", field: "username" },
    { kind: "text", value: "感谢" },
    { kind: "text", value: "赠送" },
  ]);
});
