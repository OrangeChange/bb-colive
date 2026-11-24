import test from "node:test";
import assert from "node:assert/strict";
import { componentRuntime, findElement, keyEvent } from "./helpers/componentRuntime.mjs";
import * as exportProgress from "../src/diagnostics/exportProgress.ts";
import { bindUiDismissableLayer } from "../src/components/ui/layer.ts";
import * as eventStyles from "../src/eventStyleSettings.ts";
import * as eventDisplay from "../src/eventDisplaySettings.ts";
import * as previewEvents from "../src/components/stylePreviewEvents.ts";
import * as filterGeometry from "../src/archive/reviewFilterPopover.ts";
import * as colorGeometry from "../src/components/colorPopoverPlacement.ts";

function layerEnvironment() {
  const previous = { window: globalThis.window, document: globalThis.document, ResizeObserver: globalThis.ResizeObserver };
  const listeners = new Map(), windowListeners = new Map();
  const trigger = { focus: () => { document.activeElement = trigger; }, getAttribute: () => "advanced", contains: (target) => target === trigger,
    getBoundingClientRect: () => ({ top: 100, bottom: 132, right: 300, left: 76, width: 224 }) };
  const surface = { contains: (target) => target === surface, querySelector: () => null, querySelectorAll: () => [], focus() {},
    getBoundingClientRect: () => ({ height: 200 }) };
  globalThis.document = { body: {}, activeElement: trigger, querySelector: () => null,
    addEventListener: (name, fn, capture) => listeners.set(`${name}:${Boolean(capture)}`, fn),
    removeEventListener: (name, fn, capture) => listeners.delete(`${name}:${Boolean(capture)}`) };
  globalThis.window = { innerWidth: 400, innerHeight: 500,
    addEventListener: (name, fn) => windowListeners.set(name, fn), removeEventListener: (name) => windowListeners.delete(name),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {} };
  let resize;
  globalThis.ResizeObserver = class { constructor(callback) { resize = callback; } observe() {} disconnect() {} };
  return { trigger, surface, windowListeners, resize: () => resize(),
    escape() { const event = keyEvent("Escape"); listeners.get("keydown:true")?.(event); listeners.get("keydown:false")?.(event); },
    outside() { listeners.get("pointerdown:true")?.({ target: {} }); },
    close() { Object.assign(globalThis, previous); } };
}

test("筛选浮层在滚动、窗口改变与锚点尺寸改变后更新几何并移除监听", () => {
  const env = layerEnvironment();
  let rect = { top: 100, bottom: 220, left: 20, width: 350 };
  const app = componentRuntime("src/components/ReviewFilterPopover.tsx", {
    "@radix-ui/react-popover": { Root: "root", Anchor: "anchor", Portal: "portal", Content: "content" },
    "../archive/reviewFilterPopover.ts": filterGeometry,
  });
  const props = { open: true, onOpenChange() {}, triggerRef: { current: env.trigger }, anchorRef: { current: { getBoundingClientRect: () => rect } }, children: "条件" };
  try {
    app.render("ReviewFilterPopover", props); app.effects();
    const style = () => findElement(app.render("ReviewFilterPopover", props), (node) => node.type === "content").props.style;
    assert.equal(style().maxHeight, 264);
    rect = { ...rect, bottom: 140 }; env.windowListeners.get("scroll")(); assert.equal(style().maxHeight, 344);
    window.innerWidth = 300; env.windowListeners.get("resize")(); assert.equal(style().width, 284);
    rect = { ...rect, bottom: 180 }; env.resize(); assert.equal(style().maxHeight, 304);
    app.close(); assert.equal(env.windowListeners.size, 0);
  } finally { env.close(); }
});

test("表面颜色浮层外部关闭并返回触发器焦点", () => {
  const env = layerEnvironment();
  const app = componentRuntime("src/components/SettingsPanel.tsx", {
    "./ui/layer": { bindUiDismissableLayer }, "../eventStyleSettings": eventStyles,
    "./colorPopoverPlacement": colorGeometry,
  }, ["SurfaceColorInput"]);
  const props = { value: { r: 0, g: 0, b: 0, a: 1 }, onChange() {} };
  try {
    let tree = app.render("SurfaceColorInput", props);
    const trigger = findElement(tree, (node) => node.type === "button"); trigger.props.ref.current = env.trigger;
    trigger.props.onClick(); tree = app.render("SurfaceColorInput", props);
    findElement(tree, (node) => node.props?.role === "dialog").props.ref.current = env.surface;
    app.effects(); env.outside();
    assert.equal(findElement(app.render("SurfaceColorInput", props), (node) => node.props?.role === "dialog"), null);
    app.close(); assert.equal(document.activeElement, env.trigger);
  } finally { env.close(); }
});


