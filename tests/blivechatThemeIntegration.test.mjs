import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import postcss from "postcss";
import { MsgType } from "../src/protocol/eventTypeCodes.ts";

let vite;
let BlivechatEvent;
let BLIVECHAT_CAPABILITY;
let createBlivechatBaseCss;
let createBlivechatThemeRuntime;
let BLIVECHAT_SOURCE;
let BLIVECHAT_SOURCE_CSS;
let projectBlivechatEvent;
let getCompatibleThemeEditingSurface;
let createCompatibleThemeModeAdapter;
let registerCompatibleEventRenderProvider;
let installCompatibleEventRenderResolver;
let resolveCompatibleEventRender;
let scopeBlivechatCss;
let buildBlivechatObsSnapshot;
let subscribeCompatibleEventRenderChange;
let compatibleSelectorFor;
let resolveCompatibleCodeDefault;
let composeBlivechatThemeCss;
let createBlivechatAuxiliaryDisplayCss;
let StickyEventCard;
let DEFAULT_EVENT_DISPLAY_PREFERENCES;
let createDefaultEventStyleSettings;
let NativeObsContent;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-blivechatThemeIntegration.test.mjs", configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, optimizeDeps: {include:[], noDiscovery: true }, appType: "custom", logLevel: "silent" });
  ({ BlivechatEvent, BLIVECHAT_CAPABILITY, createBlivechatBaseCss, createBlivechatThemeRuntime, createBlivechatAuxiliaryDisplayCss, BLIVECHAT_SOURCE, BLIVECHAT_SOURCE_CSS, projectBlivechatEvent, scopeBlivechatCss, buildBlivechatObsSnapshot, composeBlivechatThemeCss } = await vite.ssrLoadModule("/src/compat/blivechat/index.tsx"));
  await vite.ssrLoadModule("/src/compat/blivechat/register.tsx");
  ({ getCompatibleThemeEditingSurface } = await vite.ssrLoadModule("/src/components/CompatibleThemePreview.tsx"));
  ({ createCompatibleThemeModeAdapter } = await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"));
  ({ compatibleSelectorFor } = await vite.ssrLoadModule("/src/themes/compatManagedCss.ts"));
  ({ resolveCompatibleCodeDefault } = await vite.ssrLoadModule("/src/themes/compatThemeCapabilities.ts"));
  ({ StickyEventCard } = await vite.ssrLoadModule("/src/components/StickyEventCard.tsx"));
  ({ DEFAULT_EVENT_DISPLAY_PREFERENCES } = await vite.ssrLoadModule("/src/eventDisplaySettings.ts"));
  ({ createDefaultEventStyleSettings } = await vite.ssrLoadModule("/src/eventStyleSettings.ts"));
  ({ NativeObsContent } = await vite.ssrLoadModule("/src/obs/NativeObsRenderer.tsx"));
  ({ registerCompatibleEventRenderProvider, installCompatibleEventRenderResolver, resolveCompatibleEventRender, subscribeCompatibleEventRenderChange } = await vite.ssrLoadModule("/src/compat/CompatibleEventRenderer.tsx"));
});
after(async () => { await vite?.close(); });

const roomId = 42;
const user = { uid: "7", uname: "测试用户", avatar: "https://example.test/avatar.png", guardLevel: 1 };
const event = (msgType, extra = {}) => ({ id: `event-${msgType}`, msgType, roomId, ts: 1_700_000_000_000, user, ...extra });
const scope = { roomId, generation: 3 };

test("BLC 原版只接收真实组件支持的事件，SC 与大航海独立于礼物", () => {
  const accepted = [
    event(MsgType.Danmu, { text: "普通弹幕" }),
    event(MsgType.Danmu, { text: "大表情", emoticon: { url: "https://example.test/large.webp", width: 162, height: 162 } }),
    event(MsgType.Gift, { gift: { id: 1, name: "免费礼物", count: 1, price: 0, total: 100, coinType: "silver", isFree: true } }),
    event(MsgType.Gift, { gift: { id: 2, name: "付费礼物", count: 2, price: 1000, total: 2000, coinType: "gold", totalRmb: 2 } }),
    event(MsgType.Gift, { gift: { id: 3, name: "盲盒开出物", count: 1, price: 5000, total: 5000, coinType: "gold", blindGiftName: "幸运盲盒", blindPriceRmb: 10, blindHitPriceRmb: 5 } }),
    event(MsgType.SuperChat, { sc: { price: 30, message: "醒目留言", duration: 60 } }),
    event(MsgType.GuardBuy, { guard: { level: 1, count: 1, unit: "月", action: "开通", priceRmb: 198 } }),
  ];
  const projected = accepted.map((value, index) => projectBlivechatEvent(value, scope, index + 1, 1000));
  assert.deepEqual(projected.map(value => value?.kind), ["text", "text", "gift", "gift", undefined, "superchat", "membership"]);
  for (const unsupported of [MsgType.Interact, MsgType.RedPocketStart, MsgType.RedPocketWinner, MsgType.AnchorLotStart, MsgType.AnchorLotAward, MsgType.RedPocketGift]) {
    assert.equal(projectBlivechatEvent(event(unsupported), scope, 1, 1000), null);
  }
  assert.equal(projected[5]?.kind, "superchat");
  assert.equal(projected[6]?.kind, "membership");
});

