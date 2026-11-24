import test from "node:test";
import assert from "node:assert/strict";
test("新观察者只读取当前暂停帧，不启动播放或改变事件身份", async () => {
  const { createStylePreviewSession } =
    await import("../src/preview/stylePreviewSession.ts");
  const s = createStylePreviewSession();
  s.activatePreview("editor");
  const frame = { events: [{ id: "20" }], playing: false, cursor: 20 };
  s.publishPreview("editor", { kind: "native", frame });
  const a = s.getPreview(),
    b = s.getPreview();
  assert.deepEqual(a.frame, b.frame);
  assert.equal(b.frame.cursor, 20);
  assert.equal(b.frame.playing, false);
  s.publishPreview("editor", {
    kind: "native",
    frame: { events: [], playing: true, cursor: 0, restart: 1 },
  });
  assert.equal(s.getPreview().frame.cursor, 0);
});
