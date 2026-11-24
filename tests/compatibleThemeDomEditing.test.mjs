import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("three source preview hosts expose the minimal editor inspect bridge", () => {
  const blivechat = read("src/compat/blivechat/BlivechatSourceSurface.tsx");
  const openlive = read("src/compat/openlive/OpenLiveSourceSurface.tsx");
  const laplace = read("src/compat/laplace/RendererHost.tsx");
  for (const source of [blivechat, openlive, laplace]) {
    assert.match(source, /editorSelection/);
    assert.match(source, /onEditorInspection/);
  }
});

test("three published source documents handle select reveal and picked without changing event identity", () => {
  const blivechat = read("vendor/blivechat/host/entry.js");
  const openlive = read("src/compat/openlive/runtime/entry.mjs");
  const laplace = read("src/compat/laplace/renderer/frame.tsx");
  for (const source of [blivechat, openlive, laplace]) {
    assert.match(source, /editor-select/);
    assert.match(source, /editor-inspected/);
    assert.match(source, /data-compatible-editor-selected/);
    assert.match(source, /data-compatible-editor-reveal/);
  }
  assert.doesNotMatch(blivechat, /compatibleEventId\s*=\s*data\.part/);
  assert.doesNotMatch(openlive, /compatibleEventId\s*=\s*data\.part/);
  assert.doesNotMatch(laplace, /eventId\s*:\s*message\.part/);
});

test("formal editor passes capability selectors and uses iframe picks in both preview surfaces", () => {
  const editor = read("src/components/CompatibleThemeEditor.tsx");
  const preview = read("src/components/CompatibleThemePreview.tsx");
  const standalone = read("src/components/StylePreviewContent.tsx");
  assert.match(editor, /onEditorInspection/);
  assert.match(preview, /editorSelection/);
  assert.match(preview, /compatibleEditorSelectors/);
  assert.match(preview, /focusSelectors/);
  assert.match(preview, /compatibleSelectorFor/);
  assert.match(standalone, /CompatibleThemePreview/);
});

test("compatible controls retain project primitives and do not introduce forbidden type sizes", () => {
  const editor = read("src/components/CompatibleThemeEditor.tsx");
  const css = read("src/components/nativeThemeEditor.css");
  assert.match(editor, /UiSelect/);
  assert.doesNotMatch(editor, /<select\b/);
  assert.doesNotMatch(css, /font-size:\s*13px/);
});

