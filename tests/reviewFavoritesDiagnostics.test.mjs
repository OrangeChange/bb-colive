import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = readFileSync(fileURLToPath(new URL("../src/components/ReviewFavoritesPanel.tsx", import.meta.url)), "utf8");

test("收藏主界面的查询、整理和导出进入统一诊断链路", () => {
  assert.match(source, /createArchiveRequestId/);
  assert.match(source, /recordArchiveDiagnostic/);
  assert.match(source, /archive-query/);
  assert.match(source, /archive-favorite/);
  assert.match(source, /archive-export/);
  assert.match(source, /stage:|\("request"/);
  assert.match(source, /\("cancel"/);
  assert.match(source, /\("failure"/);
});
