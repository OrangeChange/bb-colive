import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const adapterSource = readFileSync(
  fileURLToPath(new URL("../src/protocol/adapter.ts", import.meta.url)),
  "utf8",
);

test("匹配当前房间的内容审核报告进入中性系统事件", () => {
  assert.match(adapterSource, /case ['"]ROOM_CONTENT_AUDIT_REPORT['"]/);
  assert.match(adapterSource, /room_id/);
  assert.match(adapterSource, /MsgType\.CoverAudit/);
  assert.match(adapterSource, /直播间内容审核状态发生变化/);
});

test("其他房间的内容审核报告不进入当前连接事件流", () => {
  assert.match(adapterSource, /ctx\.roomId/);
  assert.match(adapterSource, /room_id.*ctx\.roomId|ctx\.roomId.*room_id/s);
  assert.match(adapterSource, /ROOM_CONTENT_AUDIT_REPORT[\s\S]*return null/);
});
