import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createThemeColorDragInteraction } from "../src/components/themeColorInteraction.ts";

test("颜色拖动每帧只预览最后一个值并在结束时提交一次", () => {
  const previews = [];
  const commits = [];
  let queued;
  const interaction = createThemeColorDragInteraction({
    preview: value => previews.push(value),
    commit: value => commits.push(value),
    requestFrame: callback => { queued = callback; return 1; },
    cancelFrame: () => { queued = undefined; },
  });

  interaction.move("#111111");
  interaction.move("#222222");
  assert.deepEqual(previews, []);
  queued();
  assert.deepEqual(previews, ["#222222"]);
  interaction.end("#222222");
  assert.deepEqual(commits, ["#222222"]);
});

test("可视化颜色拖动使用临时预览，完成后才写入主题", () => {
  const field = fs.readFileSync("src/components/ThemeColorField.tsx", "utf8");
  const visual = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  const editor = fs.readFileSync("src/components/NativeThemeEditor.tsx", "utf8");
  assert.match(field, /onPreviewChange/);
  assert.match(field, /createThemeColorDragInteraction/);
  assert.match(visual, /onPreviewChange/);
  assert.match(editor, /transientSettings/);
});

test('取消拖色后松手不会提交上一个值',()=>{
 const commits=[];const drag=createThemeColorDragInteraction({preview:()=>{},commit:v=>commits.push(v),requestFrame:()=>1,cancelFrame:()=>{}});
 drag.move('#f00');drag.cancel();drag.end();assert.deepEqual(commits,[]);
});
