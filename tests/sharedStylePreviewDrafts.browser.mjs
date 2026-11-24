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
let binaryTransfers = 0;
p.on("websocket", (socket) =>
  socket.on("framereceived", ({ payload }) => {
    binaryTransfers += Object.values(
      JSON.parse(String(payload)).resources ?? {},
    ).reduce((n, value) => n + value.length, 0);
  }),
);
await p.reload();
const task = ".superpowers/sdd/2026-10-30-shared-style-preview";
await fs.mkdir(task + "/fixtures", { recursive: true });
await fs.copyFile(
  "public/media/style-preview-small-emote.png",
  task + "/fixtures/preview-acceptance.png",
);
const font = (
  await fs.readdir("public/laplace/files/chat.laplace.live/assets")
).find((n) => n.endsWith(".woff2") && n.includes("latin-600"));
await fs.copyFile(
  "public/laplace/files/chat.laplace.live/assets/" + font,
  task + "/fixtures/preview-acceptance.woff2",
);
const paths = [
  task + "/fixtures/preview-acceptance.png",
  task + "/fixtures/preview-acceptance.woff2",
].map((value) => process.cwd().replaceAll("\\", "/") + "/" + value);
await h.evaluate((paths) => {
  window.__fixturePaths = [...paths];
}, paths);
const chunk = (await fs.readdir("dist/assets")).find(
  (n) => n.startsWith("nativeMonacoLoader-") && n.endsWith(".js"),
);
const cssText =
  '@font-face{font-family:PreviewAcceptance;src:url("assets/preview-acceptance.woff2")}\n.event,.event-row-slot,yt-live-chat-text-message-renderer{font-family:PreviewAcceptance!important;color:rgb(9,123,234)!important;background-image:url("assets/preview-acceptance.png")}';
const editCss = async (value) =>
  h.evaluate(
    async ({ chunk, value }) => {
      const mod = await import("/assets/" + chunk);
      const load = Object.values(mod).find((x) => typeof x === "function");
      const api = await load();
      const models = api.editor
        .getEditors()
        .map((editor) => editor.getModel())
        .filter(Boolean);
      if (!models.length) throw Error("missing actual Monaco model");
      models[0].setValue(value);
    },
    { chunk, value },
  );
for (let i = 0; i < names.length; i++) {
  await h
    .getByRole("button", { name: "样式", exact: true })
    .evaluate((e) => e.click());
  if (await h.getByRole("button", { name: "返回样式", exact: true }).count())
    await h
      .getByRole("button", { name: "返回样式", exact: true })
      .evaluate((e) => e.click());
  if (await h.getByRole("button", { name: "放弃修改", exact: true }).count())
    await h
      .getByRole("button", { name: "放弃修改", exact: true })
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
    .getByRole("button", { name: "打开预览页", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(500);
  assert.equal(
    await h.evaluate(() =>
      window.__TAURI_INTERNALS__.invoke("plugin:window|is_visible", {
        label: "native-style-preview",
      }),
    ),
    false,
  );
  await h.waitForTimeout(1000);
  const w = ctx
    .pages()
    .find((p) => p.url().includes("window=native-style-preview"));
  const f = await source(h, i === 0, true),
    wf = await source(w, i === 0, false),
    bf = await source(p, i === 0, false);
  const assertCurrent = async () =>
    eventually(async () => {
      assert.deepEqual(await read(wf, i === 0), await read(f, i === 0));
      assert.deepEqual(await read(bf, i === 0), await read(f, i === 0));
      const a = await metrics(f, i === 0),
        c = await metrics(bf, i === 0);
      assert.equal(c.font, a.font);
      assert.equal(c.color, a.color);
    });
  const base = h.locator(".native-theme-basic input[type=number]").first();
  if (i === 2) {
    await h
      .getByRole("switch", { name: "头像", exact: true })
      .evaluate((e) => e.click());
  } else {
    const previous = Number(await base.inputValue());
    await input(base, previous + (i === 1 ? 0.1 : 2));
  }
  await assertCurrent();
  await h
    .getByRole("tab", { name: "可视化编辑", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(500);
  const numeric = h
    .locator(".native-property-field input[type=number]")
    .first();
  const visualEdited = (await numeric.count()) > 0;
  assert(visualEdited);
  if (visualEdited) {
    await input(numeric, Number(await numeric.inputValue()) + 2);
    await assertCurrent();
  }
  await h
    .getByRole("tab", { name: "高级编辑", exact: true })
    .evaluate((e) => e.click());
  await h
    .getByRole("button", { name: "自定义 CSS", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(1000);
  if (i === 0) {
    for (let j = 0; j < paths.length; j++) {
      await h
        .getByRole("button", { name: "添加图片或字体", exact: true })
        .evaluate((e) => e.click());
      await h.waitForTimeout(350);
    }
  }
  await editCss(
    i === 0
      ? cssText
      : ".event,yt-live-chat-text-message-renderer{color:rgb(9,123,234)!important}",
  );
  await h.waitForTimeout(500);
  await assertCurrent();
  if (i === 0) {
    for (const frame of [f, wf, bf]) {
      const decoded = await frame.evaluate(async () => {
        const loaded = await document.fonts.load("16px PreviewAcceptance");
        const style = [...document.querySelectorAll("style")]
          .map((x) => x.textContent)
          .join("\n");
        const data = style.match(/data:image\/png;base64,[A-Za-z0-9+/=]+/);
        if (!data)
          return {
            image: false,
            font:
              loaded.length > 0 &&
              loaded.every((face) => face.status === "loaded"),
          };
        const image = new Image();
        image.src = data[0];
        await image.decode();
        return {
          image: image.naturalWidth > 0,
          font:
            loaded.length > 0 &&
            loaded.every((face) => face.status === "loaded"),
        };
      });
      assert.deepEqual(decoded, { image: true, font: true });
    }
    const before = binaryTransfers;
    await editCss(cssText.replace("rgb(9,123,234)", "rgb(18,45,67)"));
    await h.waitForTimeout(300);
    await assertCurrent();
    assert.equal(binaryTransfers, before, "配色修改不应重新传输原资源");
    console.log("resourceReuse", binaryTransfers);
  }
  await editCss("} invalid css {");
  await h.waitForTimeout(300);
  await assertCurrent();
  await editCss("");
  await assertCurrent();
  results.push({
    mode: names[i],
    basicDraft: true,
    visualDraft: visualEdited,
    advancedDraft: true,
    invalidCss: true,
    unsavedResources: i === 0,
  });
  console.log(JSON.stringify(results.at(-1)));
  await h
    .getByRole("button", { name: "返回样式", exact: true })
    .evaluate((e) => e.click());
  if (await h.getByRole("button", { name: "放弃修改", exact: true }).count())
    await h
      .getByRole("button", { name: "放弃修改", exact: true })
      .evaluate((e) => e.click());
  await eventually(async () =>
    assert.equal(await p.locator(".shared-style-preview-content").count(), 0),
  );
}
await fs.writeFile(
  task + "/drafts-result.json",
  JSON.stringify(results, null, 2),
);
await b.close();
await app.close();
