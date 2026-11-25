import { readUiSource } from "./helpers/readUiSource.mjs";
import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { getNativeEventSample } from "./fixtures/nativeEventSamples.ts";
import { createEventAreaConfigCss } from "../src/eventAreaStyleConfig.ts";
import { createDefaultEventStyleSettings } from "../src/eventStyleSettings.ts";

const archiveCss = readUiSource(new URL('../src/archiveEventStyle.css', import.meta.url), 'utf8');
const eventCss = readUiSource(new URL('../src/eventStyle.css', import.meta.url), 'utf8');
let vite, EventRow;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-eventRow.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  ({ EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx"));
});
after(async () => { await vite?.close(); });
const render = (key, props = {}) => renderToStaticMarkup(React.createElement(EventRow, { ev: getNativeEventSample(key), showTime: false, ...props }));

const source = readUiSource(
  fileURLToPath(new URL("../src/components/EventRow.tsx", import.meta.url)),
  "utf8",
);

test("礼物数量拆分符号和数字并使用共享基线布局", () => {
  for (const props of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
    assert.match(render("normal-gift", props), /class="quantity gift-count"><span class="prefix quantity-prefix">×<\/span><span class="number quantity-number">1<\/span><\/span>/);
  }
});

test("大航海时长与金额保留分组和独立语义部件", () => {
  for (const props of [{ liveLayout: true }, { reviewLayout: true }, {}]) {
    const html = render("guard-admiral", props);
    assert.match(html, /class="guard-duration inline-flex[^\"]*items-center[^\"]*font-mono[^\"]*"[^>]*><span class="prefix quantity-prefix">×<\/span><span class="number quantity-number">3<\/span><span class="unit quantity-unit">月<\/span><\/span>/);
    assert.match(html, /class="price[^"]*"[^>]*><span class="price-unit">¥<\/span><span class="price-value">5994<\/span><\/span>/);
  }
});

test("天选结果以类别标题和已知获奖人数表达摘要", () => {
  const ev = getNativeEventSample("lottery-result"); ev.lottery.awardNum = 2;
  const html = renderToStaticMarkup(React.createElement(EventRow, {ev,liveLayout:true}));
  assert.match(html, /天选开奖/);
  assert.match(html, /<span class="winner-count">2 人<\/span>获得 /);
  assert.doesNotMatch(html.split("<details")[0], /等 2 人|中奖用户/);
});

test("盲盒连击数量与盲盒金额之间保留空格", () => {
  assert.match(source, /leadingSpace=\{count > 1\}/);
});

