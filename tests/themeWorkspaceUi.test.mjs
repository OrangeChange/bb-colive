import { readUiSource } from "./helpers/readUiSource.mjs";
import {createStylePreviewPartEvents,createStylePreviewDesignEvents} from '../src/components/stylePreviewEvents.ts';
import {MsgType} from '../src/protocol/types.ts';
import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

test("样式工作区预留四种模式分类并保留所有样式总览", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  for (const label of ["所有样式", "原生", "BLC 原版", "BLC 开放版", "LAPLACE"]) assert.match(source, new RegExp(label));
  assert.match(source, /themeCategory/);
  assert.match(source, /这个分类还没有主题/);
});

test("内置和自定义原生主题进入同一个原生主题编辑器", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.equal((source.match(/<NativeThemeEditor/g) ?? []).length, 1);
  assert.doesNotMatch(source, /StyleEditorSurface|NativeComponentAppearancePanel|部件样式/);
  assert.match(source, /session\.document\.origin === "builtin"/);
  assert.match(source, /saveThemeSessionAs/);
  assert.match(source, /saveThemeSession\(session, keepDraft\)/);
});

test("样式编辑器把真实预览交给右侧工作台而不是主页面预览列", () => {
  const app = readUiSource("src/App.tsx", "utf8");
  const panel = readUiSource("src/components/StylePanel.tsx", "utf8");
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8") + readUiSource("src/components/StylePreviewToolbar.tsx", "utf8") + readUiSource("src/components/StylePreviewActions.tsx", "utf8") + readUiSource("src/components/NativeStylePreviewSurface.tsx", "utf8") + readUiSource("src/preview/useNativePreviewEvents.ts", "utf8");
  assert.match(app, /stylePreviewActive=/);
  assert.match(app, /onStylePreviewTarget=/);
  assert.match(panel, /previewTarget/);
  assert.match(workspace, /onEditingChange/);
  assert.match(editor, /previewTarget/);
  assert.match(editor, /createPortal\(renderPreview\(\), previewTarget\)/);
  assert.match(editor, /<StylePreviewArea/);
  assert.match(editor, /nativeSelectionContextFromElement/);
  for (const label of ["静态", "点选", "动态", "画布背景", "打开独立预览", "浅色"]) assert.match(editor, new RegExp(label));
  assert.match(editor, /<ThemeColorField/);
  assert.match(editor, /previewWidth/);
  assert.match(editor, /previewBackground/);
  assert.match(editor, /useStylePreviewPlayback/);
  assert.match(readUiSource("src/preview/useStylePreviewPlayback.ts", "utf8"), /createStylePreviewPlayback/);
  assert.match(editor, /previewMotion !== "design"/);
  assert.match(readUiSource("src/components/StylePreviewArea.tsx", "utf8"), /native-preview-sticky-scroll/);
  assert.match(readUiSource("src/components/StylePreviewArea.tsx", "utf8"), /native-preview-message-scroll/);
  assert.match(readUiSource("src/components/StylePreviewArea.tsx", "utf8"), /followLatest/);
});

