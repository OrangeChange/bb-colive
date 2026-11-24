import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SCENE_SETTINGS,
  createDefaultSceneSettings,
  loadSceneSettings,
  saveSceneSettings,
} from "../src/components/sceneSettings.ts";

test("每次创建的现场默认设置都拥有独立的嵌套状态", () => {
  const first = createDefaultSceneSettings();
  const second = createDefaultSceneSettings();

  first.filters.left.interactKinds.like = false;
  first.leftBoundaries[0] = 0.4;
  first.rightBoundaries[0] = 0.2;

  assert.equal(second.filters.left.interactKinds.like, true);
  assert.deepEqual(second.leftBoundaries, [0.75]);
  assert.deepEqual(second.rightBoundaries, [1 / 3, 2 / 3]);
});

function storage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}

test("页面设置保存后可以恢复布局、筛选和阈值", () => {
  const local = storage();
  const settings = {
    ...DEFAULT_SCENE_SETTINGS,
    layoutMode: "partition",
    giftThreshold: 5,
    leftRatio: 0.62,
    filters: {
      ...DEFAULT_SCENE_SETTINGS.filters,
      left: {
        ...DEFAULT_SCENE_SETTINGS.filters.left,
        interact: false,
        interactKinds: { ...DEFAULT_SCENE_SETTINGS.filters.left.interactKinds, like: false },
      },
    },
  };

  saveSceneSettings(settings, local);
  const restored = loadSceneSettings(local);

  assert.equal(restored.layoutMode, "partition");
  assert.equal(restored.giftThreshold, 5);
  assert.equal(restored.leftRatio, 0.62);
  assert.equal(restored.filters.left.interact, false);
  assert.equal(restored.filters.left.interactKinds.like, false);
});

test("礼物阈值判断方式默认按单件并可持久化为累计金额", () => {
  const local = storage();
  const settings = {
    ...DEFAULT_SCENE_SETTINGS,
    giftThreshold: 5,
    giftThresholdMode: "cumulative",
  };

  saveSceneSettings(settings, local);
  const restored = loadSceneSettings(local);

  assert.equal(createDefaultSceneSettings().giftThresholdMode, "unit");
  assert.equal(restored.giftThresholdMode, "cumulative");
});

test("页面设置损坏或缺字段时回退默认值并补齐新增筛选项", () => {
  const local = storage();
  local.setItem("bb-colive.scene-settings.v1", JSON.stringify({ layoutMode: "wrong", filters: { left: { danmu: false } } }));

  const restored = loadSceneSettings(local);

  assert.equal(restored.layoutMode, "dual");
  assert.equal(restored.filters.left.danmu, false);
  assert.equal(restored.filters.left.interactKinds.like, true);
  assert.equal(restored.filters.right.giftKinds.free, true);
  assert.equal(restored.giftThreshold, 0.1);
  assert.equal(restored.giftThresholdMode, "unit");
});
