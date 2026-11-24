import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const baseUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:1420";

async function chooseCompatiblePart(page, placement, partName) {
  const suffix = placement === "置顶栏" ? "（置顶栏，仅副窗口 / OBS）" : placement === "展开详情" ? "（展开详情，仅副窗口 / OBS）" : "";
  const navigation = page.locator(".native-visual-layout > nav");
  const button = navigation.getByRole("button", { name: `${partName}${suffix}`, exact: true, includeHidden: true });
  await button.evaluate(element => { for (let current = element.closest("details"); current; current = current.parentElement?.closest("details")) current.open = true; });
  await button.click();
}

async function chooseCompatibleEvent(page, eventName) {
  await page.locator(".native-event-scope-primary, .native-event-scope-children").getByRole("button", { name: eventName, exact: true }).first().click();
}

test("三版首页缩略图使用现场语义且没有宿主背景、置顶栏和滚动条", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const stickySelectors = {
      blivechat: "yt-live-chat-ticker-renderer",
      "blivechat-open": "yt-live-chat-ticker-renderer",
      laplace: ".gift-sticky-bar",
    };
    for (const [mode, stickySelector] of Object.entries(stickySelectors)) {
      const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}&thumbnail=1`);
      const preview = page.locator(".compatible-theme-preview");
      await preview.waitFor();
      assert.equal(await preview.evaluate(element => getComputedStyle(element).backgroundImage), "none", `${mode} 首页缩略图不应绘制棋盘背景`);
      const frame = page.frames().find(value => value !== page.mainFrame());
      assert.ok(frame);
      await frame.waitForSelector("body");
      assert.equal(await frame.locator(stickySelector).isVisible().catch(() => false), false, `${mode} 首页缩略图不应显示置顶栏`);
      const overflow = await frame.evaluate(() => ({
        html: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        body: document.body.scrollHeight > document.body.clientHeight,
        visibleVerticalScroller: [...document.querySelectorAll("*")].some(element => {
          const style = getComputedStyle(element);
          return element.scrollHeight > element.clientHeight && (style.overflowY === "auto" || style.overflowY === "scroll");
        }),
      }));
      assert.deepEqual(overflow, { html: false, body: false, visibleVerticalScroller: false }, `${mode} 首页缩略图不应保留内部纵向滚动`);
      if (mode === "blivechat" || mode === "blivechat-open") {
        await frame.waitForSelector("#item-scroller #items yt-live-chat-text-message-renderer, #item-scroller #items yt-live-chat-paid-message-renderer");
        await frame.waitForTimeout(100);
        const firstEvent = await frame.evaluate(() => {
          const viewport = document.querySelector("#item-scroller");
          const item = document.querySelector("#item-scroller #items yt-live-chat-text-message-renderer, #item-scroller #items yt-live-chat-paid-message-renderer");
          if (!(viewport instanceof HTMLElement) || !(item instanceof HTMLElement)) return null;
          const viewportRect = viewport.getBoundingClientRect();
          const itemRect = item.getBoundingClientRect();
          return {
            viewportTop: viewportRect.top,
            viewportBottom: viewportRect.bottom,
            itemTop: itemRect.top,
            itemBottom: itemRect.bottom,
          };
        });
        assert.ok(firstEvent, `${mode} 首页缩略图应包含来源事件`);
        assert.ok(Math.abs(firstEvent.itemTop - firstEvent.viewportTop) <= 1, `${mode} 首条事件外框应贴合缩略图内容顶部：${JSON.stringify(firstEvent)}`);
        assert.ok(firstEvent.itemTop < firstEvent.viewportBottom, `${mode} 首条事件应位于缩略图可视区：${JSON.stringify(firstEvent)}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版编辑页复用原生顶部栏、标签页与可视化滚动布局", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      const tabs = page.getByRole("tablist", { name: "主题编辑区域" });
      assert.deepEqual(await tabs.getByRole("tab").allTextContents(), ["基础设置", "可视化编辑", "高级编辑"]);
      const application = page.getByRole("combobox", { name: "应用位置" });
      await application.click();
      assert.deepEqual(await page.getByRole("option").allTextContents(), ["现场", "副窗口"]);
      await page.keyboard.press("Escape");
      assert.doesNotMatch(await page.locator(".native-editor-heading p").innerText(), /blivechat|laplace/);
      await tabs.getByRole("tab", { name: "可视化编辑" }).click();
      const visual = page.locator(".native-editor-content.is-visual > .native-visual-editor");
      await visual.waitFor();
      const layout = await visual.evaluate(element => {
        const content = element.parentElement;
        const body = element.querySelector(".native-visual-body");
        const contentStyle = content ? getComputedStyle(content) : null;
        return {
          contentHeight: content?.clientHeight ?? 0,
          contentInnerHeight: content ? content.clientHeight - Number.parseFloat(contentStyle?.paddingTop ?? "0") - Number.parseFloat(contentStyle?.paddingBottom ?? "0") : 0,
          editorHeight: element.clientHeight,
          bodyHeight: body?.clientHeight ?? 0,
          bodyScrollHeight: body?.scrollHeight ?? 0,
          contentOverflow: content ? getComputedStyle(content).overflow : "",
        };
      });
      assert.equal(layout.contentOverflow, "hidden", `${mode} 可视化页由内部面板持有滚动：${JSON.stringify(layout)}`);
      assert.ok(Math.abs(layout.editorHeight - layout.contentInnerHeight) < 2, `${mode} 可视化编辑器应占满内容区：${JSON.stringify(layout)}`);
      assert.equal(layout.bodyScrollHeight, layout.bodyHeight, `${mode} 可视化主体不应被外层裁切：${JSON.stringify(layout)}`);
      await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
      assert.ok(await page.getByRole("combobox", { name: "字体" }).count() > 0, `${mode} 字体字段应复用原生字体选择器`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版高级编辑器加载共用的中文 Monaco CSS 编辑器", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
      const responseErrors = [];
      page.on("response", response => { if (response.status() >= 400) responseErrors.push(`${response.status()} ${response.url()}`); });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByRole("tab", { name: "高级编辑" }).click();
      await page.locator(".monaco-editor").waitFor({ state: "visible", timeout: 30_000 });
      assert.equal(await page.getByRole("alert").filter({ hasText: "编辑器加载失败" }).count(), 0, `${mode} 不应出现编辑器加载失败`);
      assert.deepEqual(responseErrors.filter(value => /monaco|vite\/deps/i.test(value)), [], `${mode} Monaco 资源不得返回过期依赖错误`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版编辑器复用完整预览工具栏并由同一画布宽度控制来源 iframe", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByRole("combobox", { name: "预览样例" }).waitFor();
      await page.getByRole("combobox", { name: "预览目标" }).waitFor();
      await page.getByRole("combobox", { name: "预览主题" }).waitFor();
      await page.getByRole("group", { name: "预览状态" }).getByRole("button", { name: "点选", exact: true }).click();
      await page.getByText("显示全部部件", { exact: true }).waitFor();
      const width = page.getByRole("spinbutton", { name: "画布宽度" });
      for (const expected of [340, 400, 500]) {
        await width.fill(String(expected));
        const widths = await page.locator(".native-preview-canvas").evaluate(element => ({ canvas: element.getBoundingClientRect().width, preview: element.firstElementChild?.getBoundingClientRect().width ?? 0 }));
        assert.ok(Math.abs(widths.canvas - expected) < 1, `${mode} 实际画布应为 ${expected}px：${JSON.stringify(widths)}`);
        assert.ok(widths.canvas > 0 && Math.abs(widths.canvas - widths.preview) < 1, `${mode} 预览应占满统一画布宽度：${JSON.stringify(widths)}`);
        const frame = page.frames().find(value => value !== page.mainFrame());
        assert.ok(frame);
        const inner = await frame.evaluate(() => ({ html: document.documentElement.getBoundingClientRect().width, body: document.body.getBoundingClientRect().width, root: document.querySelector("#app, #root")?.getBoundingClientRect().width ?? document.body.firstElementChild?.getBoundingClientRect().width ?? 0 }));
        assert.ok(Math.abs(inner.html - expected) < 1 && Math.abs(inner.body - expected) < 1 && Math.abs(inner.root - expected) < 1, `${mode} 来源文档内部应随画布变为 ${expected}px：${JSON.stringify(inner)}`);
      }
      const geometry = await page.locator(".native-preview-canvas").evaluate(element => ({ canvas: element.getBoundingClientRect().height, preview: element.firstElementChild?.getBoundingClientRect().height ?? 0 }));
      assert.ok(geometry.canvas > 0 && Math.abs(geometry.canvas - geometry.preview) < 1, `${mode} 预览应占满统一画布：${JSON.stringify(geometry)}`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版预览目标可切换且现场不呈现置顶栏", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const stickySelectors = {
      blivechat: "yt-live-chat-ticker-renderer",
      "blivechat-open": "yt-live-chat-ticker-renderer",
      laplace: ".gift-sticky-bar",
    };
    for (const [mode, stickySelector] of Object.entries(stickySelectors)) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      const target = page.getByRole("combobox", { name: "预览目标" });
      assert.equal(await target.isDisabled(), false, `${mode} 预览目标必须可用`);
      await target.click();
      assert.deepEqual(await page.getByRole("option").allTextContents(), ["现场", "副窗口", "OBS"]);
      await page.getByRole("option", { name: "现场", exact: true }).click();
      const frame = page.frames().find(value => value !== page.mainFrame());
      assert.ok(frame);
      await frame.waitForSelector(stickySelector, { state: "hidden" });
      await target.click();
      await page.getByRole("option", { name: "副窗口", exact: true }).click();
      await frame.waitForSelector(stickySelector, { state: "visible" });
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版预览样例选择会筛选来源事件", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const paidSelectors = {
      blivechat: "#items > yt-live-chat-paid-message-renderer,#items > yt-live-chat-paid-sticker-renderer",
      "blivechat-open": "#items > yt-live-chat-paid-message-renderer,#items > yt-live-chat-paid-sticker-renderer",
      laplace: ".superchat-card,.gift-card,[data-event-type='superchat'],[data-event-type='gift']",
    };
    for (const [mode, paidSelector] of Object.entries(paidSelectors)) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      const sample = page.getByRole("combobox", { name: "预览样例" });
      assert.equal(await sample.isDisabled(), false, `${mode} 预览样例必须可用`);
      await sample.click();
      await page.getByRole("option", { name: "弹幕", exact: true }).click();
      const frame = page.frames().find(value => value !== page.mainFrame());
      assert.ok(frame);
      await frame.waitForFunction(selector => [...document.querySelectorAll(selector)].every(element => {
        const rect = element.getBoundingClientRect();
        return rect.width === 0 || rect.height === 0 || getComputedStyle(element).display === "none";
      }), paidSelector);
      const visiblePaid = await frame.locator(paidSelector).evaluateAll(elements => elements.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== "none";
      }).length);
      assert.equal(visiblePaid, 0, `${mode} 弹幕样例不应混入付费事件`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版动态预览复用底座的播放、重播和速度状态", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByRole("group", { name: "预览状态" }).getByRole("button", { name: "动态", exact: true }).click();
      await page.getByRole("button", { name: "暂停", exact: true }).click();
      await page.getByRole("button", { name: "播放", exact: true }).waitFor();
      await page.getByRole("button", { name: "重新开始", exact: true }).click();
      await page.getByRole("combobox", { name: "动态速度" }).click();
      await page.getByRole("option", { name: "2×", exact: true }).click();
      await page.waitForFunction(() => document.querySelector('.native-preview-speed button')?.textContent?.includes('2×'));
      await page.close();
    }
  } finally { await browser.close(); }
});