test("导出忙碌期间Escape和外部点击保持弹窗，失败后可关闭", async () => {
  const env = layerEnvironment(); let closes = 0, failFlush;
  const app = componentRuntime("src/components/ReviewDataExportDialog.tsx", {
    "./ui/layer": { bindUiDismissableLayer }, "@tauri-apps/plugin-dialog": { save: async () => "test.xlsx" },
    "../archive/archiveDiagnostics.ts": { createArchiveRequestId: () => "test", recordArchiveDiagnostic() {} },
    "../archive/archiveRuntime.ts": { flushArchiveWriter: () => new Promise((resolve, reject) => { failFlush = reject; }) },
  });
  const props = { repository: {}, scopeOptions: [{ id: "session-current", label: "当前场次", scope: { kind: "session", sessionId: "s" } }], defaultScopeId: "session-current", ownerName: "主播", onClose: () => closes++ };
  try {
    let tree = app.render("ReviewDataExportDialog", props);
    findElement(tree, (node) => node.props?.role === "dialog").props.ref.current = env.surface;
    app.effects();
    findElement(tree, (node) => node.type === "button" && node.props.children === "开始导出").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    tree = app.render("ReviewDataExportDialog", props);
    assert.equal(findElement(tree, (node) => node.type === "button" && node.props.children === "关闭").props.disabled, true);
    env.escape(); env.outside(); assert.equal(closes, 0);
    failFlush(new Error("档案读取失败")); await new Promise((resolve) => setImmediate(resolve));
    tree = app.render("ReviewDataExportDialog", props);
    assert.ok(findElement(tree, (node) => node.props?.role === "alert"));
    env.escape(); assert.equal(closes, 1);
    app.close(); assert.equal(document.activeElement, env.trigger);
  } finally { env.close(); }
});

test("共同筛选浮层触发器交互保留切换，关闭恢复触发器焦点", () => {
  let app;
  try { app = componentRuntime("src/components/ReviewFilterPopover.tsx", {
    "@radix-ui/react-popover": { Root: "root", Anchor: "anchor", Portal: "portal", Content: "content" },
  }); } catch (error) { if (error.code !== "ENOENT") throw error; }
  assert.ok(app, "共同筛选浮层尚不存在");
  let focuses = 0;
  const trigger = { contains: (node) => node === trigger, focus: () => focuses++, getAttribute: () => "advanced" };
  const tree = app.render("ReviewFilterPopover", { open: true, onOpenChange() {}, anchorRef: { current: null }, triggerRef: { current: trigger }, children: "条件" });
  const content = findElement(tree, (node) => node.type === "content");
  const event = keyEvent("", { target: trigger, detail: { originalEvent: { type: "pointerdown" } } });
  content.props.onInteractOutside(event); assert.equal(event.defaultPrevented, true);
  content.props.onCloseAutoFocus(keyEvent("")); assert.equal(focuses, 1);
  app.close();
});

