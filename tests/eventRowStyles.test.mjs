import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createDefaultEventStyleSettings,
  hexToRgba,
  rgbaToHex,
  rgbaToCss,
} from "../src/eventStyleSettings.ts";
import {
  getEventStyleRole,
  getEventStyleType,
  resolveEventRowStyle,
} from "../src/eventRowStyles.ts";
import { MsgType } from "../src/protocol/types.ts";
import { createEventAreaConfigCss } from "../src/eventAreaStyleConfig.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const rowSource = readFileSync(`${root}/src/components/EventRow.tsx`, "utf8");
const listSource = readFileSync(`${root}/src/components/EventList.tsx`, "utf8");
const paneSource = readFileSync(`${root}/src/components/EventPane.tsx`, "utf8");
const partitionSource = readFileSync(`${root}/src/components/PartitionColumn.tsx`, "utf8");
const floatingSource = readFileSync(`${root}/src/windows/FloatingEventWindow.tsx`, "utf8");
const preferencesSource = readFileSync(`${root}/src/windows/eventWindowPreferences.ts`, "utf8");

test("横幅表情保留独立15B×1.25B上限，不跟随普通大表情尺寸", () => {
  const css = readFileSync(`${root}/src/eventStyle.css`, "utf8");
  const banner = css.match(/\.event \.banner-emote\s*\{([^}]+)\}/)?.[1];
  assert.ok(banner, "横幅必须有独立尺寸规则");
  assert.match(banner, /max-width:\s*min\(100%,\s*calc\(var\(--native-size\) \* 15\)\)\s*;/);
  assert.match(banner, /max-height:\s*calc\(var\(--native-size\) \* 1\.25\)\s*;/);
  assert.doesNotMatch(banner, /--big-emote-size/);
});

test("事件样式身份优先级默认大航海高于主播和房管并可配置", () => {
  assert.equal(getEventStyleRole({ isAnchor: true, isAdmin: true, guardLevel: 3 }), "viceroy");
  assert.equal(getEventStyleRole({ isAdmin: true, guardLevel: 3 }), "viceroy");
  assert.equal(getEventStyleRole({ isAnchor: true, isAdmin: true, guardLevel: 3 }, ["anchor", "admin", "viceroy", "admiral", "captain", "normal"]), "anchor");
  assert.equal(getEventStyleRole({ guardLevel: 1 }), "captain");
  assert.equal(getEventStyleRole({ guardLevel: 2 }), "admiral");
  assert.equal(getEventStyleRole({ guardLevel: 3 }), "viceroy");
  assert.equal(getEventStyleRole({ guardLevel: 0 }), "normal");
});

test("事件行样式解析身份颜色和非透明背景圆角", () => {
  const settings = createDefaultEventStyleSettings();
  settings.roles.admin.inheritFrom = null;
  settings.roles.admin.username = { r: 39, g: 174, b: 96, a: 1 };
  settings.roles.admin.background = { r: 39, g: 174, b: 96, a: 0.12 };
  const result = resolveEventRowStyle(settings, { isAdmin: true, guardLevel: 0 });
  assert.equal(result.usernameColor, "rgba(39, 174, 96, 1)");
  assert.equal(result.backgroundColor, "rgba(39, 174, 96, 0.12)");
  assert.equal(result.hasBackground, true);
  assert.equal(rgbaToCss({ r: 0, g: 0, b: 0, a: 0 }), "rgba(0, 0, 0, 0)");
});

test("事件行样式解析文字描边颜色", () => {
  const settings = createDefaultEventStyleSettings();
  settings.roles.normal.stroke = { r: 1, g: 2, b: 3, a: 0.8 };
  const result = resolveEventRowStyle(settings, { uid: "1", uname: "用户", guardLevel: 0 });
  assert.equal(result.strokeColor, "rgba(1, 2, 3, 0.8)");
});

test("事件类型颜色只覆盖正文和背景，不覆盖身份用户名颜色", () => {
  const settings = createDefaultEventStyleSettings();
  settings.roles.admin.inheritFrom = null;
  settings.roles.admin.username = { r: 10, g: 20, b: 30, a: 1 };
  settings.eventTypes.gift.content = { r: 40, g: 50, b: 60, a: 1 };
  settings.eventTypes.gift.background = { r: 70, g: 80, b: 90, a: 0.25 };
  const result = resolveEventRowStyle(settings, { isAdmin: true, guardLevel: 0 }, MsgType.Gift);
  assert.equal(result.usernameColor, "rgba(10, 20, 30, 1)");
  assert.equal(result.contentColor, "rgba(40, 50, 60, 1)");
  assert.equal(result.backgroundColor, "rgba(70, 80, 90, 0.25)");
  assert.equal(getEventStyleType(MsgType.Gift), "gift");
});

test("事件行按大航海等级读取对应的事件类型颜色", () => {
  const settings = createDefaultEventStyleSettings();
  settings.eventTypes.guardViceroy.content = { r: 240, g: 180, b: 60, a: 1 };
  const result = resolveEventRowStyle(settings, { guardLevel: 3 }, MsgType.GuardBuy);
  assert.equal(result.contentColor, "rgba(240, 180, 60, 1)");
});

test("事件行源码使用全局内边距和动画预设", () => {
  const css = createEventAreaConfigCss("padding", { settings: createDefaultEventStyleSettings(), layout: "live", fontSize: 16, bigEmoteSize: 40, padding: 10, spacing: 8 });
  assert.ok(css.includes("--event-config-padding-scale:0.625"));
  assert.match(rowSource, /eventAnimationPreset/);
  assert.match(rowSource, /event-animation-/);
});

test("事件类型正文颜色覆盖礼物和醒目消息的语义颜色", () => {
  assert.match(rowSource, /const semanticColor = evColor\(ev\);/);
  assert.match(rowSource, /const color = resolvedStyle\.contentColor \?\? semanticColor;/);
});

test("事件行将动画进入和退出持续时长下发为 CSS 变量", () => {
  assert.match(rowSource, /--event-animation-duration/);
  assert.match(rowSource, /--event-animation-exit-duration/);
});

test("颜色支持 HEX 与独立透明度互转", () => {
  assert.equal(rgbaToHex({ r: 15, g: 160, b: 255, a: 0.42 }), "#0FA0FF");
  assert.deepEqual(hexToRgba("#0FA0FF", 0.42), { r: 15, g: 160, b: 255, a: 0.42 });
  assert.deepEqual(hexToRgba("#0FA0FF80"), { r: 15, g: 160, b: 255, a: 128 / 255 });
  assert.equal(hexToRgba("not-a-color", 0.42), null);
});

test("事件行和三个事件列表入口传递全局样式与独立头像尺寸", () => {
  assert.match(rowSource, /eventStyleSettings\?: EventStyleSettings/);
  const settings = createDefaultEventStyleSettings(); settings.reviewAvatarSize = 32;
  assert.ok(createEventAreaConfigCss("review", { settings, layout: "review", fontSize: 13, bigEmoteSize: 40, padding: 6, spacing: 0 }).includes("--event-config-avatar-scale:2.2857142857142856"));
  assert.match(rowSource, /resolveEventRowStyle/);
  assert.match(listSource, /eventStyleSettings\?: EventStyleSettings/);
  assert.match(paneSource, /eventStyleSettings\?: EventStyleSettings/);
  assert.match(partitionSource, /eventStyleSettings\?: EventStyleSettings/);
  assert.match(floatingSource, /eventStyleSettings=\{windowPreferences\.eventStyleSettings\}/);
  assert.match(preferencesSource, /eventStyleSettings: EventStyleSettings/);
});