test("LAPLACE 动态预览从实际产物加载本地礼物图片", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=laplace`);
    await page.getByRole("group", { name: "预览状态" }).getByRole("button", { name: "动态", exact: true }).click();
    const frame = page.frames().find(value => value !== page.mainFrame());
    assert.ok(frame);
    await frame.waitForFunction(() => [...document.querySelectorAll(".event--gift .gift-icon-wrap img")].some(element => {
      if (!(element instanceof HTMLImageElement)) return false;
      const rect = element.getBoundingClientRect();
      return element.currentSrc.includes("/laplace/files/") && !element.currentSrc.endsWith("/gift-fallback.png") && element.naturalWidth > 0 && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
    }), undefined, { timeout: 10_000 });
    const gift = await frame.evaluate(() => {
      const image = [...document.querySelectorAll(".event--gift .gift-icon-wrap img")].find(element => {
        if (!(element instanceof HTMLImageElement)) return false;
        const rect = element.getBoundingClientRect();
        return element.currentSrc.includes("/laplace/files/") && !element.currentSrc.endsWith("/gift-fallback.png") && element.naturalWidth > 0 && rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
      });
      return image instanceof HTMLImageElement ? { src: image.getAttribute("src"), width: image.naturalWidth, height: image.naturalHeight } : null;
    });
    assert.ok(gift?.src?.startsWith("/laplace/files/"), JSON.stringify(gift));
    assert.ok(gift.width > 0 && gift.height > 0, JSON.stringify(gift));
  } finally {
    await page.close();
    await browser.close();
  }
});

test("BLC 原版保留来源置顶高度并收起无正文礼物内容区", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=blivechat`);
    await page.locator("iframe").first().waitFor();
    const frame = page.frames().find(value => value !== page.mainFrame());
    assert.ok(frame);
    await frame.waitForSelector("yt-live-chat-ticker-renderer #items");
    const ticker = await frame.evaluate(() => {
      const root = document.querySelector("yt-live-chat-ticker-renderer");
      const items = root?.querySelector("#items");
      return { root: root?.getBoundingClientRect().height ?? 0, items: items?.getBoundingClientRect().height ?? 0 };
    });
    assert.equal(ticker.root, ticker.items, `置顶栏不得裁切来源内容：${JSON.stringify(ticker)}`);
    const empty = await frame.evaluate(() => {
      const content = [...document.querySelectorAll("yt-live-chat-paid-message-renderer[show-only-header] #content")]
        .find(element => element.getBoundingClientRect().top >= 0);
      if (!content) return null;
      const style = getComputedStyle(content);
      return { height: content.getBoundingClientRect().height, paddingTop: style.paddingTop, paddingBottom: style.paddingBottom };
    });
    assert.deepEqual(empty, { height: 0, paddingTop: "0px", paddingBottom: "0px" });
  } finally {
    await page.close();
    await browser.close();
  }
});

