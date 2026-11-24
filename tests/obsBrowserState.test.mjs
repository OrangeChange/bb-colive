import test from "node:test";
import assert from "node:assert/strict";
let createObsMessageGate, obsSamplePreferences;
try {
  ({ createObsMessageGate, obsSamplePreferences } =
    await import("../src/obs/obsBrowserState.ts"));
} catch (e) {
  if (e.code !== "ERR_MODULE_NOT_FOUND") throw e;
}
test("同一连接拒绝旧序号，重连后的完整快照重建序号基准", () => {
  assert.equal(typeof createObsMessageGate, "function");
  const gate = createObsMessageGate();
  assert.equal(gate.accept("same", 30), true);
  assert.equal(gate.accept("same", 2), false);
  gate.reset();
  assert.equal(gate.accept("same", 1), true);
});
test("静态样例不被正式到期设置裁空，也不改变原设置", () => {
  assert.equal(typeof obsSamplePreferences, "function");
  const original = { eventExpiry: { enabled: true, seconds: 3 } };
  const sample = obsSamplePreferences(original);
  assert.equal(sample.eventExpiry.enabled, false);
  assert.equal(original.eventExpiry.enabled, true);
});
