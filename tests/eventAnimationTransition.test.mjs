import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("事件进入退出使用 transition 而不是事件 keyframes", () => {
  const css = readUiSource("src/App.css", "utf8");
  assert.match(css, /@starting-style/);
  assert.match(css, /transition-property:\s*opacity, transform/);
  assert.doesNotMatch(css, /@keyframes event-animation-/);
  assert.doesNotMatch(css, /display-window-event-removing[^}]+animation:/s);
});

test("减少动态效果时关闭位移和缩放", () => {
  const css = readUiSource("src/App.css", "utf8");
  assert.match(css, /prefers-reduced-motion:\s*reduce[\s\S]+transition-duration:\s*0ms/);
});
