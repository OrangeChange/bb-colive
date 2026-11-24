import test from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_SECTIONS,
  SETTINGS_WHEEL_THRESHOLD,
  consumeSectionWheel,
  isSectionNavigationTargetReached,
  resolveActiveSectionIndex,
} from "../src/components/settingsNavigation.ts";

test("分类导航未达到阈值时保留滚轮余量且不切换", () => {
  const result = consumeSectionWheel(1, 0, SETTINGS_WHEEL_THRESHOLD - 1, SETTINGS_SECTIONS.length);
  assert.deepEqual(result, { index: 1, remainder: SETTINGS_WHEEL_THRESHOLD - 1 });
});

test("正文在首尾时分类导航明确落到第一项和最后一项", () => {
  const offsets = [0, 120, 260, 500, 620];
  assert.equal(resolveActiveSectionIndex(offsets, 0, 500, 720), 0);
  assert.equal(resolveActiveSectionIndex(offsets, 220, 500, 720), 4);
});

test("正文位于中段时按经过顶部安全线的最后一个标题定位", () => {
  const offsets = [0, 120, 260, 500, 620];
  assert.equal(resolveActiveSectionIndex(offsets, 205, 500, 900, 16), 1);
  assert.equal(resolveActiveSectionIndex(offsets, 250, 500, 900, 16), 2);
});

test("平滑跳转未到达目标位置时保持目标分类", () => {
  assert.equal(isSectionNavigationTargetReached(500, 240), false);
  assert.equal(isSectionNavigationTargetReached(500, 498), true);
  assert.equal(isSectionNavigationTargetReached(500, 501), true);
});

test("分类导航持续滚动时可跨越多项并保留剩余位移", () => {
  const result = consumeSectionWheel(
    0,
    SETTINGS_WHEEL_THRESHOLD / 2,
    SETTINGS_WHEEL_THRESHOLD * 2,
    SETTINGS_SECTIONS.length,
  );
  assert.deepEqual(result, { index: 2, remainder: SETTINGS_WHEEL_THRESHOLD / 2 });
});

test("分类导航到首尾后停止且不保留越界方向余量", () => {
  const last = SETTINGS_SECTIONS.length - 1;
  assert.deepEqual(
    consumeSectionWheel(last - 1, 0, SETTINGS_WHEEL_THRESHOLD * 3, SETTINGS_SECTIONS.length),
    { index: last, remainder: 0 },
  );
  assert.deepEqual(
    consumeSectionWheel(1, 0, -SETTINGS_WHEEL_THRESHOLD * 3, SETTINGS_SECTIONS.length),
    { index: 0, remainder: 0 },
  );
});

test("分类导航反向滚动会先抵消原方向余量", () => {
  const result = consumeSectionWheel(
    2,
    SETTINGS_WHEEL_THRESHOLD * 0.75,
    -SETTINGS_WHEEL_THRESHOLD * 0.5,
    SETTINGS_SECTIONS.length,
  );
  assert.deepEqual(result, { index: 2, remainder: SETTINGS_WHEEL_THRESHOLD * 0.25 });
});
