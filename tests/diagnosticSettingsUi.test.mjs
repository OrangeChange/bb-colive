import { readUiSource } from "./helpers/readUiSource.mjs";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (path) => readUiSource(`${root}/${path}`, "utf8");

test("其他设置包含诊断与日志操作", () => {
  const source = read("src/components/SettingsPanel.tsx");
  assert.match(source, /<DiagnosticSettings/);
  const diagnosticSource = read("src/components/DiagnosticSettings.tsx");
  for (const label of ["诊断与日志", "标记问题", "生成24小时诊断包", "生成完整日志包", "打开日志目录"]) {
    assert.match(diagnosticSource, new RegExp(label));
  }
});

test("诊断设置说明两种导出边界并包含原文资料提示", () => {
  const source = read("src/components/DiagnosticSettings.tsx");
  assert.match(source, /弹幕原文和用户资料/);
  assert.match(source, /24h/);
  assert.match(source, /full/);
  assert.match(source, /前2分钟.*后3分钟/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /resize-none|resize:\s*none/);
});

test("诊断页的普通用途说明收敛到标题提示，状态和异常仍然可见", () => {
  const source = read("src/components/DiagnosticSettings.tsx");
  assert.doesNotMatch(source, /用于定位直播连接、事件处理、语音合成和播报问题。日志仅保存在本机。<\/p>/);
  assert.match(source, /settings-subsection-title[^>]*title=["']用于定位直播连接、事件处理、语音合成和播报问题。日志仅保存在本机。["']/);
  assert.doesNotMatch(source, /24小时诊断包只包含最近24小时的标准诊断资料；完整日志包包含本机保留的全部日志，生成前会确认数据范围。<\/p>/);
  assert.match(source, /diagnostic-export-actions[^>]*title=["']24小时诊断包只包含最近24小时的标准诊断资料；完整日志包包含本机保留的全部日志，生成前会确认数据范围。["']/);
});

test("成功诊断操作提示会自动消失并清理定时器", () => {
  const source = read("src/components/DiagnosticSettings.tsx");
  assert.match(source, /notice\.tone\s*!==\s*[\"']success[\"']/);
  assert.match(source, /setTimeout\([\s\S]*?setNotice\(null\)/);
  assert.match(source, /clearTimeout\(/);
});

test("诊断桥接调用正确的 Tauri 命令并先刷盘", () => {
  const source = read("src/diagnostics/diagnosticBridge.ts");
  assert.match(source, /get_diagnostic_status/);
  assert.match(source, /export_diagnostic_bundle/);
  assert.match(source, /outputPath/);
  assert.match(source, /flush/);
  assert.ok(source.indexOf("flush") < source.indexOf("export_diagnostic_bundle"));
});

test("导出后会明确提示功能快照缺失项，而不是把导出默认为完整", () => {
  const source = read("src/components/DiagnosticSettings.tsx");
  assert.match(source, /missingSnapshots/);
  assert.match(source, /快照缺失/);
  assert.match(source, /flushDegraded/);
  assert.match(source, /分析结果可能不完整/);
});

test("诊断设置不把恢复默认和日志清理绑定", () => {
  const source = read("src/components/SettingsPanel.tsx");
  const otherStart = source.indexOf('data-settings-section="other"');
  assert.ok(otherStart >= 0);
  const otherSection = source.slice(otherStart);
  assert.match(otherSection, /<DiagnosticSettings/);
  assert.doesNotMatch(otherSection, /reset.*diagnostic|cleanup_diagnostic_logs/iu);
});

test("托盘问题标记会复用原有输入对话框", () => {
  const navigation = read("src/components/settingsNavigation.ts");
  const panel = read("src/components/SettingsPanel.tsx");
  const diagnostic = read("src/components/DiagnosticSettings.tsx");
  assert.match(navigation, /SettingsAnchorId = "display" \| "gift" \| "cloud-recovery" \| "diagnostics"/);
  assert.match(panel, /anchorRefs\.current\.set\("diagnostics"/);
  assert.match(panel, /openMarkRequest=/);
  assert.match(diagnostic, /openMarkRequest/);
  assert.match(diagnostic, /setMarkOpen\(true\)/);
});

test("问题标记备注示例使用常见的播报异常场景", () => {
  const source = read("src/components/DiagnosticSettings.tsx");
  assert.match(source, /例如：礼物已显示，但语音或个性播报没有触发/);
});

test("诊断导出状态会传递到应用关闭流程", () => {
  const diagnostic = read("src/components/DiagnosticSettings.tsx");
  const settings = read("src/components/SettingsPanel.tsx");
  const workbench = read("src/components/RightWorkbench.tsx");
  const app = readApplicationSources();
  assert.match(diagnostic, /onExportStateChange/);
  assert.match(diagnostic, /onExportStateChange\(true\)/);
  assert.match(diagnostic, /onExportStateChange\(false\)/);
  assert.match(settings, /onDiagnosticExportStateChange/);
  assert.match(workbench, /onDiagnosticExportStateChange/);
  assert.match(app, /diagnosticExportCompletionRef/);
  assert.match(app, /await diagnosticExportCompletionRef\.current/);
});


test("日志容量、队列积压和实际丢失使用不同提示与颜色", async () => {
  const {createServer}=await import("vite");
  const {createElement}=await import("react");
  const {renderToStaticMarkup}=await import("react-dom/server");
  const server=await createServer({configFile:false,esbuild:{jsx:"automatic"},optimizeDeps:{include:[],noDiscovery:true},server:{middlewareMode:true,watch:null},appType:"custom"});
  try {
    const {DiagnosticSettings}=await server.ssrLoadModule("/src/components/DiagnosticSettings.tsx");
    const base={status:"healthy",totalBytes:0,normalBytes:0,detailedBytes:0,writeFailures:0,discarded:0,truncated:0,pending:0,droppedRecords:0};
    const cases=[
      [{status:"full",detailedBytes:513*1024*1024},"日志已达保留上限","warning"],
      [{status:"full",detailedBytes:513*1024*1024,pending:1},"日志已达保留上限","warning"],
      [{status:"full",droppedRecords:3},"有日志记录丢失","danger"],
      [{status:"full",discarded:2},"有日志记录丢失","danger"],
      [{status:"full",pending:1000,queueFull:true},"日志待写队列已满","warning"],
      [{status:"full",writeFailures:1,detailedBytes:513*1024*1024},"日志写入异常","warning"],
      [{status:"degraded",writeFailures:1},"日志写入异常","warning"],
      [{},"日志记录正常","success"],
    ];
    for(const [patch,label,tone] of cases){
      const html=renderToStaticMarkup(createElement(DiagnosticSettings,{status:{...base,...patch},markers:[],onMarkIssue(){},onExport(){},onExportStateChange(){},onOpenDirectory(){}}));
      assert.ok(html.includes(label),label);
      assert.ok(html.includes("background-color:var(--status-"+tone+")"),label);
      if(label==="日志已达保留上限")assert.ok(!html.includes("有日志记录丢失"));
    }
  } finally {await server.close();}
});
