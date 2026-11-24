import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";
import { MsgType } from "../src/protocol/eventTypeCodes.ts";

let vite;
let OpenLiveEvent;
let OPENLIVE_CAPABILITY;
let DEFAULT_OPENLIVE_THEME_SETTINGS;
let createOpenLiveBaseCss;
let createOpenLiveThemeRuntime;
let projectOpenLiveEvent;
let createCompatibleThemeModeAdapter;
let getThemeModeAdapter;
let getCompatibleThemeEditingSurface;
let OPENLIVE_SOURCE;
let OPENLIVE_SOURCE_CSS;
let composeOpenLiveThemeCss;
let buildOpenLiveObsSnapshot;
let createOpenLiveSourceConfig;
let NativeObsContent;
let compatibleSelectorFor;
let resolveCompatibleCodeDefault;
let compatibleEventOptions;
let createThemeRepository;
let createThemeSessionHost;
let createOpenLiveDocumentCss;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-openliveThemeIntegration.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, root: fileURLToPath(new URL("..", import.meta.url)), configFile: false, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  ({ OpenLiveEvent, OPENLIVE_CAPABILITY, DEFAULT_OPENLIVE_THEME_SETTINGS, createOpenLiveBaseCss, createOpenLiveThemeRuntime, projectOpenLiveEvent, OPENLIVE_SOURCE, OPENLIVE_SOURCE_CSS, composeOpenLiveThemeCss, buildOpenLiveObsSnapshot, createOpenLiveSourceConfig } = await vite.ssrLoadModule("/src/compat/openlive/index.tsx"));
  ({ createOpenLiveDocumentCss } = await vite.ssrLoadModule("/src/compat/openlive/css.ts"));
  await vite.ssrLoadModule("/src/compat/openlive/register.tsx");
  ({ createCompatibleThemeModeAdapter, getThemeModeAdapter } = await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"));
  ({ getCompatibleThemeEditingSurface } = await vite.ssrLoadModule("/src/components/CompatibleThemePreview.tsx"));
  ({ NativeObsContent } = await vite.ssrLoadModule("/src/obs/NativeObsRenderer.tsx"));
  ({ compatibleSelectorFor } = await vite.ssrLoadModule("/src/themes/compatManagedCss.ts"));
  ({ resolveCompatibleCodeDefault } = await vite.ssrLoadModule("/src/themes/compatThemeCapabilities.ts"));
  ({ compatibleEventOptions } = await vite.ssrLoadModule("/src/components/CompatibleThemeEditor.tsx"));
  ({ createThemeRepository } = await vite.ssrLoadModule("/src/themes/themeRepository.ts"));
  ({ createThemeSessionHost } = await vite.ssrLoadModule("/src/themes/themeEditorSession.ts"));
});
after(async () => {
  if (!vite) return;
  try {
    const { getConnectionRuntime } = await vite.ssrLoadModule('/src/archive/connectionRuntime.ts');
    await getConnectionRuntime()?.dispose('shutdown');
  } finally {
    await vite.close();
  }
});

const roomId = 42;
const user = { uid: "7", uname: "开放版用户", avatar: "https://example.test/avatar.png", guardLevel: 2, medal: { name: "粉丝牌", level: 12, isWearing: true, isCurrentRoom: true } };
const event = (msgType, extra = {}) => ({ id: `event-${msgType}`, msgType, roomId, ts: 1_700_000_000_000, user, ...extra });
const scope = { roomId, generation: 3 };

