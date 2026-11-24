import { createRequire } from "node:module";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const app = await chromium.connectOverCDP(
  process.env.PREVIEW_TEST_CDP ||
    process.env.PREVIEW_TEST_CDP ||
    "http://127.0.0.1:9253",
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
await p.goto(
  process.env.PREVIEW_TEST_URL ||
    process.env.PREVIEW_TEST_URL ||
    "http://127.0.0.1:17922/preview",
);
const results = [];
const eventually = async (check) => {
  const end = Date.now() + 10000;
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
await h.evaluate(() => {
  navigator.clipboard.writeText = async (text) => {
    window.__copiedPreview = text;
  };
});
const p2 = await b.newPage();
await p2.addInitScript(() => {
  const Original = WebSocket;
  window.WebSocket = class extends Original {
    constructor(...args) {
      super(...args);
      window.__actualPreviewSocket = this;
      this.addEventListener("message", (e) => {
        (window.__previewMessages ??= []).push(JSON.parse(e.data));
      });
    }
  };
});
await p2.goto("http://127.0.0.1:17922/preview?config=old&draft=old");
await eventually(async () => assert.equal(new URL(p2.url()).search, ""));
for (let cycle = 0; cycle < 3; cycle++)
  for (let i = 0; i < names.length; i++) {
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
    await h
      .getByRole("button", { name: "静态", exact: true })
      .evaluate((e) => e.click());
    await h
      .getByRole("button", { name: "复制预览链接", exact: true })
      .evaluate((e) => e.click());
    await eventually(async () =>
      assert.equal(
        await h.evaluate(() => window.__copiedPreview),
        process.env.PREVIEW_TEST_URL || "http://127.0.0.1:17922/preview",
      ),
    );
    await eventually(async () =>
      assert.equal(
        await p2
          .locator(".shared-style-preview-content")
          .getAttribute("data-preview-kind"),
        i === 0 ? "native" : "compatible",
      ),
    );
    const f = await source(h, i === 0, true),
      remote = await source(p2, i === 0, false);
    await eventually(async () =>
      assert.deepEqual(await read(remote, i === 0), await read(f, i === 0)),
    );
    console.log("switch", cycle, names[i]);
  }
const transientDocumentErrors = [];
p2.on("pageerror", error => transientDocumentErrors.push(error.message));
await p2.evaluate(() => {
  const doc = document.querySelector(".shared-style-preview-content iframe")?.contentDocument;
  if (!doc) throw new Error("预览文档未加载");
  Object.defineProperty(doc, "head", { configurable: true, get: () => null });
  document.fonts.dispatchEvent(new Event("loadingdone"));
  delete doc.head;
});
await p2.waitForTimeout(100);
assert.deepEqual(transientDocumentErrors, [], "字体加载通知不得使未完成加载的预览文档报错");
await p2.evaluate(() => window.__actualPreviewSocket.close());
assert.equal(await p2.locator(".shared-style-preview-content").count(), 1);
await eventually(async () =>
  assert.equal(await p2.locator(".shared-style-preview-content").count(), 1),
);
await h
  .getByTitle("现场（当前页）", { exact: true })
  .evaluate((e) => e.click());
await eventually(async () =>
  assert.equal(await p2.locator(".shared-style-preview-content").count(), 0),
);
await h
  .getByRole("button", { name: "样式", exact: true })
  .evaluate((e) => e.click());
if (await h.getByRole("button", { name: "返回样式", exact: true }).count())
  await h
    .getByRole("button", { name: "返回样式", exact: true })
    .evaluate((e) => e.click());
await h
  .getByRole("button", { name: "OBS 设置", exact: true })
  .evaluate((e) => e.click());
const configurations = [],
  formalPages = [];
for (let i = 0; i < names.length; i++) {
  await h
    .getByRole("button", { name: "新建配置", exact: true })
    .evaluate((e) => e.click());
  await input(
    h.getByRole("textbox", { name: "OBS 房间号", exact: true }),
    24125,
  );
  await choose("OBS 主题", names[i]);
  await h
    .getByRole("button", { name: "保存配置", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(500);
  assert.equal(
    await h.getByRole("button", { name: "打开预览页", exact: true }).count(),
    0,
  );
  assert.equal(
    await h.getByRole("button", { name: "复制预览链接", exact: true }).count(),
    0,
  );
  await eventually(async () =>
    assert.equal(
      await p2
        .locator(".shared-style-preview-content")
        .getAttribute("data-preview-kind"),
      "obs",
    ),
  );
  await eventually(async () =>
    assert(
      await h
        .getByRole("button", { name: "复制 OBS 地址", exact: true })
        .isEnabled(),
    ),
  );
  await h.evaluate(() => {
    window.__copiedPreview = null;
  });
  await h
    .getByRole("button", { name: "复制 OBS 地址", exact: true })
    .evaluate((e) => e.click());
  await eventually(async () =>
    assert(await h.evaluate(() => window.__copiedPreview?.includes("/obs?"))),
  );
  const url = await h.evaluate(() => window.__copiedPreview);
  const parsed = new URL(url);
  const config = {
    id: parsed.searchParams.get("config"),
    themeId: parsed.searchParams.get("theme"),
    roomId: parsed.searchParams.get("room"),
  };
  configurations.push(config);
  parsed.searchParams.set("preview", "sample");
  const formal = await b.newPage();
  await formal.addInitScript(() => {
    const Original = WebSocket;
    window.WebSocket = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", (e) => {
          const value = JSON.parse(e.data);
          if (value.type === "state") window.__formal = value;
        });
      }
    };
  });
  await formal.goto(parsed.href);
  await formal.waitForFunction(
    () => window.__formal && document.querySelector(".obs-native-root"),
  );
  assert.equal(
    await formal.evaluate(() => window.__formal.snapshot.mode || "native"),
    ["native", "blivechat", "blivechat-open", "laplace"][i],
  );
  formalPages.push({
    page: formal,
    snapshot: await formal.evaluate(() =>
      JSON.stringify(window.__formal.snapshot),
    ),
  });
  console.log("formal", names[i], config.id);
}
await fs.writeFile(
  ".superpowers/sdd/2026-10-30-shared-style-preview/formal-configs.json",
  JSON.stringify(configurations, null, 2),
);
await h
  .getByRole("button", { name: "返回样式", exact: true })
  .evaluate((e) => e.click());
