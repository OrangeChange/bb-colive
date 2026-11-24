import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
let EventRow;
let RankUserRow;
let resolveGuardIdentityIconSrc;
let MsgType;
let displaySettings;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-guardIdentityDisplay.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root,
    configFile: false,
    server: { middlewareMode: true, watch:null },
    appType: "custom",
    logLevel: "silent",
  });
  [{ EventRow }, { RankUserRow }, { MsgType }, displaySettings, { resolveGuardIdentityIconSrc }] = await Promise.all([
    vite.ssrLoadModule("/src/components/EventRow.tsx"),
    vite.ssrLoadModule("/src/components/RoomInsightsView.tsx"),
    vite.ssrLoadModule("/src/protocol/types.ts"),
    vite.ssrLoadModule("/src/eventDisplaySettings.ts"),
    vite.ssrLoadModule("/src/components/GuardIdentityBadge.tsx"),
  ]);
});

after(async () => {
  await vite?.close();
});

const iconUrl = "https://i0.hdslb.com/bfs/live/room-captain.png";
const eventFor = (guardIconUrl = iconUrl, guardLevel = 1, guardIconSet) => ({
  id: "guard-event",
  msgType: MsgType.Danmu,
  roomId: 123,
  ts: 1_780_000_000_000,
  user: {
    uid: "7001",
    uname: "舰长用户",
    guardLevel,
    ...(guardIconSet ? { guardIconSet } : {}),
    ...(guardIconUrl ? { guardIconUrl } : {}),
  },
  text: "你好",
});

const renderEvent = (mode, guardIconUrl = iconUrl) => renderToStaticMarkup(React.createElement(EventRow, {
  ev: eventFor(guardIconUrl),
  showTime: false,
  displayPreferences: {
    ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES,
    showGuardIdentity: true,
    guardIdentityDisplayMode: mode,
  },
}));

test("榜单排名开启时显示在用户名之前，关闭或未上榜时不显示", () => {
  const event = eventFor(null);
  event.user.currentRank = 2;
  const hidden = renderToStaticMarkup(React.createElement(EventRow, {
    ev: event,
    showTime: false,
    displayPreferences: displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES,
  }));
  assert.doesNotMatch(hidden, /榜\s*2/);

  const shown = renderToStaticMarkup(React.createElement(EventRow, {
    ev: event,
    showTime: false,
    displayPreferences: { ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES, showCurrentRank: true },
  }));
  assert.match(shown, /event-current-rank event-current-rank--2/);
  assert.match(shown, />榜2<\/span>[\s\S]*舰长用户/);
  assert.ok(shown.indexOf(">榜2<") < shown.indexOf("舰长用户"));

  const unranked = { ...event, user: { ...event.user, currentRank: 0 } };
  const unrankedMarkup = renderToStaticMarkup(React.createElement(EventRow, {
    ev: unranked,
    showTime: false,
    displayPreferences: { ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES, showCurrentRank: true },
  }));
  assert.doesNotMatch(unrankedMarkup, /榜\s*0/);
});

