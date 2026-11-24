import { createRequire } from "node:module";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const app = await chromium.connectOverCDP(
  process.env.PREVIEW_TEST_CDP || "http://127.0.0.1:9253",
);
const ctx = app.contexts()[0];
const h = ctx.pages().find((p) => p.url() === "http://tauri.localhost/");
assert.match(
  await h.evaluate(() =>
    window.__TAURI_INTERNALS__.invoke("plugin:app|identifier"),
  ),
  /^cc\.orange\.danmu-app\.shared-preview-/,
);
const sessionChunk = (await fs.readdir("dist/assets")).find(
  (name) => name.startsWith("obsOutputState-") && name.endsWith(".js"),
);
await h.evaluate(async (path) => {
  const module = await import("/assets/" + path);
  const session = Object.values(module).find(
    (x) =>
      typeof x === "function" &&
      typeof x.getState === "function" &&
      "phase" in x.getState(),
  );
  if (!session) throw new Error("missing session store");
  session.setState({
    phase: "loggedIn",
    session: {
      cookie: "",
      refreshToken: "",
      mid: "0",
      uname: "预览验收",
      savedAt: Date.now(),
    },
    error: null,
  });
}, sessionChunk);
await h.waitForTimeout(700);
const suppress = () => {
  if (window.__previewFetchShim) return;
  const original = window.fetch.bind(window);
  window.__previewFetchShim = true;
  window.fetch = (url, options) => {
    const target = new URL(String(url), location.href);
    if (target.hostname === "ipc.localhost") {
      const command = decodeURIComponent(target.pathname.slice(1));
      const ok = (value) =>
        Promise.resolve(
          new Response(JSON.stringify(value), {
            headers: {
              "Content-Type": "application/json",
              "Tauri-Response": "ok",
            },
          }),
        );
      if (["plugin:window|show", "plugin:window|set_focus"].includes(command))
        return ok(null);
      if (command === "plugin:dialog|open")
        return ok(window.__fixturePaths?.shift() ?? null);
      if (command === "plugin:webview|create_webview_window") {
        const payload = JSON.parse(options.body);
        payload.options.visible = false;
        options = { ...options, body: JSON.stringify(payload) };
      }
    }
    return original(url, options);
  };
};
await ctx.addInitScript(suppress);
await h.evaluate(suppress);
const b = await chromium.launch({ channel: "chrome", headless: true });
const p = await b.newPage({ viewport: { width: 1000, height: 1100 } });
await p.goto(process.env.PREVIEW_TEST_URL || "http://127.0.0.1:17922/preview");
const results = [];
const eventually = async (check) => {
  const end = Date.now() + 30000;
  for (;;) {
    try {
      return await check();
    } catch (error) {
      if (Date.now() > end) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
};
const names = ["原生默认", "BLC 原版默认", "BLC 开放版默认", "LAPLACE 默认"];
const source = async (page, native, main) => {
  const selector = main
    ? native
      ? "[data-native-canvas] iframe"
      : "[data-compatible-canvas] iframe"
    : ".shared-style-preview-content iframe";
  const el = await page.locator(selector).first().elementHandle();
  assert(el, selector);
  return await el.contentFrame();
};
const read = async (frame, native) =>
  frame.evaluate((native) => {
    const selector = native
      ? ".event-row-slot[data-event-id]"
      : "[data-compatible-event-id],.event[data-event-id]";
    const ids = [...document.querySelectorAll(selector)].map(
      (x) =>
        x.getAttribute("data-compatible-event-id") ||
        x.getAttribute("data-event-id"),
    );
    return [...new Set(ids)];
  }, native);
const choose = async (label, name) => {
  await h
    .getByRole("combobox", { name: label, exact: true })
    .evaluate((e) => e.click());
  await h.getByRole("option", { name, exact: true }).evaluate((e) => e.click());
};
const input = async (locator, value) =>
  locator.evaluate((e, v) => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    ).set.call(e, String(v));
    e.dispatchEvent(new Event("input", { bubbles: true }));
  }, value);
const metrics = async (frame, native) =>
  frame.evaluate((native) => {
    const row = document.querySelector(
      native
        ? ".event-row-slot[data-event-id]"
        : "[data-compatible-event-id],.event[data-event-id]",
    );
    if (!row) return null;
    let text = [...row.querySelectorAll("*")].find(
      (e) => e.children.length === 0 && e.textContent.trim(),
    );
    text ??= row;
    const c = getComputedStyle(text),
      r = row.getBoundingClientRect();
    return {
      text: text.textContent,
      font: c.fontSize,
      color: c.color,
      line: c.lineHeight,
      width: r.width,
      height: r.height,
    };
  }, native);