await h
  .locator(".theme-library-card")
  .filter({ has: h.locator("strong").filter({ hasText: "原生默认" }) })
  .first()
  .getByRole("button", { name: "编辑", exact: true })
  .evaluate((e) => e.click());
await h
  .getByRole("tab", { name: "基础设置", exact: true })
  .evaluate((e) => e.click());
const baseline = h.locator(".native-theme-basic input[type=number]").first();
await input(baseline, 24);
await h
  .getByRole("button", { name: "动态", exact: true })
  .evaluate((e) => e.click());
await h.waitForTimeout(1000);
for (const entry of formalPages)
  assert.equal(
    await entry.page.evaluate(() => JSON.stringify(window.__formal.snapshot)),
    entry.snapshot,
  );
await h
  .getByRole("button", { name: "返回样式", exact: true })
  .evaluate((e) => e.click());
await eventually(async () =>
  assert.equal(await p2.locator(".shared-style-preview-content").count(), 0),
);
await fs.writeFile(
  ".superpowers/sdd/2026-10-30-shared-style-preview/lifecycle-result.json",
  JSON.stringify(
    {
      fixedLink: true,
      rapidSwitches: 12,
      reconnect: true,
      clearOnLeave: true,
      obsManagement: true,
      formalIsolation: true,
      configurations,
    },
    null,
    2,
  ),
);
await b.close();
await app.close();
