import test from "node:test";
import assert from "node:assert/strict";

function createStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, String(value)); },
  };
}

test("场次提示关闭状态按 sessionId 隔离，并可重复读取", async () => {
  const { dismissArchiveNotice, loadDismissedArchiveNotices } = await import("../src/archive/archiveNoticeState.ts");
  const storage = createStorage();

  assert.deepEqual(loadDismissedArchiveNotices("session-a", storage), []);
  dismissArchiveNotice("session-a", "quality", storage);
  assert.deepEqual(loadDismissedArchiveNotices("session-a", storage), ["quality"]);
  assert.deepEqual(loadDismissedArchiveNotices("session-b", storage), []);

  dismissArchiveNotice("session-a", "metadata", storage);
  dismissArchiveNotice("session-a", "quality", storage);
  assert.deepEqual(loadDismissedArchiveNotices("session-a", storage), ["quality", "metadata"]);
});
