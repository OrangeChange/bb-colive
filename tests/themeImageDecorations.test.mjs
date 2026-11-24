import test from "node:test";
import assert from "node:assert/strict";
import { renderThemeImageDecorations, resolveThemeImageDecorations, clearThemeImageDecorations } from "../src/themes/themeImageDecorations.ts";
test("装饰只作用于已选目标的可用伪元素，不改动定位宿主", () => {
  const css = renderThemeImageDecorations(
    {
      target: [
        {
          id: "one",
          source: "assets/a.png",
          width: 80,
          height: 40,
          slot: "before",
          visible: true,
          flow: false,
          alignment: [50, 50],
          anchor: [
            { value: 50, unit: "%" },
            { value: 50, unit: "%" },
          ],
          move: [
            { value: 20, unit: "px" },
            { value: 0, unit: "px" },
          ],
        },
      ],
    },
    () => ".event .username",
  );
  assert.match(css, /\.event \.username::before/);
  assert.match(css, /left: calc\(50% \+ 20px\)/);
  assert.match(css, /translate\(-50%, -50%\)/);
  assert.doesNotMatch(css, /position: relative/);
});

const decoration = (id, patch = {}) => ({
  id,
  source: `assets/${id}.png`,
  width: 80,
  height: 40,
  slot: "before",
  visible: true,
  flow: false,
  alignment: [50, 50],
  anchor: [
    { value: 50, unit: "%" },
    { value: 50, unit: "%" },
  ],
  move: [
    { value: 0, unit: "px" },
    { value: 0, unit: "px" },
  ],
  ...patch,
});
test("同层图片保留顺序、定位补偿和基准字号", () => {
  const css = renderThemeImageDecorations(
    {
      target: [
        decoration("front", {
          compensation: [12, 0],
          basis: { variable: "--event-base-size", value: 16 },
        }),
        decoration("back"),
      ],
    },
    () => ".event",
  );
  assert.equal((css.match(/::before/g) || []).length, 1);
  assert.ok(css.indexOf("front.png") < css.indexOf("back.png"));
  assert.match(css, /--event-base-size/);
  assert.match(css, /-1.75/);
});
test("头像框跟随头像容器，隐藏来源不留下伪元素", () => {
  const css = renderThemeImageDecorations(
    {
      "common|all|all|avatarFrame": [
        decoration("frame", { avatarRatio: { width: 1.2, height: 1.2 } }),
      ],
    },
    () => ".avatar-wrap",
  );
  assert.match(css, /width: 120%/);
  assert.match(css, /\.avatar-frame.*display: none/);
  const hidden = renderThemeImageDecorations(
    { "common|all|all|avatarFrame": [decoration("frame", { visible: false })] },
    () => ".avatar-wrap",
  );
  assert.doesNotMatch(hidden, /url\(/);
  assert.match(hidden, /content: none/);
  assert.match(hidden, /display: none/);
  assert.equal(
    renderThemeImageDecorations(
      { "common|all|all|avatarFrame": [] },
      () => ".avatar-wrap",
    ).trim(),
    "",
  );
});

test("装饰继承配色、身份和事件范围，空配置屏蔽继承后可恢复", () => {
  const parent = decoration("parent");
  const model = {"common|all|all|main|avatarFrame":[parent]};
  const key = "dark|chat|captain|main|avatarFrame";
  assert.deepEqual(resolveThemeImageDecorations(model,key),[parent]);
  model[key]=[];
  assert.deepEqual(resolveThemeImageDecorations(model,key),[]);
  const css=renderThemeImageDecorations(model,key=>key.startsWith("dark")?".dark .captain":".avatar");
  assert.match(css,/\.dark \.captain::before \{ content: none/);
  assert.deepEqual(resolveThemeImageDecorations(clearThemeImageDecorations(model,key),key),[parent]);
});