test("预览窗口宽度与工作台联动且内容铺满窗口", () => {
  const app = readUiSource("src/App.tsx", "utf8");
  const panel = readUiSource("src/components/StylePanel.tsx", "utf8");
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  const workbench = readUiSource("src/components/RightWorkbench.tsx", "utf8");
  const main = readUiSource("src/main.tsx", "utf8");
  assert.match(app, /stylePreviewGeometry/);
  assert.match(app, /onStylePreviewGeometry/);
  assert.match(panel, /previewGeometry/);
  assert.match(workspace, /previewGeometry/);
  assert.match(editor, /previewGeometry\.resizeBy/);
  assert.match(editor, /setFallbackPreviewWidth\(next\)/);
  assert.doesNotMatch(editor, /minWidth:previewWidth|flex:"0 0 auto"/);
  assert.match(workbench, /NativePreviewGeometry/);
  assert.match(workbench, /resizeBy/);
  assert.match(main, /native-style-preview/);
  assert.doesNotMatch(editor, /window\.open\("about:blank"/);
});

test("可视化设置保存结构化模型且生成 CSS 不覆盖独立可视化层", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editor = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  const updateStart = workspace.indexOf("const updateSettings");
  const updateEnd = workspace.indexOf("const apply", updateStart);
  assert.match(workspace.slice(updateStart, updateEnd), /settings:\s*nextSettings/);
  assert.doesNotMatch(workspace.slice(updateStart, updateEnd), /visualCss:/);
  assert.match(workspace.slice(updateStart, updateEnd), /patchManagedNativeCss/);
  assert.match(workspace.slice(updateStart, updateEnd), /updateThemeVisualCssFromControls/);
  assert.match(editor, /tryComposeNativePreviewCss\(applyThemeAssetUrls\(\{/);
  assert.match(editor, /\.\.\.previewDocument/);
  assert.doesNotMatch(editor, /synchronizedVisualCss/);
  assert.doesNotMatch(editor, /useEffect\(\(\) => \{[\s\S]*onVisualCssChange\(generatedVisualCss\)/);
});

test("样式首页采用当前使用和主题库而不是常驻侧栏列表", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /theme-workspace-current-uses/);
  assert.match(source, />当前使用</);
  assert.match(source, />主题库</);
  assert.match(source, /theme-library-grid/);
  assert.match(source, /setView\("editor"\)/);
  assert.match(source, /setView\("home"\)/);
  assert.doesNotMatch(source, /<aside className="theme-library"/);
});

test("OBS 从主页右上角进入且不占用当前使用卡片", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /className="[^"]*theme-obs-entry[^"]*"/);
  assert.match(source, /setView\("obs"\)/);
  assert.match(source, /OBS 设置/);
  assert.doesNotMatch(source, /\["obs", "OBS"/);
  assert.match(source, /OBS 配置/);
  assert.match(source, /复制 OBS 地址/);
  assert.match(source, /浏览器打开/);
  assert.match(source, /删除配置/);
  assert.match(source, /nativeObsConfigurationStore/);
  assert.match(source, /保存配置/);
  assert.match(source, /useConnection/);
  assert.match(source, /theme-obs-anchor-card/);
  assert.match(source, /theme-obs-anchor-trigger/);
  assert.match(source, /anchorName/);
  assert.match(source, /直播间 \$\{item\.roomId\}/);
  assert.match(source, /aria-label=["']OBS 房间号["']/);
});

test("主题库提供多选管理和批量动作", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /manageMode/);
  assert.match(source, /selectedThemeIds/);
  assert.match(source, /全选当前结果/);
  assert.match(source, /导出所选/);
  assert.match(source, /删除所选/);
});

test("主题库操作集中在管理旁并在卡片显示必要元数据", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editorChrome = readUiSource("src/components/ThemeEditorChrome.tsx", "utf8");
  const headingStart = workspace.indexOf('className="theme-workspace-section-heading"', workspace.indexOf('aria-label="主题库"'));
  const tabsStart = workspace.indexOf('className="theme-category-tabs"', headingStart);
  const heading = workspace.slice(headingStart, tabsStart);
  for (const label of ["新建主题", "导入", "导出全部主题", "管理"]) assert.match(heading, new RegExp(label));
  for (const label of ["更新现有主题", "导入为副本", "跳过导入"]) assert.match(workspace, new RegExp(label));
  assert.match(workspace, /内置主题不能覆盖，请导入为副本。/);
  assert.match(workspace, /disabled=\{summaries\.some\(item => item\.themeId === pendingImport\.document\.themeId && item\.origin === "builtin"\)\}/);
  assert.match(workspace, /item\.author/);
  assert.match(workspace, /item\.version/);
  assert.match(editorChrome, /label: ["']主题信息["']/);
});

test("主题库使用操作分别应用到现场或副窗口", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const applyStart = workspace.indexOf("const applySummary");
  const applyEnd = workspace.indexOf("const saveObsConfiguration", applyStart);
  const applySource = workspace.slice(applyStart, applyEnd);
  assert.match(applySource, /targetId: string/);
  assert.match(applySource, /publishToTarget/);
  assert.doesNotMatch(applySource, /Promise\.all/);
  assert.match(workspace, /<ThemeActionMenu label=\{`使用 \$\{item.name\}`\}/);
  assert.match(workspace, /`用于\$\{target.label\}`/);
  assert.match(workspace, /current: !unsupported && themeIdAt\(target.id\) === item.themeId/);
  assert.doesNotMatch(workspace, /applyMenuThemeId|theme-library-apply-menu/);
});

test("未绑定目标的显示缩放失败时不保留未保存数值", () => {
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const start = workspace.indexOf("const updateDisplayScale");
  const end = workspace.indexOf("const appliedSummary", start + 1);
  const source = workspace.slice(start, end > start ? end : undefined);
  assert.ok(source.indexOf("await themeBindingRegistry.setDisplayScale") < source.indexOf("setDisplayScales"));
});


test("主题缩略图具备真实渲染和明确失败状态", () => {
  const source = readUiSource("src/components/NativeThemeThumbnail.tsx", "utf8");
  const compatible = readUiSource("src/components/CompatibleThemePreview.tsx", "utf8");
  const shell = readUiSource("src/components/ThemeThumbnailShell.tsx", "utf8");
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const styles = readUiSource("src/components/themeWorkspace.css", "utf8");
  assert.match(source, /StylePreviewArea/);
  assert.match(shell, /is-rendered/);
  assert.match(source, /ThemeThumbnailShell/);
  assert.match(compatible, /ThemeThumbnailShell/);
  assert.match(shell, /IntersectionObserver/);
  assert.match(shell, /无法显示预览/);
  assert.match(workspace, /const draftDocument = sessionHost\.getDraftThemeDocument\(item\.themeId\)/);
  assert.doesNotMatch(workspace, /item\.mode === "native" \? sessionHost\.getDraftThemeDocument/);
  assert.match(source, /theme-library-thumbnail-canvas/);
  assert.match(shell, /theme-library-thumbnail-frame/);
  assert.match(styles, /\.theme-library-thumbnail-frame\{[^}]*border:1px solid var\(--color-line\)[^}]*border-radius:/);
  assert.match(styles, /\.theme-library-thumbnail-frame\{[^}]*background:var\(--color-bg\)/);
  assert.match(styles, /\.theme-library-thumbnail\.is-rendered \.style-editor-preview-list\{[^}]*margin-top:0[^}]*border:0[^}]*border-radius:0[^}]*background:transparent/);
  assert.doesNotMatch(styles, /\.theme-library-thumbnail-frame iframe\{background:var\(--color-surface\)!important\}/);
  assert.doesNotMatch(styles, /width:\s*210%/);
  assert.doesNotMatch(styles, /scale\(\.47\)/);
  assert.doesNotMatch(styles, /\.theme-library-thumbnail span\{/);
  assert.match(styles, /\.theme-library-thumbnail\.is-loading>span\{/);
  assert.match(styles, /\.theme-library-thumbnail\.is-rendered \.event-area\{[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.theme-library-thumbnail\.is-rendered \.native-preview-message-scroll\{[^}]*overflow:\s*hidden/);
  assert.match(styles, /\.theme-library-grid\{[^}]*display:grid[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(min-width:1500px\)\{\.theme-library-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}\}/);
  assert.match(styles, /\.theme-library-card\{[^}]*width:100%[^}]*min-width:0[^}]*max-width:none/);
});

