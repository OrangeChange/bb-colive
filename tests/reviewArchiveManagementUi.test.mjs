import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) => readUiSource(`${root}/${path}`, "utf8");

test("回看档案管理提供文件导入导出、删除预览和确认入口", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /@tauri-apps\/plugin-dialog/);
  assert.match(source, /\bopen\(/);
  assert.match(source, /\bsave\(/);
  assert.match(source, /previewImportArchive/);
  assert.match(source, /commitImportArchive/);
  assert.match(source, /previewDelete/);
  assert.match(source, /deleteArchive/);
  assert.match(source, /eventCount/);
  assert.match(source, /favoriteCount/);
  assert.match(source, /ownerCount/);
  assert.match(source, /resourceReferenceCount/);
  assert.match(source, /资源地址/);
  assert.match(source, /记录中或重连中的场次/);
});

test("主播档案管理支持导出指定场次", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /导出本场档案/);
  assert.match(source, /kind:\s*["']session["']/);
  assert.match(source, /selectedSessionId/);
});

test("主播档案管理支持显式删除该主播全部档案并设置单独保留策略", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /ownerAll:\s*true/);
  assert.match(source, /删除该主播全部档案/);
  assert.match(source, /review-owner-retention-policy/);
  assert.match(source, /跟随全局设置/);
});

test("删除预览后的最终删除必须通过应用内二次确认弹窗", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /ConfirmDialog/);
  assert.match(source, /deleteConfirmOpen/);
  assert.match(source, /确认删除档案/);
  assert.match(source, /删除后无法恢复/);
  assert.doesNotMatch(source, /onClick=\{confirmDelete\}/);
});

test("管理 UI 通过 Tauri 文件能力传输 JSON，不把 markers 交给档案导入", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /read_archive_transfer/);
  assert.match(source, /write_archive_transfer/);
  assert.match(source, /exportArchiveText/);
  assert.doesNotMatch(source, /Array\.from\(bytes\)/);
  assert.doesNotMatch(source, /markers/);
  assert.doesNotMatch(source, /resourcePolicy（|资源 URL manifest/);
  assert.match(source, /recordArchiveDiagnostic/);
  assert.match(source, /pathProvided/);
  assert.match(source, /phase/);
  assert.match(source, /stage.*cancel|"cancel"/);
});

test("管理 UI 的导出命令直接接收文本，不复制整份字节数组", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /contents:\s*content/);
  assert.doesNotMatch(source, /const bytes\s*=\s*await service\.exportArchive/);
});

test("管理面板共享 transfer requestId，并在关闭或取消预览时记录 cancel", () => {
  const source = read("src/components/ReviewArchiveManagement.tsx");
  assert.match(source, /createArchiveRequestId/);
  assert.match(source, /requestId/);
  assert.match(source, /cancelImportPreview/);
  assert.match(source, /cancelDeletePreview/);
  assert.match(source, />取消<|取消预览/);
  assert.match(source, /recordArchiveDiagnostic\("cancel",\s*"archive-import"/);
  assert.match(source, /recordArchiveDiagnostic\("cancel",\s*"archive-delete"/);
});

test("ReviewPanel 将 owner 层更多入口接到管理组件", () => {
  const panel = read("src/components/ReviewPanel.tsx");
  assert.match(panel, /ReviewArchiveManagement/);
  assert.match(panel, /管理档案/);
  assert.match(panel, /showManagement/);
  assert.match(panel, /ownerId/);
});