test("分类子菜单Escape先关闭子层并恢复按钮焦点", () => {
  const savedDocument = globalThis.document;
  globalThis.document = { activeElement: null };
  const app = componentRuntime("src/components/ReviewSearchControls.tsx", {
    "@radix-ui/react-popover": { Root: "root", Anchor: "anchor", Portal: "portal", Content: "content" },
    "./ReviewFilterPopover": { ReviewFilterSubmenuLayerContext: { _currentValue: null } },
  });
  const props = { label: "礼物", active: true, filterMode: "include", options: [{ value: "normal", label: "普通礼物" }], isSelected: () => true, onPrimaryToggle() {}, onToggle() {} };
  let tree = app.render("ReviewFilterSubmenu", props);
  let focuses = 0;
  const trigger = findElement(tree, (node) => node.type === "button" && node.props["aria-haspopup"] === "menu");
  trigger.props.ref.current = { focus() {
    focuses++;
    findElement(tree, (node) => node.type === "div" && node.props.onPointerEnter).props.onFocus();
  } };
  findElement(tree, (node) => node.type === "div" && node.props.onPointerEnter).props.onPointerEnter();
  tree = app.render("ReviewFilterSubmenu", props);
  const content = findElement(tree, (node) => node.type === "content");
  if (content) {
    assert.equal(content.props.sideOffset, 0, "按钮与可悬停子层之间不能留空隙");
    assert.match(content.props.className, /\bpt-1\b/, "视觉间距在子层内部保留");
    findElement(tree, (node) => node.type === "root").props.onOpenChange(false);
    content.props.onEscapeKeyDown(keyEvent("Escape"));
    content.props.onCloseAutoFocus(keyEvent(""));
  }
  const wrapper = findElement(tree, (node) => node.type === "div" && node.props.onPointerEnter);
  wrapper.props.onKeyDown?.(keyEvent("Escape"));
  tree = app.render("ReviewFilterSubmenu", props);
  assert.equal(findElement(tree, (node) => node.type === "button" && node.props["aria-haspopup"] === "menu").props["aria-expanded"], false);
  assert.equal(focuses, 1);
  findElement(tree, (node) => node.type === "div" && node.props.onPointerEnter).props.onFocus();
  assert.equal(findElement(app.render("ReviewFilterSubmenu", props), (node) => node.type === "button" && node.props["aria-haspopup"] === "menu").props["aria-expanded"], true);
  app.close();
  globalThis.document = savedDocument;
});

for (const [key, expected] of [["ArrowDown", 0], ["Home", 0], ["ArrowUp", 1], ["End", 1]]) {
  test(`分类按钮${key}打开Portal后进入${expected === 0 ? "首" : "末"}项`, () => {
    const app = componentRuntime("src/components/ReviewSearchControls.tsx", {
      "@radix-ui/react-popover": { Root: "root", Anchor: "anchor", Portal: "portal", Content: "content" },
      "./ReviewFilterPopover": { ReviewFilterSubmenuLayerContext: { _currentValue: null } },
    });
    const props = { label: "礼物", active: true, filterMode: "include", options: [{ value: "normal", label: "普通礼物" }, { value: "paid", label: "付费礼物" }], isSelected: () => false, onPrimaryToggle() {}, onToggle() {} };
    let tree = app.render("ReviewFilterSubmenu", props);
    const button = findElement(tree, (node) => node.type === "button" && node.props["aria-haspopup"] === "menu");
    const event = keyEvent(key);
    button.props.onKeyDown?.(event);
    assert.equal(event.defaultPrevented, true, "分类按钮必须接收菜单进入按键");
    tree = app.render("ReviewFilterSubmenu", props);
    assert.equal(findElement(tree, (node) => node.type === "root").props.open, true);
    let focused = null;
    const items = [0, 1].map((index) => ({ focus() { focused = index; } }));
    const content = findElement(tree, (node) => node.type === "content");
    content.props.ref({ querySelectorAll: () => items });
    app.effects();
    content.props.onOpenAutoFocus(keyEvent(""));
    assert.equal(focused, expected);
    focused = null;
    findElement(tree, (node) => node.type === "button" && node.props["aria-haspopup"] === "menu").props.onKeyDown(keyEvent(key));
    assert.equal(focused, expected, "已经打开的子菜单也能从按钮进入");
    app.close();
  });
}

test("分类按钮进入请求在已打开但Portal节点尚未挂载时保留", () => {
  const app = componentRuntime("src/components/ReviewSearchControls.tsx", {
    "@radix-ui/react-popover": { Root: "root", Anchor: "anchor", Portal: "portal", Content: "content" },
    "./ReviewFilterPopover": { ReviewFilterSubmenuLayerContext: { _currentValue: null } },
  });
  const props = { label: "礼物", active: true, filterMode: "include", options: [{ value: "normal", label: "普通礼物" }], isSelected: () => false, onPrimaryToggle() {}, onToggle() {} };
  let tree = app.render("ReviewFilterSubmenu", props);
  findElement(tree, (node) => node.type === "div" && node.props.onFocus).props.onFocus();
  tree = app.render("ReviewFilterSubmenu", props);
  findElement(tree, (node) => node.type === "content").props.onOpenAutoFocus(keyEvent(""));
  findElement(tree, (node) => node.type === "button" && node.props["aria-haspopup"] === "menu").props.onKeyDown(keyEvent("ArrowDown"));
  let focused = false;
  const content = findElement(tree, (node) => node.type === "content");
  let items = [];
  const element = { querySelectorAll: () => items };
  if (typeof content.props.ref === "function") content.props.ref(element);
  else content.props.ref.current = element;
  items = [{ focus() { focused = true; } }];
  content.props.onOpenAutoFocus(keyEvent(""));
  assert.equal(focused, true, "Portal挂载后执行尚未完成的键盘进入请求");
  app.close();
});