test("大航海图标模式显示事件原始 URL，缺图时使用内置图标而非文字", () => {
  const icon = renderEvent("icon");
  assert.match(icon, new RegExp(`src="${iconUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));

  assert.match(icon, /height="16"/);
  assert.doesNotMatch(icon, /width="36"/);
  assert.match(icon, /w-auto[^\"]*max-w-9/);

  const fallback = renderEvent("icon", null);
  assert.match(fallback, /<img[^>]+src="\/guard-identities\/standard-captain.png"/);
  assert.doesNotMatch(fallback, />舰长<\/span>/);
  assert.doesNotMatch(fallback, /<img[^>]+room-captain\.png/);
});

test("三个身份在缺图的榜单和各类事件中仍显示对应图标", () => {
  for (const [modelLevel, wireLevel, name, asset] of [[1, 3, "舰长", "captain"], [2, 2, "提督", "admiral"], [3, 1, "总督", "governor"]]) {
    const rank = renderToStaticMarkup(React.createElement(RankUserRow, {
      user: { uid: "7001", name: "用户", rank: 1, guardLevel: wireLevel },
      kind: "guard", guardIdentityDisplayMode: "icon",
    }));
    assert.match(rank, new RegExp(`<img[^>]+src="/guard-identities/standard-${asset}.png"`));
    assert.doesNotMatch(rank, new RegExp(`>${name}</span>`));
    for (const msgType of [MsgType.Danmu, MsgType.Interact, MsgType.Gift, MsgType.SuperChat, MsgType.GuardBuy]) {
      const ev = eventFor(null);
      ev.user.guardLevel = modelLevel;
      ev.msgType = msgType;
      const markup = renderToStaticMarkup(React.createElement(EventRow, { ev, displayPreferences: displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES }));
      if(msgType === MsgType.GuardBuy) assert.match(markup,new RegExp(`guard/${asset}-animate.png`));
      else assert.match(markup, new RegExp(`<img[^>]+src="/guard-identities/standard-${asset}.png"`));
    }
  }
});

test("大航海文字模式显示舰长名称且不输出图片", () => {
  const text = renderEvent("text");
  assert.match(text, />舰长</);
  assert.doesNotMatch(text, /room-captain\.png/);
});

test("图标资源由身份等级与图标套系决定，增强套系的失效 URL 不回退到基础图标", () => {
  for (const [guardLevel, asset] of [[1, "captain"], [2, "admiral"], [3, "governor"]]) {
    const ev = eventFor(null, guardLevel, "base");
    const base = renderToStaticMarkup(React.createElement(EventRow, {
      ev,
      displayPreferences: displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES,
    }));
    assert.match(base, new RegExp(`/guard-identities/standard-${asset}\\.png`));

    const enhancedEvent = eventFor(null, guardLevel, "enhanced");
    const enhanced = renderToStaticMarkup(React.createElement(EventRow, {
      ev: enhancedEvent,
      displayPreferences: displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES,
    }));
    assert.match(enhanced, new RegExp(`/guard-identities/${asset}\\.png`));
    assert.doesNotMatch(enhanced, new RegExp(`/guard-identities/standard-${asset}\\.png`));
  }
});

test("远程大航海图标加载失败时，按当前图标套系回退", () => {
  assert.equal(resolveGuardIdentityIconSrc({
    iconUrl: "https://invalid.example/captain.png",
    failedUrl: "https://invalid.example/captain.png",
    iconSet: "enhanced",
    guardLevel: 1,
  }), "/guard-identities/captain.png");
  assert.equal(resolveGuardIdentityIconSrc({
    iconUrl: "https://invalid.example/captain.png",
    failedUrl: "https://invalid.example/captain.png",
    iconSet: "base",
    guardLevel: 1,
  }), "/guard-identities/standard-captain.png");
});

test("没有原始 URL 时，增强套系仍按三个身份分别显示本地图标", () => {
  for (const [guardLevel, asset] of [[1, "captain"], [2, "admiral"], [3, "governor"]]) {
    const markup = renderToStaticMarkup(React.createElement(EventRow, {
      ev: eventFor(null, guardLevel, "enhanced"),
      displayPreferences: displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES,
    }));
    assert.match(markup, new RegExp(`/guard-identities/${asset}\\.png`));
  }
});

test("所有带用户的事件分支都使用同一套身份显示设置", () => {
  const userEvents = [
    { msgType: MsgType.AnchorLotAward, lottery: { winners: [{ uid: "7001", uname: "舰长用户" }], awardName: "礼物" } },
    { msgType: MsgType.RedPocketStart, lottery: { totalPrice: 1000, awards: [] } },
    { msgType: MsgType.RedPocketWinner, lottery: { winners: [{ uid: "7001", uname: "舰长用户" }], awardName: "礼物" } },
    { msgType: MsgType.Recall },
  ];

  for (const extra of userEvents) {
    const event = { ...eventFor(iconUrl), ...extra };
    const live = renderToStaticMarkup(React.createElement(EventRow, {
      ev: event,
      liveLayout: true,
      showTime: false,
      displayPreferences: { ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES, showGuardIdentity: true },
    }));
    const review = renderToStaticMarkup(React.createElement(EventRow, {
      ev: event,
      reviewLayout: true,
      showTime: false,
      displayPreferences: { ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES, showGuardIdentity: true },
    }));
    if(extra.msgType !== MsgType.RedPocketStart) { assert.doesNotMatch(live,/room-captain\.png/); assert.doesNotMatch(review,/room-captain\.png/); continue; }
    assert.match(live, new RegExp(`src="${iconUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(review, new RegExp(`src="${iconUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));

    const hidden = renderToStaticMarkup(React.createElement(EventRow, {
      ev: event,
      showTime: false,
      displayPreferences: { ...displaySettings.DEFAULT_EVENT_DISPLAY_PREFERENCES, showGuardIdentity: false },
    }));
    assert.doesNotMatch(hidden, /room-captain\.png|standard-captain\.png/);
  }
});

