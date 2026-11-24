import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true, channel: "msedge" });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.PREVIEW_TEST_URL || "http://localhost:1420"}/tests/fixtures/nativePreviewSwitch.html?obs`);
  await page.locator(".message").first().waitFor();
  assert.equal(await page.locator(".message").first().evaluate(node => getComputedStyle(node).fontSize), "24px", "OBS 正文使用主题基准");
  await page.goto(`${process.env.PREVIEW_TEST_URL || "http://localhost:1420"}/tests/fixtures/nativePreviewSwitch.html?leaf`);
  await page.frameLocator("iframe").locator(".message").first().waitFor();
  await page.evaluate(async () => {
    const { renderManagedNativeCss } = await import("/src/themes/nativeManagedCss.ts");
    const { createDefaultEventStyleSettings } = await import("/src/eventStyleSettings.ts");
    const settings = createDefaultEventStyleSettings();
    settings.visualModel = { common: { "all|all|message": { fontSize: { source: "custom", value: { mode: "base-relative", ratio: 1 } } } }, light: {}, dark: {} };
    const style = document.querySelector("iframe").contentDocument.createElement("style");
    style.textContent = renderManagedNativeCss(settings);
    document.querySelector("iframe").contentDocument.head.append(style);
  });
  for (const size of [32, 16]) {
    await page.getByRole("button", { name: String(size), exact: true }).click();
    const messages = await page.frameLocator("iframe").locator(".message").evaluateAll(nodes => nodes.map(node => ({ text: node.textContent, size: getComputedStyle(node).fontSize })));
    assert.ok(messages.length >= 3);
    assert.ok(messages.every(message => message.size === `${size}px`), JSON.stringify(messages));
  }
  const results = await page.evaluate(async () => {
    await import("/src/eventStyle.css");
    const { createEventAreaConfigCss } = await import("/src/eventAreaStyleConfig.ts");
    const { createDefaultEventStyleSettings } = await import("/src/eventStyleSettings.ts");
    const { renderManagedNativeCss } = await import("/src/themes/nativeManagedCss.ts");
    const relative = ratio => ({ source: "custom", value: { mode: "base-relative", ratio } });
    const settings = createDefaultEventStyleSettings();
    settings.visualModel = { common: {
      "all|all|row": { fontSize: relative(1.5), paddingX: relative(.5), paddingY: relative(.25), marginX: relative(.25), marginY: relative(.5), gap: relative(.25), borderWidth: relative(.125), borderRadius: relative(.5) },
      "all|all|message": { fontSize: relative(1) },
      "all|all|avatar": { width: relative(2), height: relative(2) },
      "all|all|giftImage": { width: relative(1.5), height: relative(1.5) },
      "all|all|inlineEmote": { width: relative(1), height: relative(1) },
      "all|all|bigEmote": { width: relative(3), height: relative(3) },
      "all|all|username": { fontSize: { source: "custom", value: { mode: "fixed", value: 18 } } },
    }, light: {}, dark: {} };
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    const records = [];
    for (const layout of ["live", "window", "default"]) {
      for (const size of [24, 32, 16]) {
        host.innerHTML = `<style>${createEventAreaConfigCss("base", {settings, layout, fontSize:size, bigEmoteSize:40, padding:6, spacing:0})}${renderManagedNativeCss(settings)}</style><div class="event-area" data-event-style-scope="base"><div class="event-list"><div class="event" style="border-style:solid"><span class="message">正文</span><span class="username">用户</span><div class="user-avatar avatar-wrap"><img class="avatar"></div><img class="gift-icon"><img class="inline-emote"><img class="big-emote"></div></div></div>`;
        const css = selector => getComputedStyle(host.querySelector(selector));
        const row = css(".event");
        records.push({layout,size,message:css(".message").fontSize, fixed:css(".username").fontSize,
          row:row.getPropertyValue("--event-font-size").trim(), padding:row.paddingLeft, paddingY:row.paddingTop,
          margin:row.marginLeft, marginY:row.marginTop, gap:row.gap, border:row.borderLeftWidth, radius:row.borderRadius,
          avatar:css(".avatar").width, avatarHeight:css(".avatar").height, gift:css(".gift-icon").width,
          emote:css(".inline-emote").width, big:css(".big-emote").maxWidth});
        const avatar = host.querySelector(".avatar");
        const normalWidth = avatar.getBoundingClientRect().width;
        host.querySelector(".event-list").style.zoom = ".9";
        if (Math.abs(avatar.getBoundingClientRect().width / normalWidth - .9) > .002) throw new Error("副窗口缩放重复作用于基准");
        if (css(".message").fontSize !== `${size}px`) throw new Error("显示缩放改变了主题字号");
      }
    }
    return records;
  });
  for (const r of results) {
    assert.equal(r.message, `${r.size}px`, `${r.layout} 基准${r.size}正文`);
    assert.equal(r.fixed, "18px");
    for (const [key, ratio] of Object.entries({padding:.5,paddingY:.25,margin:.25,marginY:.5,gap:.25,border:.125,radius:.5,avatar:2,avatarHeight:2,gift:1.5,emote:1,big:3})) {
      assert.equal(r[key], `${r.size * ratio}px`, `${r.layout} ${key}`);
    }
  }
  console.log("OBS与真实预览正文、16/24/32px基准、相对尺寸/间距、固定字号和90%缩放均通过。");
} finally {
  await browser.close();
}
