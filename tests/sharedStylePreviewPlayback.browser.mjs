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
const previewUrl = process.env.PREVIEW_TEST_URL || "http://127.0.0.1:17922/preview";
const service = await h.evaluate(async (port) => {
  const status = await window.__TAURI_INTERNALS__.invoke("obs_service_status");
  return status.running && status.port === port ? status : window.__TAURI_INTERNALS__.invoke("obs_set_service_port", { port });
}, Number(new URL(previewUrl).port));
assert.equal(service.port, Number(new URL(previewUrl).port));
await p.goto(previewUrl);
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

const chunk = (await fs.readdir("dist/assets")).find(
  (n) => n.startsWith("stylePreviewSession-") && n.endsWith(".js"),
);
const state = () =>
  h.evaluate(async (c) => (await import("/assets/" + c)).b(), chunk);
const measureIntervals = (native) => h.evaluate(async ({ chunk, native }) => {
  const getPreview = (await import("/assets/" + chunk)).b;
  const samples = [];
  let previous;
  const deadline = performance.now() + 90000;
  while (samples.length < 21 && performance.now() < deadline) {
    const frame = getPreview()?.frame;
    const records = frame?.records?.filter(record => ["onAddText", "onAddGift", "onAddMember", "onAddSuperChat", "onAddLike"].includes(record.method));
    const value = native ? frame?.cursor : records ? records.at(-1)?.sequence : frame?.events?.at(-1)?.id;
    if (value !== undefined && value !== previous) {
      samples.push(performance.now());
      previous = value;
    }
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  return samples.slice(1).map((time, index) => time - samples[index]);
}, { chunk, native });
for (
  let i = Number(process.env.PREVIEW_START_INDEX || 0);
  i < Number(process.env.PREVIEW_END_INDEX || names.length);
  i++
) {
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
  if (i === 0) await choose("预览样例", "混合流");
  await h
    .getByRole("button", { name: "动态", exact: true })
    .evaluate((e) => e.click());
  if (await h.getByRole("button", { name: "播放", exact: true }).count())
    await h
      .getByRole("button", { name: "播放", exact: true })
      .evaluate((e) => e.click());
  await h
    .getByRole("button", { name: "打开预览页", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(1000);
  if (process.env.PREVIEW_START_FRESH === "1") await p.reload();
  const w = ctx
    .pages()
    .find((p) => p.url().includes("window=native-style-preview"));
  await h.waitForTimeout(2300);
  await eventually(async () => assert((await read(await source(h, i === 0, true), i === 0)).length));
  const speeds = [];
  for (const speed of [0.5, 1, 1.5, 2, 2.5, 3]) {
    await choose("动态速度", speed + "×");
    await h.waitForTimeout(1000);
    await h
      .getByRole("button", { name: "暂停", exact: true })
      .evaluate((e) => e.click());
    await h.waitForTimeout(600);
    await eventually(async () => {
      const f = await source(h, i === 0, true),
        wf = await source(w, i === 0, false),
        bf = await source(p, i === 0, false);
      const ids = await read(f, i === 0);
      assert(ids.length);
      assert.deepEqual(await read(wf, i === 0), ids);
      assert.deepEqual(await read(bf, i === 0), ids);
    });
    const st = await state();
    assert.equal(st.frame.playing, false);
    if (i !== 0) assert.equal(st.content.previewSpeed, speed);
    speeds.push(speed);
    await h
      .getByRole("button", { name: "播放", exact: true })
      .evaluate((e) => e.click());
  }
  if (i === 2) {
    await h.getByRole("button", { name: "暂停", exact: true }).click();
    await choose("动态速度", "0.5×");
    await h.waitForTimeout(500);
    const count = (await state()).frame.records.length;
    await h.getByRole("button", { name: "播放", exact: true }).click();
    await h.waitForTimeout(400);
    assert.equal((await state()).frame.records.length, count, "继续播放不应立即产生新事件");
  }
  if (i === 0 && process.env.PREVIEW_READING === "1") {
    await p.setViewportSize({ width: 1000, height: 240 });
    await w.setViewportSize({ width: 1000, height: 240 });
    await choose("动态速度", "3×");
    await h.getByRole("button", { name: "重新开始", exact: true }).evaluate(e => e.click());
    const position = frame => frame.evaluate(() => {
      const node = document.querySelector(".native-preview-message-scroll");
      return { top: node.scrollTop, max: node.scrollHeight - node.clientHeight };
    });
    const scrollable = async () => {
      const wf = await source(w, true, false), bf = await source(p, true, false);
      assert((await position(wf)).max > 40);
      assert((await position(bf)).max > 40);
      return [wf, bf];
    };
    let frames = await eventually(scrollable);
    await h.getByRole("button", { name: "暂停", exact: true }).evaluate(e => e.click());
    const pausedRestart = (await state()).frame.restart;
    await choose("动态速度", "2×");
    assert.equal((await state()).frame.restart, pausedRestart);
    for (const frame of frames) await frame.evaluate(() => {
      const node = document.querySelector(".native-preview-message-scroll");
      node.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true }));
      node.scrollTop = 0;
    });
    await h.waitForTimeout(500);
    for (const frame of frames) assert((await position(frame)).top <= 4, "接收页应停在历史位置");
    await h.getByRole("button", { name: "播放", exact: true }).evaluate(e => e.click());
    await h.waitForTimeout(200);
    assert.equal((await state()).frame.restart, pausedRestart);
    await h.getByRole("button", { name: "重新开始", exact: true }).evaluate(e => e.click());
    await eventually(async () => assert((await state()).frame.restart > pausedRestart));
    await h.waitForTimeout(600);
    frames = await eventually(scrollable);
    await eventually(async () => {
      for (const frame of frames) {
        const { top, max } = await position(frame);
        assert(max - top <= 4, `重播后应跟随最新，差距 ${max - top}px`);
      }
    });
    await choose("动态速度", "3×");
    const round = (await state()).frame.restart;
    await eventually(async () => assert((await state()).frame.restart > round, "序列循环应开启新轮次"));
    const beforeSample = (await state()).frame.restart;
    await choose("预览样例", "弹幕");
    await eventually(async () => assert((await state()).frame.restart > beforeSample, "切换样例应开启新轮次"));
    await choose("预览样例", "混合流");
    console.log(JSON.stringify({ mode: names[i], replayRestoresFollowing: true }));
    await p.setViewportSize({ width: 1000, height: 1100 });
  }
  let firstSignature;
  if (process.env.PREVIEW_TRANSITIONS === "1") {
    await choose("动态速度", "0.5×");
    for (const mode of ["静态", "点选", "静态"]) {
      await h.getByRole("button", { name: mode, exact: true }).evaluate(e => e.click());
      await h.waitForTimeout(800);
      const oldRestart = (await state()).frame.restart;
      const receiver = i === 2 ? await source(p, false, false) : null;
      if (receiver) await receiver.evaluate(() => {
        window.__roundFrames = [];
        if (!window.__roundCapture) {
          window.__roundCapture = true;
          window.addEventListener("message", event => {
            if (event.data?.command === "preview-present") window.__roundFrames.push({ restart: event.data.data.restart, count: event.data.data.messages.length });
          });
        }
      });
      await h.getByRole("button", { name: "动态", exact: true }).evaluate(e => e.click());
      await eventually(async () => {
        const frame = (await state()).frame;
        const count = i === 0 ? frame.cursor : frame.records
          ? frame.records.filter(record => ["onAddText", "onAddGift", "onAddMember", "onAddSuperChat", "onAddLike"].includes(record.method)).length
          : frame.events?.length;
        assert(count >= 1 && count <= 2);
      });
      await h.getByRole("button", { name: "暂停", exact: true }).evaluate(e => e.click());
      await h.waitForTimeout(500);
      const current = await state();
      if (receiver) {
        const frames = await receiver.evaluate(() => window.__roundFrames);
        assert(frames.some(frame => frame.restart > oldRestart), "固定预览应接收新轮次");
        assert(frames.filter(frame => frame.restart > oldRestart).every(frame => frame.count <= 2), "新轮次不能重新呈现旧静态样例");
      }
      const count = i === 0 ? current.frame.cursor : current.frame.records
        ? current.frame.records.filter(record => ["onAddText", "onAddGift", "onAddMember", "onAddSuperChat", "onAddLike"].includes(record.method)).length
        : current.frame.events.length;
      assert(count >= 1 && count <= 2, `${names[i]} ${mode}→动态应从首项开始，实际 ${count} 条`);
      const first = i === 0 ? current.content.events[0] : current.frame.records
        ? current.frame.records.find(record => ["onAddText", "onAddGift", "onAddMember", "onAddSuperChat", "onAddLike"].includes(record.method))
        : current.frame.events[0];
      const payload = first.payload ?? first;
      const signature = JSON.stringify([first.method ?? first.type ?? first.msgType, payload.content ?? payload.message ?? payload.text ?? payload.giftName, payload.authorName ?? payload.username ?? payload.user?.uname]);
      if (firstSignature === undefined) firstSignature = signature;
      else assert.equal(signature, firstSignature, `${names[i]} 重新进入动态后首项应一致`);
      await eventually(async () => {
        const ids = await read(await source(h, i === 0, true), i === 0);
        assert.deepEqual(await read(await source(w, i === 0, false), i === 0), ids);
        assert.deepEqual(await read(await source(p, i === 0, false), i === 0), ids);
      });
      console.log(JSON.stringify({ mode: names[i], transition: `${mode}→动态`, count }));
    }
    await h.getByRole("button", { name: "播放", exact: true }).evaluate(e => e.click());
    await h.waitForTimeout(2200);
  }
  const intervals = {};
  if (process.env.PREVIEW_MEASURE === "1") {
    for (const speed of [0.5, 1, 2]) {
      await choose("动态速度", `${speed}×`);
      await h.getByRole("button", { name: "重新开始", exact: true }).evaluate(e => e.click());
      const samples = await measureIntervals(i === 0);
      assert.equal(samples.length, 20, `${names[i]} ${speed}× 未收集到 20 个间隔`);
      const sorted = [...samples].sort((a, b) => a - b);
      const median = (sorted[9] + sorted[10]) / 2;
      intervals[speed] = Math.round(median);
      console.log(JSON.stringify({ mode: names[i], speed, samples: samples.length, median: intervals[speed] }));
      assert(Math.abs(median - 1000 / speed) <= 100, `${names[i]} ${speed}× 间隔中位数 ${median}ms`);
    }
  }
  const before = await state();
  if (process.env.PREVIEW_TRANSITIONS === "1") await choose("动态速度", "2×");
  await h
    .getByRole("button", { name: "重新开始", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(1000);
  await h
    .getByRole("button", { name: "暂停", exact: true })
    .evaluate((e) => e.click());
  await h.waitForTimeout(650);
  const after = await state();
  if (i === 0) {
    assert(after.frame.cursor <= 4);
    assert(Number.isInteger(before.frame.restart));
    assert(after.frame.restart > before.frame.restart);
  } else assert(after.frame.restart > before.frame.restart);
  if (firstSignature !== undefined) {
    const first = i === 0 ? after.content.events[0] : after.frame.records
      ? after.frame.records.find(record => ["onAddText", "onAddGift", "onAddMember", "onAddSuperChat", "onAddLike"].includes(record.method))
      : after.frame.events[0];
    assert(first, `${names[i]} 重播后应有首项`);
    const payload = first.payload ?? first;
    assert.equal(JSON.stringify([first.method ?? first.type ?? first.msgType, payload.content ?? payload.message ?? payload.text ?? payload.giftName, payload.authorName ?? payload.username ?? payload.user?.uname]), firstSignature, `${names[i]} 重播首项应一致`);
  }
  await p.reload();
  await h.waitForTimeout(850);
  await eventually(async () => {
    const f = await source(h, i === 0, true),
      wf = await source(w, i === 0, false),
      bf = await source(p, i === 0, false);
    assert.deepEqual(await read(wf, i === 0), await read(f, i === 0));
    assert.deepEqual(await read(bf, i === 0), await read(f, i === 0));
  });
  results.push({
    mode: names[i],
    speeds,
    restart: true,
    lateAfterRestart: true,
    ...(process.env.PREVIEW_MEASURE === "1" ? { intervals } : {}),
  });
  console.log(JSON.stringify(results.at(-1)));
  if (i + 1 < Number(process.env.PREVIEW_END_INDEX || names.length))
    await h.getByRole("button", { name: "播放", exact: true }).evaluate(e => e.click());
}
await fs.writeFile(
  ".superpowers/sdd/2026-10-30-shared-style-preview/playback-result.json",
  JSON.stringify(results, null, 2),
);
await b.close();
await app.close();