test("右上角榜单身份徽标支持图标与文字模式", () => {
  const user = {
    uid: "7001", name: "舰长用户", rank: 1, guardLevel: 3,
    guardIconUrl: iconUrl,
  };
  const renderRankUser = (guardIdentityDisplayMode, showGuardIdentity = true) => renderToStaticMarkup(React.createElement(RankUserRow, {
    user, kind: "guard", guardIdentityDisplayMode, showGuardIdentity,
  }));

  const icon = renderRankUser("icon");
  assert.match(icon, /room-captain\.png/);
  assert.doesNotMatch(icon, /width="36"/);

  const text = renderRankUser("text");
  assert.match(text, />舰长</);
  assert.doesNotMatch(text, /room-captain\.png/);

  const hidden = renderRankUser("icon", false);
  assert.doesNotMatch(hidden, /room-captain\.png|大航海身份：舰长|>舰长</);
});

test("右上角前三头像仍是纯头像，不附加大航海身份标记", async () => {
  const { RankTopThree } = await vite.ssrLoadModule("/src/components/RankTopThree.tsx");
  const markup = renderToStaticMarkup(React.createElement(RankTopThree, {
    users: [{ uid: "7001", name: "舰长用户", face: "", rank: 1, guardLevel: 1, guardIconUrl: iconUrl }],
    pending: false,
  }));
  assert.doesNotMatch(markup, /room-captain\.png|大航海身份：/);
});

test("现场、两个副窗口和回看事件行统一复用 EventRow 身份徽标", () => {
  for (const path of [
    "src/components/EventList.tsx",
    "src/windows/FloatingEventWindow.tsx",
    "src/components/ReviewSessionTimeline.tsx",
    "src/components/ReviewOwnerEventResults.tsx",
  ]) {
    assert.match(readFileSync(new URL(`../${path}`, import.meta.url), "utf8"), /<EventRow\b/);
  }
  const rankings = readFileSync(new URL("../src/components/RoomRankings.tsx", import.meta.url), "utf8");
  assert.match(rankings, /applyObservedGuardIcons/);
  assert.match(rankings, /RankUserRow/);
});

 test("共享头像在榜单中有独立于事件区域的尺寸和头像框约束", () => {
  const component = readFileSync(new URL("../src/components/UserAvatar.tsx", import.meta.url), "utf8");
  assert.match(component, /import ['"]\.\/UserAvatar\.css['"]/);
  const css = readFileSync(new URL("../src/components/UserAvatar.css", import.meta.url), "utf8");
  assert.match(css, /\.user-avatar\s*\{[^}]*width:\s*var\(--avatar-size,\s*calc\(var\(--event-font-size,\s*16px\) \* 24 \/ 16\)\)/s);
  assert.match(css, /\.user-avatar\s+\.avatar-frame\s*\{[^}]*position:\s*absolute/s);
  assert.match(css, /\.user-avatar\s+:is\(\.avatar,\s*\.avatar-placeholder\)\s*\{[^}]*width:\s*100%/s);
});
