import test from "node:test";
import assert from "node:assert/strict";

test("现场定位在追加事件和行高重测后仍对准目标，稳定后才完成", async () => {
  const location = await import("../src/events/liveEventLocation.ts");
  assert.equal(typeof location.locateLiveEvent, "function");
  let rows = ["a", "target", "b"];
  let offset = 0;
  let height = 60;
  let completed = false;
  const frames = new Map();
  let serial = 0;
  const cancel = location.locateLiveEvent({
    getIndex: () => rows.indexOf("target"),
    scrollToIndex: (index) => { offset = index * height; },
    getPosition: () => ({ target: rows.indexOf("target") * height, current: offset }),
    scrollToOffset: (value) => { offset = value; },
    requestFrame: (fn) => { frames.set(++serial, fn); return serial; },
    cancelFrame: (id) => frames.delete(id),
    onLocated: () => { completed = true; },
  });
  const tick = () => { const work = [...frames.values()]; frames.clear(); work.forEach((fn) => fn()); };
  tick();
  rows = ["new", ...rows];
  height = 100;
  tick();
  assert.equal(completed, false);
  for (let n = 0; n < 4; n++) tick();
  assert.equal(offset, 200);
  assert.equal(completed, true);
  cancel();
  assert.equal(frames.size, 0);
});

test("目标被移除或取消定位时，不确认成功且停止调度", async () => {
  const { locateLiveEvent } = await import("../src/events/liveEventLocation.ts");
  let frame;
  let missing = 0;
  let located = 0;
  const options = {
    getIndex: () => -1,
    scrollToIndex: () => assert.fail("目标不存在时不能跳转"),
    getPosition: () => null,
    scrollToOffset: () => assert.fail("目标不存在时不能校正"),
    requestFrame: (callback) => { frame = callback; return 1; },
    cancelFrame: () => { frame = undefined; },
    onLocated: () => { located += 1; },
    onMissing: () => { missing += 1; },
  };
  locateLiveEvent(options);
  const tick = frame;
  frame = undefined;
  tick();
  assert.equal(missing, 1);
  assert.equal(located, 0);
  assert.equal(frame, undefined);
  const cancel = locateLiveEvent(options);
  cancel();
  assert.equal(frame, undefined);
});
