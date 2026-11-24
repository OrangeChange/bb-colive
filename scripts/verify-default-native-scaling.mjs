import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });

try {
  const page = await browser.newPage();
  await page.goto(`${process.env.PREVIEW_TEST_URL || "http://localhost:1420"}/tests/fixtures/nativePreviewSwitch.html?leaf`);
  const measured = await page.evaluate(async () => {
    await import("/src/eventStyle.css");
    const { createEventAreaConfigCss } = await import("/src/eventAreaStyleConfig.ts");
    const { createDefaultEventStyleSettings } = await import("/src/eventStyleSettings.ts");
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const read = (size, fixed = false) => {
      const settings = createDefaultEventStyleSettings();
      host.innerHTML = `<style>${createEventAreaConfigCss("default-scale", { settings, layout:"live", fontSize:size, bigEmoteSize:40, padding:6, spacing:4 })}${fixed ? ".message{font-size:14px}.avatar{width:14px;height:14px}" : ""}</style><div class="event-area" data-event-style-scope="default-scale"><div class="event-list"><div class="event" data-event-layout="live"><div class="user-avatar avatar-wrap"><img class="avatar"></div><span class="username">用户</span><span class="fan-medal">牌</span><img class="guard-badge"><img class="wealth-medal"><span class="rank-badge">1</span><span class="message">正文<img class="inline-emote"></span><img class="gift-icon"><span class="gift-count">×1</span><span class="guard-duration">30天</span><span class="gift-price price">¥10</span><img class="big-emote"></div></div></div>`;
      const css = selector => getComputedStyle(host.querySelector(selector));
      const px = (selector, property) => Number.parseFloat(css(selector)[property]);
      return {
        message: px(".message", "fontSize"), avatar: px(".avatar-wrap", "width"), avatarImage: px(".avatar", "width"),
        inlineEmote: px(".inline-emote", "width"), bigEmote: px(".big-emote", "maxWidth"),
        guardBadge: px(".guard-badge", "height"), honor: px(".wealth-medal", "height"),
        medalFont: px(".fan-medal", "fontSize"), medalHeight: px(".fan-medal", "height"), medalPadding: px(".fan-medal", "paddingLeft"), medalGap: px(".fan-medal", "gap"),
        rankFont: px(".rank-badge", "fontSize"), count: px(".gift-count", "fontSize"), duration: px(".guard-duration", "fontSize"), price: px(".gift-price", "fontSize"),
        rowPadding: px(".event", "paddingLeft"), rowGap: px(".event", "gap"), spacing: Number.parseFloat(css(".event-area").getPropertyValue("--event-spacing")),
      };
    };
    return { base16: read(16), base24: read(24), fixed24: read(24, true) };
  });
  const ratios = {
    message: 1, avatar: 1.5, avatarImage: 1.5, inlineEmote: 1.25, guardBadge: 1, honor: 1,
    medalFont: .75, medalHeight: 1.125, medalPadding: .25, medalGap: .25, rankFont: .75,
    count: .875, duration: .875, price: .875, rowPadding: .375, rowGap: .5, spacing: .25,
  };
  for (const [key, ratio] of Object.entries(ratios)) {
    assert.equal(measured.base16[key], 16 * ratio, `16px默认${key}`);
    assert.equal(measured.base24[key], 24 * ratio, `24px默认${key}`);
  }
  assert.equal(measured.base16.bigEmote, 40, "大表情使用独立主题尺寸");
  assert.equal(measured.base24.bigEmote, 40, "大表情不随基准字号重复缩放");
  assert.equal(measured.fixed24.message, 14, "手写固定正文保持14px");
  assert.equal(measured.fixed24.avatarImage, 14, "手写固定媒体尺寸保持14px");
  console.log("未编辑默认比例和固定CSS边界通过。", measured);
} finally {
  await browser.close();
}
