import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");
const eventRow = read("src/components/EventRow.tsx");
const eventList = read("src/components/EventList.tsx");
const app = readApplicationSources();
const floating = read("src/windows/FloatingEventWindow.tsx");
const overlay = read("src/components/GiftEffectOverlay.tsx");
const channels = read("src/windows/eventWindowChannels.ts");

test("有可播放资源的礼物图标提供手动特效入口", () => {
  assert.match(eventRow, /giftEffectResolver/);
  assert.match(eventRow, /onPlayGiftEffect/);
  assert.match(eventRow, /event-gift-effect-trigger/);
  assert.match(eventRow, /aria-label=\{`播放\$\{gift\?\.name/);
});

test("手动特效回调从事件列表传到礼物事件行", () => {
  assert.match(eventList, /onPlayGiftEffect/);
  assert.match(eventList, /giftEffectResolver/);
  assert.match(eventList, /<EventRow[\s\S]*onPlayGiftEffect=\{onPlayGiftEffect\}/);
});

test("主窗口手动播放同时进入本地播放器和礼物窗", () => {
  assert.match(app, /GIFT_EFFECT_MANUAL_EVENT/);
  assert.match(app, /manual:\s*true/);
  assert.match(app, /publishGiftEffectEvent\(notice\)/);
  assert.match(app, /listen<GiftEffectNotice>\(GIFT_EFFECT_MANUAL_EVENT/);
});

test("礼物窗手动播放同步回主窗口，并用资源索引响应图标点击", () => {
  assert.match(floating, /giftEffectResourcesRef/);
  assert.match(floating, /emitTo\("main", GIFT_EFFECT_MANUAL_EVENT/);
  const expression = floating.match(/\bconst\s+hasGiftEffects\s*=\s*([^;]+);/)?.[1];
  assert.ok(expression, "窗口需要声明礼物特效范围");
  const hasGiftEffects = new Function("kind", `return (${expression});`);
  for (const [kind, expected] of [['gift', true], ['gift-only', true], ['display', false], ['superchat', false], ['guard', true]]) {
    assert.equal(hasGiftEffects(kind), expected, `${kind}的礼物特效范围`);
  }
  assert.match(floating, /onPlayGiftEffect=\{hasGiftEffects\s*\?\s*onPlayGiftEffect\s*:\s*undefined\}/);
  assert.match(floating, /giftEffectResolver=\{hasGiftEffects\s*\?\s*resolveGiftEffect\s*:\s*undefined\}/);
});

test("手动特效请求不受自动特效开关限制", () => {
  assert.match(channels, /GIFT_EFFECT_MANUAL_EVENT/);
  assert.match(overlay, /\(\(notice\.event\.guard \|\| notice\.event\.honor\) \? guardEnabled : enabled\) \|\| notice\.manual/);
});

test("特效叠加层不拦截鼠标，礼物图标保留手动播放入口", () => {
  assert.match(floating, /kind === ["\x27]gift["\x27]/);
  assert.match(overlay, /pointer-events-none/);
  assert.match(eventRow, /event-gift-effect-trigger[\s\S]*pointer-events-auto/);
});