test("礼物数字价格保持数字字体，免费文字单独使用界面字体", () => {
  assert.match(render("free-gift", { liveLayout: true }), /class="price gift-price gift-free-label font-ui[^>]*>免费<\/span>/);
  assert.match(render("normal-gift", { liveLayout: true }), /class="price gift-price font-mono[^>]*><span class="price-unit">¥<\/span><span class="price-value">50<\/span>/);
});

test("原生信息与正文直接组合，回看保留正文主体", () => {
  assert.match(source, /liveLayout\?: boolean/);
  assert.match(source, /function LiveSplitBody/);
  assert.match(source, /className="event-body"/);
  assert.match(source, /className="info"/);
  assert.doesNotMatch(source, /className="event-header/);
});

test("副窗口相同弹幕使用独立的连击胶囊样式", () => {
  assert.match(source, /danmuRepeatCount/);
  assert.match(source, /danmu-repeat-badge/);
  assert.match(source, /function DanmuRepeatBadge\(\{ count \}/);
  assert.match(source, /×\{count\}/);
});

test("大表情合并后也显示连击次数，且现场布局复用同一徽标", () => {
  const bodyStart = source.indexOf("function Body");
  const bodyEnd = source.indexOf("case MsgType.Gift:", bodyStart);
  const danmuBody = source.slice(bodyStart, bodyEnd);
  assert.match(danmuBody, /DanmuRepeatBadge/);

  const liveStart = source.indexOf("function LiveSplitBody");
  const liveBody = source.slice(liveStart, bodyStart);
  assert.match(liveBody, /DanmuRepeatBadge/);
});

test("现场和弹幕窗用户名使用 16px 事件字号", () => {
  const css = createEventAreaConfigCss("name", { settings: createDefaultEventStyleSettings(), layout: "live", fontSize: 16, bigEmoteSize: 40, padding: 6, spacing: 0 });
  assert.ok(css.includes("--event-font-size:16px"));
  const html = render("text", { liveLayout: true });
  const name = html.match(/<(?:span|button) class="[^"]*username[^>]*>/)?.[0];
  assert.ok(name);
  assert.doesNotMatch(name, /style=/, "用户名不能以内联字号阻断区域参数");
});

test("大表情、互动和大航海不进入现场两行布局", () => {
  assert.match(source, /function canUseLiveSplit[\s\S]*?ev\.emoticon/);
  assert.match(source, /case MsgType\.Interact:/);
  assert.match(source, /case MsgType\.GuardBuy:/);
  assert.match(source, /case MsgType\.GuardHonor:/);
});

test("回看大表情按独立行高缩放，官方横幅保持独立限制", () => {
  for (const [key, kind] of [["big-emote", "big"], ["banner-emote", "banner"]]) {
    const html = render(key, { reviewLayout: true });
    assert.ok(html.includes(`data-event-emote="${kind}"`));
    const img = html.match(/<img[^>]*class="emote [^>]*>/)?.[0];
    assert.ok(img?.includes(`${kind === "big" ? "big" : "banner"}-emote`));
    assert.doesNotMatch(img, /style=/);
    assert.doesNotMatch(html, /min-height:/, "回看预留高度不能冻结在行内");
  }
  const css = createEventAreaConfigCss("emotes", { settings: createDefaultEventStyleSettings(), layout: "review", fontSize: 13, padding: 6, spacing: 0 });
  assert.ok(css.includes("--event-font-size:13px"));
  const big = archiveCss.match(/\.event\.event-surface-archive \.big-emote \{([^}]+)\}/)?.[1];
  const banner = archiveCss.match(/\.event\.event-surface-archive \.banner-emote \{([^}]+)\}/)?.[1];
  assert.match(big, /max-height: calc\(var\(--review-line\) \* 2\)/);
  assert.match(banner, /max-width: min\(100%, calc\(var\(--review-main\) \* 15\)\)/);
  assert.match(banner, /max-height: var\(--review-line\)/);
});

test("事件行使用全局显示偏好控制头像、身份徽标和礼物图片", () => {
  assert.match(source, /displayPreferences/);
  assert.match(source, /showAvatar/);
  assert.match(source, /showGuardIdentity/);
  assert.match(source, /showAdminIdentity/);
  assert.match(source, /showAnchorIdentity/);
  assert.match(source, /shouldShowFanMedal/);
  assert.match(source, /showGiftImage/);
});

test("GiftIcon 在关闭礼物图片时仍按固定顺序调用 Hook", () => {
  const giftIconStart = source.indexOf("function GiftIcon(");
  const giftIconEnd = source.indexOf("function Avatar", giftIconStart);
  const giftIcon = source.slice(giftIconStart, giftIconEnd);
  const stateIndex = giftIcon.indexOf("const [idx, setIdx] = useState(0)");
  const guardIndex = giftIcon.indexOf("if (!showGiftImage) return null;");

  assert.ok(stateIndex >= 0, "GiftIcon 必须调用 useState");
  assert.ok(guardIndex >= 0, "GiftIcon 必须处理 showGiftImage=false");
  assert.ok(stateIndex < guardIndex, "useState 必须位于 showGiftImage 条件返回之前");
});

test("回看头像使用独立14px比例，现场尺寸跟随基准比例", () => {
  const settings = createDefaultEventStyleSettings(); settings.avatarSize = 24; settings.reviewAvatarSize = 32;
  const liveCss = createEventAreaConfigCss("sizes", { settings, layout: "live", fontSize: 16, padding: 6, spacing: 0 });
  assert.ok(liveCss.includes("--event-config-avatar-scale:1.5;"));
  assert.match(eventCss, /--avatar-size, calc\(var\(--event-font-size, 16px\) \* var\(--event-config-avatar-scale, 1\.5\)\)/);
  assert.match(eventCss, /max-height: var\(--big-emote-size, calc\(var\(--event-font-size, 16px\) \* 40 \/ 16\)\)/);
  assert.match(archiveCss, /--avatar-size: calc\(var\(--review-main\) \* 12 \/ 7\)/);
  assert.match(archiveCss, /--review-line: calc\(var\(--review-main\) \* 10 \/ 7\)/);
  assert.match(render("text", { reviewLayout: true, eventStyleSettings: settings, eventFontSize: 24 }), /--review-size:14px/);
});

test("身份显示开关只控制标记，不影响用户名身份色", () => {
  const identityStart = source.indexOf("function identityNameClass");
  const identityEnd = source.indexOf("/** 事件主色", identityStart);
  const identityBlock = source.slice(identityStart, identityEnd);
  assert.match(identityBlock, /if \(user\.isAnchor\)/);
  assert.match(identityBlock, /if \(user\.guardLevel > 0\)/);
  assert.match(identityBlock, /if \(user\.isAdmin\)/);
  assert.doesNotMatch(identityBlock, /preferences\.show(?:Anchor|Guard|Admin)Identity/);

  const unameStart = source.indexOf("function Uname");
  const unameEnd = source.indexOf("/** 正则元字符", unameStart);
  assert.match(source.slice(unameStart, unameEnd), /identityNameClass\(user\)/);
});

test("天选标题与用户资料分开，资格条件保留原字段",()=>{
  const html=render("lottery-start",{liveLayout:true});
  assert.doesNotMatch(html,/class="event-header event-meta-row/);
  assert.match(html,/天选福袋/);assert.match(html,/lottery-requirement/);
});
test("红包主金额独立于奖励和口令，保留小数金额",()=>{
  const ev=getNativeEventSample("pocket-start");ev.lottery.totalPrice=2500;
  const html=renderToStaticMarkup(React.createElement(EventRow,{ev,liveLayout:true,showTime:false}));
  assert.match(html,/>2.5<\/span>/);assert.match(html,/发出红包<\/span>/);assert.match(html,/<span class="prefix">奖励<\/span> /);
});
test("现场默认行不生成装饰竖线，紧凑历史布局保持独立",()=>{
  assert.doesNotMatch(render("normal-gift",{liveLayout:true}),/event-row-highlight/);
});

test("荣誉数字只从成就文案提取，数字用户名不变成里程碑",()=>{
  const ev={...getNativeEventSample("guard-admiral"),msgType:9,honor:{firstLine:"恭喜主播<%12345%>",secondLine:"达成<%100%>人舰队"}};
  const html=renderToStaticMarkup(React.createElement(EventRow,{ev,liveLayout:true,showTime:false}));
  assert.match(html,/honor-milestone[^>]*>100<\/span>/);assert.doesNotMatch(html,/honor-milestone[^>]*>12345<\/span>/);
});

test("部分中奖名单保留已知获奖总人数",()=>{
 for(const key of ["pocket-result","lottery-result"]){const ev=getNativeEventSample(key);ev.lottery.awardNum=10;
 const html=renderToStaticMarkup(React.createElement(EventRow,{ev,liveLayout:true,showTime:false}));
 assert.match(html,/<span class="winner-count">10 人<\/span>获得 /);assert.doesNotMatch(html,/>2 人<\/span>获得 /);}
});

test("活动倒计时与正文同属事件根",()=>{
 const html=renderToStaticMarkup(React.createElement(EventRow,{ev:getNativeEventSample('lottery-start'),liveLayout:true,showTime:false}));
 assert.match(html,/class="activity-status/);
 assert.doesNotMatch(html,/class="(?:event-layout|event-card|event-content)\b/);
});



test("事件图标可独立隐藏，礼物图片与事件正文继续显示", async () => {
  const { DEFAULT_EVENT_DISPLAY_PREFERENCES } = await import("../src/eventDisplaySettings.ts");
  const displayPreferences = {...DEFAULT_EVENT_DISPLAY_PREFERENCES,showEventIcon:false};
  for (const key of ["translated-sc","guard-governor","lottery-start","normal-gift"]) {
    const html = render(key,{liveLayout:true,displayPreferences});
    assert.doesNotMatch(html,/class="event-icon\b/);
    if(key === "normal-gift") assert.match(html,/class="gift-icon\b/);
  }
});


test("关闭事件图标后不保留空媒体容器", async () => {
  const { DEFAULT_EVENT_DISPLAY_PREFERENCES } = await import("../src/eventDisplaySettings.ts");
  for (const key of ["lottery-start", "pocket-start"]) {
    const html=render(key,{liveLayout:true,displayPreferences:{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showEventIcon:false}});
    assert.doesNotMatch(html,/<span class="event-media"><\/span>/);
  }
});
