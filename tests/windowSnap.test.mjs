import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const root = new URL("../", import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), "utf8");
test("前端桥接不再异步回写窗口几何", () => {
  const displayBridge = read("src/windows/displayBridge.ts");
  const giftBridge = read("src/windows/giftBridge.ts");

  for (const source of [displayBridge, giftBridge]) {
    assert.doesNotMatch(source, /snapMovedWindow/);
    assert.doesNotMatch(source, /snapResizedWindow/);
    assert.doesNotMatch(source, /createLatestSnapScheduler/);
  }
});

test("通用副窗口在原生拖拽前注册同步吸附处理器", () => {
  const eventWindow = read("src/windows/FloatingEventWindow.tsx");
  const rust = read("src-tauri/src/window_snap.rs");

  assert.match(eventWindow, /invoke\(["']install_floating_window_snap["']\)/);
  assert.match(rust, /WM_MOVING/);
  assert.match(rust, /WM_SIZING/);
  assert.match(rust, /SetWindowSubclass/);
});

test("原生吸附使用固定像素，不按DPI缩放判定距离", () => {
  const rust = read("src-tauri/src/window_snap.rs");
  const cargo = read("src-tauri/Cargo.toml");

  assert.doesNotMatch(rust, /GetDpiForWindow|scaled_distance/);
  assert.doesNotMatch(cargo, /Win32_UI_HiDpi/);
});

test("两个副窗口入口复用通用浮动事件窗口", () => {
  const main = read("src/main.tsx");
  const gift = read("src/windows/GiftWindow.tsx");

  assert.match(main, /FloatingEventWindow/);
  assert.doesNotMatch(main, /from ["']\.\/windows\/DisplayWindow["']/);
  assert.match(gift, /FloatingEventWindow/);
});

test("副窗口提供八方向原生拉伸热区", () => {
  const eventWindow = read("src/windows/FloatingEventWindow.tsx");

  assert.match(eventWindow, /startResizeDragging\(direction\)/);
  assert.match(eventWindow, /NorthEast/);
  assert.match(eventWindow, /SouthWest/);
});