test("样式预览不生成封面审核事件", () => {
  const source = readUiSource("src/components/stylePreviewEvents.ts", "utf8");
  for(const kind of ['混合流','系统'])for(const create of [createStylePreviewPartEvents,createStylePreviewDesignEvents]){const events=create(kind);assert.ok(events.length>0);assert.ok(events.every(e=>e.msgType!==MsgType.CoverAudit));}
});

test("样式页复用软件公共主播栏", () => {
  const source = readUiSource("src/components/StylePanel.tsx", "utf8");
  assert.match(source, /import \{ ConnectBar \}/);
  assert.match(source, /<ConnectBar \/>/);
});

test("LAPLACE 精选来源失败时不创建预览且禁止另存", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /loaded\.error/);
  assert.match(source, /disabled=\{[^}]*!laplaceUrlDraft\.document/);
});

test("远程 URL 预览弹窗保留可滚动内容和固定操作区", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const styles = readUiSource("src/components/themeWorkspace.css", "utf8");
  assert.match(source, /theme-url-dialog-body/);
  assert.match(source, /theme-url-dialog-actions/);
  assert.match(styles, /\.theme-url-dialog\{[^}]*max-height:calc\(100vh - 32px\)[^}]*overflow:hidden/);
  assert.match(styles, /\.theme-url-dialog-body\{[^}]*overflow-y:auto/);
  assert.match(styles, /\.theme-source-options\{[^}]*grid-template-columns:repeat\(auto-fit,minmax\(120px,1fr\)\)/);
  assert.match(styles, /@media\(max-width:520px\)/);
  assert.match(styles, /\.theme-url-dialog-actions\{display:grid!important;grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
});

