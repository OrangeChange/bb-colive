import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);
function read(relativePath) {
  try {
    return readUiSource(new URL(relativePath, root), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

test("导出对话框提供三种格式和CSV分类选择", () => {
  const dialog = read("src/components/ReviewDataExportDialog.tsx");
  assert.match(dialog, /Excel/);
  assert.match(dialog, /CSV/);
  assert.match(dialog, /JSON/);
  assert.match(dialog, /JSON 适合交给 AI 或其他程序分析/);
  assert.doesNotMatch(dialog, /AI JSON/);
  assert.doesNotMatch(dialog, /里程碑/);
  assert.match(dialog, /danmaku/);
  assert.match(dialog, /interaction/);
  assert.match(dialog, /gift/);
  assert.match(dialog, /superchat/);
  assert.match(dialog, /guard/);
  assert.match(dialog, /selectedCategoryList\.length === 1/);
  assert.match(dialog, /extension = "csv"/);
  assert.match(dialog, /zipArchiveDataCsv/);
  assert.match(dialog, /extension = "zip"/);
  assert.match(dialog, /disabled=\{busy/);
  assert.match(dialog, /await save/);
  assert.match(dialog, /useState<ArchiveSortDirection>\("asc"\)/);
  assert.match(dialog, /\["asc", "desc"\]/);
  assert.match(dialog, /value === "asc" \? ["']顺序排列["'] : ["']倒序排列["']/);
  assert.match(dialog, /safeFilePart/);
  assert.match(dialog, /scopeFilePart/);
  assert.match(dialog, /exportFilePart/);
  assert.match(dialog, /String\(date\.getFullYear\(\)\)\.slice\(-2\)/);
  assert.match(dialog, /stableSessionName/);
  assert.match(dialog, /已选\$\{scope\.sessionIds\.length\}场/);
  assert.match(dialog, /categoryName/);
  assert.doesNotMatch(dialog, /danmu-data-/);
});

test("回看入口提供导出数据按钮并使用二进制写入命令", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  const dialog = read("src/components/ReviewDataExportDialog.tsx");
  assert.match(panel, /ReviewDataExportDialog/);
  assert.match(panel, /导出数据/);
  assert.match(dialog, /write_archive_export_bytes/);
  assert.match(dialog, /collectArchiveDataExportSnapshot/);
  assert.match(panel, /id: "owner-all"/);
  assert.match(panel, /id: "selected-sessions"/);
  assert.match(panel, /id: "owner-event-results"/);
  assert.match(panel, /id: hasConditions \? "session-filtered" : "session-current"/);
  assert.match(panel, /onExportSelected=\{\(\) => openDataExport\("selected-sessions"\)\}/);
});

test("导出 summary 使用注入了主播名称的场次快照", () => {
  const dialog = read("src/components/ReviewDataExportDialog.tsx");
  assert.match(dialog, /const exportSessions = snapshot\.sessions\.map\(/);
  assert.match(dialog, /buildArchiveDataBundle\(\{ \.\.\.snapshot, sessions: exportSessions \}/);
});