test("开放版只接受真实支持事件，点赞必须是非负安全整数", () => {
  const supported = [
    event(MsgType.Danmu, { text: "普通弹幕" }),
    event(MsgType.Interact, { interactKind: "like", likeCount: 3 }),
    event(MsgType.Gift, { gift: { id: 1, name: "礼物", count: 1, price: 1000, total: 1000, coinType: "gold" } }),
    event(MsgType.SuperChat, { sc: { price: 30, message: "醒目留言", duration: 60 } }),
    event(MsgType.GuardBuy, { guard: { level: 2, count: 1, price: 198000 } }),
  ];
  assert.deepEqual(supported.map((value, index) => projectOpenLiveEvent(value, scope, index + 1, 1000)?.method), ["onAddText", "onAddLike", "onAddGift", "onAddSuperChat", "onAddMember"]);
  for (const likeCount of [undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(projectOpenLiveEvent(event(MsgType.Interact, { interactKind: "like", likeCount }), scope, 1, 1000), null);
  }
  for (const kind of ["enter", "follow", "share", "specialFollow", "mutualFollow"]) {
    assert.equal(projectOpenLiveEvent(event(MsgType.Interact, { interactKind: kind, likeCount: 1 }), scope, 1, 1000), null);
  }
  for (const msgType of [MsgType.RedPocketStart, MsgType.RedPocketWinner, MsgType.AnchorLotStart, MsgType.AnchorLotAward]) {
    assert.equal(projectOpenLiveEvent(event(msgType), scope, 1, 1000), null);
  }
});

test("开放版使用真实粉丝牌与身份节点，不复制原版能力表", () => {
  const html = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.Danmu, { text: "正文" }), placement: "main", showGiftInfo: true }));
  assert.match(html, /yt-live-chat-author-medal-renderer/);
  assert.match(html, /id="medal-card"/);
  assert.match(html, /id="medal-name"/);
  assert.match(html, /id="medal-level"/);
  assert.match(html, /yt-live-chat-author-badge-renderer/);
  assert.ok(OPENLIVE_CAPABILITY.parts.fanMedal);
  assert.equal(OPENLIVE_CAPABILITY.parts.avatarFrame.selector, "#author-photo");
  assert.equal(OPENLIVE_CAPABILITY.parts.honor, undefined);
  assert.match(html, /guard-level-2\.png/);
});

test("开放版薄适配保留来源节点、字符串身份、牌子属性与多身份", () => {
  const mixed = { ...user, guardLevel: 2, isAdmin: true };
  const html = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: { ...event(MsgType.Danmu, { text: "正文" }), user: mixed }, placement: "main" }));
  assert.match(html, /<div id="card"/);
  assert.match(html, /id="chip-badges"/);
  assert.match(html, /id="chat-medal"/);
  assert.match(html, /id="chat-badges"/);
  assert.match(html, /author-type="member"/);
  assert.match(html, /medal-name="粉丝牌"/);
  assert.match(html, /medal-level="12"/);
  assert.match(html, /is-current-room=""/);
  assert.match(html, /--yt-live-chat-medal-background-color/);
  assert.match(html, /guard-level-2\.png/);
  assert.match(html, /<path/);
});

test("开放版薄适配逐节点保持固定 Vue DOM 关键关系", () => {
  const html = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.Danmu, { text: "正文" }), placement: "main", showTimestamp: true }));
  assert.match(html, /<yt-live-chat-author-chip[^>]*>\s*<span id="timestamp"/);
  assert.match(html, /<div id="image-and-message"[^>]*>\s*<span id="message"[^>]*>正文<\/span>/);
  assert.doesNotMatch(html, /<span id="image-and-message"/);
  assert.match(html, /<div id="medal-name"/);
  assert.match(html, /<div id="medal-level"/);
  const guard = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.GuardBuy, { guard: { level: 2, count: 1, price: 198000 } }), placement: "main" }));
  assert.match(guard, /<span id="author-name"[^>]*class="member style-scope yt-live-chat-author-chip"/);
  assert.match(guard, /<yt-live-chat-author-chip[^>]*>[\s\S]*<span id="chat-badges"[\s\S]*<\/yt-live-chat-author-chip>/);
  assert.match(guard, /<div id="header-subtext"[^>]*>[\s\S]*?<\/div><\/div><div id="timestamp" class="style-scope yt-live-chat-membership-item-renderer"/);
  assert.doesNotMatch(guard, /<span id="timestamp"/);
  const ticker = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.SuperChat, { sc: { price: 30, message: "SC", duration: 60 } }), placement: "sticky" }));
  assert.match(ticker, /<yt-live-chat-ticker-renderer[^>]*>\s*<div id="container"[^>]*>\s*<div id="items"/);
});

