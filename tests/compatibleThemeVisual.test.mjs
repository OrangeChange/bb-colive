import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  compatiblePartFromElement,
  resolveCompatibleVisualControl,
  resolveCompatibleVisualProperty,
  clearCompatibleVisualTarget,
  setCompatibleVisualProperty,
  temporaryRevealCompatiblePart,
} from "../src/themes/compatThemeCapabilities.ts";

test("正文与用户名属性独立，子类按属性继承", () => {
  let model = { common: {}, light: {}, dark: {} };
  model = setCompatibleVisualProperty(model, { event: "all", identity: "all", placement: "main", part: "message" }, "fontSize", { source: "theme", value: 16 });
  model = setCompatibleVisualProperty(model, { event: "gift", identity: "all", placement: "main", part: "message" }, "color", { source: "custom", value: "#ff0000" });
  model = setCompatibleVisualProperty(model, { event: "gift", identity: "all", placement: "main", part: "username" }, "fontSize", { source: "custom", value: 20 });
  assert.equal(resolveCompatibleVisualProperty(model, { event: "gift", identities: [], placement: "main", part: "message" }, "fontSize").value, 16);
  assert.equal(resolveCompatibleVisualProperty(model, { event: "gift", identities: [], placement: "main", part: "message" }, "color").value, "#ff0000");
  assert.equal(resolveCompatibleVisualProperty(model, { event: "gift", identities: [], placement: "main", part: "username" }, "fontSize").value, 20);
});

test("全部恢复继承只清当前事件、身份、区域和部件", () => {
  const model = { common: {
    "gift|all|main|message": { color: { source: "custom", value: "#f00" } },
    "gift|all|sticky|message": { color: { source: "custom", value: "#0f0" } },
  }, light: {}, dark: {} };
  const cleared = clearCompatibleVisualTarget(model, { event: "gift", identity: "all", placement: "main", part: "message" });
  assert.equal(cleared.common["gift|all|main|message"], undefined);
  assert.equal(cleared.common["gift|all|sticky|message"].color.value, "#0f0");
});

test("主区和置顶栏的同名部件保存与解析互不覆盖", () => {
  let model = { common: {}, light: {}, dark: {} };
  model = setCompatibleVisualProperty(model, { event: "gift", identity: "all", placement: "main", part: "amount" }, "fontSize", { source: "custom", value: 18 });
  model = setCompatibleVisualProperty(model, { event: "gift", identity: "all", placement: "sticky", part: "amount" }, "fontSize", { source: "custom", value: 28 });
  assert.equal(model.common["gift|all|main|amount"].fontSize.value, 18);
  assert.equal(model.common["gift|all|sticky|amount"].fontSize.value, 28);
  assert.equal(resolveCompatibleVisualProperty(model, { event: "gift", identities: [], placement: "main", part: "amount" }, "fontSize").value, 18);
  assert.equal(resolveCompatibleVisualProperty(model, { event: "gift", identities: [], placement: "sticky", part: "amount" }, "fontSize").value, 28);
});

test("高优先身份缺少属性时继续按身份优先级逐属性继承", () => {
  const model = { common: {
    "all|captain|main|message": { color: { source: "custom", value: "#00ff00" } },
    "all|anchor|main|message": { fontSize: { source: "custom", value: 24 } },
    "all|all|main|message": { lineHeight: { source: "theme", value: 1.5 } },
  }, light: {}, dark: {} };
  const target = { event: "danmaku", identities: ["anchor", "captain"], part: "message" };
  assert.equal(resolveCompatibleVisualProperty(model, target, "fontSize", { identityPriority: ["anchor", "captain"] }).value, 24);
  assert.equal(resolveCompatibleVisualProperty(model, target, "color", { identityPriority: ["anchor", "captain"] }).value, "#00ff00");
  assert.equal(resolveCompatibleVisualProperty(model, target, "lineHeight", { identityPriority: ["anchor", "captain"] }).value, 1.5);
});

test("隐藏部件临时显露只作用预览且不写回模型", () => {
  const model = { common: { "all|all|main|avatar": { visible: { source: "custom", value: false } } }, light: {}, dark: {} };
  const preview = temporaryRevealCompatiblePart(model, { event: "all", identity: "all", part: "avatar" });
  assert.equal(preview.common["all|all|main|avatar"].visible.value, true);
  assert.equal(model.common["all|all|main|avatar"].visible.value, false);
});