test("三版置顶栏用鼠标滚轮横向滚动且不改变布局", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    const selectors = {
      blivechat: "yt-live-chat-ticker-renderer .el-scrollbar__wrap",
      "blivechat-open": "yt-live-chat-ticker-renderer > #container",
      laplace: ".gift-sticky-bar",
    };
    for (const [mode, selector] of Object.entries(selectors)) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.locator("iframe").first().waitFor();
      const frame = page.frames().find(value => value !== page.mainFrame());
      assert.ok(frame);
      await frame.waitForSelector(selector);
      const before = await frame.locator(selector).evaluate(element => ({
        left: element.scrollLeft,
        width: element.getBoundingClientRect().width,
        height: element.getBoundingClientRect().height,
        scrollWidth: element.scrollWidth,
      }));
      assert.ok(before.scrollWidth > before.width, `${mode} 置顶样例应产生横向溢出：${JSON.stringify(before)}`);
      const leftReleased = await frame.locator(selector).evaluate(element => element.dispatchEvent(new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true })));
      assert.equal(leftReleased, true, `${mode} 到达左边界后应释放向左滚轮`);
      const prevented = await frame.locator(selector).evaluate(element => !element.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true })));
      const after = await frame.locator(selector).evaluate(element => ({ left: element.scrollLeft, width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
      assert.equal(prevented, true, `${mode} 可继续横向滚动时应接管滚轮`);
      assert.ok(after.left > before.left, `${mode} 普通滚轮应推动置顶栏横向滚动：${JSON.stringify({ before, after })}`);
      assert.deepEqual({ width: after.width, height: after.height }, { width: before.width, height: before.height }, `${mode} 滚轮交互不得改变布局`);
      await frame.locator(selector).evaluate(element => { element.scrollLeft = element.scrollWidth; });
      const released = await frame.locator(selector).evaluate(element => element.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true })));
      assert.equal(released, true, `${mode} 到达右边界后应释放向右滚轮`);
      const noOverflowReleased = await frame.locator(selector).evaluate(element => {
        element.replaceChildren();
        element.scrollLeft = 0;
        return element.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
      });
      assert.equal(noOverflowReleased, true, `${mode} 无横向溢出时不得接管滚轮`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("三版正式编辑器控件驱动完整发布 iframe 并回填真实节点", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const [mode, size] of [["blivechat", 27], ["blivechat-open", 28], ["laplace", 29]]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByText("可视化编辑", { exact: true }).click();
      await page.locator(".native-visual-layout > nav").getByRole("button", { name: "正文", exact: true }).click();
      await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
      const frame = page.frameLocator("iframe").first();
      const scheme = page.getByRole("combobox", { name: "编辑配色" });
      await scheme.click(); await page.getByRole("option", { name: "浅色", exact: true }).click();
      await frame.locator("[data-compatible-editor-selected]").first().waitFor({ state: "attached" });
      const widths = await page.locator(".native-preview-canvas").evaluate(element => ({ canvas: element.getBoundingClientRect().width, preview: element.firstElementChild?.getBoundingClientRect().width ?? 0 }));
      assert.ok(widths.canvas > 0 && Math.abs(widths.canvas - widths.preview) < 1, `${mode} 点选预览应占满统一画布宽度：${JSON.stringify(widths)}`);
      await page.getByText("高级编辑", { exact: true }).click();
      await frame.locator("[data-compatible-editor-selected],[data-compatible-editor-reveal]").first().waitFor({ state: "detached" });
      await page.getByText("可视化编辑", { exact: true }).click();
      const bodySelector = mode === "laplace" ? ".event--message .message" : "#message";
      await frame.locator(bodySelector).first().dispatchEvent("click");
      await page.waitForFunction(() => document.querySelector(".native-visual-layout > nav .is-active")?.textContent?.includes("正文"));
      assert.match(await page.locator(".native-visual-layout > nav .is-active").innerText(), /正文/);
      await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
      const sizeInput = page.locator(".native-property-panel label", { hasText: "字号" }).locator('input[type="number"]');
      await sizeInput.fill(String(size));
      const message = frame.locator("[data-compatible-editor-selected]").first();
      await assert.doesNotReject(() => message.waitFor({ state: "attached" }));
      assert.equal(await message.evaluate(element => getComputedStyle(element).fontSize), `${size}px`);
      assert.equal(await sizeInput.inputValue(), String(size));
      await scheme.click(); await page.getByRole("option", { name: "深色", exact: true }).click();
      assert.notEqual(await frame.locator("html").getAttribute("data-theme"), "dark", `${mode} 编辑配色不应改变预览明暗`);
      const previewScheme = page.getByRole("combobox", { name: "预览主题" });
      await previewScheme.click(); await page.getByRole("option", { name: "深色主题", exact: true }).click();
      assert.equal(await frame.locator("html").getAttribute("data-theme"), "dark");
      await page.close();
    }
  } finally { await browser.close(); }
});