test("普通、小表情和大表情进入原版 TextMessage DOM", () => {
  const normal = event(MsgType.Danmu, {
    text: "你好[热]",
    emotes: { "[热]": { url: "https://example.test/small.webp", width: 20, height: 20 } },
  });
  const html = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: normal, placement: "main", showGiftName: false }));
  assert.match(html, /<yt-live-chat-text-message-renderer/);
  assert.match(html, /<yt-live-chat-author-chip/);
  assert.match(html, /id="author-photo"/);
  assert.match(html, /<yt-img-shadow[^>]*loaded/);
  assert.match(html, /<img id="img"[^>]*class="style-scope yt-img-shadow"/);
  assert.doesNotMatch(html, /id="author-photo"[^>]*style="[^"]*(?:width|height)/);
  assert.match(html, /id="message"/);
  assert.match(html, /class="emoji yt-formatted-string/);
  assert.doesNotMatch(html, /blc-large-emoji/);

  const large = renderToStaticMarkup(React.createElement(BlivechatEvent, {
    event: event(MsgType.Danmu, { text: "大表情", emoticon: { url: "https://example.test/large.webp", width: 162, height: 162 } }),
    placement: "main",
    showGiftName: false,
  }));
  assert.match(large, /class="emoji [^"]*blc-large-emoji/);
});

test("房管与大航海身份使用来源 AuthorBadge 的 image、SVG 和图片关系", () => {
  const moderator = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: event(MsgType.Danmu, { user: { ...user, isAdmin: true }, text: "房管" }), placement: "main" }));
  assert.match(moderator, /<yt-live-chat-author-badge-renderer[^>]*type="moderator"/);
  assert.match(moderator, /<div id="image"/);
  assert.match(moderator, /<yt-icon/);
  assert.match(moderator, /<svg[^>]*viewBox="0 0 16 16"/);
  assert.match(moderator, /<path[^>]*d="M9\.64589146/);
  const member = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: event(MsgType.Danmu, { text: "舰长" }), placement: "main" }));
  assert.match(member, /<div id="image"/);
  assert.match(member, /guard-level-3\.png/);
  for (const level of [1, 2, 3]) {
    assert.equal(existsSync(resolvePath(fileURLToPath(new URL("..", import.meta.url)), `public/static/img/icons/guard-level-${level}.png`)), true);
  }
});

test("礼物、SC、大航海和置顶使用原版付费、会员与 ticker 组件关系", () => {
  const gift = event(MsgType.Gift, { gift: { id: 2, name: "礼物", count: 2, price: 1000, total: 2000, coinType: "gold", totalRmb: 2 } });
  const main = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: gift, placement: "main", showGiftName: false }));
  assert.match(main, /<yt-live-chat-paid-message-renderer/);
  assert.match(main, /id="purchase-amount"/);
  assert.doesNotMatch(main, /送出 礼物 ×2/);
  const withDescription = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: gift, placement: "main", showGiftName: true }));
  assert.match(withDescription, /送出 礼物 ×2/);
  const sticky = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: gift, placement: "sticky", showGiftName: true }));
  assert.match(sticky, /<yt-live-chat-ticker-renderer/);
  assert.match(sticky, /<yt-live-chat-ticker-paid-message-item-renderer/);
  assert.match(sticky, /aria-expanded="false"/);
  assert.doesNotMatch(sticky, /data-blc-detail/);
  assert.doesNotMatch(sticky, /送出 礼物 ×2/);

  const sc = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: event(MsgType.SuperChat, { sc: { price: 30, message: "SC", duration: 60 } }), placement: "main" }));
  assert.match(sc, /blc-price-level="2"/);
  assert.match(sc, /--yt-live-chat-paid-message-primary-color/);

  const blind = renderToStaticMarkup(React.createElement(BlivechatEvent, {
    event: event(MsgType.Gift, { gift: { id: 3, name: "开出物", count: 2, price: 2500, total: 5000, coinType: "gold", totalRmb: 5, blindGiftName: "幸运盲盒", blindPriceRmb: 10, blindHitPriceRmb: 2.5 } }),
    placement: "main",
    showGiftName: true,
  }));
  assert.equal(blind, "");
});

test("软件置顶动画宿主同时包裹兼容 ticker", () => {
  const stickyEvent = event(MsgType.SuperChat, { sc: { price: 30, message: "SC", duration: 60 } });
  const compatible = () => React.createElement("yt-live-chat-ticker-renderer", { "data-test-ticker": true });
  compatible.rootProps = { scopeId: "windows:windows" };
  const html = renderToStaticMarkup(React.createElement(StickyEventCard, {
    card: { key: stickyEvent.id, event: stickyEvent, amount: 30, expiresAt: 5000 },
    now: 1000,
    display: DEFAULT_EVENT_DISPLAY_PREFERENCES,
    eventStyleSettings: createDefaultEventStyleSettings(),
    compatibleEventRender: compatible,
  }));
  assert.match(html, /data-sticky-motion-host[^>]*>[\s\S]*data-test-ticker/);
});

