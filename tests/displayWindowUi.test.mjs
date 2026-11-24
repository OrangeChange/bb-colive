import { readUiSource } from "./helpers/readUiSource.mjs";
import { readApplicationSources } from "./helpers/applicationSources.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) => readUiSource(`${root}/${relativePath}`, "utf8");

test("副窗口只依赖无副作用的事件通道定义，不加载主窗口桥接生命周期", () => {
  const channelsPath = `${root}/src/windows/eventWindowChannels.ts`;
  assert.equal(existsSync(channelsPath), true);
  const floating = read("src/windows/FloatingEventWindow.tsx");
  const channels = read("src/windows/eventWindowChannels.ts");
  assert.match(floating, /from\s+["']\.\/eventWindowChannels["']/);
  assert.doesNotMatch(floating, /from\s+["']\.\/(?:displayBridge|giftBridge)["']/);
  assert.match(channels, /DISPLAY_EVENT_NAME\s*=\s*["']display:danmu["']/);
  assert.match(channels, /GIFT_EVENT_NAME\s*=\s*["']gift:events["']/);
  assert.doesNotMatch(channels, /WebviewWindow|listen\(|import\.meta\.hot/);
});

test("显示桥接定义独立窗口和 ready 事件", () => {
  const bridgePath = `${root}/src/windows/displayBridge.ts`;
  assert.equal(existsSync(bridgePath), true);
  const source = read("src/windows/displayBridge.ts");
  const channels = read("src/windows/eventWindowChannels.ts");
  assert.match(channels, /DISPLAY_WINDOW_LABEL\s*=\s*["']display["']/);
  assert.match(channels, /display:ready/);
  assert.match(channels, /DISPLAY_READY_REQUEST_EVENT\s*=\s*["']display:ready-request["']/);
  assert.match(channels, /DISPLAY_READY_ACK_EVENT\s*=\s*["']display:ready-ack["']/);
  assert.match(source, /emitTo\(DISPLAY_WINDOW_LABEL, DISPLAY_EVENT_NAME/);
});

test("显示桥接可以对复用窗口重复发起 ready 握手并清理投递失败的原生窗口", () => {
  const source = read("src/windows/displayBridge.ts");
  const floating = read("src/windows/FloatingEventWindow.tsx");
  assert.match(source, /function requestDisplayReady\(target: WebviewWindow\)/);
  assert.match(source, /if \(!session\.ready\) requestDisplayReady\(existing\)/);
  assert.match(source, /emitTo\(DISPLAY_WINDOW_LABEL, DISPLAY_READY_REQUEST_EVENT, getDisplayRoomState\(\)\)/);
  assert.match(source, /void window\.close\(\)\.catch/);
  assert.match(floating, /listen<EventWindowRoomStatePayload>\(config\.readyRequestEvent/);
  assert.match(floating, /applyRoomState\(event\.payload\)/);
  assert.match(source, /emitTo\(DISPLAY_WINDOW_LABEL, DISPLAY_READY_ACK_EVENT\)/);
  assert.match(floating, /emitTo\("main", config\.readyEvent,/);
  assert.match(floating, /startReadyRetry\(\)/);
  const listenIndex = source.indexOf("listen(DISPLAY_READY_EVENT");
  const staleIndex = source.indexOf("if (firstConsumer) await closeStaleDisplayWindow()");
  assert.ok(listenIndex >= 0 && staleIndex > listenIndex, "必须先注册 ready 监听，再清理遗留窗口");
});

test("弹幕窗 ready 时先同步偏好再释放待发事件", () => {
  const source = read("src/windows/displayBridge.ts");
  const readyStart = source.indexOf("async function handleDisplayReady");
  const readyEnd = source.indexOf("function requestDisplayReady", readyStart);
  const readySource = source.slice(readyStart, readyEnd);
  const preferenceIndex = readySource.indexOf("await sendDisplayWindowPreferences()");
  const readyIndex = readySource.indexOf("const pending = markDisplayReady(session)");

  assert.ok(preferenceIndex >= 0, "ready 握手必须等待偏好设置发送");
  assert.ok(readyIndex >= 0, "ready 握手必须取得待发事件");
  assert.ok(preferenceIndex < readyIndex, "偏好设置必须先于释放待发事件，避免使用旧合并设置");
});

test("主连接只在去重后追加事件时投递给弹幕窗", () => {
  const source = read("src/stores/connection.ts");
  const flushStart = source.indexOf("const flush = () =>");
  const onEventStart = source.indexOf("const onEvent", flushStart);
  const flushSource = source.slice(flushStart, onEventStart);
  assert.match(flushSource, /eventDelivery\.append\(patched\)/);
  assert.match(flushSource, /next\.push\(patched\)[\s\S]*eventDelivery\.append\(patched\)/);
  assert.doesNotMatch(source.slice(onEventStart), /publishDisplayEvent/);
});

test("主窗口启动时建立显示桥接并在卸载时清理", () => {
  const source = readApplicationSources();
  assert.match(source, /startDisplayBridge\(\)/);
  assert.match(source, /closeDisplayBridge\(\)/);
  assert.match(source, /isDisplayWindowOpen\(\)/);
  assert.match(source, /subscribeDisplayWindowState\(/);
});

test("主入口注册弹幕窗路由", () => {
  const source = read("src/main.tsx");
  assert.match(source, /await import\(["']\.\/windows\/FloatingEventWindow["']\)/);
  assert.match(source, /isEventWindowKind\(windowType\)/);
  assert.match(source, /Component\s*=\s*\(\)\s*=>\s*<FloatingEventWindow\s+kind=\{windowType\}/);
});

test("弹幕窗监听事件并在关闭时清空自己的缓存", () => {
  const displayPath = `${root}/src/windows/FloatingEventWindow.tsx`;
  assert.equal(existsSync(displayPath), true);
  const source = read("src/windows/FloatingEventWindow.tsx");
  assert.match(source, /eventName: DISPLAY_EVENT_NAME/);
  assert.match(source, /listen<EventWindowEvent \| EventWindowEvent\[\]>\(config\.eventName/);
  assert.match(source, /DISPLAY_ROOM_CHANGED_EVENT/);
  assert.match(source, /roomChangedEvent: DISPLAY_ROOM_CHANGED_EVENT/);
  assert.match(source, /listen<EventWindowRoomStatePayload>\(config\.roomChangedEvent/);
  assert.match(source, /emitTo\("main", config\.readyEvent, activeRoomState/);
  assert.match(source, /setEvents\(\[\]\)/);
  assert.doesNotMatch(source, /等待现场事件/);
  assert.match(source, /role="log"/);
  assert.match(source, /EventRow/);
});

test("显示桥接按真实房间切换清空显示缓存，但断开与同房重连不清空", () => {
  const bridge = read("src/windows/displayBridge.ts");
  const channels = read("src/windows/eventWindowChannels.ts");
  const connection = read("src/stores/connection.ts");
  assert.match(channels, /DISPLAY_ROOM_CHANGED_EVENT\s*=\s*["']display:room-changed["']/);
  assert.match(bridge, /export function switchDisplayRoom\(roomId: number \| null\)/);
  assert.match(bridge, /switchDisplayRoomSession\(session, roomId\)/);
  assert.match(
    connection,
    /if \(target\) \{[\s\S]*eventDelivery\.switchRoom\(target\.realRoomId\)/,
  );
  assert.match(connection, /eventDelivery\.switchRoom\(state\.roomId\)/);
  assert.match(read("src/runtime/liveEventDelivery.ts"), /switchDisplayRoom\(roomId\)/);
  const disconnectStart = connection.indexOf('disconnect: (reason = "manual-disconnect") => {', connection.indexOf("export const useConnection"));
  assert.ok(disconnectStart >= 0);
  assert.doesNotMatch(connection.slice(disconnectStart), /switchDisplayRoom/);
});

test("弹幕窗入口使用统一短名称并提供可操作的开关按钮", () => {
  const source = read("src/components/Sidebar.tsx");
  const buttonStart = source.indexOf('aria-label={displayOpen ? "关闭弹幕窗" : "打开弹幕窗"}');
  assert.ok(buttonStart >= 0);
  const buttonSource = source.slice(Math.max(0, buttonStart - 360), buttonStart + 420);
  assert.match(buttonSource, /onClick=\{handleDisplayButtonClick\}/);
  assert.match(buttonSource, /aria-pressed=\{displayOpen\}/);
  assert.match(buttonSource, /displayOpen \? btnOn : btnIdle/);
  assert.doesNotMatch(source, /弹幕显示窗/);
});

test("弹幕窗和礼物窗使用语义化静态图标", () => {
  const source = read("src/components/Sidebar.tsx");
  assert.match(source, /function IconChatWindow\(\)/);
  assert.match(source, /function IconGiftBox\(\)/);
  assert.match(source, /<IconChatWindow \/>/);
  assert.match(source, /<IconGiftBox \/>/);
  assert.match(source, /<LucideMessagesSquare className="size-5"/);
  assert.match(source, /<LucideGift className="size-5"/);
  assert.doesNotMatch(source, /function IconMonitor\(\)/);
  assert.doesNotMatch(source, /function IconSparkle\(\)/);
});

test("现场保留实时广播图标，回看使用历史时钟图标", () => {
  const source = read("src/components/Sidebar.tsx");
  const historyStart = source.indexOf("function IconHistory() {");
  const historyEnd = source.indexOf("function IconChatWindow()", historyStart);
  assert.ok(historyStart >= 0);
  assert.ok(historyEnd > historyStart);
  const historySource = source.slice(historyStart, historyEnd);
  assert.match(historySource, /<LucideHistory className="size-5"/);
  assert.match(source, /<LucideRadio className="size-5"/);
  assert.match(source, /<IconBroadcast \/>/);
  assert.match(source, /<IconHistory \/>/);
});

test("主窗口具备创建并控制弹幕窗所需的最小权限", () => {
  const source = read("src-tauri/capabilities/default.json");
  for (const permission of [
    "core:webview:allow-create-webview-window",
    "core:window:allow-get-all-windows",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "core:window:allow-center",
  ]) {
    assert.match(source, new RegExp(`\"${permission}\"`));
  }
});

test("显示桥接能关闭窗口并抵抗 StrictMode 的异步清理", () => {
  const source = read("src/windows/displayBridge.ts");
  assert.match(source, /export async function closeDisplayWindow\(\)/);
  assert.match(source, /let bridgeConsumers\s*=\s*0/);
  assert.match(source, /bridgeConsumers\s*\+=\s*1/);
  assert.match(source, /bridgeConsumers\s*-=?\s*1/);
});

test("主窗口生命周期结束时关闭弹幕窗并在新生命周期清理遗留窗口", () => {
  const source = read("src/windows/displayBridge.ts");
  const app = readApplicationSources();

  assert.match(source, /async function closeStaleDisplayWindow\(\)/);
  assert.match(source, /WebviewWindow\.getByLabel\(DISPLAY_WINDOW_LABEL\)/);
  assert.match(source, /if \(firstConsumer\) await closeStaleDisplayWindow\(\)/);
  assert.match(source, /if \(bridgeCloseRequested\) void closeDisplayWindow\(\)/);
  assert.match(source, /hot\.on\("vite:beforeUpdate", closeForHotUpdate\)/);
  assert.match(source, /import\.meta\.hot\?\.dispose/);
  assert.match(app, /addEventListener\("beforeunload", closeDisplayBridge\)/);
  assert.match(app, /removeEventListener\("beforeunload", closeDisplayBridge\)/);
  const closeBridge = source.slice(source.indexOf("export function closeDisplayBridge"));
  assert.match(closeBridge, /void closeDisplayWindow\(\)/);
});

test("锁定偏好跨主窗口重载保存且弹幕窗挂载不再强制解锁", () => {
  const bridge = read("src/windows/displayBridge.ts");
  const display = read("src/windows/FloatingEventWindow.tsx");

  assert.match(bridge, /DISPLAY_LOCK_STORAGE_KEY/);
  assert.match(bridge, /localStorage\.getItem\(DISPLAY_LOCK_STORAGE_KEY\)/);
  assert.match(bridge, /localStorage\.setItem\(DISPLAY_LOCK_STORAGE_KEY/);
  assert.match(bridge, /let displayWindowLocked = readDisplayWindowLocked\(\)/);
  const mountSetup = display.slice(
    display.indexOf("void Promise.all(["),
    display.indexOf("]).then(restoreAndListen)") + 2,
  );
  assert.doesNotMatch(mountSetup, /setIgnoreCursorEvents\(false\)/);
  assert.doesNotMatch(mountSetup, /setResizable\(true\)/);
});

test("弹幕窗使用无装饰透明窗口，并以独立透明表面渲染", () => {
  const bridge = read("src/windows/displayBridge.ts");
  const display = read("src/windows/FloatingEventWindow.tsx");
  const main = read("src/main.tsx");
  const css = read("src/App.css");
  assert.match(bridge, /decorations:\s*false/);
  assert.match(bridge, /transparent:\s*true/);
  assert.match(bridge, /shadow:\s*false/);
  assert.match(display, /windowClass: "display-window"/);
  assert.match(display, /className=\{`\$\{config\.windowClass\}/);
  assert.doesNotMatch(display, /display-window[^\n]*bg-bg/);
  assert.match(main, /dataset\.window\s*=\s*["']display["']/);
  assert.match(css, /html\[data-window="display"\][\s\S]*background:\s*transparent/);
  assert.match(css, /\.display-window[\s\S]*color-mix/);
});

test("弹幕窗支持历史阅读并隐藏滚动条", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  const css = read("src/App.css");
  assert.match(source, /display-window-log/);
  assert.match(source, /logRef/);
  assert.match(source, /tabIndex=\{0\}/);
  assert.match(source, /overflow-y-auto/);
  assert.match(source, /useLocalFeedReading\(logNode/);
  assert.doesNotMatch(source, /display-window-log[^\n]*overflow-hidden/);
  assert.match(css, /\.display-window-log[\s\S]*scrollbar-width:\s*none/);
  assert.match(css, /\.display-window-log[\s\S]*::-webkit-scrollbar[\s\S]*display:\s*none/);
});

test("副窗口接收事件显示偏好并把字号传给事件行", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  assert.match(source, /EVENT_WINDOW_PREFERENCES_EVENT/);
  assert.match(source, /setWindowPreferences/);
  assert.match(source, /displayPreferences=\{windowPreferences\.display\}/);
  assert.match(source, /eventFontSize=\{windowPreferences\.fontSize\}/);
});

test("副窗口事件按进入缓存时间定时移除，主窗口不参与此逻辑", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  assert.match(source, /receivedAt/);
  assert.match(source, /pruneExpiredEvents/);
  assert.match(source, /eventExpiry\.enabled/);
  assert.match(source, /Date\.now\(\)/);
  assert.match(source, /setInterval/);
});

test("弹幕窗使用独立的一级/二级事件筛选，并按显示时过滤", () => {
  const floating = read("src/windows/FloatingEventWindow.tsx");
  const preferences = read("src/windows/eventWindowPreferences.ts");
  assert.match(preferences, /displayFilters: DisplayEventFilters/);
  assert.match(floating, /isDisplayWindowEventVisible\(event, windowPreferences\.displayFilters, windowPreferences\.display\.showPhoneNotVerified\)/);
  assert.match(floating, /windowPreferences\.display\.onlyGuardEntry/);
});

test("副窗口定时移除事件前先播放退出过渡", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  const css = read("src/App.css");
  assert.match(source, /removingEvents/);
  assert.match(source, /setTimeout/);
  assert.match(source, /display-window-event-removing/);
  assert.match(css, /\.display-window-event-removing \.event-row \{[^}]*transition-duration:/);
  assert.match(css, /\.display-window-event-removing \.event-row\.event-animation-fade \{[^}]*opacity:\s*0/);
  assert.match(source, /getEventAnimationExitDuration/);
});

test("弹幕窗滚动容器四边固定留白且事件列表不重复增加边距", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  const css = read("src/App.css");
  assert.match(source, /display-window-event-list/);
  assert.doesNotMatch(source, /display-window-log[^\n]*(?:p-2|px-3|pb-3|pt-3)/);
  assert.match(css, /\.display-window-log\s*,[\s\S]*\.gift-window-log\s*\{[\s\S]*margin:\s*8px/);
  assert.match(css, /\.display-window-event-list\s*,[\s\S]*\.gift-window-event-list\s*\{[\s\S]*gap:\s*0[;\s][\s\S]*padding:\s*0/);
  assert.match(css, /\.display-window\s+\.event-row\s*,[\s\S]*padding:\s*8px/);
});

test("两个副窗口的事件间距通过占位层共享显示设置", () => {
  const display = read("src/windows/FloatingEventWindow.tsx");
  const floating = read("src/windows/FloatingEventWindow.tsx");
  for (const source of [display, floating]) {
    assert.match(source, /event-row-slot/);
    assert.match(source, /eventSpacing/);
    assert.match(source, /eventAnimationPreset/);
  }
});

test("副窗口将事件内边距和动画预设传给事件行，并按预设退出", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  assert.match(source, /eventPadding/);
  assert.match(source, /eventAnimationPreset/);
  assert.match(source, /eventAnimationDurationMs/);
  assert.match(source, /getEventAnimationExitDuration/);
});

test("副窗口按窗口设置显示事件时间，主事件行默认保留时间", () => {
  const display = read("src/windows/FloatingEventWindow.tsx");
  const row = read("src/components/EventRow.tsx");
  assert.match(display, /<EventRow[\s\S]*liveLayout[\s\S]*showTime=\{windowPreferences\.display\.showTimestamp === true\}/);
  assert.match(row, /showTime\s*=\s*true/);
  assert.match(row, /!archiveLayout && showTime &&/);
});

test("弹幕窗未锁定时可通过拖动层移动，并提供放大的斜角缩放热区", () => {
  const source = read("src/windows/FloatingEventWindow.tsx");
  assert.match(source, /display-window-drag-layer/);
  assert.match(source, /data-tauri-drag-region/);
  assert.match(source, /startDragging\(\)/);
  assert.match(source, /onMouseDown=\{\(event\) =>/);
  assert.match(source, /display-window-resize-handle/);
  assert.match(source, /startResizeDragging\(direction\)/);
  assert.doesNotMatch(source, /display-window-lock/);
});

test("主窗口提供弹幕窗锁定入口，锁定时弹幕窗启用原生鼠标穿透", () => {
  const bridge = read("src/windows/displayBridge.ts");
  const sidebar = read("src/components/Sidebar.tsx");
  const app = readApplicationSources();
  const display = read("src/windows/FloatingEventWindow.tsx");
  const css = read("src/App.css");
  assert.match(bridge, /DISPLAY_LOCK_EVENT/);
  assert.match(bridge, /emitTo\(DISPLAY_WINDOW_LABEL, DISPLAY_LOCK_EVENT/);
  assert.match(sidebar, /onToggleDisplayLock/);
  assert.match(sidebar, /sidebar-display-controls/);
  assert.match(sidebar, /aria-pressed=\{displayLocked\}/);
  assert.match(app, /toggleDisplayWindowLock/);
  assert.match(display, /DISPLAY_LOCK_EVENT/);
  assert.match(display, /setIgnoreCursorEvents\(nextLocked\)/);
  assert.match(display, /DISPLAY_LOCK_STATE_EVENT/);
  assert.match(css, /\.sidebar-display-lock[\s\S]*cursor:\s*pointer/);
});

test("弹幕窗扩展功能在悬停时使用不透明背景条并保持锁定按钮可读", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const css = read("src/App.css");
  assert.match(sidebar, /sidebar-display-controls[^\n]*has-lock/);
  assert.match(css, /\.sidebar-display-controls\.has-lock::before[\s\S]*background:\s*var\(--surface\)/);
  assert.match(css, /\.sidebar-display-controls\.has-lock::before[\s\S]*border-radius:/);
  assert.match(css, /\.sidebar-display-controls\.has-lock::before[\s\S]*z-index:\s*0/);
  assert.match(css, /\.sidebar-display-controls\.has-lock::before[\s\S]*pointer-events:\s*auto/);
  assert.match(css, /\.sidebar-display-controls\.has-lock\.is-revealed::before/);
  assert.match(css, /\.sidebar-display-controls\.has-lock\s*>\s*button:first-child[\s\S]*position:\s*relative[\s\S]*z-index:\s*1/);
  assert.match(css, /\.sidebar-display-lock[\s\S]*position:\s*absolute/);
  assert.match(css, /\.sidebar-display-controls\.has-lock\.is-revealed[\s\S]*\.sidebar-display-lock[^\{]*\{[\s\S]*background:\s*var\(--surface-raised\)/);
});

test("弹幕窗锁定按钮使用懒启动、延迟收起，并完全离开左侧栏", () => {
  const sidebar = read("src/components/Sidebar.tsx");
  const css = read("src/App.css");
  assert.match(sidebar, /DISPLAY_LOCK_HOVER_DELAY_MS\s*=\s*2000/);
  assert.match(sidebar, /DISPLAY_LOCK_COLLAPSE_DELAY_MS\s*=\s*220/);
  assert.match(sidebar, /setTimeout\([\s\S]*DISPLAY_LOCK_HOVER_DELAY_MS/);
  assert.match(sidebar, /handleDisplayButtonClick/);
  assert.match(sidebar, /onClick=\{handleDisplayButtonClick\}/);
  assert.match(sidebar, /displayOpenRef/);
  assert.match(sidebar, /onMouseEnter=/);
  assert.match(sidebar, /handleDisplayControlsMouseLeave/);
  assert.match(sidebar, /onMouseLeave=\{handleDisplayControlsMouseLeave\}/);
  assert.match(sidebar, /if \(!displayControlsHoveredRef\.current\)\s+scheduleDisplayControlsCollapse\(\)/);
  assert.match(sidebar, /onFocusCapture=/);
  assert.match(sidebar, /onBlurCapture=/);
  assert.match(sidebar, /is-revealed/);
  assert.match(css, /\.sidebar-display-controls\.has-lock\.is-revealed::before/);
  assert.match(css, /\.sidebar-display-lock[\s\S]*left:\s*calc\(100% \+ 20px\)/);
  assert.match(css, /\.sidebar-display-controls\.has-lock::before[\s\S]*width:\s*112px/);
});

test("弹幕窗关闭后保留锁定偏好，并在复用窗口时重新下发", () => {
  const bridge = read("src/windows/displayBridge.ts");
  assert.doesNotMatch(bridge, /if \(!nextOpen\) setDisplayWindowLocked\(false\)/);
  const existingStart = bridge.indexOf("if (existing)", bridge.indexOf("export async function openDisplayWindow"));
  const existingEnd = bridge.indexOf("\n  }\n\n  openDisplaySession(session, currentRoomId)", existingStart);
  assert.ok(existingStart >= 0 && existingEnd > existingStart);
  assert.match(bridge.slice(existingStart, existingEnd), /sendDisplayLockState\(\)/);
});

test("弹幕窗默认始终置顶且权限允许鼠标穿透、斜角缩放和几何恢复", () => {
  const bridge = read("src/windows/displayBridge.ts");
  const display = read("src/windows/FloatingEventWindow.tsx");
  const capability = read("src-tauri/capabilities/display-window.json");
  assert.match(bridge, /alwaysOnTop:\s*true/);
  assert.match(display, /setAlwaysOnTop\(true\)/);
  assert.match(display, /outerPosition\(\)/);
  assert.match(display, /onMoved\(/);
  assert.match(display, /onResized\(/);
  assert.match(display, /geometryRef/);
  assert.match(display, /onCloseRequested\(/);
  assert.match(display, /payload: position/);
  assert.match(display, /payload: size/);
  assert.match(display, /innerSize\(\)/);
  assert.match(display, /appData\.ts/);
  assert.match(display, /store\.set/);
  assert.match(capability, /store:default/);
  assert.match(capability, /core:window:allow-start-dragging/);
  assert.match(capability, /core:window:allow-start-resize-dragging/);
  assert.match(capability, /core:window:allow-set-ignore-cursor-events/);
  assert.match(capability, /core:window:allow-outer-position/);
  assert.match(capability, /core:window:allow-outer-size/);
  assert.match(capability, /core:window:allow-set-position/);
  assert.match(capability, /core:window:allow-set-size/);
  assert.match(capability, /core:window:allow-set-resizable/);
  assert.match(capability, /core:window:allow-set-always-on-top/);
  assert.match(capability, /core:window:allow-set-maximizable/);
  assert.match(capability, /core:window:allow-destroy/);
});

test("弹幕窗禁止最大化，避免无边框拖动触发系统最大化", () => {
  const bridge = read("src/windows/displayBridge.ts");
  const display = read("src/windows/FloatingEventWindow.tsx");
  assert.match(bridge, /maximizable:\s*false/);
  assert.match(display, /setMaximizable\(false\)/);
});

test("副窗口表面使用当前明暗与材质，纯色和透明没有玻璃装饰", () => {
  const css = read("src/App.css");
  const display = read("src/windows/FloatingEventWindow.tsx");
  assert.match(display, /resolveWindowSurfaceColor/);
  assert.match(display, /data-material=\{windowPreferences.appearance.material\}/);
  assert.doesNotMatch(display, /backdrop-blur-lg|backdrop-saturate/);
  assert.doesNotMatch(css, /feTurbulence/);
  assert.match(css, /\[data-material="glass"\]\s*\{\s*background: transparent;\s*box-shadow: none;/);
  assert.doesNotMatch(css, /\[data-material="glass"\]::(?:before|after)/);
  assert.match(css, /\[data-material="transparent"\][\s\S]*background: transparent/);
  assert.match(css, /@media \(forced-colors: active\)/);
});
