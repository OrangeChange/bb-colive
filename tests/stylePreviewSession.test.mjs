import test from "node:test";
import assert from "node:assert/strict";
test("当前预览接续最新状态，旧编辑器不能覆盖或清除新预览", async () => {
  const { createStylePreviewSession } =
    await import("../src/preview/stylePreviewSession.ts");
  const session = createStylePreviewSession();
  const updates = [];
  session.subscribePreview((value) => updates.push(value));
  assert.equal(session.getPreview(), null);
  session.activatePreview("a");
  session.publishPreview("a", {
    kind: "native",
    frame: { events: [{ id: "a" }] },
  });
  assert.equal(session.getPreview().frame.events[0].id, "a");
  session.activatePreview("b");
  session.publishPreview("b", {
    kind: "compatible",
    frame: { events: [{ id: "b" }] },
  });
  session.publishPreview("a", { kind: "native" });
  session.clearPreview("a");
  assert.equal(session.getPreview().kind, "compatible");
  session.clearPreview("b");
  assert.equal(session.getPreview(), null);
  assert.equal(updates.at(-1), null);
});

test("当前预览进入加载空态后清空显示，归属不变且可继续发布", async () => {
  const { createStylePreviewSession } =
    await import("../src/preview/stylePreviewSession.ts");
  const s = createStylePreviewSession();
  s.activatePreview("a");
  s.publishPreview("a", { kind: "native", frame: {} });
  s.publishPreview("a", null);
  assert.equal(s.getPreview(), null);
  s.publishPreview("a", { kind: "obs", frame: {} });
  assert.equal(s.getPreview().kind, "obs");
});