test("BLC 头像框编辑复用头像节点，不伪造粉丝牌、荣耀或排名", () => {
  for (const key of ["username", "message", "avatar", "smallEmote", "largeEmote", "amount", "timestamp", "identity", "event", "paidCard", "membership", "ticker"]) {
    assert.ok(BLIVECHAT_CAPABILITY.parts[key], key);
  }
  assert.equal(BLIVECHAT_CAPABILITY.parts.avatarFrame.selector, "#author-photo");
  for (const absent of ["fanMedal", "honor", "rank"]) assert.equal(BLIVECHAT_CAPABILITY.parts[absent], undefined);
});

test("事件和身份限定逐选择器分支组合，不会让礼物规则影响 SC 或其他事件", () => {
  const giftAmount = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|amount", "common");
  const branches = postcss.list.comma(giftAmount);
  assert.ok(branches.length > 0);
  assert.ok(branches.every(branch => /data-blc-kind='gift'|data-blc-gift-kind='(?:normal|blind)'/.test(branch) && branch.includes("#purchase-amount")));
  assert.ok(branches.every(branch => !branch.includes("data-blc-kind='superchat'")));
  const captainMessage = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "danmaku|captain|main|message", "common");
  assert.ok(postcss.list.comma(captainMessage).every(branch => branch.includes("yt-live-chat-text-message-renderer") && branch.includes("blc-guard-level='3'") && branch.endsWith("#message")));
  const giftUser = postcss.list.comma(compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|username", "common"));
  assert.ok(giftUser.every(branch => !/paid-message-renderer[^,]*paid-message-renderer/.test(branch)));
  const giftCard = postcss.list.comma(compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|paidCard", "common"));
  assert.ok(giftCard.every(branch => !/#card\s+#card/.test(branch)));
  assert.equal(BLIVECHAT_CAPABILITY.parts.membership.events.includes("gift"), false);
  assert.equal(BLIVECHAT_CAPABILITY.parts.ticker.placements.includes("main"), false);
});

test("主区与置顶栏使用独立模型键和真实 ticker 选择器", () => {
  const main = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|amount", "common");
  const sticky = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|sticky|amount", "common");
  const ticker = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|sticky|ticker", "common");
  assert.match(main, /paid-message-renderer/);
  assert.match(main, /#purchase-amount/);
  assert.doesNotMatch(main, /ticker-renderer/);
  assert.match(sticky, /yt-live-chat-ticker-paid-message-item-renderer/);
  assert.match(sticky, /data-blc-placement='sticky'/);
  assert.match(sticky, /#text/);
  assert.doesNotMatch(sticky, /#purchase-amount/);
  assert.doesNotMatch(ticker, /yt-live-chat-ticker-renderer[^,}]*yt-live-chat-ticker-renderer/);
});

test("来源实际默认值按事件、区域、部件和属性解析", () => {
  const giftMessage = BLIVECHAT_CAPABILITY.parts.message;
  const avatar = BLIVECHAT_CAPABILITY.parts.avatar;
  assert.equal(resolveCompatibleCodeDefault(giftMessage, "gift-normal", "main", "color"), "#000000");
  assert.equal(resolveCompatibleCodeDefault(giftMessage, "gift-normal", "main", "lineHeight"), "normal");
  assert.equal(resolveCompatibleCodeDefault(avatar, "gift", "main", "marginX"), 16);
  assert.equal(resolveCompatibleCodeDefault(avatar, "gift", "sticky", "marginX"), -4);
  assert.match(BLIVECHAT_CAPABILITY.eventSelectorsByPlacement.main["gift-normal"], /data-blc-gift-kind='normal'/);
  assert.equal(BLIVECHAT_CAPABILITY.parts.paidCard.codeDefaults.background, undefined);
  assert.equal(resolveCompatibleCodeDefault(BLIVECHAT_CAPABILITY.parts.paidCard, "gift", "main", "background"), "rgba(30,136,229,1)");
});

test("G/F 等于一时不覆盖来源 author-chip margin 与 ticker 外层 padding", () => {
  const css = createBlivechatBaseCss({ globalScale: 1, fontScale: 1, showGiftName: false });
  assert.doesNotMatch(css, /:where\(yt-live-chat-author-chip\)/);
  assert.doesNotMatch(css, /:where\(yt-live-chat-ticker-renderer > #container\)/);
  const scaled = createBlivechatBaseCss({ globalScale: 1.2, fontScale: 1, showGiftName: false });
  assert.match(scaled, /yt-live-chat-text-message-renderer yt-live-chat-author-chip/);
  assert.doesNotMatch(scaled, /yt-live-chat-membership-item-renderer yt-live-chat-author-chip/);
  assert.match(scaled, /yt-live-chat-ticker-renderer #items/);
  assert.doesNotMatch(scaled, /:where\(yt-live-chat-ticker-renderer > #container\)/);
});

test("普通礼物保留分支标记，盲盒不渲染", () => {
  const normal = renderToStaticMarkup(React.createElement(BlivechatEvent, {
    event: event(MsgType.Gift, { gift: { id: 1, name: "免费礼物", count: 1, price: 0, total: 0, coinType: "silver", isFree: true } }),
    placement: "main", showGiftName: true,
  }));
  const blind = renderToStaticMarkup(React.createElement(BlivechatEvent, {
    event: event(MsgType.Gift, { gift: { id: 2, name: "开出物", count: 1, price: 5000, total: 5000, coinType: "gold", blindGiftName: "盲盒", blindPriceRmb: 10, blindHitPriceRmb: 5 } }),
    placement: "main", showGiftName: true,
  }));
  assert.match(normal, /data-blc-gift-kind="normal"/);
  assert.equal(blind, "");
});

test("编辑预览根使用与正式辅助目标相同的时间显示变量", () => {
  const surface = getCompatibleThemeEditingSurface("blivechat");
  const theme = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
  theme.settings = { ...theme.settings, showTimestamp: true };
  const shown = renderToStaticMarkup(surface.renderer({ document: theme, thumbnail: false }));
  assert.match(shown, /data-source-sample="source-simulation"/);
  assert.match(createBlivechatAuxiliaryDisplayCss(theme.settings), /#timestamp\) \{ display: inline/);
  theme.settings = { ...theme.settings, showTimestamp: false };
  const hidden = renderToStaticMarkup(surface.renderer({ document: theme, thumbnail: false }));
  assert.match(hidden, /data-source-sample="source-simulation"/);
  assert.doesNotMatch(createBlivechatAuxiliaryDisplayCss(theme.settings), /#timestamp\) \{ display: inline/);
});

test("来源实际默认按事件、区域和 G/F 派生", () => {
  const settings = { globalScale: 1.5, fontScale: 2 };
  assert.equal(resolveCompatibleCodeDefault(BLIVECHAT_CAPABILITY.parts.message, "gift", "main", "fontSize", settings), 45);
  assert.equal(resolveCompatibleCodeDefault(BLIVECHAT_CAPABILITY.parts.avatar, "gift", "main", "width", settings), 60);
  assert.equal(resolveCompatibleCodeDefault(BLIVECHAT_CAPABILITY.parts.avatar, "gift", "main", "borderRadius", settings), "50%");
  assert.equal(resolveCompatibleCodeDefault(BLIVECHAT_CAPABILITY.parts.amount, "gift", "sticky", "fontSize", settings), 42);
  assert.equal(resolveCompatibleCodeDefault(BLIVECHAT_CAPABILITY.parts.amount, "guard", "main", "fontSize", settings), 45);
  for (const property of ["visible", "color", "fontFamily", "background", "borderColor"]) {
    const definition = property === "background" || property === "borderColor" ? BLIVECHAT_CAPABILITY.parts.paidCard : BLIVECHAT_CAPABILITY.parts.message;
    assert.notEqual(resolveCompatibleCodeDefault(definition, "gift", "main", property, settings), undefined, property);
  }
});

test("G 与 F 分别控制尺寸链和字体链并保留固定 px 例外", () => {
  const defaults = createBlivechatBaseCss({ globalScale: 1, fontScale: 1, showGiftName: false });
  const global = createBlivechatBaseCss({ globalScale: 1.5, fontScale: 1, showGiftName: false });
  const font = createBlivechatBaseCss({ globalScale: 1, fontScale: 1.5, showGiftName: false });
  assert.match(defaults, /--blc-g: 1;/);
  assert.match(defaults, /--blc-f: 1;/);
  assert.match(defaults, /--blc-avatar-text: 24px;/);
  assert.match(global, /--blc-avatar-text: 36px;/);
  assert.match(global, /--blc-text-font-size: 19\.5px;/);
  assert.match(font, /--blc-avatar-text: 24px;/);
  assert.match(font, /--blc-text-font-size: 19\.5px;/);
  assert.match(font, /--blc-emote-size: 36px;/);
  assert.match(global, /--blc-message-spacing: 6px;/);
  assert.match(global, /--blc-paid-avatar: 60px;/);
  assert.match(font, /font-size: 12px !important;\/\* source-fixed \*\//);
  assert.doesNotMatch(defaults, /#author-name, #message/);
  assert.doesNotMatch(defaults, /:where\(yt-live-chat-paid-message-renderer #author-name\)/);
  assert.match(global, /:where\(yt-live-chat-paid-message-renderer #author-name\) \{ font-size: 21px/);
  assert.doesNotMatch(defaults, /#timestamp, yt-live-chat-author-chip #author-name \{ margin-right:/);
  assert.match(font, /--blc-paid-font-size: 22\.5px/);
  assert.match(font, /:where\(#header-subtext\) \{ font-size: var\(--blc-paid-font-size\)/);
});

test("运行 CSS 按目标根逐分支隔离，root、ID 与用户 CSS 不会泄漏", () => {
  const scoped = scopeBlivechatCss(":root{--x:1} #message,.foo,#author-name:hover{color:red}@keyframes pulse{from{opacity:.2}to{opacity:.8}}.pulse{animation:pulse 1s}@media (min-width:1px){#card,.bar{padding:1px}}", "obs:one");
  const root = postcss.parse(scoped);
  const selectors = [];
  root.walkRules(rule => selectors.push(...rule.selectors));
  assert.deepEqual(selectors, [
    '[data-blivechat-scope="obs:one"]',
    '[data-blivechat-scope="obs:one"] #message',
    '[data-blivechat-scope="obs:one"] .foo',
    '[data-blivechat-scope="obs:one"] #author-name:hover',
    'from',
    'to',
    '[data-blivechat-scope="obs:one"] .pulse',
    '[data-blivechat-scope="obs:one"] #card',
    '[data-blivechat-scope="obs:one"] .bar',
  ]);
  assert.match(scoped, /@keyframes pulse--obs-one/);
  assert.match(scoped, /animation:pulse--obs-one 1s/);
});

test("预览与运行共用同一 CSS 合成顺序，用户 CSS 最后生效", () => {
  const document = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
  document.styles.customCss = "#message { font-size: 50px; }";
  const css = composeBlivechatThemeCss(document);
  assert.match(css, /body[^}]*background(?:-color)?:\s*transparent\s*;/);
  assert.ok(css.indexOf(BLIVECHAT_SOURCE_CSS) <= css.indexOf("--blc-g"));
  assert.ok(css.indexOf("--blc-g") < css.lastIndexOf("font-size: 50px"));
});

test("BLC 原版注册真实编辑预览面并把来源默认写入内置主题", () => {
  assert.deepEqual(BLIVECHAT_SOURCE, {
    repositoryObject: "3a37312:blivechat-implementation/",
    upstreamCommit: "848409df78d2cca65d3cc8ffe938eb6b6f261b76",
    version: "1.10.4",
  });
  assert.match(BLIVECHAT_SOURCE_CSS, /yt-live-chat-text-message-renderer/);
  assert.match(BLIVECHAT_SOURCE_CSS, /yt-live-chat-paid-message-renderer/);
  assert.match(BLIVECHAT_SOURCE_CSS, /yt-live-chat-membership-item-renderer/);
  assert.match(BLIVECHAT_SOURCE_CSS, /yt-live-chat-ticker-renderer/);
  const surface = getCompatibleThemeEditingSurface("blivechat");
  assert.equal(surface?.capability, BLIVECHAT_CAPABILITY);
  assert.equal(typeof surface?.renderer, "function");
  assert.equal(typeof surface?.renderBasicControls, "function");
  const document = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
  const defaults = { showGiftName: false, globalScale: 1, fontScale: 1, showTimestamp: false, maskUsername: false, showAvatar: true, showUsername: true };
  for (const [key, value] of Object.entries(defaults)) assert.equal(document.settings[key], value, key);
  assert.match(createCompatibleThemeModeAdapter("blivechat").exportCss(document, "full"), /--blc-avatar-text: 24px/);
  assert.match(document.styles.baseCss, /yt-live-chat-text-message-renderer/);
  const revealed = renderToStaticMarkup(surface.renderer({ document, thumbnail: false, revealPart: "timestamp" }));
  assert.doesNotMatch(revealed, /id="timestamp"[^>]*hidden/);
});

test("发布运行时按目标隔离主题并保留目标缩放", async () => {
  const stored = new Map([
    ["live", { targetId: "live", targetKind: "live", themeId: "old", revision: 1, displayScale: 1.25 }],
  ]);
  const bindings = {
    async load() { return [...stored.values()]; },
    async bind(value) { stored.set(value.targetId, { ...value, displayScale: value.displayScale ?? stored.get(value.targetId)?.displayScale ?? 1 }); },
    async setDisplayScale(targetId, displayScale) { stored.set(targetId, { ...stored.get(targetId), displayScale }); },
    async remove(targetId) { stored.delete(targetId); },
    subscribe() { return () => {}; },
  };
  const runtimeRecords = new Map();
  const runtime = createBlivechatThemeRuntime(bindings, {
    async load() { return [...runtimeRecords.values()]; },
    async loadTarget(targetId) { return structuredClone(runtimeRecords.get(targetId)); },
    async save(value) { runtimeRecords.set(value.context.targetId, structuredClone(value)); },
    async remove(targetId) { runtimeRecords.delete(targetId); },
    async publish() {},
    subscribe() { return () => {}; },
  });
  const make = (themeId, showGiftName) => ({
    ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(),
    themeId,
    origin: "custom",
    revision: 2,
    settings: { showGiftName, globalScale: 1, fontScale: 1 },
  });
  const themeA = make("theme-a", false);
  themeA.settings.showAvatar = false;
  themeA.settings.showUsername = false;
  await runtime.publish(themeA, { target: "live", targetId: "live", roomId: "42", displayScale: 1 });
  const themeB = make("theme-b", true);
  themeB.settings.visualModel = { common: { "all|all|main|message": { color: { source: "custom", value: "#12ab34" } } }, light: {}, dark: {} };
  await runtime.publish(themeB, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  assert.equal(stored.get("live").displayScale, 1.25);
  assert.equal(stored.get("live").themeId, "theme-a");
  assert.equal(stored.get("windows").themeId, "theme-b");
  const gift = event(MsgType.Gift, { gift: { id: 2, name: "礼物", count: 2, price: 1000, total: 2000, coinType: "gold", totalRmb: 2 } });
  const live = runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  const window = runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" });
  assert.equal(live.listSurface.project(gift, 1).method, "onAddGift");
  assert.match(live.listSurface.css, /#author-photo\) \{ display: none/);
  assert.match(live.listSurface.css, /#author-name\) \{ display: none/);
  assert.doesNotMatch(live.listSurface.css, /#timestamp\) \{ display: inline/);
  assert.equal(window.listSurface.project(gift, 1).payload.giftName, "礼物");
  assert.match(window.listSurface.css, /#12ab34/);
  assert.equal(window.rootProps.scopeId, "blivechat:windows:windows");
  assert.equal(window.rootProps.style, undefined);
  assert.match(createCompatibleThemeModeAdapter("blivechat").exportCss(themeB, "full"), /#12ab34/);
  const restore = await runtime.remove("windows", "windows");
  assert.equal(runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), undefined);
  await restore();
  assert.equal(typeof runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), "function");
});

test("三个兼容版保存 OBS 配置采用本次缩放，现场继续保留已绑定缩放", async () => {
  for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
    const contexts = [];
    const adapter = createCompatibleThemeModeAdapter(mode, {
      bindings: { load: async () => [{ targetId: "one", targetKind: "obs", themeId: "old", revision: 1, displayScale: 1 }] },
      renderer: { publish: async (_, context) => { contexts.push(context); } },
    });
    await adapter.publishTarget(adapter.createBuiltinTheme(), { target: "obs", targetId: "one", roomId: "24125", displayScale: 1.25 });
    assert.equal(contexts[0].displayScale, 1.25, mode);
  }
});

test("外部 HTML 握手失败时不保存、不绑定、不发布并保留旧输出", async () => {
  const actions = [];
  const oldBinding = { targetId: "live", targetKind: "live", themeId: "old", revision: 1, displayScale: 1 };
  const bindings = { async load(){ return [oldBinding]; }, async bind(){ actions.push("bind"); }, async setDisplayScale(){}, async remove(){}, subscribe(){ return () => {}; } };
  const runtime = createBlivechatThemeRuntime(bindings, {
    async load(){ return []; }, async loadTarget(){ return undefined; }, async save(){ actions.push("save"); }, async remove(){}, async publish(){ actions.push("publish"); }, subscribe(){ return () => {}; },
    async prepareExternalHtml(){ actions.push("prepare"); throw new Error("握手失败"); },
  });
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "external", origin: "custom", metadata: { name: "外部", author: "", version: "", updatedAt: "", externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true } } };
  await assert.rejects(() => runtime.publish(document, { target: "windows", targetId: "live", roomId: "42", displayScale: 1 }), /握手失败/);
  assert.deepEqual(actions, ["prepare"]);
  assert.deepEqual(await bindings.load(), [oldBinding]);
});

test("外部 HTML 不支持现场应用且不会触发预检或改动 binding", async () => {
  const actions = [];
  const oldBinding = { targetId: "live", targetKind: "live", themeId: "old", revision: 1, displayScale: 1 };
  const bindings = { async load(){ return [oldBinding]; }, async bind(){ actions.push("bind"); }, async setDisplayScale(){}, async remove(){}, subscribe(){ return () => {}; } };
  const runtime = createBlivechatThemeRuntime(bindings, { async load(){return[]}, async loadTarget(){return undefined}, async save(){actions.push("save")}, async remove(){}, async publish(){actions.push("publish")}, subscribe(){return()=>{}}, async prepareExternalHtml(){actions.push("prepare")} });
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "external-live", origin: "custom", metadata: { name: "外部", author: "", version: "", updatedAt: "", externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true } } };
  await assert.rejects(() => runtime.publish(document, { target: "live", targetId: "live", roomId: "42", displayScale: 1 }), /不支持现场/);
  assert.deepEqual(actions, []);
  assert.deepEqual(await bindings.load(), [oldBinding]);
});

test("外部 HTML 的同一已握手 iframe 准备完成后才提交 windows binding", async () => {
  const actions = [];
  const bindings = { async load(){return[]}, async bind(){actions.push("bind")}, async setDisplayScale(){}, async remove(){}, subscribe(){return()=>{}} };
  const runtime = createBlivechatThemeRuntime(bindings, { async load(){return[]}, async loadTarget(){return undefined}, async save(){actions.push("save")}, async remove(){}, async publish(){actions.push("publish")}, subscribe(){return()=>{}}, async prepareExternalHtml(request){actions.push(`prepare:${request.context.target}:${request.context.targetId}`)} });
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "external-window", origin: "custom", metadata: { name: "外部", author: "", version: "", updatedAt: "", externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true } } };
  await runtime.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  assert.deepEqual(actions, ["prepare:windows:windows", "save", "bind", "publish"]);
  assert.equal(runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }).externalHtml.url, "https://example.test/theme");
});

test("同 URL 再应用生成新的 candidate request revision", async () => {
  const requests = [];
  const bindings = { async load(){return[]}, async bind(){}, async setDisplayScale(){}, async remove(){}, subscribe(){return()=>{}} };
  const runtime = createBlivechatThemeRuntime(bindings, { async load(){return[]}, async loadTarget(){return undefined}, async save(){}, async remove(){}, async publish(){}, subscribe(){return()=>{}}, async prepareExternalHtml(request){requests.push(request.requestId)} });
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "same-url", origin: "custom", metadata: { name: "外部", author: "", version: "", updatedAt: "", externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true } } };
  await runtime.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  await runtime.publish({ ...document, revision: document.revision + 1 }, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  assert.equal(requests.length, 2); assert.notEqual(requests[0], requests[1]);
});

test("时间与用户名打码只在副窗口和 OBS 生效且固定为三个星号", async () => {
  const stored = new Map();
  const bindings = { async load(){return [...stored.values()]}, async bind(v){stored.set(v.targetId,v)}, async setDisplayScale(){}, async remove(){}, subscribe(){return()=>{}} };
  const records = new Map();
  const runtime = createBlivechatThemeRuntime(bindings, { async load(){return[]}, async loadTarget(id){return records.get(id)}, async save(v){records.set(v.context.targetId,v)}, async remove(){}, async publish(){}, subscribe(){return()=>{}} });
  const document = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
  document.themeId = "visibility-scope"; document.origin = "custom"; document.settings = { ...document.settings, showTimestamp: true, maskUsername: true };
  for (const target of ["live", "windows"]) await runtime.publish(document, { target, targetId: target, roomId: "42", displayScale: 1 });
  const sample = event(MsgType.Danmu, { text: "正文" });
  const source = target => runtime.resolve({ target, targetId: target, roomId: 42, placement: "main" }).listSurface;
  assert.doesNotMatch(source("live").css, /content: "\*\*\*"/);
  assert.doesNotMatch(source("windows").css, /content: "\*\*\*"/);
  assert.equal(source("windows").project(sample, 1).payload.authorName, "测***");
  const obsHtml = renderToStaticMarkup(React.createElement(BlivechatEvent, { event: sample, placement: "main", showGiftName: false, showTimestamp: true, maskUsername: true }));
  assert.match(obsHtml, />测\*\*\*</);
  assert.doesNotMatch(source("live").css, /#timestamp\) \{ display: inline/);
  assert.match(source("windows").css, /#timestamp\) \{ display: inline/);
  const liveRender = runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  assert.equal(liveRender.rootProps.style, undefined);
  assert.equal(liveRender.rootProps.surfaceStyle.backgroundColor, "var(--yt-live-chat-background-color)");
  assert.equal(runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }).rootProps.style["--yt-live-chat-paid-message-timestamp-display"], "inline");
});

test("发布的 BLC 主题可由另一个窗口运行时恢复并接收后续更新", async () => {
  const bindingsState = new Map();
  const bindings = {
    async load() { return [...bindingsState.values()]; },
    async bind(value) { bindingsState.set(value.targetId, { ...value }); },
    async setDisplayScale(targetId, displayScale) { bindingsState.set(targetId, { ...bindingsState.get(targetId), displayScale }); },
    async remove(targetId) { bindingsState.delete(targetId); },
    subscribe() { return () => {}; },
  };
  const records = new Map();
  const listeners = new Set();
  const bindingListeners = new Set();
  const ports = {
    async load() { return [...records.values()].map(value => structuredClone(value)); },
    async loadTarget(targetId) { return records.has(targetId) ? structuredClone(records.get(targetId)) : undefined; },
    async save(value) { records.set(value.context.targetId, structuredClone(value)); },
    async remove(targetId) { records.delete(targetId); },
    async publish(value) { for (const listener of listeners) listener(structuredClone(value)); },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async loadBindings() { return [...bindingsState.values()].map(value => structuredClone(value)); },
    subscribeBindings(listener) { bindingListeners.add(listener); return () => bindingListeners.delete(listener); },
  };
  const publisher = createBlivechatThemeRuntime(bindings, ports);
  const secondaryWindow = createBlivechatThemeRuntime(bindings, ports);
  await secondaryWindow.start();
  const document = {
    ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(),
    themeId: "cross-window",
    origin: "custom",
    revision: 2,
    settings: { showGiftName: true, globalScale: 1.5, fontScale: 1 },
  };
  await publisher.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  const render = secondaryWindow.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" });
  assert.equal(typeof render, "function");
  const projected = render.listSurface.project(event(MsgType.Gift, { gift: { id: 2, name: "礼物", count: 2, price: 1000, total: 2000, coinType: "gold", totalRmb: 2 } }), 1);
  assert.equal(projected.method, "onAddGift");
  assert.equal(projected.payload.giftName, "礼物");
  assert.equal(render.rootProps.scopeId, "blivechat:windows:windows");
  assert.match(createCompatibleThemeModeAdapter("blivechat").exportCss(document, "full"), /--blc-g: 1\.5/);
  let notifications = 0;
  const stopNotification = subscribeCompatibleEventRenderChange(() => { notifications += 1; });
  bindingsState.set("windows", { targetId: "windows", targetKind: "windows", themeId: "native-default", revision: 1, displayScale: 1 });
  for (const listener of bindingListeners) listener([...bindingsState.values()]);
  assert.equal(secondaryWindow.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), undefined);
  assert.ok(notifications > 0);
  stopNotification();
});

test("删除 BLC 发布会跨窗口失效，旧缓存不能在正式 binding 缺失时复活", async () => {
  const bindingState = new Map();
  const records = new Map();
  const publications = new Set();
  const bindingListeners = new Set();
  const bindings = {
    async load() { return [...bindingState.values()]; },
    async bind(value) { bindingState.set(value.targetId, value); for (const listener of bindingListeners) listener([...bindingState.values()]); },
    async setDisplayScale(targetId, displayScale) { const value = { ...bindingState.get(targetId), displayScale }; bindingState.set(targetId, value); for (const listener of bindingListeners) listener([...bindingState.values()]); },
    async remove(targetId) { bindingState.delete(targetId); for (const listener of bindingListeners) listener([...bindingState.values()]); },
    subscribe() { return () => {}; },
  };
  const ports = {
    async load() { return [...records.values()]; }, async loadTarget(targetId) { return records.has(targetId) ? structuredClone(records.get(targetId)) : undefined; }, async save(value) { records.set(value.context.targetId, structuredClone(value)); }, async remove(targetId) { records.delete(targetId); },
    async publish(value) { for (const listener of publications) listener(structuredClone(value)); }, subscribe(listener) { publications.add(listener); return () => publications.delete(listener); },
    async loadBindings() { return [...bindingState.values()]; }, subscribeBindings(listener) { bindingListeners.add(listener); return () => bindingListeners.delete(listener); },
  };
  const first = createBlivechatThemeRuntime(bindings, ports); const second = createBlivechatThemeRuntime(bindings, ports); await first.start(); await second.start();
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "to-remove", origin: "custom", revision: 3 };
  await first.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  assert.equal(typeof second.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), "function");
  await first.remove("windows", "windows");
  assert.equal(second.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), undefined);
});

test("BLC OBS 快照自带模式、房间、缩放和显示配置，不依赖原生快照", () => {
  const document = { ...createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "obs-blc", revision: 4 };
  const snapshot = buildBlivechatObsSnapshot(document, { target: "obs", targetId: "obs-1", roomId: "7788", displayScale: 1.4 }, {
    showTimestamp: true, maskUsername: true, eventPadding: 7, eventSpacing: 9,
  });
  assert.deepEqual({ mode: snapshot.mode, targetId: snapshot.targetId, roomId: snapshot.roomId, displayScale: snapshot.displayScale }, { mode: "blivechat", targetId: "obs-1", roomId: 7788, displayScale: 1.4 });
  assert.equal(snapshot.display.showTimestamp, true);
  assert.equal(snapshot.display.maskUsername, true);
  assert.equal(snapshot.display.eventPadding, 7);
  assert.equal(snapshot.display.eventSpacing, 9);
  assert.equal(snapshot.document.themeId, "obs-blc");
  const html = renderToStaticMarkup(React.createElement(NativeObsContent, { events: [], targetId: "obs-1", snapshot }));
  assert.match(html, /class="theme-surface theme-target-obs obs-native-root event-area obs"[^>]*data-event-style-scope="obs"[^>]*style="[^"]*zoom:1\.4/);
});

test("BLC 作为兼容提供方注册，不会阻止后续兼容模式共用渲染入口", () => {
  const firstRender = () => "BLC";
  const secondRender = () => "其他兼容模式";
  const stopFirst = registerCompatibleEventRenderProvider(context => context.targetId === "windows" ? firstRender : undefined);
  const stopSecond = registerCompatibleEventRenderProvider(context => context.targetId === "obs-a" ? secondRender : undefined);
  assert.equal(resolveCompatibleEventRender({ target: "windows", targetId: "windows", roomId: 1, placement: "main" }), firstRender);
  assert.equal(resolveCompatibleEventRender({ target: "obs", targetId: "obs-a", roomId: 1, placement: "main" }), secondRender);
  const stopOverride = installCompatibleEventRenderResolver(() => undefined);
  assert.equal(resolveCompatibleEventRender({ target: "windows", targetId: "windows", roomId: 1, placement: "main" }), firstRender);
  stopOverride();
  stopSecond();
  stopFirst();
});

test("BLC 原版置顶栏透明、可滚动且隐藏滚动条", () => {
  const source = createBlivechatBaseCss({ globalScale: 1, fontScale: 1, showGiftName: false });
  const tickerBackgrounds = [];
  postcss.parse(source).walkRules(rule => {
    if (rule.selectors.includes("yt-live-chat-ticker-renderer > #container")) {
      rule.walkDecls("background", declaration => tickerBackgrounds.push(declaration.value));
    }
  });
  assert.deepEqual(tickerBackgrounds, ["transparent"]);
  assert.match(source, /\.el-scrollbar__wrap[^}]*overflow-x:\s*auto\s*!important/);
  assert.match(source, /\.el-scrollbar__bar\.is-vertical[^}]*display:\s*none\s*!important/);
  assert.doesNotMatch(source, /yt-live-chat-ticker-renderer #container\s*\{[^}]*background:\s*transparent\s*!important/);
  assert.match(source, /\.el-scrollbar__wrap::\-webkit-scrollbar[^}]*display:\s*none/);
  assert.match(source, /yt-live-chat-ticker-renderer #items[^}]*width:\s*max-content/);
  assert.match(source, /scrollbar-width:\s*none/);
  assert.match(source, /el-scrollbar__bar\.is-horizontal[^}]*display:\s*none\s*!important/);
});

test("BLC 原版来源根与主列表保持透明", () => {
  const source = createBlivechatBaseCss({ globalScale: 1, fontScale: 1, showGiftName: false });
  assert.match(source, /--yt-live-chat-background-color:\s*transparent/);
  assert.match(source, /yt-live-chat-renderer[\s\S]*#item-scroller[\s\S]*background:\s*transparent\s*;/);
  assert.match(source, /#item-scroller[^}]*scrollbar-width:\s*thin/);
  assert.match(source, /#item-scroller::\-webkit-scrollbar[^}]*width:\s*6px/);
  assert.match(source, /yt-live-chat-ticker-renderer[^}]*width:\s*var\(--bb-list-content-width,\s*100%\)/);
  const host = readFileSync(resolvePath("vendor/blivechat/host/entry.js"), "utf8");
  assert.match(host, /--bb-list-content-width/);
  assert.match(host, /ResizeObserver/);
});
