import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { MsgType } from "../src/protocol/types.ts";
import { nativeEventSamples, EVENT_CODES, getNativeEventSample, comboUpdateSample } from "./fixtures/nativeEventSamples.ts";
import { toArchiveMutations, toArchiveEventInput, getArchiveEventPaidAmount } from "../src/archive/archiveEventMutations.ts";
import { getEventMarkKey, getEventBookmarkKey } from "../src/events/eventIdentity.ts";
import { mergeGiftInto } from "../src/events/giftMerge.ts";
import { summarizeGiftEvents } from "../src/components/eventSummary.ts";
import { DEFAULT_EVENT_FILTERS, filterEventsForPane } from "../src/events/eventView.ts";

let vite, EventRow, preferences;
before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-nativeEventSamples.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, esbuild: { jsx: "automatic" }, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  ({ EventRow } = await vite.ssrLoadModule("/src/components/EventRow.tsx"));
  ({ DEFAULT_EVENT_DISPLAY_PREFERENCES: preferences } = await vite.ssrLoadModule("/src/eventDisplaySettings.ts"));
});
after(async () => { await vite?.close(); });
const layouts = [{ liveLayout: true }, { reviewLayout: true }, {}];
const render = (ev, layout = layouts[0], overrides = {}) => renderToStaticMarkup(React.createElement(EventRow, {
  ev, showTime: false, ...layout, displayPreferences: { ...preferences, ...overrides },
}));
const text = (html) => html.replace(/<[^>]*>/g, "");

test("固定27个可显示持久化代码及独立的行、统计、更新类别", () => {
  const visibleCodes = [...Array.from({ length: 26 }, (_, i) => i), 27];
  assert.deepEqual(EVENT_CODES.map((name) => MsgType[name]), visibleCodes);
  assert.deepEqual(nativeEventSamples.slice(0, 27).map((sample) => sample.event.msgType), visibleCodes);
  assert.equal(new Set(nativeEventSamples.map((sample) => sample.event.id)).size, nativeEventSamples.length);
  for (const sample of nativeEventSamples) assert.equal(sample.source.kind, "synthetic");
  assert.deepEqual(nativeEventSamples.filter((sample) => sample.handling === "stats").map((sample) => sample.event.msgType), [12, 13, 14, 15]);
  assert.deepEqual(nativeEventSamples.filter((sample) => sample.handling === "update").map((sample) => sample.event.msgType), [17]);
});

test("固定样本经过真实档案消费边界保留分类、原始ID和payload", () => {
  for (const sample of nativeEventSamples) {
    const original = structuredClone(sample.event);
    const mutations = toArchiveMutations([sample.event]);
    if (sample.handling === "stats") { assert.deepEqual(mutations, []); continue; }
    if (sample.handling === "update") {
      assert.equal(mutations.length, 1);
      assert.equal(mutations[0].kind, "update");
      assert.deepEqual(mutations[0].targetEventKeys, ["6431492:archive-event:fixed-sc"]);
      assert.deepEqual(mutations[0].patch, { scDeleted: true });
      continue;
    }
    assert.equal(mutations.length, 1, sample.key);
    assert.equal(mutations[0].kind, "append");
    assert.equal(mutations[0].eventKey, `6431492:archive-event:${sample.event.dedupe ?? sample.event.id}`);
    const input = toArchiveEventInput(mutations[0], { sessionId: "fixed-session", roomId: sample.event.roomId, ordinal: 1, eventKey: mutations[0].eventKey });
    assert.equal(input.primaryCategory, sample.primaryCategory, sample.key);
    assert.equal(input.secondaryCategory, sample.secondaryCategory, sample.key);
    assert.deepEqual(input.payload, original);
    assert.deepEqual(sample.event, original);
  }
});

test("固定礼物价值、成本、盈亏与累计连击保持真实算法和行身份", () => {
  const gifts = ["normal-gift", "free-gift", "blind-gift", "pocket-gift"].map(getNativeEventSample);
  assert.deepEqual(gifts.map(getArchiveEventPaidAmount), [50, 0, 10, 0]);
  assert.deepEqual(summarizeGiftEvents(gifts, [0, 1, 2, 3]), { totalRmb: 55, blindProfitRmb: -5, blindCount: 1 });
  const first = getNativeEventSample("normal-gift");
  const keys = [getEventMarkKey(first), getEventBookmarkKey(first)];
  const rows = [first];
  assert.ok(mergeGiftInto(rows, structuredClone(comboUpdateSample))?.updated);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gift.count, 3);
  assert.equal(rows[0].gift.totalRmb, 150);
  assert.equal(rows[0].id, first.id);
  assert.equal(rows[0].dedupe, first.dedupe);
  assert.equal(rows[0].reactKey, first.reactKey);
  assert.deepEqual([getEventMarkKey(rows[0]), getEventBookmarkKey(rows[0])], keys);
  assert.equal(getArchiveEventPaidAmount(getNativeEventSample("sc")), 30);
  assert.equal(getArchiveEventPaidAmount(getNativeEventSample("guard-admiral")), 5994);
});

