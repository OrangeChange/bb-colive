import { readUiSource } from "./helpers/readUiSource.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { commitNativeThemePublication, CompatibleWindowProjectionRestoreError, detachPublishedNativeThemeTarget, NativeThemePublicationError, publishNativeThemeTarget, PublishedThemeCleanupError, resolveRecoverableThemeId, restoreCompatibleWindowThemeProjection, targetDisplayScaleCss, withNativeThemeDisplayScale } from "../src/themes/nativeThemeRuntime.ts";
import { createThemeBindingRegistry } from "../src/themes/themeBindings.ts";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";

test("保存原生 OBS 配置采用明确传入的缩放", async () => {
  const values = new Map();
  let snapshot;
  let binding;
  const ports = {
    loadRuntimeStore: async () => ({get: async key => values.get(key), set: async (key,value) => values.set(key,value), save: async () => {}}),
    bindings: {load: async () => [{targetId:"obs-one",targetKind:"obs",themeId:"native-default",revision:1,displayScale:1}],bind: async value => {binding=value;}},
    loadObsSnapshot: async () => undefined,
    persistObsSnapshot: async value => {snapshot=value;},
    emitNativeObsSnapshot: async () => {},
    emitPublication: async () => {},
  };
  await publishNativeThemeTarget(createBuiltinNativeTheme("native-default"), "obs-one", "obs", undefined, "24125", ports, 1.25);
  assert.equal(snapshot.displayScale, 1.25);
  assert.equal(binding.displayScale, 1.25);
});