test("主题编辑器提供基础可视化和高级三个区域", () => {
  const source = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  const chrome = readUiSource("src/components/ThemeEditorChrome.tsx", "utf8");
  assert.match(chrome, /"basic" \| "visual" \| "advanced"/);
  assert.match(chrome, /["']基础设置["']/);
  assert.match(chrome, /["']可视化编辑["']/);
  assert.match(chrome, /["']高级编辑["']/);
  assert.match(source, /NativeThemeAdvancedEditor/);
});

test("主题编辑只保留一层标题栏并把返回入口放入统一编辑器", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const editorSource = readUiSource("src/components/NativeThemeEditor.tsx", "utf8");
  const chrome = readUiSource("src/components/ThemeEditorChrome.tsx", "utf8");
  assert.match(source, /view === "home" && <header className="theme-workspace-page-header">/);
  assert.match(source, /onBack=\{\(\) => returnHome\(\)\}/);
  assert.match(editorSource, /<ThemeEditorHeader/);
  assert.match(chrome, />返回样式</);
  assert.match(chrome, /ChevronLeftIcon/);
  assert.match(source, /theme-obs-back[^>]*>[\s\S]*ChevronLeftIcon/);
});

test("新建主题先进入草稿并在首次保存时写入主题库", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const start = source.indexOf("const createTheme");
  const end = source.indexOf("const exportTheme", start);
  const createSource = source.slice(start, end);
  assert.match(createSource, /createNewThemeSession/);
  assert.doesNotMatch(createSource, /repository\.saveThemeDocument/);
  assert.match(source, /主题信息/);
  assert.match(source, /主题作者/);
  assert.match(source, /主题版本/);
});

test("草稿列表每次渲染读取最新摘要，管理选择只包含可导出主题", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /const visible = librarySummaries\.filter/);
  assert.doesNotMatch(source, /const visible = useMemo/);
  assert.match(source, /selectableVisible/);
  assert.match(source, /!draftThemeIds\.has\(item\.themeId\) && manageMode/);
});

test("原生草稿缩略图从会话文档加载，不访问主题仓库", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /getDraftThemeDocument\(item\.themeId\)/);
  assert.match(source, /load=\{draftDocument \? async \(\) => resolveThemeAssets\(structuredClone\(draftDocument\), sessionHost\.getDraftThemeAssetChanges\(item\.themeId\)\) : resolveSavedThemeForObsPreview\}/);
});

test("OBS 主播触发器保留主播卡片并让页面导航独立成行", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const styles = readUiSource("src/components/themeWorkspace.css", "utf8");
  assert.match(source, /className="theme-obs-anchor-trigger theme-obs-anchor-card"/);
  assert.match(source, /theme-obs-page-nav/);
  assert.match(styles, /\.theme-obs-detail-actions\{[^}]*gap:/);
  assert.match(styles, /\.theme-obs-preview\{[^}]*border:1px solid var\(--color-line\)[^}]*border-radius:8px/);
});

