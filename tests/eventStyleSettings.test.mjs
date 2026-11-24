import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  EVENT_STYLE_TYPES,
  DEFAULT_EVENT_STYLE_SETTINGS,
  DEFAULT_EVENT_FONT_FAMILY,
  eventFontFamilyCss,
  hslaToRgba,
  normalizeEventStyleSettings,
  rgbaToHsla,
  resolveInheritedRoleStyle,
} from "../src/eventStyleSettings.ts";
import { MsgType } from "../src/protocol/types.ts";

test("RGBA 与 HSLA 往返转换保留颜色和透明度", () => {
  const source = { r: 231, g: 76, b: 125, a: 0.6 };
  const roundTrip = hslaToRgba(rgbaToHsla(source));
  assert.ok(Math.abs(roundTrip.r - source.r) <= 1);
  assert.ok(Math.abs(roundTrip.g - source.g) <= 1);
  assert.ok(Math.abs(roundTrip.b - source.b) <= 1);
  assert.equal(roundTrip.a, source.a);
});

test("RGBA 转 HSLA 为调色器保留小数定位精度", () => {
  const hsla = rgbaToHsla({ r: 123, g: 45, b: 67, a: 0.5 });
  assert.ok([hsla.h, hsla.s, hsla.l].some((value) => !Number.isInteger(value)));
});

test("身份样式默认独立，显式跟随后才读取父级最新值", () => {
  const settings = structuredClone(DEFAULT_EVENT_STYLE_SETTINGS);
  settings.roles.normal.username = { r: 12, g: 34, b: 56, a: 1 };
  assert.equal(settings.roles.captain.inheritFrom, null);
  assert.notDeepEqual(resolveInheritedRoleStyle(settings, "captain").username, settings.roles.normal.username);
  settings.roles.captain.inheritFrom = "normal";
  assert.deepEqual(resolveInheritedRoleStyle(settings, "captain"), settings.roles.normal);
});

test("三档大航海身份只有显式建立后才使用继承链", () => {
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.roles.captain.inheritFrom, null);
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.roles.admiral.inheritFrom, null);
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.roles.viceroy.inheritFrom, null);

  const settings = structuredClone(DEFAULT_EVENT_STYLE_SETTINGS);
  settings.roles.captain.username = { r: 12, g: 34, b: 56, a: 1 };
  settings.roles.captain.inheritFrom = null;
  settings.roles.admiral.inheritFrom = "captain";
  settings.roles.viceroy.inheritFrom = "captain";
  assert.deepEqual(resolveInheritedRoleStyle(settings, "admiral"), settings.roles.captain);
  assert.deepEqual(resolveInheritedRoleStyle(settings, "viceroy"), settings.roles.captain);
});

test("旧版自动继承设置加载后不会继续联动", () => {
  const result = normalizeEventStyleSettings({
    roles: {
      captain: { inheritFrom: "normal" },
      admiral: { inheritFrom: "captain" },
      viceroy: { inheritFrom: "captain" },
      admin: { inheritFrom: "normal" },
      anchor: { inheritFrom: "normal" },
    },
  });
  assert.equal(result.roles.captain.inheritFrom, null);
  assert.equal(result.roles.admiral.inheritFrom, null);
  assert.equal(result.roles.viceroy.inheritFrom, null);
  assert.equal(result.roles.admin.inheritFrom, null);
  assert.equal(result.roles.anchor.inheritFrom, null);
});

test("全局事件样式提供内置字体和文字描边设置", () => {
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.fontFamily, DEFAULT_EVENT_FONT_FAMILY);
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.textStroke.enabled, false);
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.textStroke.width, 1);
  const result = normalizeEventStyleSettings({
    fontFamily: "Segoe UI",
    textStroke: { enabled: true, width: 99 },
  });
  assert.equal(result.fontFamily, "Segoe UI");
  assert.equal(result.textStroke.enabled, true);
  assert.equal(result.textStroke.width, 2);
  assert.equal(
    eventFontFamilyCss("Segoe UI"),
    '"Segoe UI", "MiSans", "MiSans TC", "MiSans L3", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  );
  assert.equal(
    eventFontFamilyCss("MiSans"),
    '"MiSans", "MiSans TC", "MiSans L3", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif',
  );
});

