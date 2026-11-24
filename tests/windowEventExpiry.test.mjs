import test from "node:test";
import assert from "node:assert/strict";

test("副窗口事件定时消失默认关闭且默认十秒", async () => {
  const expiry = await import("../src/windows/windowEventExpiry.ts").catch(() => null);
  assert.ok(expiry, "副窗口事件定时消失模块应存在");
  assert.deepEqual(expiry.DEFAULT_EVENT_EXPIRY, { enabled: false, seconds: 10 });
  assert.deepEqual(expiry.normalizeEventExpiry({ enabled: true, seconds: 25 }), { enabled: true, seconds: 25 });
  assert.deepEqual(expiry.normalizeEventExpiry({ enabled: "yes", seconds: -2 }), { enabled: false, seconds: 1 });
});

test("定时消失从事件进入副窗口缓存时刻开始计算", async () => {
  const expiry = await import("../src/windows/windowEventExpiry.ts").catch(() => null);
  assert.ok(expiry, "副窗口事件定时消失模块应存在");
  const settings = { enabled: true, seconds: 10 };
  assert.equal(expiry.isEventExpired(1_000, 10_999, settings), false);
  assert.equal(expiry.isEventExpired(1_000, 11_000, settings), true);
  assert.equal(expiry.isEventExpired(1_000, 99_000, { enabled: false, seconds: 10 }), false);
  assert.deepEqual(
    expiry.pruneExpiredEvents([
      { event: "old", receivedAt: 1_000 },
      { event: "new", receivedAt: 5_000 },
    ], 11_000, settings),
    [{ event: "new", receivedAt: 5_000 }],
  );
});
