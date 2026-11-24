import test from "node:test";
import assert from "node:assert/strict";
test("到期事件仅保留退出动画时长，更新不延长截止时间", async () => {
  const { reconcileEventRemovalTransitions } = await import("../src/events/eventRemovalTransition.ts");
  const a = { id: "a", receivedAt: 1000 };
  const result = reconcileEventRemovalTransitions([{ event: a }], [], 2000, 300, () => true);
  assert.equal(result[0].removeAt, 2300);
  assert.equal(reconcileEventRemovalTransitions(result, [], 2200, 300, () => true)[0].removeAt, 2300);
  assert.deepEqual(reconcileEventRemovalTransitions(result, [], 2300, 300, () => true), []);
});
test("删除立即生效，已有行更新不重新入场，零时长不保留", async () => {
  const { reconcileEventRemovalTransitions: reconcile } = await import("../src/events/eventRemovalTransition.ts");
  const a = { id: "a" };
  assert.deepEqual(reconcile([{ event: a }], [], 0, 200, () => false), []);
  assert.deepEqual(reconcile([{ event: a }], [], 0, 0, () => true), []);
  const updated = { id: "a", text: "updated" };
  assert.equal(reconcile([{ event: a, removeAt: 200 }], [updated], 0, 200, () => true)[0].event, updated);
});