test("capability selectors are derived from published DOM rather than wrapper-only selectors", async () => {
  const laplace = await import("../src/compat/laplace/theme.ts");
  const blivechat = await import("../src/compat/blivechat/theme.ts");
  const openlive = await import("../src/compat/openlive/theme.ts");
  const laplaceSelectors = JSON.stringify(laplace.LAPLACE_CAPABILITY.eventSelectorsByPlacement);
  assert.doesNotMatch(laplaceSelectors, /laplace-theme|laplace-sticky-root|laplace-detail-root/);
  assert.match(laplaceSelectors, /event-list/);
  assert.match(laplaceSelectors, /gift-sticky-bar/);
  assert.match(JSON.stringify(blivechat.BLIVECHAT_CAPABILITY.eventSelectorsByPlacement), /data-blc-kind/);
  assert.match(JSON.stringify(openlive.OPENLIVE_CAPABILITY.eventSelectorsByPlacement?.sticky), /ticker-paid-message-item-renderer\[data-openlive-kind/);
});

test("editor protocol carries scheme, exact scope, scrolling and explicit clear semantics", () => {
  for (const path of ["vendor/blivechat/host/entry.js", "src/compat/openlive/runtime/entry.mjs", "src/compat/laplace/renderer/frame.tsx"]) {
    const source = read(path);
    assert.match(source, /scrollIntoView/);
    assert.match(source, /strictScope|markPreviewEditorSelection/);
    assert.match(source, /editor-select/);
  }
  const preview = read("src/components/CompatibleThemePreview.tsx");
  assert.match(preview, /const editorSelection = useMemo<CompatibleEditorSelectionState>/);
  assert.match(preview, /scheme:\s*actualScheme/);
});

test("standalone preview payload keeps the complete preview state and user width", () => {
  const bridge = read("src/preview/stylePreviewState.ts");
  assert.match(bridge, /CompatibleStylePreviewState/);
  assert.match(bridge, /previewMode/);
  assert.match(bridge, /previewScheme/);
  assert.match(bridge, /selection/);
  assert.match(bridge, /width/);
  const surface=read("src/components/StylePreviewContent.tsx");
  assert.match(surface,/width: "100%"/);
  assert.match(surface,/height: "100%"/);
});

test("scheme、scope、computed、精确 reveal 与 viewport 使用同一正式协议", () => {
  const preview = read("src/components/CompatibleThemePreview.tsx");
  const editor = read("src/components/CompatibleThemeEditor.tsx");
  const standalone = read("src/components/StylePreviewContent.tsx");
  for (const path of ["vendor/blivechat/host/entry.js", "src/compat/openlive/runtime/entry.mjs", "src/compat/laplace/renderer/frame.tsx"]) {
    const source = read(path);
    assert.match(source, /editor-inspected/);
    assert.match(source, /getComputedStyle/);
    assert.match(source, /eventType/);
    assert.match(source, /placement/);
    assert.doesNotMatch(source, /for\s*\([^)]*current[^)]*\)\s*current\.setAttribute\('data-compatible-editor-reveal'/);
  }
  assert.match(preview, /resolveCompatiblePreviewScheme/);
  assert.match(editor, /previewWidth/);
  assert.match(editor, /onEditorInspection/);
  assert.match(editor, /eventType/);
  assert.match(standalone, /previewWidth=\{undefined\}/);
  assert.doesNotMatch(standalone, /maxWidth/);
});

test("跟随软件使用应用明暗，显式选择仍覆盖", async () => {
  const vite = await createServer({ configFile: false, cacheDir: `${tmpdir()}/danmu-ssr-cache/compat-scheme`, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, watch: null }, optimizeDeps: { include: [], noDiscovery: true }, appType: "custom", logLevel: "silent" });
  try {
    const { resolveCompatiblePreviewScheme } = await vite.ssrLoadModule("/src/themes/compatPreviewScheme.ts");
    const { useTheme } = await vite.ssrLoadModule("/src/theme.ts");
    const previousMode = useTheme.getState().mode;
    const laplace = { settings: { colorScheme: "dark" } };
    useTheme.setState({ mode: "light" });
    assert.equal(resolveCompatiblePreviewScheme(laplace, "system"), "light");
    assert.equal(resolveCompatiblePreviewScheme(laplace, "light"), "light");
    assert.equal(resolveCompatiblePreviewScheme(laplace, "dark"), "dark");
    const previous = globalThis.window;
    globalThis.window = { matchMedia: () => ({ matches: true }) };
    try {
      useTheme.setState({ mode: "light" });
      assert.equal(resolveCompatiblePreviewScheme({ settings: {} }, "system"), "light", "手动浅色不得被深色系统覆盖");
      useTheme.setState({ mode: "system" });
      assert.equal(resolveCompatiblePreviewScheme({ settings: {} }, "system"), "dark");
    } finally { globalThis.window = previous; useTheme.setState({ mode: previousMode }); }
  } finally { await vite.close(); }
});

test("预览宽度控件读取工作台实际宽度而不是固定 340", () => {
  const geometry = read("src/components/nativePreviewGeometry.ts");
  const workbench = read("src/components/RightWorkbench.tsx");
  const compatible = read("src/components/CompatibleThemeEditor.tsx");
  assert.match(geometry, /readonly width:\s*number/);
  assert.match(workbench, /width:\s*workbenchWidth/);
  assert.match(compatible, /previewGeometry\?\.width/);
});