test("控件同时保留直接覆盖语义并展示逐属性解析值", () => {
  const model = { common: { "all|all|main|message": { color: { source: "theme", value: "#aaa" }, visible: { source: "theme", value: false } }, "gift|anchor|main|message": { fontSize: { source: "custom", value: 24 } } }, light: {}, dark: {} };
  const color = resolveCompatibleVisualControl(model, { event: "gift", identity: "anchor", part: "message" }, "color", { identityPriority: ["anchor"] });
  const size = resolveCompatibleVisualControl(model, { event: "gift", identity: "anchor", part: "message" }, "fontSize", { identityPriority: ["anchor"] });
  const hidden = resolveCompatibleVisualControl(model, { event: "gift", identity: "anchor", part: "message" }, "visible", { identityPriority: ["anchor"] });
  assert.equal(color.direct, undefined);
  assert.equal(color.resolved.value, "#aaa");
  assert.equal(size.direct.value, 24);
  assert.equal(size.resolved.value, 24);
  assert.equal(hidden.resolved.value, false);
});

test("iframe 元素按节点类型跨 realm 点选", () => {
  const match = { nodeType: 1 };
  const target = { nodeType: 1, closest: selector => selector === ".message" ? match : null };
  const boundary = { contains: node => node === target || node === match };
  assert.equal(compatiblePartFromElement(target, boundary, { mode: "blivechat", parts: { message: { selector: ".message", properties: [] } } }), "message");
});

test("点选解析覆盖事件与区域专用选择器", () => {
  const match = { nodeType: 1 };
  const target = { nodeType: 1, closest: selector => selector === "#text" ? match : null };
  const boundary = { contains: node => node === target || node === match };
  const capability = { mode: "blivechat", parts: { amount: { selector: "#purchase-amount", selectorsByPlacement: { sticky: "#text" }, properties: [] } } };
  assert.equal(compatiblePartFromElement(target, boundary, capability), "amount");
});

test("兼容编辑器复用现有颜色、高级 CSS 和隔离预览接点", () => {
  const editor = fs.readFileSync("src/components/CompatibleThemeEditor.tsx", "utf8");
  const nativeEditor = fs.readFileSync("src/components/NativeThemeVisualEditor.tsx", "utf8");
  const sharedNavigation = fs.readFileSync("src/components/ThemeVisualNavigation.tsx", "utf8");
  const chrome = fs.readFileSync("src/components/ThemeEditorChrome.tsx", "utf8");
  const preview = fs.readFileSync("src/components/CompatibleThemePreview.tsx", "utf8");
  const workspace = fs.readFileSync("src/components/ThemeWorkspace.tsx", "utf8");
  assert.match(editor, /ThemeVisualPropertyField/);
  assert.match(fs.readFileSync("src/components/ThemeVisualPropertyField.tsx", "utf8"), /ThemeColorField/);
  for (const source of [editor, nativeEditor]) {
    assert.match(source, /ThemeVisualNavigation/);
    assert.match(source, /ThemeVisualPropertyPanel/);
  }
  assert.match(editor, /NativeThemeAdvancedEditor/);
  assert.match(preview, /IsolatedPreviewFrame/);
  assert.match(preview, /renderer/);
  assert.match(workspace, /getCompatibleThemeEditingSurface/);
  assert.match(workspace, /<CompatibleThemeEditor/);
  assert.match(workspace, /CompatibleThemeThumbnail/);
  assert.match(editor, /<ThemeEditorHeader/);
  assert.match(chrome, /onClick=\{onApply\}/);
  assert.match(chrome, /ThemeActionMenu[^>]*items=\{\[\{ label: "更新已有输出", action: onApply \}, \.\.\.applyTargets\]\}/);
  assert.match(editor, /<ThemeEditorHeader[^>]*onApply=\{onApply\}[^>]*applyTargets=\{applyTargets\}/);
  assert.match(editor, /previewTarget && createPortal/);
  assert.match(editor, /native-event-scope-primary/);
  assert.match(editor, /native-event-scope-children/);
  assert.match(editor, /buildCompatibleVisualNavigation/);
  assert.match(sharedNavigation, /aria-label="语义部件"/);
  assert.match(sharedNavigation, /data-native-nav-level="1"/);
  assert.match(sharedNavigation, /render\(item,\s*\[group.id\],\s*2\)/);
  assert.doesNotMatch(editor, />区域范围</);
  assert.match(editor, /native-identity-scope/);
  assert.doesNotMatch(editor, /compatible-scope-strip/);
  assert.doesNotMatch(editor, /setEditScheme\(scheme\); if \(scheme !== "common"\) setPreviewScheme/);
});

