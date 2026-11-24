import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("礼物特效叠加层使用独立队列并支持开关与房间切换清理", async () => {
  const source = await readFile(new URL("../src/components/GiftEffectOverlay.tsx", import.meta.url), "utf8");
  assert.match(source, /createGiftEffectQueue/);
  assert.match(source, /createGiftEffectPlayer/);
  assert.match(source, /enabled/);
  assert.match(source, /clearPending/);
  assert.match(source, /roomKey/);
  assert.match(source, /pointer-events-none/);
});

test("查询代际变化会清空 current 与 pending，现场路径仍不带查询重置", async () => {
  const overlay = await readFile(new URL("../src/components/GiftEffectOverlay.tsx", import.meta.url), "utf8");
  const timeline = await readFile(new URL("../src/components/ReviewSessionTimeline.tsx", import.meta.url), "utf8");
  const eventPane = await readFile(new URL("../src/components/EventPane.tsx", import.meta.url), "utf8");
  const floatingWindow = await readFile(new URL("../src/windows/FloatingEventWindow.tsx", import.meta.url), "utf8");

  assert.match(overlay, /resetKey\?: string \| number \| null/);
  assert.match(overlay, /const resetKeyRef = useRef\(resetKey\)/);
  assert.match(
    overlay,
    /if \(resetKeyRef\.current !== resetKey \|\| roomKeyRef\.current !== roomKey\) \{[\s\S]*?queueRef\.current\?\.cancelAll\(\);[\s\S]*?playerRef\.current\?\.destroy\(\);[\s\S]*?return;\r?\n\s*\}/,
  );
  assert.match(timeline, /<GiftEffectOverlay enabled notices=\{giftEffectNotices\} resetKey=\{queryKey\} roomKey=\{sessionId\} \/>/);
  for (const liveSource of [eventPane, floatingWindow]) {
    assert.doesNotMatch(liveSource, /<GiftEffectOverlay[\s\S]*resetKey=/);
  }
});
