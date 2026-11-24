import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
let vite, api, Area, prefs, settings, MsgType;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-stylePreviewContext.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},
    root: fileURLToPath(new URL("..", import.meta.url)),
    configFile: false,
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, watch: null },
    logLevel: "silent",
  });
  api = await vite
    .ssrLoadModule("/src/components/stylePreviewContext.ts")
    .catch(() => ({}));
  ({ DEFAULT_EVENT_DISPLAY_PREFERENCES: prefs } = await vite.ssrLoadModule(
    "/src/eventDisplaySettings.ts",
  ));
  ({ createDefaultEventStyleSettings: settings } = await vite.ssrLoadModule(
    "/src/eventStyleSettings.ts",
  ));
  ({ MsgType } = await vite.ssrLoadModule("/src/protocol/types.ts"));
});
after(async () => {
  await vite?.close();
});

const input = () => ({
  displayPreferences: {
    ...prefs,
    showAvatar: false,
    showGuardIdentity: false,
    showGiftImage: false,
  },
  eventFontSize: 18,
  windowEventFontSize: 22,
  bigEmoteWidth: 60,
  windowBigEmoteWidth: 80,
  reviewBigEmoteMode: "custom",
  reviewBigEmoteWidth: 32,
});

test("五个预览上下文消费自己的尺寸和实际分类，全部部件不扩大副窗类别", () => {
  assert.equal(typeof api.resolveStylePreviewContext, "function");
  for (const [context, size, area] of [
    ["live", 18, "event-area live"],
    ["review", 14, "event-area review"],
    ["window-chat", 22, "event-area window window-chat"],
    ["window-pay", 22, "event-area window window-pay"],
    ["obs", 18, "event-area obs"],
  ]) {
    const current = api.resolveStylePreviewContext(context, "current", input());
    assert.equal(current.fontSize, size);
    assert.equal(current.areaClass.replace(/ theme-target-[\w-]+/, ""), area);
    assert.equal(current.displayPreferences.showAvatar, false);
    const all = api.resolveStylePreviewContext(context, "all", input());
    assert.equal(all.displayPreferences.showAvatar, false);
    assert.equal(all.displayPreferences.showGuardIdentity, false);
    assert.equal(all.displayPreferences.showCurrentRank, input().displayPreferences.showCurrentRank);
    assert.equal(input().displayPreferences.showAvatar, false);
    const types = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18].filter((msgType) =>
      all.accepts({ msgType }),
    );
    assert.deepEqual(
      types,
      context === "window-chat"
        ? [0, 10]
        : context === "window-pay"
          ? [1, 2, 3, 4, 5, 6, 7, 9]
          : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 18],
    );
  }
});
test("真实预览区域在回看显示时间并消费配置，当前设置隐藏身份和媒体", async () => {
  ({ StylePreviewArea: Area } = await vite
    .ssrLoadModule("/src/components/StylePreviewArea.tsx")
    .catch(() => ({})));
  assert.equal(typeof Area, "function");
  const events = [
    {
      id: "preview-a",
      roomId: 1,
      ts: 1700000000000,
      msgType: 0,
      user: { uid: "same", uname: "固定用户", guardLevel: 1 },
      text: "完整弹幕",
    },
  ];
  const props = {
    ...input(),
    eventStyleSettings: settings(),
    context: "review",
    mode: "current",
    events,
  };
  const html = renderToStaticMarkup(React.createElement(Area, props));
  assert.match(html, /event-area theme-target-review review/);
  assert.match(html, /--event-font-size:14px/);
  assert.doesNotMatch(html, /--big-emote-size:20px/);
  assert.match(html, /class="time[^\"]*"/);
  assert.match(html, /class="guard-badge/);
  assert.match(html, /完整弹幕/);
  const chat = renderToStaticMarkup(
    React.createElement(Area, {
      ...props,
      context: "window-chat",
      mode: "all",
      events: [
        ...events,
        {
          id: "gift-a",
          roomId: 1,
          ts: 1,
          msgType: 1,
          gift: {
            id: 1,
            name: "不支持礼物",
            count: 1,
            price: 1,
            total: 1,
            coinType: "gold",
          },
        },
      ],
    }),
  );
  assert.match(chat, /event-area theme-target-windows window window-chat/);
  assert.doesNotMatch(chat, /不支持礼物/);
  assert.doesNotMatch(chat, /class="guard-badge/);
  const empty = renderToStaticMarkup(
    React.createElement(Area, { ...props, context: "window-pay", events }),
  );
  assert.match(empty, /当前区域没有此类样例/);
  assert.doesNotMatch(empty, /完整弹幕/);
});

test("置顶预览复用正式排序并包含天选与红包", async () => {
  ({ StylePreviewArea: Area } = await vite
    .ssrLoadModule("/src/components/StylePreviewArea.tsx")
    .catch(() => ({})));
  const base = { roomId: 1, user: { uid: "u", uname: "用户" } };
  const events = [
    {
      ...base,
      id: "gift",
      ts: 1000,
      msgType: MsgType.Gift,
      gift: {
        id: 1,
        name: "礼物",
        count: 1,
        price: 100000,
        total: 100000,
        coinType: "gold",
        paymentRmb: 100,
        priceRmb: 100,
        totalRmb: 100,
      },
    },
    {
      ...base,
      id: "red",
      ts: 2000,
      msgType: MsgType.RedPocketStart,
      text: "红包",
      lottery: {
        id: 2,
        awardName: "红包",
        awardNum: 1,
        totalPrice: 200000,
        waitTime: 600,
      },
    },
    {
      ...base,
      id: "lot",
      ts: 3000,
      msgType: MsgType.AnchorLotStart,
      lottery: { id: 3, awardName: "天选奖品", awardNum: 1, maxTime: 600 },
    },
  ];
  const html = renderToStaticMarkup(
    React.createElement(Area, {
      ...input(),
      eventStyleSettings: settings(),
      context: "window-pay",
      mode: "all",
      events,
      showStickyPreview: true,
      stickySettings: {
        enabled: true,
        position: "top",
        giftThreshold: 30,
        maxCount: 10,
        sort: "amount",
      },
    }),
  );
  assert.match(html, /aria-label="置顶栏"/);
  assert.match(html, /class="[^"]*sticky-area[^"]*"/);
  assert.match(html, /class="[^"]*event-sticky[^"]*"/);
  assert.match(
    html,
    /天选[\s\S]*price-unit">¥[\s\S]*price-value">200[\s\S]*price-unit">¥[\s\S]*price-value">100/,
    html,
  );
});

test("当前现场和副窗遵守仅大航海进房，回看独立且全部部件可见", () => {
  const configured = input();
  configured.displayPreferences.onlyGuardEntry = true;
  const entry = {
    msgType: 10,
    interactKind: "entry",
    user: { uid: "ordinary", uname: "普通", guardLevel: 0 },
  };
  for (const context of ["live", "window-chat"]) {
    assert.equal(
      api
        .resolveStylePreviewContext(context, "current", configured)
        .accepts(entry),
      false,
    );
    assert.equal(
      api
        .resolveStylePreviewContext(context, "current", configured)
        .accepts({ ...entry, user: { ...entry.user, guardLevel: 1 } }),
      true,
    );
    assert.equal(
      api.resolveStylePreviewContext(context, "all", configured).accepts(entry),
      true,
    );
  }
  assert.equal(
    api
      .resolveStylePreviewContext("review", "current", configured)
      .accepts(entry),
    true,
  );
});

test('原生当前设置在容量前过滤主题分类，全部部件临时放开', async () => {
  ({StylePreviewArea: Area}=await vite.ssrLoadModule('/src/components/StylePreviewArea.tsx'));
  const configured=settings();configured.eventVisibility={categories:{danmaku:false},children:{}};
  const event={id:'blocked',roomId:1,ts:1000,msgType:0,text:'被关闭的弹幕'};
  const props={...input(),context:'obs',mode:'current',events:[event],eventStyleSettings:configured};
  assert.doesNotMatch(renderToStaticMarkup(React.createElement(Area,props)),/被关闭的弹幕/);
  assert.match(renderToStaticMarkup(React.createElement(Area,{...props,mode:'all'})),/被关闭的弹幕/);
});