test("兼容缩略图使用透明来源背景并只取顶部样例", () => {
  const blivechat = fs.readFileSync("src/compat/blivechat/register.tsx", "utf8");
  const openlive = fs.readFileSync("src/compat/openlive/register.tsx", "utf8");
  const laplace = fs.readFileSync("src/compat/laplace/register.tsx", "utf8");
  const surface = fs.readFileSync("src/compat/blivechat/BlivechatSourceSurface.tsx", "utf8");
  const openliveSurface = fs.readFileSync("src/compat/openlive/OpenLiveSourceSurface.tsx", "utf8");
  const presentation = fs.readFileSync("src/compat/thumbnailFramePresentation.ts", "utf8");
  for (const source of [blivechat, openlive]) assert.match(source, /html,body,#app,yt-live-chat-renderer,yt-live-chat-item-list-renderer,#item-scroller,#items\{background:transparent!important/);
  assert.match(laplace, /html,body,#root[^}]*background:transparent!important/);
  assert.match(surface, /thumbnail\s*\?\s*records\.slice\(0, 6\)/);
  assert.match(laplace, /thumbnail[^\n]*slice\(0,/);
  assert.match(surface, /command === "hydrated" && thumbnail\) \{[\s\S]*applyCompatibleThumbnailFramePresentation\(frameRef\.current\?\.contentDocument/);
  assert.doesNotMatch(surface, /command === "hydrated" && thumbnail\) \{[\s\S]{0,500}command: "scroll-latest"/);
  assert.match(openliveSurface, /command === "hydrated"[\s\S]*if \(thumbnail\) \{[\s\S]*applyCompatibleThumbnailFramePresentation\(frameRef\.current\?\.contentDocument[\s\S]*post\("scroll-latest"\)/);
  assert.match(laplace, /onFrameDocument: thumbnail \? applyCompatibleThumbnailFramePresentation : setFallbackDocument/);
  assert.match(presentation, /node\.scrollTop = 0/);
  assert.match(presentation, /THUMBNAIL_TRANSPARENT_ROOTS/);
  assert.match(presentation, /addEventListener\("load", reset, true\)/);
  assert.match(laplace, /direction: thumbnail \? "top" : scrollDirection/);
  assert.match(presentation, /requestAnimationFrame/);
  assert.doesNotMatch(presentation, /getComputedStyle\(card\)/);
});

test("缩略预览有固定画布边界且棋盘背景不写入主题 CSS", () => {
  const preview = fs.readFileSync("src/components/CompatibleThemePreview.tsx", "utf8");
  const workspaceCss = fs.readFileSync("src/components/themeWorkspace.css", "utf8");
  assert.match(preview, /is-thumbnail/);
  assert.match(preview, /previewBackground/);
  assert.doesNotMatch(preview, /background[^\n]*customCss/);
  assert.match(workspaceCss, /\.theme-library-thumbnail-frame iframe\{background:transparent!important\}/);
  assert.match(workspaceCss, /theme-library-thumbnail\.is-rendered \.event-area\{[^}]*scrollbar-color:transparent transparent/);
});

test("兼容编辑预览宽度跟随画布，宽度值不再固定来源 iframe", () => {
  const preview = fs.readFileSync("src/components/CompatibleThemePreview.tsx", "utf8");
  assert.doesNotMatch(preview, /minWidth:\s*previewWidth/);
  assert.doesNotMatch(preview, /width:\s*previewWidth/);
});

test("快速拖色只更新瞬时预览，结束后才提交主题设置", () => {
  const editor = fs.readFileSync("src/components/CompatibleThemeEditor.tsx", "utf8");
  assert.match(editor, /onPreviewChange=\{value=>previewUpdate/);
  assert.match(editor, /setTransientModel/);
  assert.doesNotMatch(editor, /onPreviewChange=\{next => update/);
});

test("可视化编辑定位不被预览样例筛选覆盖", () => {
  const editor = fs.readFileSync("src/components/CompatibleThemeEditor.tsx", "utf8");
  assert.match(editor, /const previewSelection = section !== "basic" \? selection : sampleSelection/);
  assert.doesNotMatch(editor, /const previewSelection = useMemo\(\(\) => \(\{ \.\.\.selection, event:/);
});