test("现场与副窗口安装并订阅同一份已应用原生主题 CSS", () => {
  const runtime = readUiSource("src/themes/nativeThemeRuntime.ts", "utf8");
  const floating = readUiSource("src/windows/FloatingEventWindow.tsx", "utf8");
  assert.match(runtime, /ACTIVE_NATIVE_THEME_CSS_KEY/);
  assert.match(runtime, /store\.set\(ACTIVE_NATIVE_THEME_CSS_KEY/);
  assert.match(floating, /subscribeNativeThemeTarget/);
});

test("OBS 无正式快照时仍挂载外部 HTML 候选，提交前保留原生输出", () => {
  const source = readUiSource("src/obs/NativeObsRenderer.tsx", "utf8");
  assert.match(source, /resolvePendingExternal[\s\S]*if \(!snapshot && !pendingExternalHtml\)/);
  assert.match(source, /BlivechatExternalHtmlTarget/);
});

test("现场已应用 CSS 只命中真实事件区，不污染主题缩略图", () => {
  const runtime = readUiSource("src/themes/nativeThemeRuntime.ts", "utf8");
  const list = readUiSource("src/components/EventList.tsx", "utf8");
  const thumbnail = readUiSource("src/components/NativeThemeThumbnail.tsx", "utf8");
  assert.match(runtime, /\.theme-surface\.theme-target-live/);
  assert.match(list, /data-native-runtime-target=\{liveLayout \? "live" : undefined\}/);
  assert.doesNotMatch(thumbnail, /data-native-runtime-target/);
});

test("主题草稿不写入已应用主题存储", () => {
  const session = readUiSource("src/themes/themeEditorSession.ts", "utf8");
  assert.doesNotMatch(session, /localStorage/);
  assert.doesNotMatch(session, /applyNativeTheme/);
});

test("现场与副窗口订阅已发布主题修订而不是只在挂载时读取", () => {
  const runtime = readUiSource("src/themes/nativeThemeRuntime.ts", "utf8");
  const app = readUiSource("src/App.tsx", "utf8");
  const floating = readUiSource("src/windows/FloatingEventWindow.tsx", "utf8");
  assert.match(runtime, /subscribeNativeThemeTarget/);
  assert.match(app, /subscribeNativeThemeTarget/);
  assert.match(floating, /subscribeNativeThemeTarget/);
});

test("已发布主题保存完整投影并在订阅启动时恢复", () => {
  const runtime = readUiSource("src/themes/nativeThemeRuntime.ts", "utf8");
  assert.match(runtime, /targetIdProjectionKey/);
  assert.match(runtime, /store\.set\(targetIdProjectionKey\(targetId\), projection\)/);
  assert.match(runtime, /onProjection\?\.\(\{ \.\.\.projection,/);
});

test("副窗口按当前主题目标把投影合并到窗口视觉偏好", () => {
  const floating = readUiSource("src/windows/FloatingEventWindow.tsx", "utf8");
  assert.match(floating, /applyNativeThemeProjectionToWindowPreferences/);
  assert.match(floating, /subscribeNativeThemeTarget\(themeTargetId, "windows", applyThemeProjection\)/);
});

test("时间显示消费主题开关，用户名打码仅用于副窗口与OBS", () => {
  const row = readUiSource("src/components/EventRow.tsx", "utf8");
  const floating = readUiSource("src/windows/FloatingEventWindow.tsx", "utf8");
  const obs = readUiSource("src/obs/ObsOutputView.tsx", "utf8");
  const list = readUiSource("src/components/EventList.tsx", "utf8");
  assert.match(row, /displayName = maskUsername \? maskDisplayName\(originalDisplayName\) : originalDisplayName/);
  assert.match(floating, /showTime=\{windowPreferences\.display\.showTimestamp === true\}/);
  assert.match(floating, /maskUsername=\{windowPreferences\.display\.maskUsername === true\}/);
  assert.match(obs, /showTime=\{snapshot\.display\.showTimestamp\}/);
  assert.match(obs, /maskUsername=\{snapshot\.display\.maskUsername\}/);
  assert.match(list, /showTime=\{!liveLayout \|\| \(eventStyleSettings as EventStyleSettings & \{ display\?: \{ showTimestamp\?: boolean \} \}\)\.display\?\.showTimestamp === true\}/);
  assert.doesNotMatch(list, /maskUsername=/);
});

test("现场、副窗口和 OBS 只在事件内容容器应用各自显示缩放", () => {
  const obs = readUiSource("src/obs/ObsOutputView.tsx", "utf8");
  assert.equal(targetDisplayScaleCss("live", 1.25), "");
  assert.equal(targetDisplayScaleCss("windows", 1.5), ".event-area.window .event-list:not(.compatible-event-list), .event-area.window .sticky-area { zoom: 1.5; }");
  assert.doesNotMatch(targetDisplayScaleCss("live", 1.25), /button|empty|resize|drag/);
  assert.match(obs, /zoom: snapshot\.displayScale/);
});

test("持久化或绑定失败时不会提前切换可见画面", async () => {
  const order = [];
  await assert.rejects(() => commitNativeThemePublication({
    persist: async () => { order.push("persist"); },
    bind: async () => { order.push("bind"); throw new Error("binding failed"); },
    activate: () => { order.push("activate"); },
    rollback: { runtime: async () => { order.push("rollback-runtime"); }, binding: async () => { order.push("rollback-binding"); }, output: async () => { order.push("rollback-output"); } },
  }), /binding failed/);
  assert.deepEqual(order, ["persist", "bind", "rollback-runtime", "rollback-binding", "rollback-output"]);
});

test("发布准备完成后才切换画面", async () => {
  const order = [];
  await commitNativeThemePublication({
    persist: async () => { order.push("persist"); },
    bind: async () => { order.push("bind"); },
    activate: () => { order.push("activate"); },
    rollback: { runtime: async () => { order.push("rollback-runtime"); }, binding: async () => { order.push("rollback-binding"); }, output: async () => { order.push("rollback-output"); } },
  });
  assert.deepEqual(order, ["persist", "bind", "activate"]);
});

test("画面激活失败时回滚已持久化快照和绑定", async () => {
  const order = [];
  await assert.rejects(() => commitNativeThemePublication({
    persist: async () => { order.push("persist"); },
    bind: async () => { order.push("bind"); },
    activate: async () => { order.push("activate"); throw new Error("activate failed"); },
    rollback: { runtime: async () => { order.push("rollback-runtime"); }, binding: async () => { order.push("rollback-binding"); }, output: async () => { order.push("rollback-output"); } },
  }), /activate failed/);
  assert.deepEqual(order, ["persist", "bind", "activate", "rollback-runtime", "rollback-binding", "rollback-output"]);
});

test("原生现场通知失败后恢复旧投影与实际 CSS，单项回滚失败不阻断其余恢复", async () => {
  const oldTheme = createBuiltinNativeTheme("native-default");
  oldTheme.styles.customCss = ".old-live-css{color:red}";
  const nextTheme = structuredClone(oldTheme);
  nextTheme.themeId = "native-next";
  nextTheme.origin = "custom";
  nextTheme.revision = 2;
  nextTheme.styles.customCss = ".next-live-css{color:blue}";
  const oldProjection = { css: ".old-live-css{color:red}", displayScale: 1, settings: {}, display: {}, scheme: "common", visual: {} };
  const values = new Map([
    ["activeCss:target:live", oldProjection.css],
    ["projection:target:live", oldProjection],
    ["activeCss:live", oldProjection.css],
    ["activeCss", oldProjection.css],
  ]);
  const binding = { targetId: "live", targetKind: "live", themeId: oldTheme.themeId, revision: 1, displayScale: 1 };
  const applied = [], installed = [], publications = [];
  let saves = 0;
  const ports = {
    loadRuntimeStore: async () => ({
      get: async key => structuredClone(values.get(key)),
      set: async (key, value) => { values.set(key, structuredClone(value)); },
      delete: async key => { values.delete(key); },
      save: async () => { saves += 1; if (saves === 2) throw new Error("runtime restore failed"); },
    }),
    bindings: {
      load: async () => [structuredClone(binding)],
      bind: async value => { publications.push(`bind:${value.themeId}`); },
      remove: async () => {},
    },
    loadObsSnapshot: async () => undefined,
    removeObsSnapshot: async () => {}, persistObsSnapshot: async () => {}, emitObsSnapshot: async () => {}, emitNativeObsSnapshot: async () => {},
    installCss: css => { installed.push(css); },
    emitPublication: async publication => {
      publications.push(publication.themeId);
      if (publication.themeId === nextTheme.themeId) throw new Error("notify failed");
    },
  };
  let error;
  try { await publishNativeThemeTarget(nextTheme, "live", "live", projection => applied.push(projection.css), null, ports); }
  catch (cause) { error = cause; }
  assert.ok(error instanceof NativeThemePublicationError);
  assert.deepEqual(error.restored, { runtime: false, binding: true, output: true });
  assert.match(String(error.rollbackErrors.runtime), /runtime restore failed/);
  assert.equal(applied.at(-1), oldProjection.css);
  assert.equal(installed.at(-1), oldProjection.css);
  assert.equal(publications.at(-1), oldTheme.themeId);
});

test("LAPLACE 副窗口旧投影恢复的存储、CSS 和通知各自独立尝试", async () => {
  const projection = { css: ".old-window{}", displayScale: 1, settings: {}, display: {}, scheme: "common", visual: {} };
  const snapshot = { targetId: "windows", css: projection.css, targetCss: projection.css, projection };
  for (const failedPart of ["storage", "notification"]) {
    const calls = [];
    let error;
    try {
      await restoreCompatibleWindowThemeProjection(snapshot, { themeId: "laplace-old", revision: 4 }, {
        loadRuntimeStore: async () => {
          calls.push("storage");
          if (failedPart === "storage") throw new Error("storage failed");
          return { get: async () => undefined, set: async () => {}, delete: async () => {}, save: async () => {} };
        },
        installCss: css => { calls.push(`css:${css}`); },
        emitPublication: async publication => {
          calls.push(`notify:${publication.themeId}`);
          if (failedPart === "notification") throw new Error("notification failed");
        },
      });
    } catch (cause) { error = cause; }
    assert.ok(error instanceof CompatibleWindowProjectionRestoreError);
    assert.ok(calls.includes(`css:${projection.css}`));
    assert.ok(calls.includes("notify:laplace-old"));
    if (failedPart === "storage") assert.deepEqual(error.restored, { storage: false, css: true, notification: true });
    else assert.deepEqual(error.restored, { storage: true, css: true, notification: false });
  }
});

test("绑定主题文件缺失时保留身份，仅未绑定时初始化原生默认", () => {
  assert.equal(resolveRecoverableThemeId("available-custom"), "available-custom");
  assert.equal(resolveRecoverableThemeId("missing-custom"), "missing-custom");
  assert.equal(resolveRecoverableThemeId(undefined), "native-default");
});

test("删除目标时同步移除运行时快照和 OBS 快照", () => {
  const runtime = readUiSource("src/themes/nativeThemeRuntime.ts", "utf8");
  const workspace = readUiSource("src/components/ThemeWorkspace.tsx", "utf8");
  const obs = readUiSource("src/obs/nativeObsTheme.ts", "utf8");
  assert.match(runtime, /removePublishedNativeThemeTarget/);
  assert.match(runtime, /store\.delete\(targetIdCssKey\(targetId\)\)/);
  assert.match(runtime, /store\.delete\(targetIdProjectionKey\(targetId\)\)/);
  assert.match(obs, /removeNativeObsThemeSnapshot/);
  assert.match(runtime, /detachPublishedNativeThemeTarget/);
  assert.match(workspace, /resolvePublishedThemeMode\(configuration\.id, bindings/);
  assert.match(workspace, /cleanupPublished: \(\) => adapter\.removeTarget\(configuration\.id, "obs"\)/);
});

function publishedState(options = {}) {
  let savedBindings = [{ targetId: "obs-1", targetKind: "obs", themeId: "native-default", revision: 2, displayScale: 1.25 }];
  let failBindingRemoval = options.failBindingRemoval ?? false;
  const registry = createThemeBindingRegistry({
    read: async () => structuredClone(savedBindings),
    write: async value => {
      if (failBindingRemoval && value.length === 0) { failBindingRemoval = false; throw new Error("绑定删除失败"); }
      savedBindings = structuredClone(value);
    },
  });
  const runtime = new Map([
    ["activeCss:target:obs-1", ".event{}"],
    ["projection:target:obs-1", { css: ".event{}", displayScale: 1.25 }],
  ]);
  const snapshots = new Map([["obs-1", options.compatSnapshot ?? { targetId: "obs-1", displayScale: 1.25 }]]);
  let restoring = false;
  const store = {
    async get(key) { return structuredClone(runtime.get(key)); },
    async set(key, value) { if (restoring && options.failRuntimeRestore) throw new Error("运行时恢复失败"); runtime.set(key, structuredClone(value)); },
    async delete(key) { runtime.delete(key); },
    async save() {},
  };
  const ports = {
    loadRuntimeStore: async () => store,
    bindings: registry,
    loadObsSnapshot: async id => structuredClone(snapshots.get(id)),
    removeObsSnapshot: async id => { snapshots.delete(id); if (options.failSnapshotRemoval) { restoring = true; throw new Error("快照删除失败"); } },
    persistObsSnapshot: async snapshot => snapshots.set(snapshot.targetId, structuredClone(snapshot)),
    emitObsSnapshot: async () => {},
  };
  return { registry, runtime, snapshots, ports };
}

test("产品删除入口清空绑定、运行时键和 OBS 快照，并由返回入口完整恢复", async () => {
  const state = publishedState();
  const restore = await detachPublishedNativeThemeTarget("obs-1", "obs", state.ports);
  assert.equal((await state.registry.load()).length, 0);
  assert.equal(state.runtime.has("activeCss:target:obs-1"), false);
  assert.equal(state.runtime.has("projection:target:obs-1"), false);
  assert.equal(state.snapshots.has("obs-1"), false);
  await restore();
  assert.equal((await state.registry.load())[0].displayScale, 1.25);
  assert.equal(state.runtime.has("activeCss:target:obs-1"), true);
  assert.equal(state.runtime.has("projection:target:obs-1"), true);
  assert.equal(state.snapshots.has("obs-1"), true);
});

test("原生目标清理回滚会原样恢复此前兼容模式 OBS 输出", async () => {
  const compatSnapshot = {
    mode: "laplace",
    targetId: "obs-1",
    themeId: "laplace-custom",
    revision: 8,
    displayScale: 1.25,
    document: { mode: "laplace", html: "<main>旧输出</main>", css: ".old{}" },
  };
  const state = publishedState({ compatSnapshot });
  const restore = await detachPublishedNativeThemeTarget("obs-1", "obs", state.ports);
  await restore();
  assert.deepEqual(state.snapshots.get("obs-1"), compatSnapshot);
});

test("快照删除失败且运行时恢复失败时产品入口标记未恢复", async () => {
  const state = publishedState({ failSnapshotRemoval: true, failRuntimeRestore: true });
  await assert.rejects(
    () => detachPublishedNativeThemeTarget("obs-1", "obs", state.ports),
    error => error instanceof PublishedThemeCleanupError && error.restored === false && /运行时恢复失败/.test(error.message),
  );
});

test("绑定删除失败但全部状态恢复时产品入口标记已恢复", async () => {
  const state = publishedState({ failBindingRemoval: true });
  await assert.rejects(
    () => detachPublishedNativeThemeTarget("obs-1", "obs", state.ports),
    error => error instanceof PublishedThemeCleanupError && error.restored === true,
  );
  assert.equal((await state.registry.load())[0].displayScale, 1.25);
  assert.equal(state.runtime.has("projection:target:obs-1"), true);
  assert.equal(state.snapshots.has("obs-1"), true);
});

test("目标缩放只修改已发布投影", () => {
  const projection = { css: ".event{}", displayScale: 1, settings: {}, display: {} };
  const scaled = withNativeThemeDisplayScale(projection, 1.5);
  assert.equal(scaled.displayScale, 1.5);
  assert.equal(scaled.css, projection.css);
  assert.notEqual(scaled, projection);
});

test('副窗口发布失败只恢复目标输出，不修改现场投影和 CSS', async () => {
  const theme = createBuiltinNativeTheme('native-default');
  const previous = {css:'.old-window{}',displayScale:1,settings:{},display:{},scheme:'common',visual:{}};
  const values = new Map([['projection:target:windows',previous],['activeCss:target:windows',previous.css]]);
  const applied=[], installed=[], notifications=[];
  const binding={targetId:'windows',targetKind:'windows',themeId:'old',revision:1,displayScale:1};
  const ports={
    loadRuntimeStore:async()=>({get:async key=>values.get(key),set:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key),save:async()=>{}}),
    bindings:{load:async()=>[binding],bind:async()=>{},remove:async()=>{}},
    loadObsSnapshot:async()=>undefined,removeObsSnapshot:async()=>{},persistObsSnapshot:async()=>{},emitObsSnapshot:async()=>{},emitNativeObsSnapshot:async()=>{},
    installCss:(...args)=>installed.push(args),
    emitPublication:async value=>{notifications.push(value);if(value.themeId===theme.themeId)throw Error('publish failed');},
  };
  await assert.rejects(publishNativeThemeTarget(theme,'windows','windows',value=>applied.push(value),null,ports));
  assert.deepEqual(applied,[]);
  assert.deepEqual(installed,[]);
  assert.equal(notifications.at(-1).themeId,'old');
  assert.equal(values.get('projection:target:windows'),previous);
});