test("父筛选浮层保留同一次外部点击的子层快照，后续点击可关闭", () => {
  const env = layerEnvironment();
  const listeners = new Map();
  document.addEventListener = (name, fn, capture) => listeners.set(`${name}:${Boolean(capture)}`, fn);
  document.removeEventListener = (name, fn, capture) => listeners.delete(`${name}:${Boolean(capture)}`);
  const app = componentRuntime("src/components/ReviewFilterPopover.tsx", {
    "@radix-ui/react-popover": { Root: "root", Anchor: "anchor", Portal: "portal", Content: "content" },
    "../archive/reviewFilterPopover.ts": filterGeometry,
  });
  try {
    const tree = app.render("ReviewFilterPopover", { open: true, onOpenChange() {}, triggerRef: { current: env.trigger }, anchorRef: { current: env.trigger }, children: "筛选" });
    const provider = findElement(tree, (node) => typeof node.props?.value?.registerSubmenu === "function");
    assert.ok(provider, "父子筛选浮层需要局部打开状态协调");
    const unregister = provider.props.value.registerSubmenu({});
    app.effects();
    const firstPointer = { type: "pointerdown" };
    listeners.get("pointerdown:true")(firstPointer);
    unregister();
    const content = findElement(tree, (node) => node.type === "content");
    const outside = (originalEvent) => keyEvent("", { target: {}, detail: { originalEvent } });
    const focus = outside({ type: "focusin" }); content.props.onInteractOutside(focus);
    assert.equal(focus.defaultPrevented, true, "点击引起的后续焦点外移不能关闭父层");
    listeners.get("click:true")();
    const first = outside(firstPointer); content.props.onInteractOutside(first);
    assert.equal(first.defaultPrevented, true, "子层先卸载也不能让同次点击穿透");
    const secondPointer = { type: "pointerdown" }; listeners.get("pointerdown:true")(secondPointer);
    const second = outside(secondPointer); content.props.onInteractOutside(second);
    assert.equal(second.defaultPrevented, false);
    app.close(); assert.equal(listeners.size, 0);
  } finally { env.close(); }
});

test("设备首字匹配打开菜单后仍高亮匹配项，Escape不改已选设备", () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  globalThis.document = { body: {} };
  globalThis.window = { setTimeout: () => 1, clearTimeout() {} };
  const app = componentRuntime("src/components/SettingsListSelect.tsx");
  const changes = [];
  const props = { ariaLabel: "设备", value: "default", options: [
    { value: "default", label: "跟随系统默认设备" }, { value: "usb", label: "USB 声卡" },
  ], onChange: (value) => changes.push(value) };
  try {
    let tree = app.render("SettingsListSelect", props);
    findElement(tree, (node) => node.props?.role === "combobox").props.onKeyDown(keyEvent("u"));
    tree = app.render("SettingsListSelect", props);
    const usb = findElement(tree, (node) => node.props?.role === "option" && node.props.children[0].props.children === "USB 声卡");
    assert.match(usb.props.className, /is-highlighted/);
    const imeEscape = keyEvent("Escape", { nativeEvent: { isComposing: true } });
    findElement(tree, (node) => node.props?.role === "combobox").props.onKeyDown(imeEscape);
    tree = app.render("SettingsListSelect", props);
    assert.ok(findElement(tree, (node) => node.props?.role === "listbox"), "输入法组合期间Escape不能关闭设备菜单");
    props.options = [...props.options, { value: "new", label: "新设备" }];
    tree = app.render("SettingsListSelect", props);
    assert.ok(findElement(tree, (node) => node.props?.role === "option" && node.props.children[0].props.children === "新设备"));
    findElement(tree, (node) => node.props?.role === "combobox").props.onKeyDown(keyEvent("Escape"));
    assert.equal(findElement(app.render("SettingsListSelect", props), (node) => node.props?.role === "listbox"), null);
    assert.deepEqual(changes, []);
    props.value = "missing";
    const unavailable = findElement(app.render("SettingsListSelect", props), (node) => node.props?.role === "combobox");
    assert.equal(unavailable.props.title, "missing");
    assert.equal(unavailable.props.children[0].props.children, "设备不可用");
  } finally { app.close(); globalThis.window = savedWindow; globalThis.document = savedDocument; }
});