test("完整字体资源覆盖中日韩与免费价格文字", () => {
  const css = readUiSource(path.resolve("src/App.css"), "utf8");
  const requiredAssets = [
    "MiSans-Regular.woff2",
    "MiSans-Medium.woff2",
    "MiSans-Semibold.woff2",
    "MiSans-TC-Regular.woff2",
    "MiSans-TC-Medium.woff2",
    "MiSans-TC-Semibold.woff2",
    "MiSans-L3.otf",
  ];
  for (const asset of requiredAssets) {
    const assetPath = path.resolve("src/assets/fonts", asset);
    assert.ok(fs.existsSync(assetPath), `缺少字体资源 ${asset}`);
    assert.ok(fs.statSync(assetPath).size > 100_000, `字体资源过小 ${asset}`);
  }
  assert.match(css, /font-family:\s*"MiSans TC"/);
  assert.match(css, /font-family:\s*"MiSans L3"/);
  assert.match(css, /--font-mono:\s*var\(--font-ui\)/);
});

test("样式状态非法值归一化到默认值和允许范围", () => {
  const result = normalizeEventStyleSettings({ avatarSize: 999, fontWeight: 999, roles: null });
  assert.equal(result.avatarSize, 40);
  assert.equal(result.fontWeight, 500);
  assert.equal(result.roles.normal.background.a, 0);
});

test("事件样式支持按事件类型覆盖正文和背景颜色", () => {
  assert.deepEqual(EVENT_STYLE_TYPES, ["danmu", "interact", "gift", "redPocket", "lottery", "superChat", "guardCaptain", "guardAdmiral", "guardViceroy", "system"]);
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.eventTypes.gift.content, null);
  assert.equal(DEFAULT_EVENT_STYLE_SETTINGS.eventTypes.gift.background, null);
  const result = normalizeEventStyleSettings({
    eventTypes: {
      gift: {
        content: { r: 1, g: 2, b: 3, a: 0.8 },
        background: { r: 4, g: 5, b: 6, a: 0.2 },
      },
    },
  });
  assert.deepEqual(result.eventTypes.gift.content, { r: 1, g: 2, b: 3, a: 0.8 });
  assert.deepEqual(result.eventTypes.gift.background, { r: 4, g: 5, b: 6, a: 0.2 });
  assert.equal(result.eventTypes.system.content, null);
});

test("旧版通用大航海事件颜色迁移到舰长，三档颜色独立保存", () => {
  const result = normalizeEventStyleSettings({
    eventTypes: {
      guard: {
        content: { r: 1, g: 2, b: 3, a: 1 },
        background: { r: 4, g: 5, b: 6, a: 0.2 },
      },
      guardAdmiral: { content: { r: 7, g: 8, b: 9, a: 1 } },
    },
  });
  assert.deepEqual(result.eventTypes.guardCaptain.content, { r: 1, g: 2, b: 3, a: 1 });
  assert.deepEqual(result.eventTypes.guardCaptain.background, { r: 4, g: 5, b: 6, a: 0.2 });
  assert.deepEqual(result.eventTypes.guardAdmiral.content, { r: 7, g: 8, b: 9, a: 1 });
  assert.equal(result.eventTypes.guardViceroy.content, null);
  assert.equal(result.eventTypes.guard, undefined);
});

test("消息类型映射到事件个性化类型", async () => {
  const { getEventStyleType } = await import("../src/eventStyleSettings.ts");
  assert.equal(getEventStyleType(MsgType.Danmu), "danmu");
  assert.equal(getEventStyleType(MsgType.Gift), "gift");
  assert.equal(getEventStyleType(MsgType.GuardBuy, 1), "guardCaptain");
  assert.equal(getEventStyleType(MsgType.GuardBuy, 2), "guardAdmiral");
  assert.equal(getEventStyleType(MsgType.GuardBuy, 3), "guardViceroy");
  assert.equal(getEventStyleType(MsgType.GuardHonor, 3), "guardViceroy");
  assert.equal(getEventStyleType(MsgType.AnchorLotAward), "lottery");
  assert.equal(getEventStyleType(MsgType.RedPocketWinner), "redPocket");
  assert.equal(getEventStyleType(MsgType.Warning), "system");
});