test("三版可视化编辑复用原生范围栏、部件树与属性分组", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.getByText("可视化编辑", { exact: true }).click();
      const scope = page.locator(".native-scope-strip");
      for (const label of ["事件范围", "用户身份", "编辑配色"])
        await assert.doesNotReject(() => scope.getByText(label, { exact: true }).waitFor());
      assert.equal(await scope.getByText("区域范围", { exact: true }).count(), 0, `${mode} 不应保留独立区域范围`);
      assert.equal(await page.getByRole("combobox", { name: "编辑部件" }).count(), 0, `${mode} 不应保留重复部件下拉框`);
      assert.ok(await page.locator(".native-visual-layout > nav details").count() >= 2, `${mode} 应按语义分组显示部件树`);
      await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
      await assert.doesNotReject(() => page.locator(".native-edit-context").waitFor());
      assert.match(await page.locator(".native-edit-context").innerText(), /事件.*身份.*部件.*配色/s);
      assert.ok(await page.locator(".native-property-sections > details").count() >= 2, `${mode} 属性应按类别分组`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("BLC 原版可视化部件逐项命中对应区域的来源 DOM", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=blivechat`);
    await page.getByText("可视化编辑", { exact: true }).click();
    const frame = page.frameLocator("iframe").first();
    const cases = [
      ["主消息区", "弹幕", "用户名", "yt-live-chat-text-message-renderer #author-name"],
      ["主消息区", "弹幕", "正文", "yt-live-chat-text-message-renderer #message"],
      ["主消息区", "弹幕", "头像", "yt-live-chat-text-message-renderer #author-photo"],
      ["主消息区", "弹幕", "小表情", "yt-live-chat-text-message-renderer #message .emoji:not(.blc-large-emoji)"],
      ["主消息区", "弹幕", "大表情", "yt-live-chat-text-message-renderer #message .emoji.blc-large-emoji"],
      ["主消息区", "弹幕", "身份", "yt-live-chat-text-message-renderer #chat-badges yt-live-chat-author-badge-renderer"],
      ["主消息区", "醒目留言", "金额", "yt-live-chat-paid-message-renderer[data-blc-kind='superchat'] #purchase-amount"],
      ["主消息区", "醒目留言", "付费卡片", "yt-live-chat-paid-message-renderer[data-blc-kind='superchat'] #card"],
      ["主消息区", "大航海", "大航海卡片", "yt-live-chat-membership-item-renderer #card"],
      ["置顶栏", "醒目留言", "金额", "yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='superchat'] #text"],
      ["置顶栏", "醒目留言", "头像", "yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='superchat'] #author-photo"],
      ["置顶栏", "醒目留言", "置顶栏", "yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='superchat'] #container"],
    ];
    for (const [placement, eventName, partName, selector] of cases) {
      await chooseCompatibleEvent(page, eventName);
      await chooseCompatiblePart(page, placement, partName);
      await frame.locator(`${selector}[data-compatible-editor-selected]`).first().waitFor({ state: "attached" });
    }
    await chooseCompatibleEvent(page, "醒目留言");
    await page.getByText("高级编辑", { exact: true }).click();
    await frame.locator("yt-live-chat-ticker-paid-message-item-renderer[data-blc-kind='superchat']").first().click();
    await frame.locator("yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-placement='detail']").first().waitFor();
    await page.getByText("可视化编辑", { exact: true }).click();
    for (const [partName, selector] of [
      ["用户名", "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-placement='detail'] #author-name"],
      ["正文", "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-placement='detail'] #message"],
      ["头像", "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-placement='detail'] #author-photo"],
      ["金额", "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-placement='detail'] #purchase-amount"],
      ["付费卡片", "yt-live-chat-ticker-renderer > yt-live-chat-paid-message-renderer[data-blc-placement='detail'] #card"],
    ]) {
      await chooseCompatibleEvent(page, "醒目留言");
      await chooseCompatiblePart(page, "展开详情", partName);
      await frame.locator(`${selector}[data-compatible-editor-selected]`).first().waitFor({ state: "attached" });
    }
    await chooseCompatibleEvent(page, "醒目留言");
    await chooseCompatiblePart(page, "主消息区", "付费卡片");
    const borderSection = page.locator(".native-property-sections > details", { hasText: "背景与边框" });
    if (!(await borderSection.getAttribute("open"))) await borderSection.locator("summary").click();
    const radiusField = borderSection.locator(".native-property-field", { hasText: "圆角" });
    await radiusField.locator('input[type="number"]').fill("17");
    const selectedCard = frame.locator("yt-live-chat-paid-message-renderer[data-blc-kind='superchat'] #card[data-compatible-editor-selected]").first();
    await page.waitForFunction(() => getComputedStyle(document.querySelector("iframe")?.contentDocument?.querySelector("yt-live-chat-paid-message-renderer[data-blc-kind='superchat'] #card[data-compatible-editor-selected]")).borderTopLeftRadius === "17px");
    assert.equal(await selectedCard.evaluate((element) => getComputedStyle(element).borderTopLeftRadius), "17px");
    assert.notEqual(await frame.locator("yt-live-chat-paid-message-renderer[data-blc-kind='gift'] #card").first().evaluate((element) => getComputedStyle(element).borderTopLeftRadius), "17px");
    await radiusField.getByRole("button", { name: "恢复继承" }).click();
    await page.waitForFunction(() => getComputedStyle(document.querySelector("iframe")?.contentDocument?.querySelector("yt-live-chat-paid-message-renderer[data-blc-kind='superchat'] #card[data-compatible-editor-selected]")).borderTopLeftRadius !== "17px");
    assert.notEqual(await selectedCard.evaluate((element) => getComputedStyle(element).borderTopLeftRadius), "17px");
  } finally {
    await page.close();
    await browser.close();
  }
});

test("BLC 开放版可视化部件逐项命中对应区域的来源 DOM", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=blivechat-open`);
    await page.getByText("可视化编辑", { exact: true }).click();
    const frame = page.frameLocator("iframe").first();
    for (const [placement, eventName, partName, selector] of [
      ["主消息区", "弹幕", "用户名", "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #author-name"],
      ["主消息区", "弹幕", "正文", "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #message"],
      ["主消息区", "弹幕", "头像", "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #author-photo"],
      ["主消息区", "弹幕", "大表情", "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #image-and-message > img#emoticon"],
      ["主消息区", "弹幕", "粉丝牌", "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] yt-live-chat-author-medal-renderer"],
      ["主消息区", "弹幕", "身份", "yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] yt-live-chat-author-badge-renderer"],
      ["主消息区", "醒目留言", "金额", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='main'] #purchase-amount"],
      ["主消息区", "醒目留言", "付费卡片", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='main'] #card"],
      ["主消息区", "大航海", "大航海说明", "yt-live-chat-membership-item-renderer[data-openlive-kind='guard'][data-openlive-placement='main'] #header-subtext"],
      ["主消息区", "大航海", "大航海卡片", "yt-live-chat-membership-item-renderer[data-openlive-kind='guard'][data-openlive-placement='main'] #card"],
      ["置顶栏", "醒目留言", "金额", "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='superchat'] #text"],
      ["置顶栏", "醒目留言", "头像", "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='superchat'] #author-photo"],
      ["置顶栏", "醒目留言", "置顶栏", "yt-live-chat-ticker-paid-message-item-renderer[data-openlive-kind='superchat'] #container"],
    ]) {
      await chooseCompatibleEvent(page, eventName);
      await chooseCompatiblePart(page, placement, partName);
      await frame.locator(`${selector}[data-compatible-editor-selected]`).first().waitFor({ state: "attached" });
    }
    for (const [partName, selector] of [
      ["用户名", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='detail'] #author-name"],
      ["正文", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='detail'] #message"],
      ["头像", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='detail'] #author-photo"],
      ["金额", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='detail'] #purchase-amount"],
      ["付费卡片", "yt-live-chat-paid-message-renderer[data-openlive-kind='superchat'][data-openlive-placement='detail'] #card"],
    ]) {
      await chooseCompatibleEvent(page, "醒目留言");
      await chooseCompatiblePart(page, "展开详情", partName);
      await frame.locator(`${selector}[data-compatible-editor-selected]`).first().waitFor({ state: "attached" });
    }
    await chooseCompatiblePart(page, "主消息区", "大表情");
    await chooseCompatibleEvent(page, "弹幕");
    const layoutSection = page.locator(".native-property-sections > details", { hasText: "尺寸与间距" });
    if (!(await layoutSection.getAttribute("open"))) await layoutSection.locator("summary").click();
    const widthField = layoutSection.locator(".native-property-field", { hasText: "宽度" });
    await widthField.locator('input[type="number"]').fill("96");
    await page.waitForFunction(() => getComputedStyle(document.querySelector("iframe")?.contentDocument?.querySelector("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #emoticon[data-compatible-editor-selected]")).width === "96px");
    assert.equal(await frame.locator("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #emoticon[data-compatible-editor-selected]").first().evaluate((element) => getComputedStyle(element).width), "96px");
    assert.equal(await frame.locator("yt-live-chat-text-message-renderer[data-openlive-kind='danmaku'] #author-photo").first().evaluate((element) => getComputedStyle(element).width), "24px");
    await widthField.getByRole("button", { name: "恢复继承" }).click();
  } finally {
    await page.close();
    await browser.close();
  }
});

