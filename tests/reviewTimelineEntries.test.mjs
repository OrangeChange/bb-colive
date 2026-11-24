import test from "node:test";
import assert from "node:assert/strict";
import { createReviewTimelineEntries } from "../src/archive/reviewTimelineEntries.ts";

const row = (eventKey, sessionId) => ({ eventKey, sessionId, record: { sessionTitle: sessionId, sessionStartedAt: 1, sessionQuality: "complete" } });

test("单场列表保持投影顺序，不插入场次标题", () => {
  const rows = [row("new", "a"), row("old", "a")];
  assert.deepEqual(createReviewTimelineEntries(rows, false, new Set()).map((entry) => entry.key), ["new", "old"]);
});

test("主播历史保留分组与数量，折叠仅隐藏对应场次事件", () => {
  const rows = [row("a1", "a"), row("a2", "a"), row("b1", "b")];
  const entries = createReviewTimelineEntries(rows, true, new Set(["a"]));
  assert.deepEqual(entries.map((entry) => entry.key), ["session-boundary:a1", "session-boundary:b1", "b1"]);
  assert.equal(entries[0].hitCount, 2);
  assert.equal(entries[1].hitCount, 1);
  assert.equal(entries[0].quality, "complete");
});