test("开放版区分行内表情与来源大表情节点", () => {
  assert.match(OPENLIVE_CAPABILITY.parts.smallEmote.selector, /:not\(\.blc-large-emoji\)/);
  assert.deepEqual(OPENLIVE_CAPABILITY.parts.smallEmote.events, ["danmaku"]);
  assert.deepEqual(OPENLIVE_CAPABILITY.parts.smallEmote.placements, ["main"]);
  assert.match(OPENLIVE_CAPABILITY.parts.largeEmote.selector, /#image-and-message > img#emoticon/);
  assert.match(OPENLIVE_CAPABILITY.parts.largeEmote.selector, /img.emoji.blc-large-emoji/);
  const large = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.Danmu, { text: "大表情", emoticon: { url: "https://example.test/large.webp", width: 162, height: 162 } }), placement: "main" }));
  assert.match(large, /<div id="image-and-message"[^>]*>\s*<img id="emoticon" class="emoji /);
});

test("开放版控件默认值按事件与区域使用真实节点尺寸", () => {
  const avatar = OPENLIVE_CAPABILITY.parts.avatar;
  const timestamp = OPENLIVE_CAPABILITY.parts.timestamp;
  assert.equal(resolveCompatibleCodeDefault(timestamp, "danmaku", "main", "fontSize"), 11);
  assert.equal(resolveCompatibleCodeDefault(timestamp, "superchat", "main", "fontSize"), 11);
  assert.equal(resolveCompatibleCodeDefault(avatar, "danmaku", "main", "width"), 24);
  assert.equal(resolveCompatibleCodeDefault(avatar, "like", "main", "width"), 24);
  assert.equal(resolveCompatibleCodeDefault(avatar, "superchat", "main", "width"), 40);
  assert.equal(resolveCompatibleCodeDefault(avatar, "gift", "main", "width"), 40);
  assert.equal(resolveCompatibleCodeDefault(avatar, "guard", "main", "width"), 40);
  assert.equal(resolveCompatibleCodeDefault(avatar, "superchat", "sticky", "width"), 24);
});

test("开放版 sticky 头像选择器不命中展开详情，房管属性与规则一致", () => {
  const stickyAvatar = compatibleSelectorFor(OPENLIVE_CAPABILITY, "superchat|all|sticky|avatar", "common");
  assert.match(stickyAvatar, /yt-live-chat-ticker-paid-message-item-renderer\[data-openlive-kind='superchat'\]/);
  assert.match(stickyAvatar, /data-openlive-placement='sticky'/);
  assert.doesNotMatch(stickyAvatar, /data-openlive-placement='detail'/);
  assert.equal(OPENLIVE_CAPABILITY.identitySelectors.moderator, "[is-admin='true']");
  const admin = { ...user, guardLevel: 0, isAdmin: true };
  const html = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: { ...event(MsgType.Danmu, { text: "正文" }), user: admin }, placement: "main" }));
  assert.match(html, /is-admin="true"/);
  assert.match(html, /author-type="moderator"/);
});