test("LAPLACE 可视化部件逐项命中对应区域的来源 DOM", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=laplace`);
    await page.getByRole("switch", { name: "粉丝牌", exact: true }).click();
    await page.getByText("可视化编辑", { exact: true }).click();
    const frame = page.frameLocator("iframe").first();
    for (const [placement, eventName, partName, selector] of [
      ["主消息区", "弹幕", "用户名", ".event-list .event--message .username"],
      ["主消息区", "弹幕", "正文", ".event-list .event--message .message"],
      ["主消息区", "弹幕", "头像", ".event-list .event--message [data-slot='avatar'].sender-avatar"],
      ["主消息区", "弹幕", "粉丝牌", ".event-list .event--message .fans-medal"],
      ["主消息区", "弹幕", "徽章", ".event-list .event--message .guard-badge"],
      ["主消息区", "弹幕", "大表情", ".event-list .event--message .emote--large"],
      ["主消息区", "礼物", "金额", ".event-list .event--gift.event-show-as--normal .price"],
      ["主消息区", "红包开始", "红包与天选信息", ".event-list .event--red-envelope-start.event-show-as--normal .red-envelope-start-details"],
      ["置顶栏", "醒目留言", "金额", ".gift-sticky-bar .event--superchat.event-show-as--sticky .price"],
      ["置顶栏", "醒目留言", "头像", ".gift-sticky-bar .event--superchat.event-show-as--sticky [data-slot='avatar'].avatar-wrap"],
      ["主消息区", "醒目留言", "用户名", ".event-list .event--superchat.event-show-as--normal .username"],
      ["主消息区", "醒目留言", "正文", ".event-list .event--superchat.event-show-as--normal .message-text"],
      ["主消息区", "醒目留言", "金额", ".event-list .event--superchat.event-show-as--normal .price"],
    ]) {
      await chooseCompatibleEvent(page, eventName);
      await chooseCompatiblePart(page, placement, partName);
      await frame.locator(`${selector}[data-compatible-editor-selected]`).first().waitFor({ state: "attached" });
    }
    await chooseCompatibleEvent(page, "弹幕");
    await chooseCompatiblePart(page, "主消息区", "用户名");
    const sizeInput = page.locator(".native-property-panel label", { hasText: "字号" }).locator('input[type="number"]');
    await sizeInput.fill("29");
    await page.waitForFunction(() => getComputedStyle(document.querySelector("iframe")?.contentDocument?.querySelector(".event-list .event--message .username[data-compatible-editor-selected]")).fontSize === "29px");
    assert.equal(await frame.locator(".event-list .event--message .username[data-compatible-editor-selected]").first().evaluate(element => getComputedStyle(element).fontSize), "29px");
  } finally {
    await page.close();
    await browser.close();
  }
});

test("正式编辑会话在手写 authored CSS 后自动回填并允许控件原位重新接管", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  try {
    await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=blivechat-open`);
    await page.getByText("可视化编辑", { exact: true }).click();
    await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
    const sizeInput = page.locator(".native-property-panel label", { hasText: "字号" }).locator('input[type="number"]');
    await sizeInput.fill("24");
    await page.getByRole("button", { name: "写入手写可视化 CSS" }).click();
    await page.waitForFunction(() => {
      const value = JSON.parse(document.querySelector('[data-testid="qa-state"]')?.textContent || "{}");
      return value.visualCss?.includes("calc(12px + 1vw)") && Object.values(value.authored?.common ?? {}).some(properties => properties.includes("fontSize"));
    });
    await page.getByText("可视化编辑", { exact: true }).click();
    await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
    await page.waitForFunction(() => {
      const input = [...document.querySelectorAll('.native-property-panel label')].find(node => node.textContent?.includes("字号"))?.querySelector('input[type="number"]');
      return input && input.value !== "" && input.value !== "24";
    });
    await sizeInput.fill("26");
    await page.waitForFunction(() => {
      const value = JSON.parse(document.querySelector('[data-testid="qa-state"]')?.textContent || "{}");
      return value.visualCss?.includes("font-size: 26px") && !Object.values(value.authored?.common ?? {}).some(properties => properties.includes("fontSize"));
    });
    await page.waitForFunction(() => [...document.querySelectorAll('.native-property-panel label')].find(node => node.textContent?.includes("字号"))?.querySelector('input[type="number"]')?.value === "26");
    assert.equal(await sizeInput.inputValue(), "26");
    const frame = page.frameLocator("iframe").first();
    assert.equal(await frame.locator("[data-compatible-editor-selected]").first().evaluate(element => getComputedStyle(element).fontSize), "26px");
    await page.getByRole("button", { name: "写入自定义 CSS" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.native-property-panel label')].find(node => node.textContent?.includes("字号"))?.querySelector('input[type="number"]')?.value === "33");
    assert.equal(await frame.locator("[data-compatible-editor-selected]").first().evaluate(element => getComputedStyle(element).fontSize), "33px");
    await sizeInput.fill("27");
    await sizeInput.fill("28");
    await page.waitForFunction(() => [...document.querySelectorAll('.native-property-panel label')].find(node => node.textContent?.includes("字号"))?.querySelector('input[type="number"]')?.value === "33");
    assert.equal(await frame.locator("[data-compatible-editor-selected]").first().evaluate(element => getComputedStyle(element).fontSize), "33px");
    await page.getByRole("button", { name: "清空自定义 CSS" }).click();
    await page.waitForFunction(() => [...document.querySelectorAll('.native-property-panel label')].find(node => node.textContent?.includes("字号"))?.querySelector('input[type="number"]')?.value === "28");
    await page.locator(".native-visual-layout > nav").getByRole("button", { name: "时间", exact: true }).click();
    await frame.locator("#timestamp[data-compatible-editor-reveal]").first().waitFor({ state: "attached" });
    assert.notEqual(await frame.locator("#timestamp").first().evaluate(element => getComputedStyle(element).display), "none");
    await page.getByText("高级编辑", { exact: true }).click();
    await frame.locator("[data-compatible-editor-reveal]").first().waitFor({ state: "detached" });
    assert.equal(await frame.locator("#timestamp").first().evaluate(element => getComputedStyle(element).display), "none");
  } finally {
    await page.close();
    await browser.close();
  }
});

