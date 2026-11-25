import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "./helpers/vite.mjs";
import {
  getNativeEventSample,
  nativeEventSamples,
} from "./fixtures/nativeEventSamples.ts";
import { MsgType } from "../src/protocol/types.ts";
function renderFloatingMarkup(component, props) {
  const previousComputedStyle = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ getPropertyValue: () => "#ffffff" });
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  globalThis.document = { documentElement: { dataset: { softwareScheme: "light" } } };
  globalThis.window = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
  try { return renderToStaticMarkup(React.createElement(component, props)); }
  finally { globalThis.getComputedStyle = previousComputedStyle; globalThis.document = previousDocument; globalThis.window = previousWindow; }
}
let vite, EventRow, preferences, GuardIdentityBadge, FanMedalBadge;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeEventStyleContract.test.mjs",optimizeDeps:{noDiscovery:true,include:[]},configFile:false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true, watch:null },
    appType: "custom",
    logLevel: "silent",
  });
  ({ EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx"));
  ({ DEFAULT_EVENT_DISPLAY_PREFERENCES: preferences } =
    await vite.ssrLoadModule("/src/eventDisplaySettings.ts"));
  ({ GuardIdentityBadge } = await vite.ssrLoadModule(
    "/src/components/GuardIdentityBadge.tsx",
  ));
  ({ FanMedalBadge } = await vite.ssrLoadModule(
    "/src/components/FanMedalBadge.tsx",
  ));
});
after(async () => {
  await vite?.close();
});

