import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolveFavoriteClickAction } from "../src/favoriteInteraction.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readFileSync(`${root}/${path}`, "utf8");

test("收藏设置关闭时，点击只切换收藏，长按仍可编辑", () => {
  assert.equal(resolveFavoriteClickAction(false, false), "favorite");
  assert.equal(resolveFavoriteClickAction(true, false), "unfavorite");
});

test("收藏设置开启时，只有新增收藏点击会先收藏再编辑", () => {
  assert.equal(resolveFavoriteClickAction(false, true), "favorite-and-edit");
  assert.equal(resolveFavoriteClickAction(true, true), "unfavorite");
});

test("收藏编辑开关是默认关闭且纳入全局设置持久化", () => {
  const general = read("src/generalSettings.ts");
  assert.match(general, /favoriteEditOnAdd:\s*boolean/);
  assert.match(general, /favoriteEditOnAdd:\s*false/);
  assert.match(general, /setFavoriteEditOnAdd/);
  assert.match(general, /partialize:[\s\S]*favoriteEditOnAdd/);
  assert.match(general, /favoriteEditOnAdd:\s*saved\.favoriteEditOnAdd === true/);
});

test("现场和回看事件菜单都接收收藏时编辑设置", () => {
  const app = readApplicationSources();
  const review = read("src/components/ReviewPanel.tsx");
  const timeline = read("src/components/ReviewSessionTimeline.tsx");
  const menu = read("src/components/EventContextMenu.tsx");
  assert.match(app, /favoriteEditOnAdd/);
  assert.match(app, /favoriteEditOnAdd,?/);
  assert.match(review, /favoriteEditOnAdd/);
  assert.match(timeline, /favoriteEditOnAdd/);
  assert.match(menu, /resolveFavoriteClickAction/);
  assert.match(menu, /favorite-and-edit/);
});