test("开放版编辑器按区域只提供实际事件，三类选择器互不串用", () => {
  assert.deepEqual(compatibleEventOptions(OPENLIVE_CAPABILITY, "main").map(item => item.value), ["all", "danmaku", "like", "gift", "gift-normal", "superchat", "guard", "interaction"]);
  assert.deepEqual(OPENLIVE_CAPABILITY.eventGroups.interaction, ["like"]);
  assert.deepEqual(compatibleEventOptions(OPENLIVE_CAPABILITY, "sticky").map(item => item.value), ["all", "gift", "gift-normal", "superchat", "guard"]);
  assert.deepEqual(compatibleEventOptions(OPENLIVE_CAPABILITY, "detail").map(item => item.value), ["all", "gift", "gift-normal", "superchat", "guard"]);
  const main = compatibleSelectorFor(OPENLIVE_CAPABILITY, "superchat|all|main|message", "common");
  const sticky = compatibleSelectorFor(OPENLIVE_CAPABILITY, "superchat|all|sticky|amount", "common");
  const detail = compatibleSelectorFor(OPENLIVE_CAPABILITY, "superchat|all|detail|message", "common");
  assert.match(main, /placement='main'/); assert.doesNotMatch(main, /placement='detail'/);
  assert.match(sticky, /yt-live-chat-ticker-paid-message-item-renderer\[data-openlive-kind='superchat'/); assert.match(sticky, /data-openlive-placement='sticky'/);
  assert.match(detail, /placement='detail'/); assert.doesNotMatch(detail, /placement='main'/);
  assert.equal(compatibleSelectorFor(OPENLIVE_CAPABILITY, "danmaku|all|sticky|message", "common"), null);
});

test("开放版 px 行高与未知可视化规则保持原语义", () => {
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  document.settings = { ...document.settings, visualModel: { common: { "danmaku|all|main|message": { lineHeight: { source: "custom", value: 18 } } }, light: {}, dark: {} } };
  document.styles.visualCss = ":where(.unknown) { color: red !important; }";
  const css = composeOpenLiveThemeCss(document);
  assert.match(css, /line-height:\s*18px/);
  assert.match(css, /:where\(\.unknown\) \{ color: red !important; \}/);
  assert.doesNotMatch(css, /line-height:\s*18;/);
});

test("开放版固定 px 模型只修改目标属性，不连带头像、内边距或圆角", () => {
  const defaults = DEFAULT_OPENLIVE_THEME_SETTINGS;
  const changed = { ...defaults, visualModel: { common: { "danmaku|all|main|message": { fontSize: { source: "custom", value: 24 } } }, light: {}, dark: {} } };
  const css = createOpenLiveBaseCss(changed);
  assert.match(css, /font-size:\s*24px/);
  assert.doesNotMatch(css, /--blc-g|--blc-f|globalScale|fontScale/);
  assert.equal(OPENLIVE_CAPABILITY.parts.message.scaleByProperty, undefined);
  assert.equal(OPENLIVE_CAPABILITY.parts.avatar.scaleByProperty, undefined);
});

test("礼物描述默认开启且只影响主区礼物，不影响 SC、大航海与置顶", () => {
  const gift = event(MsgType.Gift, { gift: { id: 1, name: "辣条", count: 2, price: 1000, total: 2000, coinType: "gold" } });
  const main = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: gift, placement: "main", showGiftInfo: true }));
  assert.match(main, /辣条/);
  assert.match(main, /×2/);
  const hidden = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: gift, placement: "main", showGiftInfo: false }));
  assert.doesNotMatch(hidden, /辣条/);
  const sticky = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: gift, placement: "sticky", showGiftInfo: true }));
  assert.doesNotMatch(sticky, /×2/);
  const sc = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.SuperChat, { sc: { price: 30, message: "SC 正文", duration: 60 } }), placement: "main", showGiftInfo: false }));
  assert.match(sc, /SC 正文/);
  assert.match(sc, /--yt-live-chat-paid-message-primary-color/);
  assert.match(sc, /--yt-live-chat-paid-message-secondary-color/);
  const guard = renderToStaticMarkup(React.createElement(OpenLiveEvent, { event: event(MsgType.GuardBuy, { guard: { level: 2, count: 1, price: 198000 } }), placement: "main", showGiftInfo: false }));
  assert.match(guard, /开放版用户/);
  assert.match(sticky, /aria-expanded="false"/);
  assert.doesNotMatch(sticky, /data-openlive-detail/);
});