test("三版选中后停止重采样且一次 CSS 变化只刷新一轮", async () => {
  const browser = await chromium.launch({ headless: true, channel: "msedge" });
  try {
    for (const mode of ["blivechat", "blivechat-open", "laplace"]) {
      const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
      await page.goto(`${baseUrl}/tests/fixtures/compatibleEditorBridge.html?mode=${mode}`);
      await page.evaluate(() => {
        window.__editorQa = { inspected: 0 };
        window.addEventListener("message", event => {
          const data = event.data;
          if (data?.command === "editor-inspected" || data?.type === "editor-inspected") window.__editorQa.inspected += 1;
        });
      });
      const frame = page.frames().find(value => value !== page.mainFrame());
      assert.ok(frame);
      await frame.waitForSelector("body");
      await frame.evaluate(() => {
        window.__editorQa = { selections: 0, css: 0, scrolls: 0 };
        window.addEventListener("message", event => {
          const data = event.data;
          if (data?.command === "editor-select" || data?.type === "render" && data?.editorSelection) window.__editorQa.selections += 1;
          if (data?.command === "css" || data?.type === "render" && data?.editorSelection) window.__editorQa.css += 1;
        });
        const original = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (...args) {
          if (this.hasAttribute("data-compatible-editor-selected")) window.__editorQa.scrolls += 1;
          return original?.apply(this, args);
        };
      });
      await page.getByText("可视化编辑", { exact: true }).click();
      await chooseCompatibleEvent(page, "醒目留言");
      await page.locator(".native-visual-layout > nav").getByRole("button", { name: "用户名", exact: true }).click();
      await frame.waitForSelector("[data-compatible-editor-selected]");
      await page.waitForTimeout(mode === "laplace" ? 1200 : 400);
      const settled = {
        parent: await page.evaluate(() => ({ ...window.__editorQa })),
        frame: await frame.evaluate(() => ({ ...window.__editorQa })),
      };
      await page.waitForTimeout(500);
      assert.deepEqual(await page.evaluate(() => ({ ...window.__editorQa })), settled.parent, `${mode} 静止后 inspection 不应继续增长`);
      assert.deepEqual(await frame.evaluate(() => ({ ...window.__editorQa })), settled.frame, `${mode} 静止后 selection/scroll 不应继续增长`);
      const sizeInput = page.locator(".native-property-panel label", { hasText: "字号" }).locator('input[type="number"]');
      await sizeInput.fill("31");
      await page.waitForTimeout(mode === "laplace" ? 1500 : 700);
      const afterCss = {
        parent: await page.evaluate(() => ({ ...window.__editorQa })),
        frame: await frame.evaluate(() => ({ ...window.__editorQa })),
      };
      assert.equal(afterCss.parent.inspected - settled.parent.inspected, 1, `${mode} 一次 CSS 变化只回传一轮 inspection：${JSON.stringify({ settled, afterCss })}`);
      assert.equal(afterCss.frame.css - settled.frame.css, 1, `${mode} 一次 CSS 变化只发送一次 renderer 更新`);
      assert.equal(afterCss.frame.selections - settled.frame.selections, mode === "laplace" ? 1 : 0, `${mode} CSS 更新不得重复发送 editor-select`);
      assert.equal(afterCss.frame.scrolls, settled.frame.scrolls, `${mode} CSS 刷新不应重新滚动定位`);
      await page.close();
    }
  } finally { await browser.close(); }
});