test("OBS 选中配置即在右侧工作台显示完整预览", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const app = readUiSource("src/App.tsx", "utf8");
  const workbench = readUiSource("src/components/RightWorkbench.tsx", "utf8");
  assert.match(source, /<ObsManagementPreview/);
  assert.doesNotMatch(source, /obsPreviewOpen/);
  assert.match(source, /createPortal/);
  assert.match(source, /previewMode === "obs"/);
  assert.match(app, /stylePreviewTitle/);
  assert.match(workbench, /stylePreviewTitle/);
  assert.match(workbench, /stylePreviewTitle \?\? ["']样式预览["']/);
});

test("OBS 配置预览通过真实快照消费组件读取已保存配置", async () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /import \{ ObsManagementPreview \}/);
  assert.match(source, /persistedObsConfigurations\.current\.get\(selectedObs\.id\)/);
  assert.match(source, /<ObsManagementPreview[^>]*configuration=\{selectedObs\}/);
  const vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-themeWorkspaceUi.test.mjs",optimizeDeps:{noDiscovery:true,include:[]}, configFile: false, esbuild: { jsx: "automatic" }, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  try {
    const { createNativeObsRendererTargetController } = await vite.ssrLoadModule("/src/obs/NativeObsRenderer.tsx");
    const pending = new Map();
    const displayed = [];
    const controller = createNativeObsRendererTargetController(snapshot => displayed.push(snapshot?.targetId), (targetId, listener) => new Promise(resolve => pending.set(targetId, { listener, resolve })));
    controller.select("obs-a");
    pending.get("obs-a").listener({ targetId: "obs-a" });
    controller.select("obs-b");
    assert.deepEqual(displayed, [undefined, "obs-a", undefined]);
    pending.get("obs-a").listener({ targetId: "obs-a" });
    pending.get("obs-b").listener({ targetId: "obs-b" });
    controller.select(undefined);
    pending.get("obs-b").listener({ targetId: "obs-b" });
    assert.deepEqual(displayed, [undefined, "obs-a", undefined, "obs-b", undefined]);
    pending.get("obs-a").resolve(() => {});
    pending.get("obs-b").resolve(() => {});
    await Promise.resolve();
    controller.dispose();
  } finally {
    await vite.close();
  }
});

test("OBS 配置列表以配置名称为主信息并紧凑排列主播信息", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const styles = readUiSource("src/components/themeWorkspace.css", "utf8");
  assert.match(source, /className="theme-obs-list-name">\{item\.name\}/);
  assert.match(source, /className="theme-obs-list-meta"/);
  assert.match(source, /item\.anchorName[\s\S]*直播间/);
  assert.match(styles, /\.theme-obs-list button\{[^}]*align-content:center[^}]*gap:2px[^}]*padding:8px 12px/);
  assert.match(styles, /\.theme-obs-list-name\{[^}]*font-size:14px[^}]*line-height:20px/);
  assert.match(styles, /\.theme-obs-list-meta\{[^}]*font-size:12px[^}]*line-height:16px/);
});

test("OBS 清理未恢复时界面不会报告原有输出已恢复", () => {
  const source = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(source, /cause instanceof ObsConfigurationDeleteError && !cause\.restored/);
  assert.match(source, /部分输出状态可能未恢复/);
});

test("可视化编辑器直接包含范围、语义部件和继承状态", () => {
  const source = readUiSource("src/components/NativeThemeVisualEditor.tsx", "utf8");
  assert.match(source, /NATIVE_EVENT_SCOPES/);
  assert.match(source, /NATIVE_IDENTITY_SCOPES/);
  assert.match(source, /NATIVE_SEMANTIC_PARTS/);
  assert.match(source, /继承主题/);
  assert.match(source, /继承自通用/);
  assert.match(source, /当前层覆盖/);
  assert.doesNotMatch(source, /布局与尺寸/);
  assert.match(source, /const identityPriorityControl = <div className="native-scope-setting native-identity-priority"/);
  assert.match(source, /native-event-scope-primary/);
});
