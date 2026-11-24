import { readUiSourceAsync } from "./helpers/readUiSource.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

async function read(path) {
  try {
    return await readUiSourceAsync(new URL(`../${path}`, import.meta.url), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

test("可取消浮层Escape关闭并返回焦点，忙碌阶段保持打开", async () => {
  const { bindUiDismissableLayer } = await import("../src/components/ui/layer.ts");
  assert.equal(typeof bindUiDismissableLayer, "function");
  const savedDocument = globalThis.document;
  const listeners = new Map();
  let focus = 0, closes = 0, busy = false;
  const trigger = { focus() { focus++; } };
  const surface = { contains: () => false, querySelector: () => null, querySelectorAll: () => [], focus() {} };
  globalThis.document = { activeElement: trigger, querySelector: () => null,
    addEventListener(name, fn, capture) { listeners.set(`${name}:${Boolean(capture)}`, fn); },
    removeEventListener(name, fn, capture) { listeners.delete(`${name}:${Boolean(capture)}`); } };
  try {
    const dispose = bindUiDismissableLayer(surface, () => closes++, { canClose: () => !busy });
    const escape = () => { const event = { key: "Escape", preventDefault() {} }; listeners.get("keydown:true")?.(event); listeners.get("keydown:false")?.(event); };
    busy = true; escape(); assert.equal(closes, 0);
    busy = false; escape(); assert.equal(closes, 1);
    dispose(); assert.equal(focus, 1); assert.equal(listeners.size, 0);
  } finally { globalThis.document = savedDocument; }
});

test("子选择器打开时第一次Escape不关闭父层，外部点击也只处理子层", async () => {
  const { bindUiDismissableLayer } = await import("../src/components/ui/layer.ts");
  assert.equal(typeof bindUiDismissableLayer, "function");
  const savedDocument = globalThis.document;
  const listeners = new Map();
  let childOpen = true, closes = 0;
  globalThis.document = { activeElement: null, querySelector: () => childOpen ? {} : null,
    addEventListener(name, fn, capture) { listeners.set(`${name}:${Boolean(capture)}`, fn); },
    removeEventListener(name, fn, capture) { listeners.delete(`${name}:${Boolean(capture)}`); } };
  try {
    const dispose = bindUiDismissableLayer({ contains: () => false, querySelector: () => null }, () => closes++);
    listeners.get("pointerdown:true")({ target: {} }); assert.equal(closes, 0);
    const event = { key: "Escape", preventDefault() {} };
    listeners.get("keydown:true")(event);
    childOpen = false;
    listeners.get("keydown:false")(event); assert.equal(closes, 0);
    const next = { key: "Escape", preventDefault() {} };
    listeners.get("keydown:true")(next); listeners.get("keydown:false")(next);
    assert.equal(closes, 1); dispose();
  } finally { globalThis.document = savedDocument; }
});

test("共享选择器使用 Radix 并保留空值语义", async () => {
  const pkg = JSON.parse(await read("package.json"));
  const select = await read("src/components/ui/Select.tsx");

  assert.ok(pkg.dependencies["@radix-ui/react-select"]);
  assert.match(select, /@radix-ui\/react-select/);
  assert.match(select, /EMPTY_VALUE/);
  assert.match(select, /data-size/);
  assert.match(select, /aria-label/);
  assert.match(select, /open\?: boolean/);
  assert.match(select, /open=\{open\}/);
});

test("共享选择器把选项样式应用到实际可见文字", async () => {
  const select = await read("src/components/ui/Select.tsx");

  assert.match(select, /<SelectPrimitive\.ItemText data-ui-select-item-text="true">\s*<span className="ui-select-item-label" style=\{option\.style\}>\{option\.label\}<\/span>\s*<\/SelectPrimitive\.ItemText>/);
});

test("组合输入暴露 listbox 关系并使用项目弹层标记", async () => {
  const combobox = await read("src/components/ui/Combobox.tsx");

  assert.match(combobox, /@radix-ui\/react-popover/);
  assert.match(combobox, /role="combobox"/);
  assert.match(combobox, /aria-activedescendant/);
  assert.match(combobox, /role="listbox"/);
  assert.match(combobox, /role="option"/);
  assert.match(combobox, /data-ui-overlay/);
});

test("最近搜索和关键词建议按组去重并按查询过滤", async () => {
  const { filterComboboxOptions, mergeComboboxOptions } = await import("../src/components/ui/comboboxOptions.ts");
  const options = mergeComboboxOptions(["  这期梗了  ", "关注"], ["关注", "点赞", ""]);

  assert.deepEqual(options.map((option) => `${option.group}:${option.value}`), [
    "recent:这期梗了",
    "recent:关注",
    "suggestion:点赞",
  ]);
  assert.deepEqual(filterComboboxOptions(options, "梗").map((option) => option.value), ["这期梗了"]);
});

test("组合输入键盘高亮在列表边界内移动", async () => {
  const { moveComboboxHighlight } = await import("../src/components/ui/comboboxState.ts");

  assert.equal(moveComboboxHighlight(3, 0, "ArrowUp"), 0);
  assert.equal(moveComboboxHighlight(3, 0, "ArrowDown"), 1);
  assert.equal(moveComboboxHighlight(3, 2, "ArrowDown"), 2);
  assert.equal(moveComboboxHighlight(3, 1, "Home"), 0);
  assert.equal(moveComboboxHighlight(3, 1, "End"), 2);
});

test("共享控件提供碰撞高度、选中态和减少动效样式", async () => {
  const css = await read("src/App.css");

  assert.match(css, /--radix-select-content-available-height/);
  assert.match(css, /--radix-popover-content-available-height/);
  assert.match(css, /ui-select-item\[data-state="checked"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("项目内选择器和组合输入标记为交互浮层", async () => {
  const select = await read("src/components/ui/Select.tsx");
  const combobox = await read("src/components/ui/Combobox.tsx");
  const layer = await read("src/components/ui/layer.ts");

  assert.match(select, /data-ui-overlay/);
  assert.match(combobox, /data-ui-overlay/);
  assert.match(layer, /composedPath/);
});

test("现场和回看筛选不再使用浏览器原生选择器浮层", async () => {
  const files = [
    "src/components/LiveFilterBar.tsx",
    "src/components/ReviewSearchControls.tsx",
    "src/components/ReviewOwnerEventFilters.tsx",
    "src/components/ReviewOwnerSessionFilters.tsx",
    "src/components/ReviewOwnerEventResults.tsx",
  ];
  const sources = await Promise.all(files.map(read));

  for (const source of sources) {
    assert.doesNotMatch(source, /<select\b/);
    assert.doesNotMatch(source, /<datalist\b/);
  }
  assert.match(sources[1], /<UiCombobox/);
  assert.match(sources[2], /<UiCombobox/);
  assert.match(sources[1], /<UiSelect/);
  assert.match(sources[2], /<UiSelect/);
  assert.match(sources[3], /<UiSelect/);
  assert.match(sources[4], /<UiSelect/);
});

test("现场工具按钮和搜索框使用紧凑统一高度", async () => {
  const liveFilterBar = await read("src/components/LiveFilterBar.tsx");
  assert.match(liveFilterBar, /filterButtonBase\s*=\s*"[^"]*h-8/);
  assert.match(liveFilterBar, /<UiSearchInput\b[^>]*aria-label=["']搜索现场事件内容["']/);
  const searchInput = await read("src/components/ui/SearchInput.tsx");
  assert.match(searchInput, /ui-search-field[^`]*\bh-8\b/);
});

test("收藏、档案管理和个性播报复用共享选择控件", async () => {
  const files = [
    "src/components/ReviewFavoritesPanel.tsx",
    "src/components/ReviewArchiveSettings.tsx",
    "src/components/ReviewArchiveManagement.tsx",
    "src/components/PersonalBroadcastPanel.tsx",
  ];
  const sources = await Promise.all(files.map(read));

  for (const source of sources) {
    assert.doesNotMatch(source, /<select\b/);
    assert.doesNotMatch(source, /<datalist\b/);
    assert.match(source, /<(?:UiSelect|SettingsChoiceControl)\b/);
  }
});

test("样式工作区的固定选项使用共享选择器", async () => {
  const source = await read("src/components/ThemeWorkspace.tsx");
  assert.doesNotMatch(source, /<select\b/);
  assert.match(source, /<UiSelect/);
});

test("语音设置和字体下拉复用统一选择器契约", async () => {
  const voicePanel = await read("src/components/VoicePanel.tsx");
  const listSelect = await read("src/components/SettingsListSelect.tsx");
  const settingsPanel = await read("src/components/SettingsPanel.tsx");
  const sharedSelect = await read("src/components/ui/Select.tsx");

  assert.doesNotMatch(voicePanel, /<select\b/);
  assert.match(voicePanel, /<UiSelect/);
  assert.match(listSelect, /role="combobox"/);
  assert.match(listSelect, /role="listbox"/);
  assert.match(listSelect, /aria-selected/);
  assert.match(listSelect, /settings-list-select-menu-check/);
  assert.match(listSelect, /<UiSelect/);
  assert.doesNotMatch(listSelect, /virtualize|useVirtualizer/);
  assert.match(sharedSelect, /<SelectPrimitive\.Content/);
  assert.match(settingsPanel, /from "\.\/SettingsListSelect"/);
  assert.doesNotMatch(settingsPanel, /function SettingsListSelect\(/);
});
