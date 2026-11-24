import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (path) => readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

test("主窗口现场事件开启 B 站视频号链接，副窗口保持原样", () => {
  const app = readApplicationSources();
  const partition = read("src/components/PartitionColumn.tsx");
  const pane = read("src/components/EventPane.tsx");
  const list = read("src/components/EventList.tsx");
  const row = read("src/components/EventRow.tsx");
  const video = read("src/components/BilibiliVideoText.tsx");

  assert.match(app, /enableBilibiliVideoLinks/);
  assert.match(partition, /enableBilibiliVideoLinks/);
  assert.match(pane, /enableBilibiliVideoLinks/);
  assert.match(list, /enableBilibiliVideoLinks/);
  assert.match(row, /BilibiliVideoText/);
  assert.match(row, /enableBilibiliVideoLinks/);
  assert.match(video, /openUrl/);
  assert.match(video, /preventDefault/);
});
