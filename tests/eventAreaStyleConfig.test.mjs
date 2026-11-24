import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createDefaultEventStyleSettings } from "../src/eventStyleSettings.ts";
import { createEventAreaConfigCss } from "../src/eventAreaStyleConfig.ts";

test("固定区使用紧凑配置且不改变普通列表配置", () => {
  const css = createEventAreaConfigCss("compact", { settings: createDefaultEventStyleSettings(), layout: "window", fontSize: 16, bigEmoteSize: 40, padding: 6, spacing: 0 });
  const rule = css.split("\n").find(line => line.startsWith('[data-event-style-scope="compact"].sticky-area{'));
  assert.ok(rule, "固定区应有独立密度映射");
  assert.ok(!rule.includes("--avatar-size:"));
  assert.ok(rule.includes("--event-config-spacing-scale:0.25;"));
  assert.ok(!rule.includes("--event-padding:"));
  assert.ok(!rule.includes("--event-gap:"));
  assert.ok(css.includes("--event-config-avatar-scale:1.5;"));
  assert.ok(css.includes("--event-config-padding-scale:0.375;"));
});

test("区域配置保留角色用户名、类型正文和透明背景，父层公开变量不被行覆盖", () => {
  const settings = createDefaultEventStyleSettings();
  settings.roles.admin.username = { r: 1, g: 2, b: 3, a: 1 };
  settings.roles.admin.content = { r: 4, g: 5, b: 6, a: 1 };
  settings.roles.admin.background = { r: 7, g: 8, b: 9, a: 1 };
  settings.eventTypes.gift.content = { r: 10, g: 11, b: 12, a: 1 };
  settings.eventTypes.gift.background = { r: 0, g: 0, b: 0, a: 0 };
  const css = createEventAreaConfigCss("area-a", { settings, layout: "live", fontSize: 18, bigEmoteSize: 40, padding: 6, spacing: 0 });
  const rule = css.split("\n").find(line => line.includes('[data-event-role="admin"][data-event-style-type="gift"]'));
  assert.ok(rule, "角色与类型的实际消费fallback必须存在");
  assert.ok(rule.includes("--resolved-username-color:rgba(1, 2, 3, 1)"));
  assert.ok(rule.includes("--resolved-message-color:rgba(10, 11, 12, 1)"));
  assert.ok(rule.includes("--event-config-background:transparent"));
  assert.ok(!rule.includes("--username-color:"));
  assert.ok(!rule.includes("--message-color:"));
  assert.ok(css.includes("--event-font-size:18px"));
  assert.ok(css.includes("--event-config-spacing-scale:0"));
  assert.equal(css.split("\n").filter(line => line.includes("data-event-role=")).length, 60);
});

test("配置仅绑定实例，回看头像与行高不沿用现场设置", () => {
  const settings = createDefaultEventStyleSettings(); settings.reviewAvatarSize = 32;
  const css = createEventAreaConfigCss("area-b", { settings, layout: "review", fontSize: 13, bigEmoteSize: 60, padding: 4, spacing: 8 });
  assert.ok(css.includes('[data-event-style-scope="area-b"]'));
  assert.ok(!css.includes("area-a"));
  assert.ok(css.includes("--event-config-avatar-scale:2.2857142857142856"));
  assert.ok(!css.includes("--resolved-event-line-height:"));
  assert.ok(!css.includes("--big-emote-size:"));
});

test("实时区域大表情默认随基准字号等比缩放且不读取旧宽度", () => {
  const css = createEventAreaConfigCss("big", { settings: createDefaultEventStyleSettings(), layout: "live", fontSize: 24, bigEmoteSize: 77, padding: 6, spacing: 0 });
  assert.ok(!css.includes("--big-emote-size:"));
  assert.ok(!css.includes("--big-emote-size:77px"));
  const themeCss = readFileSync(new URL("../src/eventStyle.css", import.meta.url), "utf8");
  const largeEmote = themeCss.match(/\.event \.big-emote\s*\{([^}]+)\}/)?.[1];
  assert.ok(largeEmote.includes("var(--big-emote-size, calc(var(--event-font-size, 16px) * 40 / 16))"));
});

test("生命周期默认淡底保留，角色底色可设置，类型显式透明清除角色背景", () => {
  const settings = createDefaultEventStyleSettings();
  const rule = () => createEventAreaConfigCss("lifecycle", { settings, layout: "live", fontSize: 16, bigEmoteSize: 40, padding: 6, spacing: 0 }).split("\n").find(line => line.includes('[data-event-role="normal"][data-event-style-type="system"]'));
  assert.ok(rule().includes("--event-config-background:initial;"), "默认不能遮住生命周期局部淡底");
  settings.roles.normal.background = { r: 40, g: 80, b: 120, a: .25 };
  assert.ok(rule().includes("--event-config-background:rgba(40, 80, 120, 0.25);"));
  settings.eventTypes.system.background = { r: 0, g: 0, b: 0, a: 0 };
  assert.ok(rule().includes("--event-config-background:transparent;"), "显式透明不能退回角色底色或生命周期淡底");
});

test("实时主礼物图与盲盒来源图分别继承基准字号",()=>{
 const css=createEventAreaConfigCss("media",{settings:createDefaultEventStyleSettings(),layout:"live",fontSize:24,padding:6,spacing:0});
 const common=css.split("\n")[1];
 assert.ok(!common.includes("--gift-icon-size:"),"主礼物尺寸由主题默认值提供");
 assert.ok(!common.includes("--price-font-size:"));
 assert.ok(!common.includes("--count-font-size:"));
 assert.ok(!common.includes("--blind-gift-icon-size:"));
 const themeCss = readFileSync(new URL("../src/eventStyle.css", import.meta.url), "utf8");
 const blindIcon = themeCss.match(/\.event \.blind-gift-icon\s*\{([^}]+)\}/)?.[1];
 assert.ok(blindIcon.includes("var(--blind-gift-icon-size, calc(var(--event-font-size, 16px) * 20 / 16))"));
});

test("原生 MiSans 默认仅使用同系列字库，回看保持原字体栈", () => {
  const settings = createDefaultEventStyleSettings();
  const input = { settings, fontSize: 16, padding: 8, spacing: 0 };
  const live = createEventAreaConfigCss("native-font", { ...input, layout: "live" });
  const review = createEventAreaConfigCss("archive-font", { ...input, layout: "review" });
  assert.ok(live.includes('--event-font-family:"MiSans", "MiSans TC", "MiSans L3";'));
  assert.ok(!live.includes('Microsoft YaHei'));
  assert.ok(review.includes('Microsoft YaHei'));
});
