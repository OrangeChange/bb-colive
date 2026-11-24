import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("正式版只允许事件和编辑控件使用文字交互", () => {
  const styles = read("src/App.css");
  const entry = read("src/main.tsx");

  assert.match(styles, /html,[\s\S]*?body,[\s\S]*?#root\s*\{[\s\S]*?user-select:\s*none[\s\S]*?caret-color:\s*transparent/);
  assert.match(styles, /\.event-row\s*\{[\s\S]*?user-select:\s*text[\s\S]*?cursor:\s*text/);
  assert.match(styles, /input,\s*textarea,\s*select,\s*\[contenteditable="true"\][\s\S]*?user-select:\s*text[\s\S]*?caret-color:\s*auto/);
  assert.match(entry, /installInteractionPolicy\(document\)/);
});
