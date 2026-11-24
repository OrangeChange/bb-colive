import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, readdir, mkdir } from "node:fs/promises";
import { createServer } from "vite";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { scopeThemeCss } from "../src/themes/themeCssScope.ts";

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const out = process.env.LAYOUT_ACCEPTANCE_DIR || "D:/CodexBuild/native-preview-outline";
await mkdir(out, { recursive: true });
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, optimizeDeps: { noDiscovery: true, include: [] }, logLevel: "silent" });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const { NativeLayoutFixture } = await server.ssrLoadModule("/tests/fixtures/nativeLayoutRepair.tsx");
  const assets = await readdir("dist/assets");
  const utilities = postcss.parse(await readFile("dist/assets/" + assets.find(name => /^register-.*\.css$/.test(name)), "utf8"));
  for (const node of [...utilities.nodes]) if (node.type !== "atrule" || node.name !== "layer" || !["theme", "base", "utilities"].includes(node.params)) node.remove();
  const css = utilities.toString()
    + (await readFile("src/App.css", "utf8")).replace(/^@import[^;]+;|^@source[^;]+;/gm, "")
    + scopeThemeCss(await readFile("src/eventStyle.css", "utf8"), ".theme-surface")
    + await readFile("src/components/nativeThemeEditor.css", "utf8");
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  let cases = 0;
  for (const theme of ["default", "card", "bubble"]) for (const dark of [false, true]) for (const width of [280, 480]) {
    const html = renderToStaticMarkup(React.createElement(NativeLayoutFixture, { initialState: { theme, dark, width, avatar: true, typographyOnly: true, target: "live" } }));
    await page.setContent(`<style>${css}body{margin:0}.native-theme-preview{display:block;width:${width}px}.native-preview-message-scroll{height:220px;overflow:auto}</style><div class="native-theme-preview"><div class="native-preview-message-scroll">${html}</div></div>`, { waitUntil: "domcontentloaded" });
    for (const attribute of ["data-preview-part-hover", "data-preview-part-selected"]) {
      const result = await page.locator(".native-preview-message-scroll").evaluate((viewport, attribute) => {
        const event = viewport.querySelector(".event");
        viewport.scrollTop += event.getBoundingClientRect().top - viewport.getBoundingClientRect().top;
        const before = event.getBoundingClientRect();
        event.setAttribute(attribute, "");
        const box = event.getBoundingClientRect(), clip = viewport.getBoundingClientRect(), style = getComputedStyle(event);
        const expansion = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
        const result = { outline: style.outlineStyle, top: box.top - expansion - clip.top, left: box.left - expansion - clip.left, right: clip.right - box.right - expansion, bottom: clip.bottom - box.bottom - expansion, layoutUnchanged: box.width === before.width && box.height === before.height && box.top === before.top };
        event.removeAttribute(attribute);
        return result;
      }, attribute);
      assert(result.outline === "solid" && result.top >= 0 && result.left >= 0 && result.right >= 0 && result.bottom >= 0 && result.layoutUnchanged, JSON.stringify({ theme, dark, width, attribute, result }));
      cases++;
    }
    await page.locator(".event").first().evaluate(event => event.setAttribute("data-preview-part-selected", ""));
    await page.locator(".native-preview-message-scroll").screenshot({ path: `${out}/${theme}-${dark ? "dark" : "light"}-${width}.png` });
  }
  const outsideOffset = await page.evaluate(() => {
    const element = document.createElement("div");
    element.setAttribute("data-preview-part-selected", "");
    document.body.append(element);
    const offset = parseFloat(getComputedStyle(element).outlineOffset);
    element.remove();
    return offset;
  });
  assert(outsideOffset > 0, "非原生预览的选框保持原规则");
  console.log(JSON.stringify({ cases, outlinesComplete: true, layoutUnchanged: true }));
} finally {
  await browser.close();
  await server.close();
}