test("固定样本的现场投影不把统计和SC删除作为显示行", () => {
  const events = nativeEventSamples.map((sample) => sample.event);
  for (const pane of ["left", "right", "danmu", "interact", "gift", "superChat", "guard"]) {
    const visible = filterEventsForPane(events, pane, DEFAULT_EVENT_FILTERS);
    assert.ok(visible.every((ev) => ![12, 13, 14, 15, 17].includes(ev.msgType)), pane);
  }
});

test("所有有效固定行由真实EventRow在现场、回看、默认布局消费且不改事件", () => {
  for (const sample of nativeEventSamples.filter((sample) => sample.handling === "row")) {
    const original = structuredClone(sample.event);
    for (const layout of layouts) {
      assert.ok(render(sample.event, layout).length > 0, sample.key);
      assert.deepEqual(sample.event, original, sample.key);
    }
  }
});

test("真实组件保留回复目标、混排图片、大表情和横幅独立尺寸", () => {
  for (const layout of layouts) {
    assert.match(text(render(getNativeEventSample("reply"), layout)), /@目标用户.*这期神了/);
    assert.equal((text(render(getNativeEventSample("inline-reply"), layout)).match(/@目标用户/g) ?? []).length, 1);
    assert.match(text(render(getNativeEventSample("plain-at"), layout)), /@普通文本/);
    const mixed = render(getNativeEventSample("mixed-emote"), layout);
    assert.match(mixed, /文字.*<img.*结尾/);
    assert.ok(mixed.includes(`src="${getNativeEventSample("mixed-emote").emotes["[热]"].url}"`));
    assert.ok(render(getNativeEventSample("big-emote"), layout).includes(`src="${getNativeEventSample("big-emote").emoticon.url}"`));
    const banner = render(getNativeEventSample("banner-emote"), layout).match(/<img[^>]*class="emote banner-emote[^>]*>/)?.[0];
    assert.ok(banner, "横幅必须进入独立资源分支");
    assert.doesNotMatch(banner, /style=/, "横幅尺寸由独立CSS消费，不能以内联阻断级联");
  }
});

test("真实组件保留金额、特殊时长及陪伴天数", () => {
  for (const layout of layouts) {
    assert.match(text(render(getNativeEventSample("normal-gift"), layout)), /(?:¥50.*亲密之旅.*×1|亲密之旅.*×1.*¥50)/);
    assert.match(text(render(getNativeEventSample("free-gift"), layout)), /免费/);
    const blind = text(render(getNativeEventSample("blind-gift"), layout));
    assert.match(blind, /(?:¥5.*好运柚叶.*×2|好运柚叶.*×2.*¥5)/);
    assert.match(blind, /幸运盲盒.*¥10/);
    assert.match(blind, /▼-5/);
    assert.match(text(render(getNativeEventSample("guard-special"), layout)), /×5天/);
    assert.match(text(render(getNativeEventSample("guard-special"), layout)), /30\s*天/);
    assert.match(text(render(getNativeEventSample("guard-admiral"), layout)), /×3月/);
  }
});

test("SC撤回状态保留正文并独立显示状态标记", () => {
  const ev = getNativeEventSample("deleted-sc");
  assert.doesNotMatch(ev.sc.message, /已撤回/);
  for (const layout of layouts) {
    const deleted = render({ ...ev, scDeleted: true }, layout);
    const normal = render({ ...ev, scDeleted: false }, layout);
    assert.match(deleted, /<span\b[^>]*>已撤回<\/span>/);
    assert.equal((text(deleted).match(/已撤回/g) ?? []).length, 1);
    assert.match(deleted, /class="status deleted(?: [^"]*)?">已撤回<\/span>/);
    assert.match(text(deleted), /固定留言正文/);
    assert.match(text(normal), /固定留言正文/);
    assert.doesNotMatch(normal, /已撤回|class="status deleted"/);
  }
});