// 读取真实 SSR 输出的标签层级，断言公共部件的包含关系。
function elements(html) {
  const root = { children: [] },
    stack = [root];
  for (const match of html.matchAll(/<\/?([\w-]+)\b([^>]*?)>|([^<]+)/g)) {
    if (match[3]) {
      const text = match[3]
        .replaceAll("&quot;", '"')
        .replaceAll("&#x27;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&");
      for (const node of stack) node.text = (node.text ?? "") + text;
      continue;
    }
    if (match[0].startsWith("</")) {
      stack.pop();
      continue;
    }
    const attrs = Object.fromEntries(
      [...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((item) => [
        item[1],
        item[2],
      ]),
    );
    const node = { tag: match[1], attrs, children: [], parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    if (!["img", "input", "link", "br", "hr", "meta"].includes(node.tag))
      stack.push(node);
  }
  return root;
}
const hasClass = (node, name) =>
  (node.attrs?.class ?? "").split(/\s+/).includes(name);
const findAll = (node, name) =>
  node.children.flatMap((child) => [
    ...(hasClass(child, name) ? [child] : []),
    ...findAll(child, name),
  ]);
const one = (node, name) => {
  const found = findAll(node, name);
  assert.equal(found.length, 1, `公共部件 ${name} 应出现一次`);
  return found[0];
};
const layouts = [{ liveLayout: true }, { reviewLayout: true }, {}];
const render = (ev, layout = layouts[0], overrides = {}, props = {}) =>
  elements(
    renderToStaticMarkup(
      React.createElement(EventRow, {
        ev,
        showTime: false,
        ...layout,
        displayPreferences: { ...preferences, ...overrides },
        ...props,
      }),
    ),
  );
const allIdentities = { showCurrentRank: true, showHonorLevel: true };

test("零价与免费标签分开，盲盒公开类型优先",()=>{
 for(const layout of layouts){
  const ev=getNativeEventSample('normal-gift');ev.gift.totalRmb=0;ev.gift.isFree=false;
  assert.equal(one(render(ev,layout),'price-value').text,'0');
  ev.gift.isFree=true;assert.equal(one(render(ev,layout),'gift-price').text,'免费');
  assert.ok(hasClass(one(render(getNativeEventSample('blind-gift'),layout),'event'),'gift-blind'));
 }
});

test("Task4：两个真实事件区域各自产生一份配置，空列表也保持独立字号", async () => {
  const { EventList } = await vite.ssrLoadModule(
    "/src/components/EventList.tsx",
  );
  const { createFeedScrollSession } = await vite.ssrLoadModule(
    "/src/events/feedScroll.ts",
  );
  const html = renderToStaticMarkup(
    React.createElement(
      React.Fragment,
      null,
      ...[18, 24].map((size) =>
        React.createElement(EventList, {
          key: size,
          events: [],
          visibleIndices: [],
          viewKey: "fixed",
          feedKey: "fixed",
          feedSession: createFeedScrollSession(0),
          liveLayout: true,
          eventFontSize: size,
        }),
      ),
    ),
  );
  const tree = elements(html),
    areas = findAll(tree, "event-area");
  assert.equal(areas.length, 2);
  for (const [index, area] of areas.entries()) {
    const configs = area.children.filter(
      (child) =>
        child.tag === "style" && child.attrs["data-event-style-config"],
    );
    assert.equal(configs.length, 1, "真实区域必须有一份配置，不依赖行数");
    assert.equal(
      configs[0].attrs["data-event-style-config"],
      area.attrs["data-event-style-scope"],
    );
    assert.ok(
      configs[0].text.includes(`--event-font-size:${[18, 24][index]}px`),
    );
  }
  assert.notEqual(
    areas[0].attrs["data-event-style-scope"],
    areas[1].attrs["data-event-style-scope"],
  );
});

test("Task4：真实fixture提供六实例、全部26变量、加载本地资源和零高spacer", async () => {
  const { Task4Fixture, task4Variables } = await vite.ssrLoadModule(
    "/tests/fixtures/task4EventStyle.tsx",
  );
  const { EventRowSlot } = await vite.ssrLoadModule(
    "/src/components/EventRowSlot.tsx",
  );
  const html = renderToStaticMarkup(React.createElement(Task4Fixture));
  const tree = elements(html),
    areas = findAll(tree, "event-area");
  assert.equal(areas.length, 6);
  assert.equal(Object.keys(task4Variables).length, 26);
  for (const name of Object.keys(task4Variables))
    assert.ok(html.includes(`aria-label="${name}"`));
  for (const area of areas) {
    assert.equal(
      area.children.filter((child) => child.tag === "style").length,
      1,
    );
    assert.ok(findAll(area, "event").length > 0);
    assert.equal(findAll(area, "event-row-slot-spacer").length, 0);
    for (const row of findAll(area, "event")) {
      assert.doesNotMatch(
        row.attrs.style ?? "",
        /font|padding|color|background|min-height|avatar/,
      );
      for (const avatar of findAll(row, "avatar"))
        assert.match(avatar.attrs.src, /wealth-levels\/1.png|noface/);
    }
    assert.ok(
      findAll(area, "avatar").length >= 10,
      "含用户的固定样本提供可加载头像",
    );
  }
  const slot = elements(
    renderToStaticMarkup(
      React.createElement(
        EventRowSlot,
        { eventSpacing: 0 },
        React.createElement("div", { className: "event" }, "固定正文"),
      ),
    ),
  );
  assert.equal(one(slot, "event-row-slot-content").attrs["data-event-spacing"], "");
  const last = elements(
    renderToStaticMarkup(
      React.createElement(EventRowSlot, { showEventSpacing: false }, "末行"),
    ),
  );
  assert.equal(findAll(last, "event-row-slot-spacer").length, 0);
  for (const label of [
    "全部变量",
    "父区域变量",
    "祖先继承",
    "普通CSS覆盖",
    "跟随字号",
    "固定尺寸",
    "复原",
    "间距8",
    "大表情80",
  ])
    assert.ok(html.includes(`>${label}</button>`));
});

test("礼物主图、礼物和金额共用正文父级，购买数量紧跟名称",()=>{
 for(const layout of layouts){
  const tree=render(getNativeEventSample('blind-gift'),layout);
  const content=one(tree,'content'), gift=one(content,'gift'), icon=one(content,'gift-icon');
  assert.ok(content.children.includes(gift));
  assert.ok(content.children.includes(icon));
  assert.ok(content.children.includes(one(content,'gift-price')));
  assert.deepEqual(gift.children.map(node=>node.attrs.class.split(' ').find(c=>c==='gift-name'||c==='gift-count')),['gift-name','gift-count']);
  assert.doesNotMatch(gift.text,/\s×/);
  const blind=one(content,'blind-gift');
  assert.ok(content.children.includes(blind));
  const blindIcon = one(content, 'blind-gift-icon');
  assert.equal(blindIcon.parent, layout.reviewLayout ? content : blind);
  if (!layout.reviewLayout) assert.equal(blind.children[0], blindIcon);
  one(blind,'blind-price'); one(blind,'blind-profit');
 }
});

test("SC金额与标记独立，原文、译文及撤回状态完整",()=>{
 for(const layout of layouts){const ev=getNativeEventSample('sc');ev.sc.trans='平台译文';ev.scDeleted=true;const tree=render(ev,layout);
  one(one(tree,layout.reviewLayout ? 'content' : 'info'),'price');one(tree,'bili-translation');assert.match(one(tree,'content').text,/平台译文/);assert.match(one(one(tree,'content'),'deleted').text,/已撤回/);
 }
});

test("大航海完整保留单月与特殊周期的数值和单位",()=>{
 for(const layout of layouts)for(const [key,number,unit] of [['guard','1','月'],['guard-special','5','天']]){
  const duration=one(render(getNativeEventSample(key),layout),'guard-duration');assert.equal(one(duration,'number').text,number);assert.equal(one(duration,'unit').text,unit);assert.equal(one(duration,'prefix').text,'×');
 }
});

test("大航海金额与陪伴分开，开奖不用首位中奖人作为摘要",()=>{
 for(const layout of layouts){const tree=render(getNativeEventSample('guard'),layout);assert.match(one(tree,'guard-companion-days').text,/陪伴 30 天/);one(one(tree,'content'),'price');
 const result=render(getNativeEventSample('lottery-result'),layout);assert.equal(findAll(result,'user').length,0);assert.match(one(result,'winner-count').text,/3 人/);}
});

test("口令与参与要求保留标签和正文语义",()=>{
 for(const layout of layouts){const tree=render(getNativeEventSample('lottery-start'),layout);const command=one(tree,'lottery-command');assert.equal(one(command,'prefix').text,'口令');assert.match(one(command,'text').text,/好运来/);one(tree,'lottery-requirement');one(tree,'lottery-required-gift');}
});

test("支持的可见事件和六种互动公开精确类型",()=>{
 for(const sample of nativeEventSamples.filter(s=>s.handling==='row'&&![16,26].includes(s.event.msgType)))for(const layout of layouts)one(render(sample.event,layout),'event');
 for(const kind of ['entry','follow','share','specialFollow','mutualFollow','like']){const ev={...getNativeEventSample('entry'),interactKind:kind};const root=one(render(ev),'event');assert.ok(hasClass(root,'type-interaction'));}
});

test("Task2：真实回复无回调为span，有回调为button，普通@不生成回复", () => {
  for (const layout of layouts) {
    for (const key of ["reply", "inline-reply"]) {
      const tree = render(getNativeEventSample(key), layout);
      assert.equal(one(one(tree, "message"), "reply").tag, "span");
      assert.equal(
        one(
          render(
            getNativeEventSample(key),
            layout,
            {},
            { onUserFilter: () => {} },
          ),
          "reply",
        ).tag,
        "button",
      );
    }
    assert.equal(
      findAll(render(getNativeEventSample("plain-at"), layout), "reply").length,
      0,
    );
    const mixedReply = {
      ...getNativeEventSample("mixed-emote"),
      text: "@目标用户，文字[热]结尾",
      replyTo: getNativeEventSample("reply").replyTo,
    };
    one(one(render(mixedReply, layout), "message"), "reply");
  }
});

test("Task2：表情三变体在资源节点互斥，横幅尺寸独立", () => {
  for (const layout of layouts) {
    for (const [key, variant] of [
      ["mixed-emote", "inline-emote"],
      ["big-emote", "big-emote"],
      ["banner-emote", "banner-emote"],
    ]) {
      const tree = render(getNativeEventSample(key), layout),
        emote = one(one(tree, "message"), "emote");
      assert.equal(emote.tag, "img");
      assert.ok(hasClass(emote, variant));
      assert.equal(
        ["inline-emote", "big-emote", "banner-emote"].filter((name) =>
          hasClass(emote, name),
        ).length,
        1,
      );
      assert.equal(
        emote.attrs.style,
        undefined,
        "资源尺寸由CSS消费，不以内联锁死custom",
      );
    }
  }
});

test("主礼物和盲盒来源价格分组且与用户信息分开",()=>{
 for(const layout of layouts){const tree=render(getNativeEventSample('blind-gift'),layout);one(tree,'gift-price');one(tree,'blind-price');one(tree,'blind-gift');assert.equal(findAll(tree,'gift-source').length,0);assert.equal(findAll(one(tree,'content'),'user').length,0);}
});

test("原生盲盒来源图在来源组内，回看保留独立结构", () => {
  for (const layout of layouts) {
    const tree = render(getNativeEventSample("blind-gift"), layout);
    const content = one(tree, "content"), group = one(tree, "blind-gift"), icon = one(tree, "blind-gift-icon");
    assert.equal(group.parent, content);
    assert.equal(icon.parent, layout.reviewLayout ? content : group);
    if (!layout.reviewLayout) assert.equal(group.children[0], icon);
  }
});

test("大航海、成就、SC及宿主时间保留公共部件",()=>{
 for(const layout of layouts){one(render(getNativeEventSample('guard-special'),layout),'guard-duration');const honor=render(getNativeEventSample('honor'),layout);one(honor,'honor-heading');one(honor,'honor-summary');one(honor,'honor-milestone');
 const sc=getNativeEventSample('sc');sc.scDeleted=true;one(one(render(sc,layout),'content'),'deleted');
 one(render(getNativeEventSample('live-start'),layout,{}, {showTime:true}),'time');}
});

test("活动开始、奖品、口令、奖励及状态保留真实字段",()=>{
 for(const layout of layouts){const lot=render(getNativeEventSample('lottery-start'),layout);one(lot,'lottery-name');one(lot,'lottery-count');one(lot,'activity-status');one(lot,'lottery-command');
 const pocket=render(getNativeEventSample('pocket-start'),layout);one(pocket,'redpocket-awards');one(pocket,'redpocket-command');one(pocket,'activity-status');one(pocket,'price');}
});

test("连续正文保留message，系统用户属于系统标题",()=>{
 for(const layout of layouts){const chat=render(getNativeEventSample('text'),layout);one(chat,'message');assert.equal(findAll(one(chat,'content'),'user').length,0);
 const system=render(getNativeEventSample('block'),layout);one(system,'system-message-title');one(system,'message');}
});

test("Task1：真实行根公开代表类型及礼物子类，盲盒优先于免费", () => {
  for (const layout of layouts) {
    for (const [key, classes] of [
      ["text", ["type-chat"]],
      ["normal-gift", ["type-gift", "gift-normal"]],
      ["free-gift", ["type-gift", "gift-free"]],
      ["blind-gift", ["type-gift", "gift-blind"]],
      ["sc", ["type-superchat"]],
    ]) {
      const row = one(render(getNativeEventSample(key), layout), "event");
      assert.ok(hasClass(row, "event-row"));
      for (const name of classes)
        assert.ok(hasClass(row, name), `${key}: ${name}`);
      assert.ok(!hasClass(row, "normal"));
      assert.ok(
        !(row.attrs.class ?? "")
          .split(/\s+/)
          .some((name) => name.startsWith("kind-")),
      );
    }
    const blind = getNativeEventSample("blind-gift");
    blind.gift.isFree = true;
    const row = one(render(blind, layout), "event");
    assert.ok(hasClass(row, "gift-blind"));
    assert.ok(!hasClass(row, "gift-free"));
  }
});

test("Task2：真实普通行输出公开事件根和全部身份状态类", () => {
  const ev = getNativeEventSample("identity");
  ev.user.guardLevel = 3;
  ev.user.isAnchor = true;
  ev.user.isAdmin = true;
  const row = one(render(ev), "event");
  for (const name of ["guard-level-1", "streamer", "mod"])
    assert.ok(hasClass(row, name), name);
  assert.equal(row.attrs["data-event-role"], "viceroy");
  assert.equal(ev.user.guardLevel, 3, "公开等级不得改写原始值");
});

test("货币符号与数值、免费标签及盲盒盈亏分别可选取",()=>{
 for(const layout of layouts){const paid=render(getNativeEventSample('normal-gift'),layout);one(paid,'price-unit');one(paid,'price-value');
 const free=getNativeEventSample('normal-gift');free.gift.isFree=true;const label=one(render(free,layout),'gift-price');assert.equal(label.text,'免费');assert.equal(findAll(label,'price-unit').length,0);
 const blind=render(getNativeEventSample('blind-gift'),layout);one(blind,'blind-price');one(blind,'blind-profit');}
});

test("Task2修复：公开事件结构按稳定区域后代关系命中实际包装 DOM", async () => {
  const { StylePreviewArea } = await vite.ssrLoadModule(
    "/src/components/StylePreviewArea.tsx",
  );
  const { createDefaultEventStyleSettings } = await vite.ssrLoadModule(
    "/src/eventStyleSettings.ts",
  );
  const event = getNativeEventSample("normal-gift");
  event.gift = {
    ...event.gift,
    price: 100000,
    total: 100000,
    coinType: "gold",
    paymentRmb: 100,
    priceRmb: 100,
    totalRmb: 100,
  };
  const events = [event];
  const tree = elements(
    renderToStaticMarkup(
      React.createElement(StylePreviewArea, {
        displayPreferences: preferences,
        eventFontSize: 18,
        windowEventFontSize: 18,
        bigEmoteWidth: 40,
        windowBigEmoteWidth: 40,
        reviewBigEmoteMode: "small",
        reviewBigEmoteWidth: 20,
        context: "obs",
        mode: "all",
        events,
        eventStyleSettings: createDefaultEventStyleSettings(),
        showStickyPreview: true,
        stickySettings: {
          enabled: true,
          position: "top",
          giftThreshold: 0,
          maxCount: 1,
          sort: "amount",
        },
      }),
    ),
  );
  const row = findAll(tree, "event").find(node => !hasClass(node, "event-sticky"));
  assert.ok(row);
  assert.ok(
    row.parent &&
      [row.parent, row.parent.parent, row.parent.parent?.parent,row.parent.parent?.parent?.parent].some(
        (node) => node && hasClass(node, "event-list"),
      ),
  );
  const sticky = one(tree, "event-sticky");
  let stickyAncestor = sticky.parent;
  while (stickyAncestor && !hasClass(stickyAncestor, "sticky-area")) stickyAncestor = stickyAncestor.parent;
  assert.ok(stickyAncestor && hasClass(stickyAncestor, "sticky-area"));
});

test("用户元信息排序稳定，购买隐藏重复舰种与粉丝牌",()=>{
 const ev=getNativeEventSample('identity'),original=structuredClone(ev);const tree=render(ev,layouts[0],allIdentities);const user=one(tree,'user');assert.equal(user.children[0].attrs['data-rank'],'1');
 const badges=one(user,'badges');assert.deepEqual(badges.children.map(c=>['guard-badge','streamer-badge','mod-badge','wealth-medal','fan-medal'].find(n=>hasClass(c,n))),['guard-badge','streamer-badge','mod-badge','wealth-medal','fan-medal']);assert.deepEqual(ev,original);
 const buy=render({...getNativeEventSample('guard'),user:ev.user},layouts[0],allIdentities);assert.equal(findAll(buy,'guard-badge').length,0);assert.equal(findAll(buy,'fan-medal').length,0);
});

test("Task1：无可见徽章不生成 badges，无用户不生成 user", () => {
  for (const layout of layouts.filter(value => !value.reviewLayout)) {
    const ev = getNativeEventSample("identity");
    const hidden = render(ev, layout, {
      ...allIdentities,
      showGuardIdentity: false,
      showAnchorIdentity: false,
      showAdminIdentity: false,
      showHonorLevel: false,
      showFanMedal: false,
    });
    one(hidden, "user");
    one(hidden, "rank-badge");
    assert.equal(findAll(hidden, "badges").length, 0);
    const ordinary = {
      ...ev,
      user: {
        uid: "ordinary",
        uname: "普通用户",
        guardLevel: 0,
        medal: { name: "", level: 1 },
      },
    };
    assert.equal(findAll(render(ordinary, layout), "badges").length, 0);
    assert.equal(
      findAll(render({ ...ev, user: undefined }, layout), "user").length,
      0,
    );
    for (const [medal, options] of [
      [
        { name: "外房牌", level: 1, isCurrentRoom: false },
        { onlyAnchorFanMedal: true },
      ],
      [
        { name: "未亮牌", level: 1, isLighted: false },
        { hideUnlitFanMedal: true },
      ],
    ]) {
      assert.equal(
        findAll(
          render(
            { ...ordinary, user: { ...ordinary.user, medal } },
            layout,
            options,
          ),
          "badges",
        ).length,
        0,
      );
    }
  }
});

test("用户名按宿主保留筛选按钮语义，普通弹幕可自然断行", () => {
  for (const layout of layouts) {
    const ev = getNativeEventSample("identity");
    const passive = one(render(ev, layout), "username");
    const active = one(
      render(ev, layout, {}, { onUserFilter: () => {} }),
      "username",
    );
    assert.equal(passive.tag, "span");
    assert.equal(passive.attrs.role, undefined);
    assert.equal(passive.attrs.tabindex, undefined);
    if (layout.reviewLayout) {
      assert.equal(active.tag, "button");
      assert.equal(active.attrs.type, "button");
    } else {
      assert.equal(active.tag, "span");
      assert.equal(active.attrs.role, "button");
      assert.equal(active.attrs.tabindex, "0");
    }
    assert.equal(active.attrs["aria-label"], "筛选用户：固定用户");
    assert.ok(hasClass(active, "event-type-main"));
    assert.ok(hasClass(passive, "text-ev-sc"));
    assert.ok(
      hasClass(
        one(
          render(ev, layout, {
            showGuardIdentity: false,
            showAnchorIdentity: false,
            showAdminIdentity: false,
          }),
          "username",
        ),
        "text-ev-sc",
      ),
    );
  }
});

test("Task1：大航海等级只在公共样式映射，图标与文字模式一致", () => {
  for (const [guardLevel, publicLevel] of [
    [1, "3"],
    [2, "2"],
    [3, "1"],
  ]) {
    for (const layout of layouts.filter(value => !value.reviewLayout)) {
      for (const guardIdentityDisplayMode of ["icon", "text"]) {
        const ev = getNativeEventSample("text");
        ev.user.guardLevel = guardLevel;
        const badge = one(
          render(ev, layout, { guardIdentityDisplayMode }),
          "guard-badge",
        );
        assert.equal(badge.attrs["data-level"], publicLevel);
        assert.equal(
          badge.tag,
          guardIdentityDisplayMode === "icon" ? "img" : "span",
        );
        assert.equal(ev.user.guardLevel, guardLevel);
      }
    }
  }
  const ev = getNativeEventSample("text");
  ev.user.guardLevel = 0;
  assert.equal(findAll(render(ev), "guard-badge").length, 0);
});

test("Task1：头像容器包装图片与内置回退，显隐及现有尺寸保留", () => {
  const ev = getNativeEventSample("text");
  ev.user.avatar = "/test-avatar.png";
  for (const layout of layouts.filter(value => !value.reviewLayout)) {
    const tree = render(ev, layout);
    const wrap = one(tree, "avatar-wrap"),
      avatar = one(wrap, "avatar");
    assert.equal(avatar.parent, wrap);
    assert.equal(avatar.attrs.src, "/test-avatar.png");
    assert.ok(hasClass(avatar, "event-avatar"));
    assert.equal(
      findAll(render(ev, layout, { showAvatar: false }), "avatar-wrap").length,
      0,
    );
  }
  const noAvatar = getNativeEventSample("text");
  const review = render(noAvatar, { reviewLayout: true });
  assert.equal(one(review, "avatar").parent, one(review, "avatar-wrap"));
  assert.equal(one(review, "avatar").attrs.src, "/media/noface.gif");
  assert.equal(one(render(noAvatar), "avatar").attrs.src, "/media/noface.gif");
});

test("榜单真实行在两类榜单及图标文字模式中统一公开大航海等级", async () => {
  const { RankUserRow } = await vite.ssrLoadModule(
    "/src/components/RoomInsightsView.tsx",
  );
  for (const kind of ["contribution", "guard"]) {
    for (const mode of ["icon", "text"]) {
      for (const [level, name] of [
        [1, "总督"],
        [2, "提督"],
        [3, "舰长"],
      ]) {
        const user = {
          uid: "guard-user",
          name: "榜单用户",
          rank: 1,
          score: 10,
          guardLevel: level,
        };
        const tree = elements(
          renderToStaticMarkup(
            React.createElement(RankUserRow, {
              user,
              kind,
              guardIdentityDisplayMode: mode,
            }),
          ),
        );
        const badge = one(tree, "guard-badge");
        assert.equal(badge.attrs["data-level"], String(level));
        assert.equal(badge.attrs["aria-label"], `大航海身份：${name}`);
        assert.equal(badge.tag, mode === "icon" ? "img" : "span");
        const hidden = elements(
          renderToStaticMarkup(
            React.createElement(RankUserRow, {
              user,
              kind,
              guardIdentityDisplayMode: mode,
              showGuardIdentity: false,
            }),
          ),
        );
        assert.equal(findAll(hidden, "guard-badge").length, 0);
      }
      const none = elements(
        renderToStaticMarkup(
          React.createElement(RankUserRow, {
            user: { uid: "none", name: "无身份", rank: 1, guardLevel: 0 },
            kind,
            guardIdentityDisplayMode: mode,
          }),
        ),
      );
      assert.equal(findAll(none, "guard-badge").length, 0);
    }
  }
});

test("Task1：榜单复用身份组件公开同一徽章部件", () => {
  for (const mode of ["icon", "text"]) {
    const tree = elements(
      renderToStaticMarkup(
        React.createElement(GuardIdentityBadge, {
          label: "舰长",
          guardLevel: 1,
          mode,
          textClassName: "rank-identity",
        }),
      ),
    );
    assert.equal(one(tree, "guard-badge").attrs["data-level"], "3");
  }
  const medal = one(
    elements(
      renderToStaticMarkup(
        React.createElement(FanMedalBadge, {
          medal: { name: "榜单牌", level: 12 },
        }),
      ),
    ),
    "fan-medal",
  );
  assert.equal(one(medal, "medal-name").parent, medal);
  assert.equal(one(medal, "medal-level").parent, medal);
});

function assertArea(tree, context) {
  const area = one(tree, "event-area");
  assert.ok(hasClass(area, context));
  assert.equal(area.attrs["data-style-api"], "1");
  one(area, "event-list");
  return area;
}

test("Task1：EventList 的实际滚动区域与列表接入公共契约", async () => {
  const { EventList } = await vite.ssrLoadModule(
    "/src/components/EventList.tsx",
  );
  const { createFeedScrollSession } = await vite.ssrLoadModule(
    "/src/events/feedScroll.ts",
  );
  for (const liveLayout of [true, false]) {
    const tree = elements(
      renderToStaticMarkup(
        React.createElement(EventList, {
          events: [],
          visibleIndices: [],
          viewKey: "fixed",
          feedKey: "fixed",
          feedSession: createFeedScrollSession(0),
          liveLayout,
        }),
      ),
    );
    const area = assertArea(tree, liveLayout ? "live" : "review");
    assert.ok(hasClass(area, "overflow-y-auto"));
  }
});

test("Task1：回看时间线、检索摘要和收藏的实际事件区域接入公共契约", async () => {
  const { ReviewSessionTimeline } = await vite.ssrLoadModule(
    "/src/components/ReviewSessionTimeline.tsx",
  );
  const timeline = elements(
    renderToStaticMarkup(
      React.createElement(ReviewSessionTimeline, {
        repository: {},
        readingMemory: { get: () => null },
        sessionId: "fixed",
        active: false,
      }),
    ),
  );
  assertArea(timeline, "review");
  const { ReviewOwnerEventResults } = await vite.ssrLoadModule(
    "/src/components/ReviewOwnerEventResults.tsx",
  );
  const ev = getNativeEventSample("identity");
  const result = elements(
    renderToStaticMarkup(
      React.createElement(ReviewOwnerEventResults, {
        page: {
          items: [
            {
              session: {
                sessionId: "fixed",
                roomId: ev.roomId,
                startedAt: ev.ts,
              },
              matches: [
                {
                  eventKey: "fixed",
                  userName: ev.user.uname,
                  eventTs: ev.ts,
                  payloadJson: JSON.stringify(ev),
                },
              ],
              matchCount: 1,
            },
          ],
          hasMore: false,
        },
        loading: false,
        error: null,
        hasConditions: true,
      }),
    ),
  );
  const area = assertArea(result, "review");
  one(area, "event");
  one(area, "user");
  const { ReviewFavoritesPanel } = await vite.ssrLoadModule(
    "/src/components/ReviewFavoritesPanel.tsx",
  );
  const favorites = elements(
    renderToStaticMarkup(
      React.createElement(ReviewFavoritesPanel, {
        repository: {},
        owners: [],
        active: false,
      }),
    ),
  );
  assertArea(favorites, "review");
});

test("Task1：浮窗只给 log 与事件列表公开范围，拖拽缩放在范围外", async () => {
  const { FloatingEventWindow } = await vite.ssrLoadModule(
    "/src/windows/FloatingEventWindow.tsx",
  );
  for (const [kind, context] of [
    ["display", "window-chat"],
    ["gift", "window-pay"],
  ]) {
    const tree = elements(
      renderFloatingMarkup(FloatingEventWindow, { kind }),
    );
    const area = assertArea(tree, context);
    assert.ok(hasClass(area, "window"));
    assert.equal(area.attrs.role, "log");
    assert.ok(
      hasClass(area, `${kind === "display" ? "display" : "gift"}-window-log`),
    );
    assert.equal(area.parent.tag, "main");
    assert.ok(!hasClass(area.parent, "event-area"));
    assert.ok(
      area.parent.children.some((node) =>
        (node.attrs.class ?? "").includes("drag"),
      ),
    );
    assert.ok(
      area.parent.children.some((node) =>
        (node.attrs.class ?? "").includes("resize"),
      ),
    );
    assert.ok(
      !findAll(area, `${kind === "display" ? "display" : "gift"}-window-drag`)
        .length,
    );
  }
});


test("付费事件保留实际正文组与身份范围",()=>{
 for(const layout of layouts){
  const guard=render(getNativeEventSample('guard'),layout);
  const content=one(guard,'content');
  one(content,'guard-companion-days'); one(content,'price');
  assert.doesNotMatch(one(content,'guard').text,/\s×/);
  const pocketEvent = getNativeEventSample('pocket-start');
  pocketEvent.lottery = {...pocketEvent.lottery, awards:[{name:'亲密之旅', count:1}, {name:'人气票', count:5}]};
  const pocket = one(render(pocketEvent, layout), 'redpocket');
  for (const part of ['action','price','redpocket-command','redpocket-awards']) one(pocket,part);
  assert.deepEqual(findAll(pocket,'redpocket-award').map(award => award.text),
    [layout.reviewLayout ? '亲密之旅' : '亲密之旅×1', '人气票×5']);
  const lottery=one(render(getNativeEventSample('lottery-start'),layout),'lottery');
  one(lottery,'lottery-requirement');
  const honor=one(render(getNativeEventSample('honor'),layout),'honor-summary');
  one(honor,'honor-milestone');
 }
});

test("总督有实付金额时显示，缺失时不推算价格", () => {
  const event=getNativeEventSample('guard');event.guard={...event.guard,level:3,priceRmb:12345};
  for(const layout of layouts){const withPrice=render(event,layout);assert.ok(findAll(withPrice,'price-value').length>0);const unknown=structuredClone(event);delete unknown.guard.priceRmb;assert.equal(findAll(render(unknown,layout),'price-value').length,0);}
});
test("盲盒盈亏使用gain和loss状态，不使用颜色用途类", async () => {
  const {BlindProfit}=await vite.ssrLoadModule('/src/components/EventRow.tsx');
  for(const [difference,state]of[[5,'is-gain'],[-5,'is-loss']]){const html=renderToStaticMarkup(React.createElement(BlindProfit,{difference}));assert.match(html,new RegExp(state));assert.doesNotMatch(html,/text-danger|text-success/);}
  assert.equal(renderToStaticMarkup(React.createElement(BlindProfit,{difference:0})), '');
});


test("公开撤回状态位于事件根，普通事件不增加状态类", () => {
  for (const layout of layouts) {
    const event = getNativeEventSample('text');
    const normal = one(render(event, layout), 'event');
    assert.ok(!hasClass(normal, 'event-normal'));
    assert.ok(!hasClass(normal, 'deleted'));
    event.danmuDeleted = true;
    assert.ok(hasClass(one(render(event, layout), 'event'), 'deleted'));
    const sc = getNativeEventSample('sc'); sc.scDeleted = true;
    assert.ok(hasClass(one(render(sc, layout), 'event'), 'deleted'));
  }
});

test("粉丝牌与荣耀徽章公开真实等级，缺失等级不伪造", () => {
  const event = getNativeEventSample('identity');
  event.user.wealthLevel = 17;
  event.user.medal = {name:'测试牌',level:23};
  for (const layout of layouts) for (const honorLevelDisplayMode of ['icon','text']) {
    const tree = render(event,layout,{showHonorLevel:true,honorLevelDisplayMode});
    assert.equal(one(tree,'wealth-medal').attrs['data-level'],'17');
    assert.equal(one(tree,'fan-medal').attrs['data-level'],'23');
  }
  delete event.user.medal.level;
  assert.equal(one(render(event),'fan-medal').attrs['data-level'],undefined);
});

test("价格文字标签不冒充货币数值", () => {
  for (const layout of layouts) {
    for (const value of ['免费','金额未知']) {
      const event=getNativeEventSample('normal-gift');
      event.gift.isFree=value==='免费';
      if(value==='金额未知'){delete event.gift.totalRmb;delete event.gift.priceRmb;}
      const price=one(render(event,layout),'gift-price');
      assert.equal(price.text,value);
      assert.equal(findAll(price,'price-value').length,0);
      assert.equal(findAll(price,'price-unit').length,0);
    }
  }
});

test("行槽位仅在独立缩放时拆分测量和内容", async () => {
  const {EventRowSlot}=await vite.ssrLoadModule('/src/components/EventRowSlot.tsx');
  for(const scale of [undefined,1,1.25,1.5]){
    const tree=elements(renderToStaticMarkup(React.createElement(EventRowSlot,{className:'event-row-slot',contentScale:scale,style:{position:'absolute',transform:'translateY(100px)'}},React.createElement('div',{className:'event'},'内容'))));
    const outer=one(tree,'event-row-slot'),content=one(tree,'event-row-slot-content');
    assert.equal(content,scale===undefined?outer:outer.children[0]);
    assert.ok(outer.attrs.style.includes('translateY(100px)'));
    assert.ok('data-event-spacing' in content.attrs);
  }
});