for (const scale of [90, 100]) {
  await h
    .getByRole("button", { name: "打开设置", exact: true })
    .evaluate((e) => e.click());
  await input(h.getByRole("slider", { name: "界面比例", exact: true }), scale);
  await h.waitForTimeout(350);
  await h
    .getByRole("button", { name: "退出设置并收起工作台", exact: true })
    .evaluate((e) => e.click());
  if (
    await h.getByRole("button", { name: "展开功能面板", exact: true }).count()
  ) {
    await eventually(async () =>
      assert(
        await h
          .getByRole("button", { name: "展开功能面板", exact: true })
          .isEnabled(),
      ),
    );
    await h
      .getByRole("button", { name: "展开功能面板", exact: true })
      .evaluate((e) => e.click());
  }
  for (let i = 0; i < 1; i++) {
    await h
      .getByRole("button", { name: "样式", exact: true })
      .evaluate((e) => e.click());
    if (await h.getByRole("button", { name: "返回样式", exact: true }).count())
      await h
        .getByRole("button", { name: "返回样式", exact: true })
        .evaluate((e) => e.click());
    await h
      .locator(".theme-library-card")
      .filter({
        has: h
          .locator("strong")
          .filter({ hasText: new RegExp("^" + names[i] + "$") }),
      })
      .getByRole("button", { name: "编辑", exact: true })
      .evaluate((e) => e.click());
    await h
      .getByRole("tab", { name: "基础设置", exact: true })
      .evaluate((e) => e.click());
    await choose("预览样例", "混合流");
    await h
      .getByRole("button", { name: "静态", exact: true })
      .evaluate((e) => e.click());
    await h
      .getByRole("button", { name: "打开预览页", exact: true })
      .evaluate((e) => e.click());
    await h.waitForTimeout(600);
    const w = ctx
        .pages()
        .find((p) => p.url().includes("window=native-style-preview")),
      f = await source(h, i === 0, true),
      wf = await source(w, i === 0, false),
      bf = await source(p, i === 0, false);
    for (const width of [320, 500]) {
      await input(
        h.getByRole("spinbutton", { name: "画布宽度", exact: true }),
        width,
      );
      await eventually(async () => {
        const liveSource = await source(h, i === 0, true),
          liveWindow = await source(w, i === 0, false),
          liveBrowser = await source(p, i === 0, false);
        const current = await read(liveSource, i === 0);
        assert(current.length);
        assert.deepEqual(await read(liveWindow, i === 0), current);
        assert.deepEqual(await read(liveBrowser, i === 0), current);
        const a = await metrics(liveSource, i === 0);
        for (const frame of [liveWindow, liveBrowser]) {
          const c = await metrics(frame, i === 0);
          assert.equal(c.font, a.font);
          assert.equal(c.color, a.color);
          assert(Math.abs(c.width - a.width) <= 1, JSON.stringify({ a, c }));
          assert(Math.abs(c.height - a.height) <= 1, JSON.stringify({ a, c }));
        }
      });
      results.push({
        mode: names[i],
        uiScale: scale,
        width,
        cssGeometry: true,
      });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
}
await h
  .getByRole("button", { name: "样式", exact: true })
  .evaluate((e) => e.click());
if (await h.getByRole("button", { name: "返回样式", exact: true }).count())
  await h
    .getByRole("button", { name: "返回样式", exact: true })
    .evaluate((e) => e.click());
await h
  .locator(".theme-library-card")
  .filter({ has: h.locator("strong").filter({ hasText: /^原生默认$/ }) })
  .getByRole("button", { name: "编辑", exact: true })
  .evaluate((e) => e.click());
await h
  .getByRole("button", { name: "静态", exact: true })
  .evaluate((e) => e.click());
await choose("预览样例", "醒目留言");
await h
  .getByRole("tab", { name: "高级编辑", exact: true })
  .evaluate((e) => e.click());
await h
  .getByRole("button", { name: "自定义 CSS", exact: true })
  .evaluate((e) => e.click());
await h.waitForTimeout(700);
const f = await source(h, true, true),
  bf = await source(p, true, false),
  wf = await source(
    ctx.pages().find((p) => p.url().includes("window=native-style-preview")),
    true,
    false,
  );
const monacoChunk = (await fs.readdir("dist/assets")).find(
  (n) => n.startsWith("nativeMonacoLoader-") && n.endsWith(".js"),
);
const edit = async (value) =>
  h.evaluate(
    async ({ chunk, value }) => {
      const loader = Object.values(await import("/assets/" + chunk)).find(
        (x) => typeof x === "function",
      );
      const api = await loader();
      api.editor.getEditors()[0].getModel().setValue(value);
    },
    { chunk: monacoChunk, value },
  );
for (const size of [72, 8]) {
  await edit(
    `.event,.event *{font-size:${size}px!important;line-height:${size * 1.25}px!important}.native-preview-message-scroll{border:6px solid red!important}`,
  );
  await h.waitForTimeout(400);
  await eventually(async () => {
    const a = await metrics(f, true);
    for (const frame of [wf, bf]) {
      const c = await metrics(frame, true);
      assert.equal(c.font, a.font);
      assert(Math.abs(a.width - c.width) <= 1, JSON.stringify({ a, c }));
    }
  });
  console.log("CSS font geometry", size);
}
await edit("");
await b.close();
await app.close();