test("天选与红包开奖摘要显示已知总人数和奖品，不冒用单个中奖用户", () => {
  for (const [key, award, count] of [["lottery-result", "限定礼物", 3], ["pocket-result", "瓜子红包", 2]]) {
    const ev = getNativeEventSample(key);
    assert.equal(ev.lottery.winners.length, 2);
    assert.deepEqual(ev.lottery.winners.map(winner => winner.awardName), [award, award]);
    for (const layout of layouts) {
      const html = render(ev, layout), visible = text(html);
      assert.match(visible, new RegExp(`${count}\\s*人\\s*获得\\s*${award}`));
      assert.match(html, new RegExp(`class="winner-count">${count} 人</span>`));
      assert.doesNotMatch(text(html.split("<details")[0]), /中奖用户|另一位中奖者/);
      assert.match(html, /<details[^>]*class="winner-list/);
      assert.match(visible, /中奖用户.*另一位中奖者/);
    }
  }
});

test("固定身份在真实组件中遵循图标、文字、隐藏设置且内部等级不变", () => {
  for (const [key, name, resource] of [["guard", "舰长", "standard-captain"], ["guard-admiral", "提督", "admiral"], ["guard-governor", "总督", "governor"]]) {
    const sample = getNativeEventSample(key);
    const ev = { ...sample, msgType: MsgType.Danmu, text: "身份样本" };
    const original = structuredClone(ev);
    for (const layout of layouts.filter(value => !value.reviewLayout)) {
      const icon = render(ev, layout, { guardIdentityDisplayMode: "icon", showGuardIdentity: true });
      const badgeText = render(ev, layout, { guardIdentityDisplayMode: "text", showGuardIdentity: true });
      assert.match(icon, new RegExp(`<img\\b[^>]*src="/guard-identities/${resource}\\.png"[^>]*aria-label="大航海身份：${name}"`));
      assert.doesNotMatch(icon, new RegExp(`<span\\b[^>]*aria-label="大航海身份：${name}"`));
      assert.match(badgeText, new RegExp(`<span\\b[^>]*aria-label="大航海身份：${name}"[^>]*>${name}</span>`));
      assert.doesNotMatch(badgeText, /\/guard-identities\//);
      for (const guardIdentityDisplayMode of ["icon", "text"]) {
        const hidden = render(ev, layout, { guardIdentityDisplayMode, showGuardIdentity: false });
        assert.doesNotMatch(hidden, /aria-label="大航海身份：|\/guard-identities\//);
        assert.match(text(hidden), /身份样本/);
      }
    }
    assert.deepEqual(ev, original);
  }
});

test("固定组合身份的排名、荣耀和粉丝牌遵循真实显示设置", () => {
  const ev = getNativeEventSample("identity");
  for (const layout of layouts.filter(value => !value.reviewLayout)) {
    const shown = render(ev, layout, { showCurrentRank: true, showHonorLevel: true, honorLevelDisplayMode: "icon" });
    assert.match(shown, /<span\b[^>]*aria-label="榜单排名：第1名"[^>]*>榜1<\/span>/);
    assert.match(shown, /<span\b[^>]*>固定用户<\/span>/);
    assert.ok(shown.indexOf("榜1") < shown.indexOf("固定用户"));
    assert.match(shown, /\/wealth-levels\/57\.png/);
    assert.match(shown, /aria-label="主播"/);
    assert.match(shown, /aria-label="房管"/);
    assert.match(text(shown), /样例牌/);
    const hidden = render(ev, layout, { showCurrentRank: false, showHonorLevel: false, showGuardIdentity: false });
    assert.doesNotMatch(hidden, /榜1|\/wealth-levels\/57\.png|\/guard-identities\//);
  }
});

test("浏览器样本入口由Vite转换并直接导入真实EventRow与固定样本", async () => {
  const result = await vite.transformRequest("/tests/fixtures/nativeEventStyle.tsx");
  assert.ok(result?.code);
  assert.match(result.code, /src\/components\/EventRow/);
  assert.match(result.code, /nativeEventSamples/);
  const { Task3MediaFixture } = await vite.ssrLoadModule("/tests/fixtures/nativeEventStyle.tsx");
  const html = renderToStaticMarkup(React.createElement(Task3MediaFixture));
  for (const layout of ["live", "review", "default"]) assert.ok(html.includes(`data-task3-layout="${layout}"`));
  assert.match(html, /data-task3-sample="guard-unit-only"/);
  assert.match(html, /头像失败/);
  assert.match(html, /礼物全部失败/);
  assert.doesNotMatch(html, /src="https?:/);
});
