import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  page.on("pageerror", error => console.error(error));
  await page.goto(`${process.env.PREVIEW_TEST_URL || "http://localhost:1420"}/tests/fixtures/nativePreviewSwitch.html`);
  const result = await page.evaluate(async () => {
    const ReactModule = await import("/@id/react");
    const createElement = ReactModule.createElement ?? ReactModule.default?.createElement;
    const ReactDomClient = await import("/@id/react-dom/client");
    const createRoot = ReactDomClient.createRoot ?? ReactDomClient.default?.createRoot;
    const { OpenLiveEvent } = await import("/src/compat/openlive/components.tsx");
    const { composeOpenLiveThemeCss } = await import("/src/compat/openlive/runtime.tsx");
    const { createCompatibleThemeModeAdapter } = await import("/src/themes/themeModeAdapters.ts");
    const { MsgType } = await import("/src/protocol/eventTypeCodes.ts");
    const documentModel = createCompatibleThemeModeAdapter("blivechat-open").createBuiltinTheme();
    documentModel.settings = { ...documentModel.settings, visualModel: { common: {
      "danmaku|all|main|message": { fontSize: { source: "custom", value: 24 } },
      "superchat|all|sticky|amount": { fontSize: { source: "custom", value: 28 } },
      "superchat|all|main|message": { fontSize: { source: "custom", value: 26 } },
      "superchat|all|detail|message": { fontSize: { source: "custom", value: 30 } },
      "danmaku|moderator|main|username": { fontSize: { source: "custom", value: 31 } },
      "danmaku|all|main|smallEmote": { visible: { source: "custom", value: false }, width: { source: "custom", value: 33 }, height: { source: "custom", value: 34 } },
      "danmaku|all|main|largeEmote": { visible: { source: "custom", value: true }, width: { source: "custom", value: 77 }, height: { source: "custom", value: 78 } },
    }, light: {}, dark: {} } };
    documentModel.styles.customCss = "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'] #message{color:rgb(1,2,3)!important}";
    const style = document.createElement("style"); style.textContent = composeOpenLiveThemeCss(documentModel); document.head.append(style);
    const user = { uid: "1", uname: "开放版用户", avatar: "", guardLevel: 2, medal: { name: "粉丝牌", level: 12, isLighted: true, isCurrentRoom: true } };
    const base = { id: "event", roomId: 42, ts: 1_700_000_000_000, user };
    const danmaku = { ...base, msgType: MsgType.Danmu, text: "正文" };
    const adminDanmaku = { ...base, id: "admin", user: { ...user, guardLevel: 0, isAdmin: true }, msgType: MsgType.Danmu, text: "房管正文" };
    const smallEmote = { ...base, id: "small", msgType: MsgType.Danmu, text: "文字[热]", emotes: { "[热]": { url: "/wealth-levels/1.png", width: 20, height: 20 } } };
    const largeEmote = { ...base, id: "large", msgType: MsgType.Danmu, text: "大表情", emoticon: { url: "/wealth-levels/1.png", width: 162, height: 162 } };
    const sc = { ...base, id: "sc", msgType: MsgType.SuperChat, sc: { price: 30, message: "SC 正文", duration: 30 } };
    const guard = { ...base, id: "guard", msgType: MsgType.GuardBuy, guard: { level: 2, count: 1, price: 198000 } };
    const mount = document.createElement("div"); document.body.append(mount);
    createRoot(mount).render(createElement("div", { style: { "--yt-live-chat-item-timestamp-display": "inline", "--yt-live-chat-paid-message-timestamp-display": "inline" } },
      createElement(OpenLiveEvent, { event: danmaku, placement: "main", showGiftInfo: true, showTimestamp: true }),
      createElement(OpenLiveEvent, { event: adminDanmaku, placement: "main", showGiftInfo: true }),
      createElement(OpenLiveEvent, { event: smallEmote, placement: "main", showGiftInfo: true }),
      createElement(OpenLiveEvent, { event: largeEmote, placement: "main", showGiftInfo: true }),
      createElement(OpenLiveEvent, { event: sc, placement: "main", showGiftInfo: false }),
      createElement(OpenLiveEvent, { event: guard, placement: "main", showGiftInfo: false }),
      createElement(OpenLiveEvent, { event: sc, placement: "sticky", showGiftInfo: true })));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const smallNode = mount.querySelector("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #image-and-message > img.emoji:not(#emoticon)");
    const largeNode = mount.querySelector("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #image-and-message > img#emoticon");
    const ticker = mount.querySelector("yt-live-chat-ticker-paid-message-item-renderer");
    const stickyAvatarSelector = "yt-live-chat-ticker-renderer[data-openlive-kind='superchat'] #container.yt-live-chat-ticker-renderer > #items > yt-live-chat-ticker-paid-message-item-renderer > #container > #content > #author-photo";
    const stickyAvatarBefore = mount.querySelectorAll(stickyAvatarSelector).length;
    const before = ticker.getAttribute("aria-expanded"); ticker.click();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      messageSize: getComputedStyle(mount.querySelector("yt-live-chat-text-message-renderer #message")).fontSize,
      avatarWidth: getComputedStyle(mount.querySelector("yt-live-chat-text-message-renderer #author-photo")).width,
      paidAvatarWidth: getComputedStyle(mount.querySelector("yt-live-chat-paid-message-renderer[data-openlive-placement='main'] #author-photo")).width,
      scColor: getComputedStyle(mount.querySelector("yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'] #message")).color,
      tickerAmountSize: getComputedStyle(mount.querySelector("yt-live-chat-ticker-renderer #text")).fontSize,
      mainScSize: getComputedStyle(mount.querySelector("yt-live-chat-paid-message-renderer[data-openlive-placement='main'] #message")).fontSize,
      timestampVisible: getComputedStyle(mount.querySelector("yt-live-chat-text-message-renderer #timestamp")).display !== "none",
      timestampSize: getComputedStyle(mount.querySelector("yt-live-chat-text-message-renderer #timestamp")).fontSize,
      adminNameSize: getComputedStyle(mount.querySelector("yt-live-chat-text-message-renderer[is-admin='true'] #author-name")).fontSize,
      textSourceSelectors: [
        "yt-live-chat-text-message-renderer > #card > #content > yt-live-chat-author-chip > #timestamp",
        "yt-live-chat-text-message-renderer > #card > #content > #image-and-message > #message",
        "yt-live-chat-text-message-renderer #chat-medal yt-live-chat-author-medal-renderer > #medal-card > div#medal-name",
        "yt-live-chat-text-message-renderer #chat-medal yt-live-chat-author-medal-renderer > #medal-card > div#medal-level",
      ].every(selector => mount.querySelector(selector) !== null),
      tickerSourceSelector: mount.querySelector("yt-live-chat-ticker-renderer > #container > #items > yt-live-chat-ticker-paid-message-item-renderer") !== null,
      guardSourceSelector: mount.querySelector("yt-live-chat-membership-item-renderer yt-live-chat-author-chip > #chat-badges") !== null,
      guardAuthorSourceSelector: mount.querySelector("yt-live-chat-membership-item-renderer yt-live-chat-author-chip > #author-name.member.style-scope.yt-live-chat-author-chip") !== null,
      guardTimestampSourceSelector: mount.querySelector("yt-live-chat-membership-item-renderer #header-content > div#timestamp.style-scope.yt-live-chat-membership-item-renderer") !== null,
      smallSelectorCount: mount.querySelectorAll("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #image-and-message > img.emoji:not(#emoticon)").length,
      smallDisplay: getComputedStyle(smallNode).display,
      smallSize: [getComputedStyle(smallNode).width, getComputedStyle(smallNode).height],
      largeSelectorCount: mount.querySelectorAll("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #image-and-message > img#emoticon").length,
      largeVisible: getComputedStyle(largeNode).display !== "none",
      largeSize: [getComputedStyle(largeNode).width, getComputedStyle(largeNode).height],
      stickyAvatarBefore,
      stickyAvatarAfter: mount.querySelectorAll(stickyAvatarSelector).length,
      before,
      after: ticker.getAttribute("aria-expanded"),
      detailCount: mount.querySelectorAll("yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-openlive-placement='detail']").length,
      detailScSize: getComputedStyle(mount.querySelector("yt-live-chat-paid-message-renderer[data-openlive-placement='detail'] #message")).fontSize,
    };
  });
  assert.deepEqual(result, { messageSize: "24px", avatarWidth: "24px", paidAvatarWidth: "40px", scColor: "rgb(1, 2, 3)", tickerAmountSize: "28px", mainScSize: "26px", timestampVisible: true, timestampSize: "11px", adminNameSize: "31px", textSourceSelectors: true, tickerSourceSelector: true, guardSourceSelector: true, guardAuthorSourceSelector: true, guardTimestampSourceSelector: true, smallSelectorCount: 1, smallDisplay: "none", smallSize: ["33px", "34px"], largeSelectorCount: 1, largeVisible: true, largeSize: ["77px", "78px"], stickyAvatarBefore: 1, stickyAvatarAfter: 1, before: "false", after: "true", detailCount: 1, detailScSize: "30px" });
  await page.goto(`${process.env.NATIVE_EVENT_TEST_URL || process.env.PREVIEW_TEST_URL || "http://localhost:1420"}/tests/fixtures/nativeEventWindow.html?kind=display`);
  await page.waitForFunction(() => document.querySelector("#window-status")?.getAttribute("data-ready") === "true", null, { timeout: 10000 });
  const changePreference = async selector => {
    const version = Number(await page.locator("#window-status").getAttribute("data-preferences-version"));
    await page.click(selector);
    await page.waitForFunction(previous => Number(document.querySelector("#window-status")?.getAttribute("data-preferences-version")) > previous, version);
  };
  await changePreference("#animation-none");
  await changePreference("#capacity-one");
  await page.click("#send-samples");
  await page.waitForTimeout(1000);
  const windowState = await page.evaluate(() => ({ count: document.querySelectorAll(".event-row-slot[data-event-id]").length, status: document.querySelector("#window-status")?.textContent, alert: document.querySelector("[role=alert]")?.textContent }));
  assert.equal(windowState.count, 1, JSON.stringify(windowState));
  const strictCount = await page.locator(".event-row-slot[data-event-id]").count();
  await changePreference("#expiry-on");
  await page.waitForFunction(() => document.querySelectorAll(".event-row-slot[data-event-id]").length === 0, null, { timeout: 3000 });
  const exitingCount = await page.locator(".display-window-event-removing").count();
  assert.deepEqual({ strictCount, exitingCount }, { strictCount: 1, exitingCount: 0 });
  console.log("OpenLive DOM/computed 与共享严格 N、0ms 节点移除通过。");
} finally {
  await browser.close();
}
