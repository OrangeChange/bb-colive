import { readUiSource } from "./helpers/readUiSource.mjs";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => readUiSource(new URL(`../${path}`, import.meta.url), "utf8");

test("主视图包含独立的个性播报入口", () => {
  const source = read("src/components/mainView.ts");
  assert.match(source, /personal/);
});

test("侧栏提供个性播报一级入口", () => {
  const source = read("src/components/Sidebar.tsx");
  assert.match(source, /mainView="personal"/);
  assert.match(source, /onSelectMainView\?\.\(mainView\)/);
  assert.match(source, /个性播报/);
});

test("个性播报一级入口复用语音相同的悬停快捷开关契约", () => {
  const source = read("src/components/Sidebar.tsx");
  assert.match(source, /SidebarQuickToggle/);
  assert.match(source, /mainView="personal"/);
  assert.match(source, /toggleLabel=\{personalBroadcastEnabled \? ["']关闭个性播报["'] : ["']开启个性播报["']\}/);
  assert.match(source, /sidebar-feature-controls/);
  assert.match(source, /sidebar-feature-toggle/);
});

test("App 持久挂载个性播报面板", () => {
  const source = readApplicationSources();
  assert.match(source, /PersonalBroadcastPanel/);
  assert.match(source, /hidden=\{mainView !== "personal"\}/);
});

test("个性播报面板拥有自己的标题和总开关", () => {
  const source = read("src/components/PersonalBroadcastPanel.tsx");
  assert.match(source, /个性播报/);
  assert.match(source, /开启个性播报/);
  assert.match(source, /选择文件/);
  assert.match(source, /试听/);
  assert.match(source, /直播间警告/);
  assert.match(source, /直播切断与封禁/);
});

test("个性播报面板共用播报状态和队列控制", () => {
  const source = read("src/components/PersonalBroadcastPanel.tsx");
  const voiceController = read("src/voice/voiceController.ts");
  const summary = read("src/components/RuntimeQueueSummary.tsx");
  for (const label of ["播报状态", "继续", "暂停", "跳过当前", "清空队列"]) {
    assert.match(source, new RegExp(label));
  }
  for (const label of ["当前", "待播", "已丢弃", "失败"]) assert.match(summary, new RegExp(label));
  assert.match(source, /RuntimeQueueSummary/);
  for (const action of ["personalBroadcastController.pause", "personalBroadcastController.resume", "personalBroadcastController.skip", "personalBroadcastController.clear"]) {
    assert.match(source, new RegExp(action.replaceAll(".", "\\.")));
  }
  assert.match(source, /personalSnapshot\.pendingCount/);
  assert.match(source, /personalSnapshot\.discardedCount/);
  assert.match(source, /personalSnapshot\.failedCount/);
  assert.match(source, /getPersonalBroadcastPendingCount/);
  assert.match(source, /pendingCount=\{pendingCount\}/);
  assert.match(voiceController, /pending: \[\.\.\.queue\.pending\]/);
});