test("开放版适配器、编辑预览和运行时正式可用", async () => {
  const adapter = getThemeModeAdapter("blivechat-open");
  assert.equal(adapter.rendererReady, true);
  assert.equal(adapter.createBuiltinTheme().settings.showGiftInfo, true);
  assert.ok(getCompatibleThemeEditingSurface("blivechat-open"));
  assert.equal(typeof createOpenLiveThemeRuntime, "function");
  const preview = renderToStaticMarkup(getCompatibleThemeEditingSurface("blivechat-open").renderer({ document: adapter.createBuiltinTheme(), thumbnail: false }));
  assert.match(preview, /openlive-source-preview/);
  assert.match(preview, /data-source-sample="design-fixed"/);
  assert.doesNotMatch(preview, /yt-live-chat-text-message-renderer/);
});

test("开放版来源配置严格拆分二十项来源键与宿主设置", () => {
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  document.settings = { ...document.settings, skin: "default", emoticonSize: 96, showGiftInfo: false, showTimestamp: true, maskUsername: true };
  const config = createOpenLiveSourceConfig(document.settings, { direction: "top", maxNumber: 60 });
  assert.equal(Object.keys(config).filter(key => !key.startsWith("host")).length, 20);
  assert.deepEqual([config.hostShowFreeGift, config.hostShowNormalGift], [true, true]);
  assert.deepEqual({ skin: config.skin, emoticonSize: config.emoticonSize, showGiftInfo: config.showGiftInfo, maxNumber: config.maxNumber, danmakuAtBottom: config.danmakuAtBottom }, { skin: "default", emoticonSize: 96, showGiftInfo: false, maxNumber: 60, danmakuAtBottom: false });
  for (const key of ["showTimestamp", "maskUsername", "visualModel", "displayScale", "globalScale", "fontScale"]) assert.equal(Object.hasOwn(config, key), false, key);
});

test("开放版正式目标解析为冻结来源列表而不是逐事件 React renderer", async () => {
  const bindingState = new Map(); const records = new Map();
  const bindings = { async load(){ return [...bindingState.values()]; }, async bind(value){ bindingState.set(value.targetId, value); }, async setDisplayScale(){}, async remove(){}, subscribe(){ return () => {}; } };
  const runtime = createOpenLiveThemeRuntime(bindings, { async load(){return[]}, async loadTarget(id){return records.get(id)}, async save(value){records.set(value.context.targetId, structuredClone(value))}, async remove(){}, async publish(){}, subscribe(){return()=>{}} });
  const document = { ...createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme(), themeId: "open-source", origin: "custom", revision: 2 };
  await runtime.publish(document, { target: "live", targetId: "live", roomId: "42", displayScale: 1 });
  const resolved = runtime.resolve({ target: "live", targetId: "live", roomId: 42, placement: "main" });
  assert.equal(resolved.listSurface.url, "/openlive/renderer.html");
  assert.equal(resolved.listSurface.protocol, "bb-openlive");
  assert.equal(Object.keys(resolved.listSurface.config).filter(key => !key.startsWith("host")).length, 20);
  assert.equal(resolved.listSurface.project(event(MsgType.Danmu, { text: "来源" }), 7).payload.sourceId, "event-0");
  assert.equal(resolved(event(MsgType.Danmu), { eventId: "x", enableBilibiliVideoLinks: false, dispatch(){return false;} }), null);
});

test("开放版来源 CSS 保留 important 且不创建改变优先级的来源 layer", () => {
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  document.styles.baseCss = "#message { color: red !important; }";
  const css = composeOpenLiveThemeCss(document);
  assert.match(css, /color:\s*red\s*!important/);
  assert.doesNotMatch(css, /@layer\s+openlive-source/);
});

