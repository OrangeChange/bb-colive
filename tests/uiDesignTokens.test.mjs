import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readFileSync(`${root}/${relativePath}`, "utf8");

test("界面字号角色集中定义并禁止9px文字", () => {
  const css = read("src/App.css");
  for (const role of ["display", "page-title", "section-title", "event", "control", "meta", "overview-value", "micro"]) {
    assert.match(css, new RegExp(`\\.ui-type-${role}\\b`));
  }

  const componentSources = [
    read("src/components/Sidebar.tsx"),
    read("src/components/EventRow.tsx"),
    read("src/components/RoomInsightsView.tsx"),
    read("src/components/RoomRankings.tsx"),
    read("src/components/SystemReminderBell.tsx"),
    read("src/components/TitleBar.tsx"),
    read("src/components/StatusBar.tsx"),
  ];
  for (const source of componentSources) assert.doesNotMatch(source, /text-\[9px\]/);
});

test("现场工具栏的筛选按钮和输入控件统一为32px", () => {
  const source = read("src/components/LiveFilterBar.tsx");
  assert.match(source, /filterButtonBase\s*=\s*["'][^"']*h-8/);
  assert.match(source, /<UiSearchInput\b[^>]*aria-label="搜索现场事件内容"/);
  assert.match(read("src/components/ui/SearchInput.tsx"), /ui-search-field[^`]*\bh-8\b/);
  assert.match(source, /GiftThresholdInput/);
});
