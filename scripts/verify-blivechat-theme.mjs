import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.PREVIEW_TEST_URL || "http://localhost:1420"}/tests/fixtures/nativePreviewSwitch.html`);
  const result = await page.evaluate(async () => {
    const { BLIVECHAT_CAPABILITY } = await import("/src/compat/blivechat/theme.ts");
    const { createBlivechatBaseCss } = await import("/src/compat/blivechat/theme.ts");
    const { BLIVECHAT_SOURCE_CSS } = await import("/src/compat/blivechat/source.ts");
    const { compatibleSelectorFor, renderCompatibleManagedCss } = await import("/src/themes/compatManagedCss.ts");
    const { scopeBlivechatCss } = await import("/src/compat/blivechat/cssScope.ts");
    const { composeBlivechatThemeCss } = await import("/src/compat/blivechat/runtime.tsx");
    const giftUser = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|username", "common");
    const giftCard = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|paidCard", "common");
    const mainAmount = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|main|amount", "common");
    const stickyAmount = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "gift|all|sticky|amount", "common");
    const allMainAmount = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "all|all|main|amount", "common");
    const allStickyAmount = compatibleSelectorFor(BLIVECHAT_CAPABILITY, "all|all|sticky|amount", "common");
    const managed = renderCompatibleManagedCss(BLIVECHAT_CAPABILITY, { common: {
      "gift|all|main|amount": { fontSize: { source: "custom", value: 18 } },
      "gift|all|sticky|amount": { fontSize: { source: "custom", value: 28 } },
      "gift|all|main|message": { fontSize: { source: "custom", value: 20 } },
      "all|all|main|amount": { lineHeight: { source: "custom", value: "70px" } },
      "all|all|sticky|amount": { lineHeight: { source: "custom", value: "30px" } },
    }, light: {}, dark: {} });
    const cssA = scopeBlivechatCss(`${BLIVECHAT_SOURCE_CSS}\n${createBlivechatBaseCss({ globalScale: 1, fontScale: 1, showGiftName: false })}\n${managed}\n${giftUser}{color:rgb(0,128,0)}${giftCard}{border-width:7px}:root{--marker:a}@keyframes pulse{from{opacity:.2}to{opacity:.2}}.pulse{animation:pulse 10s linear infinite}#message{font-size:50px}`, "windows:a");
    const cssB = scopeBlivechatCss(`@keyframes pulse{from{opacity:.8}to{opacity:.8}}.pulse{animation:pulse 10s linear infinite}`, "obs:b");
    document.body.innerHTML = `<style>${cssA}${cssB}</style>
      <div data-blivechat-scope="windows:a" style="--yt-live-chat-paid-message-timestamp-display:inline;background-color:var(--yt-live-chat-background-color)"><yt-live-chat-paid-message-renderer data-blc-kind="gift" class="pulse"><div id="card"><div id="author-name">礼物用户</div><div id="purchase-amount">CN¥2</div><div id="message">礼物正文</div><span id="timestamp">12:00</span></div></yt-live-chat-paid-message-renderer><yt-live-chat-paid-message-renderer data-blc-kind="superchat"><div id="card"><div id="author-name">SC用户</div></div></yt-live-chat-paid-message-renderer><yt-live-chat-ticker-renderer data-blc-kind="gift"><div id="container" class="yt-live-chat-ticker-renderer"><yt-live-chat-ticker-paid-message-item-renderer><div id="container" class="yt-live-chat-ticker-paid-message-item-renderer"><span id="text">CN¥2</span></div></yt-live-chat-ticker-paid-message-item-renderer></div></yt-live-chat-ticker-renderer></div>
      <div data-blivechat-scope="obs:b"><div class="pulse">B</div></div>`;
    const a = document.querySelector('[data-blivechat-scope="windows:a"]');
    const gift = a.querySelector('[data-blc-kind="gift"]');
    const sc = a.querySelector('[data-blc-kind="superchat"]');
    const timestamp = gift.querySelector("#timestamp");
    const formalTimestamp = getComputedStyle(timestamp).display;
    timestamp.hidden = true;
    const beforeReveal = getComputedStyle(timestamp).display;
    timestamp.hidden = false;
    const reveal = document.createElement("style");
    reveal.textContent = '[data-blivechat-scope="windows:a"] #timestamp{display:initial!important;visibility:visible!important}';
    document.body.append(reveal);
    const ReactModule = await import("/@id/react");
    const createElement = ReactModule.createElement ?? ReactModule.default?.createElement;
    const ReactDomClient = await import("/@id/react-dom/client");
    const createRoot = ReactDomClient.createRoot ?? ReactDomClient.default?.createRoot;
    const { NativeObsContent } = await import("/src/obs/NativeObsRenderer.tsx");
    const { createCompatibleThemeModeAdapter } = await import("/src/themes/themeModeAdapters.ts");
    const { BlivechatPreview } = await import("/src/compat/blivechat/register.tsx");
    const { buildBlivechatObsSnapshot } = await import("/src/compat/blivechat/obs.ts");
    const obsDocument = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
    const obsSnapshot = buildBlivechatObsSnapshot(obsDocument, { target: "obs", targetId: "obs-browser", roomId: "42", displayScale: 1.4 });
    const mount = document.createElement("div"); document.body.append(mount);
    createRoot(mount).render(createElement(NativeObsContent, { events: [], targetId: "obs-browser", snapshot: obsSnapshot }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const previewMount = document.createElement("div"); document.body.append(previewMount);
    const previewRoot = createRoot(previewMount);
    const previewDocument = createCompatibleThemeModeAdapter("blivechat").createBuiltinTheme();
    const previewStyle = document.createElement("style"); document.head.append(previewStyle);
    previewDocument.settings = { ...previewDocument.settings, showTimestamp: true };
    previewStyle.textContent = composeBlivechatThemeCss(previewDocument);
    previewRoot.render(createElement(BlivechatPreview, { document: previewDocument, thumbnail: false }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const timestampKinds = [
      "yt-live-chat-paid-message-renderer[data-blc-kind='gift'] #timestamp",
      "yt-live-chat-paid-message-renderer[data-blc-kind='superchat'] #timestamp",
      "yt-live-chat-membership-item-renderer #timestamp",
    ];
    const previewTimestampShown = timestampKinds.map(selector => getComputedStyle(previewMount.querySelector(selector)).display);
    const defaultNormalGiftLineHeight = getComputedStyle(previewMount.querySelector("yt-live-chat-paid-message-renderer[data-blc-gift-kind='normal'] #message")).lineHeight;
    previewDocument.settings = { ...previewDocument.settings, showTimestamp: false };
    previewRoot.render(createElement(BlivechatPreview, { document: previewDocument, thumbnail: false }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const previewTimestampHidden = timestampKinds.map(selector => getComputedStyle(previewMount.querySelector(selector)).display);
    previewDocument.settings = { ...previewDocument.settings, showTimestamp: false, globalScale: 1.5, fontScale: 1 };
    previewStyle.textContent = composeBlivechatThemeCss(previewDocument);
    previewRoot.render(createElement(BlivechatPreview, { document: previewDocument, thumbnail: false }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const normalGiftMessage = previewMount.querySelector("yt-live-chat-paid-message-renderer[data-blc-gift-kind='normal'] #message");
    const guardAuthorChip = previewMount.querySelector("yt-live-chat-membership-item-renderer yt-live-chat-author-chip");
    return {
      giftUsers: gift.querySelectorAll(giftUser).length,
      giftCards: gift.querySelectorAll(giftCard).length,
      mainAmounts: a.querySelectorAll(mainAmount).length,
      stickyAmounts: a.querySelectorAll(stickyAmount).length,
      mainAmountSize: getComputedStyle(gift.querySelector("#purchase-amount")).fontSize,
      stickyAmountSize: getComputedStyle(a.querySelector("yt-live-chat-ticker-renderer #text")).fontSize,
      mainAllLineHeight: getComputedStyle(gift.querySelector("#purchase-amount")).lineHeight,
      stickyAllLineHeight: getComputedStyle(a.querySelector("yt-live-chat-ticker-renderer #text")).lineHeight,
      mainAllMatches: a.querySelectorAll(allMainAmount).length,
      stickyAllMatches: a.querySelectorAll(allStickyAmount).length,
      giftColor: getComputedStyle(gift.querySelector("#author-name")).color,
      surfaceBackground: getComputedStyle(a).backgroundColor,
      scUnaffected: getComputedStyle(sc.querySelector("#author-name")).color !== "rgb(0, 128, 0)",
      messageSize: getComputedStyle(gift.querySelector("#message")).fontSize,
      beforeReveal,
      afterReveal: getComputedStyle(timestamp).display,
      formalTimestamp,
      animationA: getComputedStyle(gift).animationName,
      animationB: getComputedStyle(document.querySelector('[data-blivechat-scope="obs:b"] .pulse')).animationName,
      obsZoom: getComputedStyle(mount.querySelector(".obs-native-root")).zoom,
      previewTimestampShown,
      previewTimestampHidden,
      defaultNormalGiftLineHeight,
      normalGiftColor: getComputedStyle(normalGiftMessage).color,
      normalGiftLineHeight: getComputedStyle(normalGiftMessage).lineHeight,
      guardAuthorChipMarginRight: getComputedStyle(guardAuthorChip).marginRight,
    };
  });
  assert.deepEqual(result, {
    giftUsers: 1,
    giftCards: 1,
    mainAmounts: 1,
    stickyAmounts: 1,
    mainAmountSize: "18px",
    stickyAmountSize: "28px",
    mainAllLineHeight: "70px",
    stickyAllLineHeight: "30px",
    mainAllMatches: 1,
    stickyAllMatches: 1,
    giftColor: "rgb(0, 128, 0)",
    surfaceBackground: "rgb(255, 255, 255)",
    scUnaffected: true,
    messageSize: "50px",
    beforeReveal: "none",
    afterReveal: "inline",
    formalTimestamp: "inline",
    animationA: "pulse--windows-a",
    animationB: "pulse--obs-b",
    obsZoom: "1.4",
    previewTimestampShown: ["block", "block", "block"],
    previewTimestampHidden: ["none", "none", "none"],
    defaultNormalGiftLineHeight: "22.5px",
    normalGiftColor: "rgb(0, 0, 0)",
    normalGiftLineHeight: "33.75px",
    guardAuthorChipMarginRight: "0px",
  });
  console.log("BLC 选择器命中、SC 隔离、CSS 顺序、临时显露与动画作用域通过。")
} finally {
  await browser.close();
}