test("开放版 skin none 不混入命名皮肤，只有 default 导出命名皮肤", () => {
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  assert.equal(document.settings.skin, "none");
  assert.doesNotMatch(composeOpenLiveThemeCss(document), /\/\* Transparent background \*\//);
  document.settings = { ...document.settings, skin: "default" };
  assert.match(composeOpenLiveThemeCss(document), /\/\* Transparent background \*\//);
});

test("固定 MIT 来源重建并保留 OpenLive 节点", () => {
  assert.deepEqual(OPENLIVE_SOURCE, { repository: "https://github.com/DoodleBears/blivechat", commit: "0da8c94d40a8791bb212985f6ac0ae55765c3a03", license: "MIT" });
  assert.match(OPENLIVE_SOURCE_CSS, /yt-live-chat-author-medal-renderer/);
  assert.match(OPENLIVE_SOURCE_CSS, /yt-live-chat-ticker-paid-message-item-renderer/);
  const root = resolvePath(fileURLToPath(new URL("..", import.meta.url)));
  for (const name of ["renderer.html", "entry.mjs", "renderer.js", "renderer.css", "build-info.json"]) assert.equal(existsSync(resolvePath(root, "public/openlive", name)), true, name);
  const info = JSON.parse(readFileSync(resolvePath(root, "public/openlive/build-info.json"), "utf8"));
  assert.equal(info.sourceCommit, OPENLIVE_SOURCE.commit);
  assert.equal(JSON.parse(readFileSync(resolvePath(root, "public/openlive/provenance.json"), "utf8")).license, "MIT");
});

test("保存重开保持固定 px，用户 CSS 位于来源和受管 CSS 之后", () => {
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  document.settings = { ...document.settings, skin: "default", visualModel: { common: { "danmaku|all|main|message": { fontSize: { source: "custom", value: 24 } } }, light: {}, dark: {} } };
  document.styles.customCss = "#message { color: rgb(1, 2, 3); }";
  const reopened = JSON.parse(JSON.stringify(document));
  assert.equal(reopened.settings.visualModel.common["danmaku|all|main|message"].fontSize.value, 24);
  const css = composeOpenLiveThemeCss(reopened);
  assert.match(css, /font-size:\s*24px;/);
  assert.ok(css.indexOf("/* Transparent background */") < css.indexOf("font-size: 24px"));
  assert.ok(css.indexOf("font-size: 24px") < css.lastIndexOf("rgb(1, 2, 3)"));
});

test("开放版保存重开走真实 repository/session，运行与完整导出共用 compose", async () => {
  const builtin = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  const stored = new Map([[builtin.themeId, structuredClone(builtin)]]);
  const port = {
    async list(){ return []; }, async read(id){ return stored.get(id) && structuredClone(stored.get(id)); },
    async write(value){ stored.set(value.themeId, structuredClone(value)); }, async remove(id){ stored.delete(id); },
  };
  const repository = createThemeRepository(port, [builtin]);
  const host = createThemeSessionHost(repository, { createId: () => "open-custom", now: () => "2026-10-24T00:00:00.000Z" });
  const source = await host.openThemeSession(builtin.themeId);
  host.updateThemeDraft(source, document => ({ ...document, settings: { ...document.settings, visualModel: { common: { "danmaku|all|main|message": { fontSize: { source: "custom", value: 24 } } }, light: {}, dark: {} } } }));
  const saved = await host.saveThemeSessionAs(source, { name: "开放版 24px", author: "验收" });
  host.discardThemeSession(saved.themeId);
  const reopened = await host.openThemeSession(saved.themeId);
  assert.equal(reopened.document.settings.visualModel.common["danmaku|all|main|message"].fontSize.value, 24);
  const adapter = createCompatibleThemeModeAdapter("blivechat-open");
  assert.equal(adapter.exportCss(reopened.document, "full"), composeOpenLiveThemeCss(reopened.document));
  assert.match(adapter.exportCss(reopened.document, "full"), /font-size:\s*24px/);
});

test("开放版运行时按目标隔离并保留既有显示缩放", async () => {
  const bindingState = new Map([
    ["windows", { targetId: "windows", targetKind: "windows", themeId: "old", revision: 1, displayScale: .9 }],
    ["obs-open", { targetId: "obs-open", targetKind: "obs", themeId: "old", revision: 1, displayScale: 1 }],
  ]);
  const records = new Map();
  const bindings = {
    async load(){ return [...bindingState.values()]; },
    async bind(value){ bindingState.set(value.targetId, { ...value, displayScale: value.displayScale ?? bindingState.get(value.targetId)?.displayScale ?? 1 }); },
    async setDisplayScale(targetId, displayScale){ bindingState.set(targetId, { ...bindingState.get(targetId), displayScale }); },
    async remove(targetId){ bindingState.delete(targetId); }, subscribe(){ return () => {}; },
  };
  const runtime = createOpenLiveThemeRuntime(bindings, { async load(){return[]}, async loadTarget(id){return records.get(id)}, async save(value){records.set(value.context.targetId, structuredClone(value))}, async remove(targetId){records.delete(targetId)}, async publish(){}, subscribe(){return()=>{}}, async loadObsSnapshot(){return undefined}, async persistObsSnapshot(){}, async emitObsSnapshot(){}, async removeObsSnapshot(){} });
  const document = { ...createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme(), themeId: "open-custom", origin: "custom", revision: 2 };
  document.settings = { ...document.settings, showTimestamp: true };
  await runtime.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 });
  assert.equal(bindingState.get("windows").displayScale, .9);
  assert.equal(runtime.snapshot("windows").context.displayScale, .9);
  const resolved = runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" });
  assert.equal(typeof resolved, "function");
  assert.deepEqual({ reveal: resolved.rootProps.showTimestamp, item: resolved.rootProps.style["--yt-live-chat-item-timestamp-display"], paid: resolved.rootProps.style["--yt-live-chat-paid-message-timestamp-display"] }, { reveal: true, item: "inline", paid: "inline" });
  await runtime.publish(document, { target: "obs", targetId: "obs-open", roomId: "42", displayScale: .9 });
  assert.equal(bindingState.get("obs-open").displayScale, .9, "OBS 重存必须采用表单中的新缩放");
  assert.equal(runtime.snapshot("obs-open").context.displayScale, .9);
  const restore = await runtime.remove("windows", "windows");
  assert.equal(runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), undefined);
  await restore();
  assert.equal(typeof runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), "function");
});

test("开放版 OBS 快照独立携带模式、房间和目标缩放", () => {
  const document = { ...createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme(), themeId: "open-obs", revision: 3 };
  const snapshot = buildOpenLiveObsSnapshot(document, { target: "obs", targetId: "obs-open", roomId: "42", displayScale: 1.2 }, { showTimestamp: true, maskUsername: true });
  assert.deepEqual({ mode: snapshot.mode, targetId: snapshot.targetId, roomId: snapshot.roomId, displayScale: snapshot.displayScale }, { mode: "blivechat-open", targetId: "obs-open", roomId: 42, displayScale: 1.2 });
  const html = renderToStaticMarkup(React.createElement(NativeObsContent, { events: [], targetId: "obs-open", snapshot }));
  assert.match(html, /zoom:1\.2/);
});

test("开放版基础 CSS 进入预览与正式来源文档", () => {
  const document = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
  document.styles.baseCss = ".base-import-probe{color:rgb(1,2,3)}";
  document.styles.customCss = ".custom-probe{display:block}";
  const result = createOpenLiveDocumentCss(document);
  assert.match(result.css, /base-import-probe/);
  assert.match(result.css, /custom-probe/);
});