for (const [path, name, exports, makeProps, ports] of [
  ["ArchiveCoverThumbnail", "ArchiveCoverThumbnail", [], (url) => ({ url, alt: "封面", size: "session-list" }), {}],
  ["ConnectBar", "Avatar", ["Avatar"], (face) => ({ face, name: "主播" }), {}],
  ["Sidebar", "UserBadge", ["UserBadge"], () => ({}), { "../stores/session": { useSession: (select) => select({ session: { face: globalThis.__task6Face, uname: "用户", mid: 1 }, logout() {} }) } }],
]) {
  test(`${name}旧图片失败后，新URL重新显示图片`, () => {
    const app = componentRuntime(`src/components/${path}.tsx`, ports, exports);
    globalThis.__task6Face = "old.png";
    try {
      const image = findElement(app.render(name, makeProps("old.png")), (node) => node.type === "img");
      image.props.onError();
      assert.equal(findElement(app.render(name, makeProps("old.png")), (node) => node.type === "img"), null);
      globalThis.__task6Face = "new.png";
      const next = findElement(app.render(name, makeProps("new.png")), (node) => node.type === "img");
      assert.equal(next?.props.src, "new.png");
    } finally { app.close(); delete globalThis.__task6Face; }
  });
}

for (const [label, flush, missingSnapshots, expected, absent] of [
  ["仅有历史异常", { failed: 0, pending: 0, droppedRecords: 0, writeFailures: 3 }, [], /历史.*3/, /未完全写入|待写 0/],
  ["当前写入失败", { failed: 1, pending: 0, droppedRecords: 0, writeFailures: 3 }, [], /未完全写入.*写入失败 1/, null],
  ["仍有待写记录", { failed: 0, pending: 2, droppedRecords: 0, writeFailures: 0 }, [], /待写 2 条/, /历史/],
  ["存在丢弃记录", { failed: 0, pending: 0, droppedRecords: 4, writeFailures: 0 }, [], /丢弃 4 条/, /历史/],
  ["快照缺失", { failed: 0, pending: 0, droppedRecords: 0, writeFailures: 0 }, ["事件样式"], /快照缺失：事件样式/, /未完全写入|历史/],
  ["写入正常", { failed: 0, pending: 0, droppedRecords: 0, writeFailures: 0 }, [], /诊断包已保存/, /未完全写入|历史|快照缺失/],
]) test(`诊断导出提示区分${label}`, async () => {
  const savedWindow = globalThis.window;
  globalThis.window = { setTimeout: () => 1, clearTimeout() {} };
  const app = componentRuntime("src/components/DiagnosticSettings.tsx", {
    "@tauri-apps/plugin-dialog": { save: async () => "test.zip" },
    "../diagnostics/exportFileName.ts": { buildDiagnosticExportFileName: () => "test.zip", getDiagnosticExportId: () => "test" },
    "../diagnostics/exportProgress.ts": exportProgress,
  });
  const props = { status: null, markers: [], onExportStateChange() {}, onExport: async () => ({ outputPath: "test.zip", missingSnapshots, flush }) };
  try {
    const tree = app.render("DiagnosticSettings", props);
    await findElement(tree, (node) => node.type === "button" && node.props.children === "生成24小时诊断包").props.onClick();
    await new Promise((resolve) => setImmediate(resolve));
    const notice = findElement(app.render("DiagnosticSettings", props), (node) => node.props?.role === "status");
    assert.match(notice.props.children, expected);
    if (absent) assert.doesNotMatch(notice.props.children, absent);
    assert.match(notice.props.className, label === "写入正常" ? /border-success/ : /border-warning/);
  } finally { app.close(); globalThis.window = savedWindow; }
});
