import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const material = JSON.parse(
  readFileSync(
    new URL("../src/preview/nativeStaticSamples.json", import.meta.url),
    "utf8",
  ),
);
const event = (slot) =>
  structuredClone(material.samples.find((s) => s.key === `slot-${slot}`).event);
let vite, EventRow;
before(async () => {
  vite = await createServer({
    root: new URL("..", import.meta.url).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
    configFile: false,
    cacheDir: tmpdir() + "/review-render-tests",
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null },
    logLevel: "silent",
  });
  ({ EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx"));
});
after(async () => vite?.close());
const render = (ev, props = {}) =>
  renderToStaticMarkup(
    React.createElement(EventRow, {
      ev,
      archiveLayout: true,
      reviewLayout: true,
      ...props,
    }),
  );
const purchaseSource = (html) =>
  html
    .match(/<img[^>]*class="[^"]*guard-purchase-icon[^>]*>/)?.[0]
    .match(/src="([^"]+)"/)?.[1];

test("三种大航海身份的基础、千舰图标与现场逐一对应", () => {
  for (const slot of [42, 43, 44])
    for (const milestone of ["standard", "thousand"]) {
      const e = event(slot);
      e.user.guardMilestone = milestone;
      const actual = purchaseSource(render(e));
      assert.ok(actual);
      assert.equal(
        actual,
        purchaseSource(
          render(e, {
            archiveLayout: false,
            reviewLayout: false,
            liveLayout: true,
          }),
        ),
      );
      assert.ok(
        actual.includes(milestone === "thousand" ? "-1k.png" : "-animate.png"),
      );
    }
});
test("回看不消费现场外观，系统与成就始终显示真实时间", () => {
  const e = event(1);
  const html = render(e, {
    displayPreferences: { showAvatar: false },
    eventFontSize: 24,
  });
  assert.ok(html.includes("avatar-wrap"));
  assert.ok(html.includes("--review-size:14px"));
  for (const slot of [45, 53, 54, 55, 56, 57, 58, 59, 60])
    assert.ok(render(event(slot), { showTime: false }).includes("<time "));
  assert.ok(render(event(45)).includes("/guard-honor/1000.png"));
});
test("回看保留弹幕表情、系统用户头像与行内撤回", () => {
  assert.ok(render(event(13)).includes("big-emote"));
  assert.ok(render(event(55)).includes("avatar-wrap"));
  const e = event(13);
  e.danmuDeleted = true;
  const html = render(e);
  assert.equal(html.match(/已撤回/g)?.length, 1);
  assert.ok(html.indexOf("已撤回") < html.indexOf("<time"));
});
test("红包文案与公共素材类型一致", () => {
  assert.ok(render(event(50)).includes("发出大航海红包"));
  assert.ok(render(event(51)).includes("发出电池红包"));
});

test("回看八档成就使用对应官方勋章", () => {
  for (const threshold of [100, 666, 888, 1000, 1314, 2233, 5200, 10000]) {
    const e = event(45);
    e.honor.threshold = threshold;
    e.honor.secondLine = `舰队规模突破<%${threshold}%>`;
    assert.ok(render(e).includes(`/guard-honor/${threshold}.png`));
  }
});
