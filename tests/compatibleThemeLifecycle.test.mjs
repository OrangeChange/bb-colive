import { tmpdir as ssrTemporaryDirectory } from 'node:os';
import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import path from "node:path";
import { createRequire } from "node:module";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { JSDOM } = require(path.resolve("vendor/blivechat/node_modules/jsdom"));

let vite;
let modules;

before(async () => {
  vite = await createServer({cacheDir:ssrTemporaryDirectory()+"/danmu-ssr-cache/tests-compatibleThemeLifecycle.test.mjs", configFile: false, esbuild: { jsx: "automatic" }, optimizeDeps: {include:[], noDiscovery: true }, server: { middlewareMode: true, watch: null }, appType: "custom", logLevel: "silent" });
  modules = {
    adapters: await vite.ssrLoadModule("/src/themes/themeModeAdapters.ts"),
    repository: await vite.ssrLoadModule("/src/themes/themeRepository.ts"),
    sessions: await vite.ssrLoadModule("/src/themes/themeEditorSession.ts"),
    bindings: await vite.ssrLoadModule("/src/themes/themeBindings.ts"),
    references: await vite.ssrLoadModule("/src/themes/themeReferences.ts"),
    transfer: await vite.ssrLoadModule("/src/themes/themeTransfer.ts"),
    imports: await vite.ssrLoadModule("/src/themes/themeImport.ts"),
    transactions: await vite.ssrLoadModule("/src/themes/themeWorkspaceTransactions.ts"),
    publication: await vite.ssrLoadModule("/src/compat/compatibleRuntimePublication.ts"),
    bridge: await vite.ssrLoadModule("/src/compat/compatibleLiveBridge.ts"),
    renderer: await vite.ssrLoadModule("/src/compat/CompatibleEventRenderer.tsx"),
    feed: await vite.ssrLoadModule("/src/events/feedScroll.ts"),
    sticky: await vite.ssrLoadModule("/src/windows/stickyEventModel.ts"),
    blivechatRuntime: await vite.ssrLoadModule("/src/compat/blivechat/runtime.tsx"),
    openliveRuntime: await vite.ssrLoadModule("/src/compat/openlive/runtime.tsx"),
    laplaceRuntime: await vite.ssrLoadModule("/src/compat/laplace/runtime.tsx"),
    nativeRuntime: await vite.ssrLoadModule("/src/themes/nativeThemeRuntime.ts"),
    listSurface: await vite.ssrLoadModule("/src/compat/CompatibleListSurface.tsx"),
    blivechatProjection: await vite.ssrLoadModule("/src/compat/blivechat/projection.ts"),
    openliveProjection: await vite.ssrLoadModule("/src/compat/openlive/projection.ts"),
    laplaceProjection: await vite.ssrLoadModule("/src/compat/laplace/projection.ts"),
    react: await import("react"),
    reactClient: await import("react-dom/client"),
    reactTest: await import("react"),
  };
  await vite.ssrLoadModule("/src/compat/blivechat/register.tsx");
  await vite.ssrLoadModule("/src/compat/laplace/register.tsx");
  await vite.ssrLoadModule("/src/compat/openlive/register.tsx");
});

after(async () => vite?.close());

const compatibleModes = ["blivechat", "blivechat-open", "laplace"];

test("三版来源渲染都显示合并弹幕次数", () => {
  const event = { id: "repeat", roomId: 42, msgType: 0, ts: 1000, text: "重复内容", danmuRepeatCount: 3, user: { uid: 7, uname: "用户" } };
  const original = modules.blivechatProjection.projectBlivechatCallback(event, 1);
  const open = modules.openliveProjection.projectOpenLiveCallback(event, 1);
  const laplace = modules.laplaceProjection.projectLaplaceEvent(event, { roomId: 42, generation: 1 }, 1, event.ts);
  assert.equal(original.payload.content, "重复内容 ×3");
  assert.equal(open.payload.content, "重复内容 ×3");
  assert.equal(laplace.event.message, "重复内容 ×3");
  const sourcedLaplace = modules.laplaceProjection.projectLaplaceEvent({ ...event, laplace: { sourceMode: "direct", sourceCommand: "DANMU_MSG", event: { type: "message", id: "repeat", origin: 42, username: "用户", message: "重复内容" } } }, { roomId: 42, generation: 1 }, 1, event.ts);
  assert.equal(sourcedLaplace.event.message, "重复内容 ×3", "保留来源事实的弹幕也必须显示软件合并次数");
  assert.equal(sourcedLaplace.event.hostRepeatCount, 3, "大表情由来源组件隐藏正文时仍需独立显示次数");
});

function memoryThemePort(initial = []) {
  const stored = new Map(initial.map(document => [document.themeId, structuredClone(document)]));
  return {
    stored,
    port: {
      async list() { return [...stored.values()].map(document => ({
        themeId: document.themeId, mode: document.mode, origin: document.origin,
        name: document.metadata.name, author: document.metadata.author,
        version: document.metadata.version, updatedAt: document.metadata.updatedAt,
        revision: document.revision,
      })); },
      async read(themeId) { return stored.has(themeId) ? structuredClone(stored.get(themeId)) : undefined; },
      async write(document) { stored.set(document.themeId, structuredClone(document)); },
      async remove(themeId) { stored.delete(themeId); },
    },
  };
}

function memoryBindingPort(initial = []) {
  let value = structuredClone(initial);
  return {
    async read() { return structuredClone(value); },
    async write(next) { value = structuredClone(next); },
  };
}

test("三版内置主题可保存调整，自定义 A/B 保存与旧引用保持隔离", async () => {
  for (const mode of compatibleModes) {
    const builtin = modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme();
    const { port, stored } = memoryThemePort([builtin]);
    const repository = modules.repository.createThemeRepository(port, [builtin]);
    const ids = [`${mode}-a`, `${mode}-b`];
    const host = modules.sessions.createThemeSessionHost(repository, {
      createId: () => ids.shift(),
      now: () => "2026-10-25T00:00:00.000Z",
    });
    const source = await host.openThemeSession(builtin.themeId);
    host.updateThemeDraft(source, document => ({ ...document, styles: { ...document.styles, customCss: ".draft{}" } }));
    await host.saveThemeSession(source);
    assert.equal(stored.get(builtin.themeId).styles.customCss, ".draft{}");
    assert.equal(stored.get(builtin.themeId).origin, "builtin");

    const a = await host.saveThemeSessionAs(source, { name: "A", author: "测试" });
    const b = await host.saveThemeSessionAs(source, { name: "B", author: "测试" });
    host.updateThemeDraft(a, document => ({ ...document, styles: { ...document.styles, customCss: ".a{}" } }));
    await host.saveThemeSession(a);

    assert.equal(stored.get(a.themeId).styles.customCss, ".a{}");
    assert.equal(stored.get(b.themeId).styles.customCss, ".draft{}");
    const bindings = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
      { targetId: "live", targetKind: "live", themeId: builtin.themeId, revision: 1 },
    ]));
    assert.equal((await bindings.load())[0].themeId, builtin.themeId);
  }
});

test("主题名称变化不改变身份，目标缩放不进入完整主题包", async () => {
  const builtin = modules.adapters.getThemeModeAdapter("blivechat").createBuiltinTheme();
  const document = {
    ...structuredClone(builtin), themeId: "stable-id", origin: "custom", revision: 3,
    metadata: { ...builtin.metadata, name: "改名后的主题" },
  };
  const bindings = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
    { targetId: "live", targetKind: "live", themeId: document.themeId, revision: 3, displayScale: 1.35 },
  ]));
  const restored = modules.transfer.importThemePackageBytes(modules.transfer.exportThemeDocumentBytes(document)).document;
  assert.equal(restored.themeId, "stable-id");
  assert.equal(restored.metadata.name, "改名后的主题");
  assert.equal("displayScale" in restored, false);
  assert.equal(JSON.stringify(restored).includes("1.35"), false);
  assert.equal((await bindings.load())[0].themeId, "stable-id");
});

test("三版 CSS 范围、未知 CSS、图片和字体按既有主题包往返保留", () => {
  for (const mode of compatibleModes) {
    const document = modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme();
    document.themeId = `${mode}-package`;
    document.origin = "custom";
    document.metadata = { ...document.metadata, name: `中文${mode}主题`, author: "测试作者", version: "2.1.0" };
    document.styles.visualCss += "\n.unknown-visual{--keep:1}";
    document.styles.customCss = ".unknown-custom{color:rebeccapurple}";
    document.assets = [
      { id: "image", name: "图片", path: "assets/image.webp", mediaType: "image/webp" },
      { id: "font", name: "字体", path: "assets/font.woff2", mediaType: "font/woff2" },
    ];
    const adapter = modules.adapters.getThemeModeAdapter(mode);
    assert.match(adapter.exportCss(document, "visual"), /unknown-visual/);
    assert.doesNotMatch(adapter.exportCss(document, "visual"), /unknown-custom/);
    assert.match(adapter.exportCss(document, "base-visual"), /unknown-visual/);
    assert.doesNotMatch(adapter.exportCss(document, "base-visual"), /unknown-custom/);
    assert.equal(adapter.exportCss(document, "custom"), document.styles.customCss);
    assert.match(adapter.exportCss(document, "complete"), /unknown-custom/);

    const assets = { "assets/image.webp": new Uint8Array([1, 2]), "assets/font.woff2": new Uint8Array([3, 4]) };
    const restored = modules.transfer.importThemePackageBytes(modules.transfer.exportThemeDocumentBytes(document, assets));
    assert.equal(restored.document.mode, mode);
    assert.equal(restored.document.themeId, `${mode}-package`);
    assert.equal(restored.document.origin, "custom");
    assert.deepEqual(
      { name: restored.document.metadata.name, author: restored.document.metadata.author, version: restored.document.metadata.version },
      { name: `中文${mode}主题`, author: "测试作者", version: "2.1.0" },
    );
    assert.match(restored.document.styles.visualCss, /unknown-visual/);
    assert.deepEqual(restored.assets, assets);
  }
});

test("同 ID 导入的更新、复制和跳过都保持自定义保护", async () => {
  const builtin = modules.adapters.getThemeModeAdapter("laplace").createBuiltinTheme();
  const existing = { ...structuredClone(builtin), themeId: "same-id", origin: "custom", revision: 4 };
  const incoming = { ...structuredClone(existing), revision: 99, styles: { ...existing.styles, customCss: ".incoming{}" } };
  const saved = [];
  const dependencies = {
    load: async themeId => themeId === builtin.themeId ? builtin : existing,
    save: async (document, options) => saved.push({ document: structuredClone(document), options }),
    discardSession: () => {},
    createId: () => "copy-id",
  };

  const packageAssets = { "assets/frame.webp": new Uint8Array([7, 8, 9]) };
  const updated = await modules.imports.installImportedThemePackage({ document: incoming, assets: packageAssets }, dependencies, "update");
  assert.equal(updated.document.themeId, "same-id");
  assert.equal(updated.document.revision, 5);
  assert.equal(updated.document.origin, "custom");

  assert.deepEqual(saved.at(-1).options.assetChanges, packageAssets);
  const copied = await modules.imports.installImportedThemePackage({ document: incoming, assets: packageAssets }, dependencies, "copy");
  assert.equal(copied.document.themeId, "copy-id");
  assert.equal(copied.document.revision, 1);
  assert.equal(copied.document.origin, "custom");
  assert.deepEqual(saved.at(-1).options.assetChanges, packageAssets);

  const skipped = await modules.imports.installImportedThemePackage({ document: incoming, assets: {} }, dependencies, "skip");
  assert.equal(skipped.skipped, true);
  assert.equal(saved.length, 2);

  await assert.rejects(
    () => modules.imports.installImportedThemePackage({ document: { ...incoming, themeId: builtin.themeId }, assets: {} }, dependencies, "update"),
    /内置主题不能覆盖/,
  );
});

test("现场、副窗口和多个 OBS 可独立引用，草稿、保存与仓库外部改动不主动发布", async () => {
  const port = memoryBindingPort();
  const registry = modules.bindings.createThemeBindingRegistry(port);
  for (const binding of [
    { targetId: "live", targetKind: "live", themeId: "theme-a", revision: 2 },
    { targetId: "windows", targetKind: "windows", themeId: "theme-b", revision: 3 },
    { targetId: "obs-1", targetKind: "obs", themeId: "theme-a", revision: 2 },
    { targetId: "obs-2", targetKind: "obs", themeId: "theme-c", revision: 7 },
  ]) await registry.bind(binding);
  assert.deepEqual(modules.references.listThemeReferences("theme-a", await registry.load()).map(item => item.targetId).sort(), ["live", "obs-1"]);

  let publishes = 0;
  const existing = { ...modules.adapters.getThemeModeAdapter("blivechat-open").createBuiltinTheme(), themeId: "theme-a", origin: "custom", revision: 2 };
  const { port: themePort } = memoryThemePort([existing]);
  const repository = modules.repository.createThemeRepository(themePort, []);
  const host = modules.sessions.createThemeSessionHost(repository);
  const runtime = modules.openliveRuntime.createOpenLiveThemeRuntime(registry, {
    load: async () => [], loadTarget: async () => undefined,
    save: async () => {}, remove: async () => {},
    publish: async () => { publishes += 1; }, subscribe: async () => () => {},
  });
  const stop = await runtime.start();
  const session = await host.openThemeSession("theme-a");
  host.updateThemeDraft(session, document => ({ ...document, styles: { ...document.styles, customCss: ".unsaved{}" } }));
  assert.equal(session.dirty, true);
  assert.equal(publishes, 0);

  const externalRepository = modules.repository.createThemeRepository(themePort, []);
  await externalRepository.saveThemeDocument({ ...structuredClone(existing), revision: 3, styles: { ...existing.styles, customCss: ".external{}" } });
  const changes = new EventTarget();
  let checked;
  const unsubscribe = modules.sessions.subscribeThemeRepositoryChanges(changes, () => {
    checked = host.checkThemeSessionForExternalChange(session);
  });
  changes.dispatchEvent(new Event("focus"));
  assert.equal(await checked, "changed");
  assert.equal(session.externalDocument.styles.customCss, ".external{}");
  assert.equal(session.document.styles.customCss, ".unsaved{}");
  assert.equal(publishes, 0);
  await host.saveThemeSession(session);
  assert.equal(publishes, 0);
  assert.equal((await registry.load()).find(item => item.targetId === "live").revision, 2);
  unsubscribe(); stop();
});

test("快照保存、绑定或发布失败均恢复权威旧快照、绑定与可见状态", async () => {
  const oldSnapshot = { themeId: "old", revision: 2 };
  const nextSnapshot = { themeId: "new", revision: 3 };
  for (const failedStep of ["save", "bind", "publish"]) {
    let snapshot = oldSnapshot;
    let binding = { targetId: "windows", targetKind: "windows", themeId: "old", revision: 2 };
    let visible = oldSnapshot;
    let failed = false;
    await assert.rejects(() => modules.transactions.commitThemePublication({
      loadSnapshot: async () => structuredClone(snapshot),
      nextSnapshot,
      previousBinding: structuredClone(binding),
      nextBinding: { ...binding, themeId: "new", revision: 3 },
      saveSnapshot: async value => { snapshot = value; if (failedStep === "save" && !failed) { failed = true; throw new Error("快照保存失败"); } },
      saveBinding: async value => { binding = value; if (failedStep === "bind" && !failed) { failed = true; throw new Error("绑定失败"); } },
      publish: async value => { visible = value; if (failedStep === "publish" && !failed) { failed = true; throw new Error("目标发布失败"); } },
    }), /失败/);
    assert.deepEqual(snapshot, oldSnapshot);
    assert.equal(binding.themeId, "old");
    assert.deepEqual(visible, oldSnapshot);
  }
});

test("三版正式运行时发布失败后仍解析旧主题快照", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  for (const mode of compatibleModes) {
    const base = modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme();
    const oldDocument = { ...structuredClone(base), themeId: `${mode}-old`, origin: "custom", revision: 2 };
    const nextDocument = { ...structuredClone(oldDocument), themeId: `${mode}-new`, revision: 3 };
    const context = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 };
    const oldSnapshot = { document: oldDocument, context };
    let persisted = structuredClone(oldSnapshot);
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
      { targetId: "windows", targetKind: "windows", themeId: oldDocument.themeId, revision: 2, displayScale: 1 },
    ]));
    const runtime = factories[mode](registry, {
      load: async () => [structuredClone(oldSnapshot)],
      loadTarget: async () => structuredClone(oldSnapshot),
      save: async value => { persisted = structuredClone(value); },
      remove: async () => { persisted = undefined; },
      publish: async value => {
        if (!("type" in value) && value.document.themeId === nextDocument.themeId) throw new Error("目标发布失败");
      },
      subscribe: async () => () => {},
    });
    const stop = await runtime.start();
    await assert.rejects(() => runtime.publish(nextDocument, context), /目标发布失败/);
    if (runtime.snapshot) assert.equal(runtime.snapshot("windows").document.themeId, oldDocument.themeId);
    assert.equal(persisted.document.themeId, oldDocument.themeId);
    assert.equal((await registry.load())[0].themeId, oldDocument.themeId);
    stop();
  }
});

test("BLC 原版现场发布失败后恢复发布前的显示投影", async () => {
  const base = modules.adapters.getThemeModeAdapter("blivechat").createBuiltinTheme();
  const oldDocument = { ...structuredClone(base), themeId: "blivechat-live-old", origin: "custom", revision: 2, settings: { ...base.settings, showAvatar: true } };
  const nextDocument = { ...structuredClone(oldDocument), themeId: "blivechat-live-next", revision: 3, settings: { ...oldDocument.settings, showAvatar: false } };
  const context = { target: "live", targetId: "live", roomId: "42", displayScale: 1 };
  let snapshot;
  let fail = false;
  const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort());
  const runtime = modules.blivechatRuntime.createBlivechatThemeRuntime(registry, {
    load: async () => snapshot ? [structuredClone(snapshot)] : [],
    loadTarget: async () => snapshot ? structuredClone(snapshot) : undefined,
    save: async value => { snapshot = structuredClone(value); },
    remove: async () => { snapshot = undefined; },
    publish: async value => { if (fail && !("type" in value) && value.document.themeId === nextDocument.themeId) throw new Error("目标发布失败"); },
    subscribe: async () => () => {},
  });
  const projections = [];
  const applyProjection = projection => projections.push(structuredClone(projection));
  const stop = await runtime.start();
  await runtime.publish(oldDocument, context, applyProjection);
  fail = true;
  await assert.rejects(() => runtime.publish(nextDocument, context, applyProjection), /目标发布失败/);
  assert.deepEqual(projections.map(value => value.display.showAvatar), [true, false, true]);
  assert.equal(snapshot.document.themeId, oldDocument.themeId);
  assert.equal((await registry.load())[0].themeId, oldDocument.themeId);
  stop();
});

test("现场从其他兼容模式切到 BLC 原版失败后按旧模式恢复显示投影", async () => {
  const base = modules.adapters.getThemeModeAdapter("blivechat").createBuiltinTheme();
  const nextDocument = { ...structuredClone(base), themeId: "blivechat-live-next", origin: "custom", revision: 3 };
  const oldDocument = { ...structuredClone(modules.adapters.getThemeModeAdapter("laplace").createBuiltinTheme()), themeId: "laplace-live-old", origin: "custom", revision: 2 };
  const context = { target: "live", targetId: "live", roomId: "42", displayScale: 1 };
  const oldSnapshot = { document: oldDocument, context };
  const oldBinding = { targetId: "live", targetKind: "live", themeId: oldDocument.themeId, revision: oldDocument.revision, displayScale: 1 };
  const oldProjection = { settings: {}, display: { showAvatar: false }, scheme: "common", visual: {}, css: ".laplace-old{}", displayScale: 1 };
  const applied = [];
  const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([oldBinding]));
  const runtime = modules.blivechatRuntime.createBlivechatThemeRuntime(registry, {
    load: async () => [structuredClone(oldSnapshot)],
    loadTarget: async () => structuredClone(oldSnapshot),
    save: async () => {}, remove: async () => {}, subscribe: async () => () => {},
    publish: async value => { if (!("type" in value)) throw new Error("目标发布失败"); },
    publishModeOutput: async () => {},
    restoreTargetOutput: async (binding, applyProjection) => {
      assert.equal(binding.themeId, oldDocument.themeId);
      applyProjection?.(oldProjection);
    },
  });
  await assert.rejects(() => runtime.publish(nextDocument, context, projection => applied.push(structuredClone(projection))), /目标发布失败/);
  assert.equal(applied.at(-1).css, oldProjection.css);
  assert.equal(applied.at(-1).display.showAvatar, false);
});

test("三版跨模式发布失败都从共享存储恢复旧模式快照与订阅结果", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  const transitions = [
    ["blivechat-open", "laplace"],
    ["laplace", "blivechat"],
    ["laplace", "blivechat-open"],
    ["blivechat-open", "blivechat"],
    ["blivechat", "laplace"],
  ];
  for (const [oldMode, nextMode] of transitions) {
    const oldDocument = { ...structuredClone(modules.adapters.getThemeModeAdapter(oldMode).createBuiltinTheme()), themeId: `${oldMode}-old`, origin: "custom", revision: 4 };
    const nextDocument = { ...structuredClone(modules.adapters.getThemeModeAdapter(nextMode).createBuiltinTheme()), themeId: `${nextMode}-new`, origin: "custom", revision: 5 };
    const context = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 };
    const oldSnapshot = { document: oldDocument, context };
    let sharedSnapshot = structuredClone(oldSnapshot);
    const channelSubscribers = new Map();
    const publishedModes = [], publishedChannels = [];
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
      { targetId: "windows", targetKind: "windows", themeId: oldDocument.themeId, revision: 4, displayScale: 1 },
    ]));
    const deliver = (mode, value) => {
      const eventName = modules.publication.compatibleRuntimePublicationEvent(mode);
      for (const listener of channelSubscribers.get(eventName) ?? []) listener(structuredClone(value));
    };
    const portsFor = mode => ({
      load: async () => sharedSnapshot?.document.mode === mode ? [structuredClone(sharedSnapshot)] : [],
      loadTarget: async targetId => sharedSnapshot?.context.targetId === targetId ? structuredClone(sharedSnapshot) : undefined,
      save: async value => { sharedSnapshot = structuredClone(value); },
      remove: async () => { sharedSnapshot = undefined; },
      publish: async value => {
        if (!("type" in value)) { publishedModes.push(value.document.mode); publishedChannels.push(mode); }
        deliver(mode, value);
        if (!("type" in value) && value.document.themeId === nextDocument.themeId) throw new Error("目标发布失败");
      },
      removeOutput: async targetId => { publishedChannels.push(`remove:${mode}:${targetId}`); deliver(mode, { type: "remove", targetId }); },
      publishModeOutput: async value => { publishedModes.push(value.document.mode); publishedChannels.push(`restore:${value.document.mode}`); deliver(value.document.mode, value); },
      subscribe: async listener => {
        const eventName = modules.publication.compatibleRuntimePublicationEvent(mode);
        const listeners = channelSubscribers.get(eventName) ?? new Set(); listeners.add(listener); channelSubscribers.set(eventName, listeners);
        return () => listeners.delete(listener);
      },
    });
    const oldRuntime = factories[oldMode](registry, portsFor(oldMode));
    const nextRuntime = factories[nextMode](registry, portsFor(nextMode));
    const stopOld = await oldRuntime.start();
    const stopNext = await nextRuntime.start();
    await assert.rejects(() => nextRuntime.publish(nextDocument, context), /目标发布失败/);

    assert.equal((await registry.load())[0].themeId, oldDocument.themeId);
    assert.equal(sharedSnapshot.document.mode, oldMode);
    assert.equal(sharedSnapshot.document.themeId, oldDocument.themeId);
    assert.equal(oldRuntime.snapshot("windows")?.document.mode, oldMode);
    assert.equal(nextRuntime.snapshot?.("windows"), undefined);
    assert.deepEqual(publishedModes.slice(-2), [nextMode, oldMode]);
    assert.deepEqual(publishedChannels.slice(-3), [nextMode, `remove:${nextMode}:windows`, `restore:${oldMode}`]);

    const reopened = factories[oldMode](registry, portsFor(oldMode));
    const stopReopened = await reopened.start();
    assert.equal(reopened.snapshot("windows")?.document.themeId, oldDocument.themeId);
    stopReopened(); stopNext(); stopOld();
  }
});

test("三版 OBS 解绑失败恢复解绑前完整快照，不读取当前置顶设置重建", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  for (const mode of compatibleModes) {
    const document = { ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()), themeId: `${mode}-obs`, origin: "custom", revision: 2 };
    const context = { target: "obs", targetId: `obs-${mode}`, roomId: "42", displayScale: 1 };
    const published = { document, context };
    const oldObsSnapshot = { renderer: "compatible", mode, targetId: context.targetId, sticky: { enabled: true, maxCount: 88, durationSeconds: 17 }, marker: "captured-before-unbind" };
    const restored = [];
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
      { targetId: context.targetId, targetKind: "obs", themeId: document.themeId, revision: 2, displayScale: 1 },
    ]));
    const runtime = factories[mode](registry, {
      load: async () => [structuredClone(published)], loadTarget: async () => structuredClone(published),
      save: async () => {}, remove: async () => {},
      publish: async value => { if ("type" in value) throw new Error("解绑输出失败"); },
      subscribe: async () => () => {},
      loadObsSnapshot: async () => structuredClone(oldObsSnapshot),
      removeObsSnapshot: async () => {},
      persistObsSnapshot: async snapshot => { restored.push(["persist", structuredClone(snapshot)]); },
      emitObsSnapshot: async snapshot => { restored.push(["emit", structuredClone(snapshot)]); },
    });
    await runtime.start();
    await assert.rejects(() => runtime.remove(context.targetId, "obs"), /解绑输出失败/);
    assert.deepEqual(restored.map(([, snapshot]) => snapshot), [oldObsSnapshot, oldObsSnapshot]);
  }
});

test("三版首次兼容发布失败都会撤销候选并恢复原生目标输出", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  for (const mode of compatibleModes) {
    const document = { ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()), themeId: `${mode}-first`, origin: "custom", revision: 2 };
    const oldBinding = { targetId: "windows", targetKind: "windows", themeId: "native-default", revision: 1, displayScale: 1 };
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([oldBinding]));
    const calls = [];
    const runtime = factories[mode](registry, {
      load: async () => [], loadTarget: async () => undefined,
      save: async () => {}, remove: async () => calls.push("remove-snapshot"),
      publish: async value => { if (!("type" in value)) throw new Error("激活失败"); },
      removeOutput: async () => calls.push("remove-output"),
      restoreTargetOutput: async binding => calls.push(`restore:${binding.themeId}`),
      subscribe: async () => () => {},
    });
    await runtime.start();
    await assert.rejects(() => runtime.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 }), /激活失败/);
    assert.ok(calls.includes("remove-output"));
    assert.ok(calls.includes("restore:native-default"));
    assert.equal((await registry.load())[0].themeId, "native-default");
  }
});

test("BLC 外部 HTML 握手后保存失败会取消并卸载候选", async () => {
  const builtin = modules.adapters.getThemeModeAdapter("blivechat").createBuiltinTheme();
  const document = {
    ...structuredClone(builtin),
    themeId: "external-save-fail",
    origin: "custom",
    metadata: {
      ...builtin.metadata,
      externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true },
    },
  };
  const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort());
  const cancelled = [];
  const runtime = modules.blivechatRuntime.createBlivechatThemeRuntime(registry, {
    load: async () => [],
    loadTarget: async () => undefined,
    save: async () => { throw new Error("保存失败"); },
    remove: async () => {},
    publish: async () => {},
    subscribe: async () => () => {},
    prepareExternalHtml: async () => {},
    cancelPendingExternal: async requestId => { cancelled.push(requestId); },
  });
  await runtime.start();
  await assert.rejects(() => runtime.publish(document, { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 }), /保存失败/);
  assert.equal(cancelled.length, 1);
  assert.equal(runtime.resolvePendingExternal({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), undefined);
});

test("BLC 外部 HTML 握手后读取绑定或旧 OBS 失败都会取消并卸载候选", async () => {
  for (const failedStep of ["binding", "obs"]) {
    const builtin = modules.adapters.getThemeModeAdapter("blivechat").createBuiltinTheme();
    const document = { ...structuredClone(builtin), themeId: `external-${failedStep}-fail`, origin: "custom", metadata: { ...builtin.metadata, externalHtml: { url: "https://example.test/theme", sdk: "blivechat-1.0.1", verified: true } } };
    const baseRegistry = modules.bindings.createThemeBindingRegistry(memoryBindingPort());
    const registry = failedStep === "binding" ? { ...baseRegistry, load: async () => { throw new Error("绑定读取失败"); } } : baseRegistry;
    let prepareListener; let cancelListener; const cancelled = [];
    const runtime = modules.blivechatRuntime.createBlivechatThemeRuntime(registry, {
      load: async () => [], loadTarget: async () => undefined, save: async () => {}, remove: async () => {}, publish: async () => {},
      loadBindings: async () => [], subscribeBindings: async () => () => {}, subscribe: async () => () => {},
      subscribeExternalPrepare: async listener => { prepareListener = listener; return () => {}; },
      subscribeExternalCancel: async listener => { cancelListener = listener; return () => {}; },
      prepareExternalHtml: async request => { prepareListener(request); },
      cancelPendingExternal: async requestId => { cancelled.push(requestId); cancelListener(requestId); },
      loadObsSnapshot: async () => { if (failedStep === "obs") throw new Error("OBS 快照读取失败"); return undefined; },
    });
    await runtime.start();
    const target = failedStep === "obs" ? "obs" : "windows";
    await assert.rejects(() => runtime.publish(document, { target, targetId: target, roomId: "42", displayScale: 1 }), failedStep === "binding" ? /绑定读取失败/ : /OBS 快照读取失败/);
    assert.equal(cancelled.length, 1);
    assert.equal(runtime.resolvePendingExternal({ target, targetId: target, roomId: 42, placement: "main" }), undefined);
  }
});

test("LAPLACE 副窗口真实投影通知失败后恢复绑定、兼容快照、native store 和重开输出", async () => {
  const base = modules.adapters.getThemeModeAdapter("laplace").createBuiltinTheme();
  const oldDocument = { ...structuredClone(base), themeId: "laplace-old", origin: "custom", revision: 2 };
  const nextDocument = { ...structuredClone(oldDocument), themeId: "laplace-new", revision: 3 };
  const context = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 };
  const oldSnapshot = { document: oldDocument, context };
  let persisted = structuredClone(oldSnapshot);
  const nativeValues = new Map();
  const outputPublications = [];
  const installedCss = [];
  const nativePorts = {
    loadRuntimeStore: async () => ({
      get: async key => structuredClone(nativeValues.get(key)),
      set: async (key, value) => { nativeValues.set(key, structuredClone(value)); },
      delete: async key => { nativeValues.delete(key); },
      save: async () => {},
    }),
    installCss: css => { installedCss.push(css); },
    emitPublication: async publication => {
      if (publication.themeId === nextDocument.themeId) throw new Error("副窗口投影通知失败");
      outputPublications.push(structuredClone(publication));
    },
  };
  const oldProjection = { settings: {}, display: {}, scheme: "common", visual: {}, css: ".laplace-old{}", displayScale: 1 };
  await modules.nativeRuntime.publishCompatibleWindowThemeProjection("windows", oldDocument.themeId, oldDocument.revision, oldProjection, nativePorts);
  const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
    { targetId: "windows", targetKind: "windows", themeId: oldDocument.themeId, revision: 2, displayScale: 1 },
  ]));
  const runtime = modules.laplaceRuntime.createLaplaceThemeRuntime(registry, {
    load: async () => [structuredClone(oldSnapshot)],
    loadTarget: async () => structuredClone(oldSnapshot),
    save: async value => { persisted = structuredClone(value); },
    remove: async () => { persisted = undefined; },
    publish: async () => {},
    subscribe: async () => () => {},
    publishWindowProjection: value => modules.nativeRuntime.publishCompatibleWindowThemeProjection(value.targetId, value.themeId, value.revision, value.projection, nativePorts),
    captureWindowProjection: targetId => modules.nativeRuntime.captureCompatibleWindowThemeProjection(targetId, nativePorts),
    restoreWindowProjection: (snapshot, publication) => modules.nativeRuntime.restoreCompatibleWindowThemeProjection(snapshot, publication, nativePorts),
  });
  const stop = await runtime.start();
  await assert.rejects(() => runtime.publish(nextDocument, context), /副窗口投影通知失败/);
  assert.equal(persisted.document.themeId, oldDocument.themeId);
  assert.equal((await registry.load())[0].themeId, oldDocument.themeId);
  const reopened = await modules.nativeRuntime.captureCompatibleWindowThemeProjection("windows", nativePorts);
  assert.equal(reopened.projection.css, oldProjection.css);
  assert.equal(reopened.css, oldProjection.css);
  assert.equal(reopened.targetCss, oldProjection.css);
  assert.equal(outputPublications.at(-1).themeId, oldDocument.themeId);
  assert.equal(outputPublications.at(-1).projection.css, oldProjection.css);
  assert.equal(installedCss.at(-1), oldProjection.css);
  stop();
});

test("native-default 首次切 LAPLACE 通知失败后从发布前快照恢复原生副窗口", async () => {
  const nextDocument = {
    ...structuredClone(modules.adapters.getThemeModeAdapter("laplace").createBuiltinTheme()),
    themeId: "laplace-first",
    origin: "custom",
    revision: 2,
  };
  const context = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 };
  let persisted;
  const nativeValues = new Map();
  const outputPublications = [];
  const installedCss = [];
  let lateStoreRestoreReads = 0;
  const nativePorts = {
    loadRuntimeStore: async () => ({
      get: async key => structuredClone(nativeValues.get(key)),
      set: async (key, value) => { nativeValues.set(key, structuredClone(value)); },
      delete: async key => { nativeValues.delete(key); },
      save: async () => {},
    }),
    installCss: css => { installedCss.push(css); },
    emitPublication: async publication => {
      if (publication.themeId === nextDocument.themeId) throw new Error("副窗口投影通知失败");
      outputPublications.push(structuredClone(publication));
    },
  };
  const oldProjection = { settings: {}, display: {}, scheme: "common", visual: {}, css: ".native-default-old{}", displayScale: 1 };
  await modules.nativeRuntime.publishCompatibleWindowThemeProjection("windows", "native-default", 1, oldProjection, nativePorts);
  const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
    { targetId: "windows", targetKind: "windows", themeId: "native-default", revision: 1, displayScale: 1 },
  ]));
  const runtime = modules.laplaceRuntime.createLaplaceThemeRuntime(registry, {
    load: async () => [],
    loadTarget: async () => undefined,
    save: async value => { persisted = structuredClone(value); },
    remove: async () => { persisted = undefined; },
    publish: async () => {},
    subscribe: async () => () => {},
    publishWindowProjection: value => modules.nativeRuntime.publishCompatibleWindowThemeProjection(value.targetId, value.themeId, value.revision, value.projection, nativePorts),
    captureWindowProjection: targetId => modules.nativeRuntime.captureCompatibleWindowThemeProjection(targetId, nativePorts),
    restoreWindowProjection: (snapshot, publication) => modules.nativeRuntime.restoreCompatibleWindowThemeProjection(snapshot, publication, nativePorts),
    restoreTargetOutput: async () => { lateStoreRestoreReads += 1; },
  });
  const stop = await runtime.start();
  await assert.rejects(() => runtime.publish(nextDocument, context), /副窗口投影通知失败/);
  assert.equal(persisted, undefined);
  assert.equal((await registry.load())[0].themeId, "native-default");
  const reopened = await modules.nativeRuntime.captureCompatibleWindowThemeProjection("windows", nativePorts);
  assert.equal(reopened.projection.css, oldProjection.css);
  assert.equal(reopened.css, oldProjection.css);
  assert.equal(reopened.targetCss, oldProjection.css);
  assert.equal(outputPublications.at(-1).themeId, "native-default");
  assert.equal(outputPublications.at(-1).projection.css, oldProjection.css);
  assert.equal(installedCss.at(-1), oldProjection.css);
  assert.equal(lateStoreRestoreReads, 0);
  stop();
});

test("实际发布订阅中纯 CSS 不重建阅读宿主，模式切换只重建渲染区", async () => {
  const target = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 };
  const surface = { target: "windows", targetId: "windows", roomId: 42, placement: "main" };
  const openBase = modules.adapters.getThemeModeAdapter("blivechat-open").createBuiltinTheme();
  const openDocument = { ...structuredClone(openBase), themeId: "open-theme", origin: "custom", revision: 2 };
  const blcBase = modules.adapters.getThemeModeAdapter("blivechat").createBuiltinTheme();
  const blcDocument = { ...structuredClone(blcBase), themeId: "blc-theme", origin: "custom", revision: 4 };
  let persisted = { document: structuredClone(openDocument), context: target };
  const subscribers = new Set();
  const portsFor = mode => ({
    load: async () => persisted.document.mode === mode ? [structuredClone(persisted)] : [],
    loadTarget: async () => structuredClone(persisted),
    save: async value => { persisted = structuredClone(value); }, remove: async () => {},
    publish: async value => subscribers.forEach(listener => listener(structuredClone(value))),
    subscribe: async listener => { subscribers.add(listener); return () => subscribers.delete(listener); },
  });
  const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([
    { targetId: "windows", targetKind: "windows", themeId: openDocument.themeId, revision: 2, displayScale: 1 },
  ]));
  const openRuntime = modules.openliveRuntime.createOpenLiveThemeRuntime(registry, portsFor("blivechat-open"));
  const blcRuntime = modules.blivechatRuntime.createBlivechatThemeRuntime(registry, portsFor("blivechat"));
  const stopOpen = await openRuntime.start(); const stopBlc = await blcRuntime.start();
  let publicationNotifications = 0;
  const stopNotifications = modules.renderer.subscribeCompatibleEventRenderChange(() => { publicationNotifications += 1; });

  const event = { id: "event-1", reactKey: "stable-event-1", ts: 1_000, msgType: 2, sc: { price: 30, duration: 60 } };
  const feedSession = modules.feed.createFeedScrollSession(1);
  feedSession.scrollTop = 120; feedSession.followingLatest = false;
  const readingAnchor = { eventKey: event.reactKey, offset: 18 };
  const layout = modules.feed.captureFeedLayoutSnapshot({ ...feedSession, readingAnchor });
  const stickyProjection = modules.sticky.createStickyProjection();
  stickyProjection.configure({ enabled: true, obsEnabled: true, position: "top", giftThreshold: 0, maxCount: 3, sort: "amount" }, 2_000);
  const projectedEvent = stickyProjection.accept(event, 2_000);
  const deadline = modules.sticky.stickyCandidate(projectedEvent, { enabled: true, obsEnabled: true, position: "top", giftThreshold: 0, maxCount: 3, sort: "amount" }).expiresAt;
  const hostIdentity = { event: projectedEvent, feedSession, readingAnchor };
  const initialMount = modules.renderer.compatibleRendererMountIdentity(openRuntime.resolve(surface));

  const cssRevision = { ...structuredClone(openDocument), revision: 3, styles: { ...openDocument.styles, customCss: ".css-revision{}" } };
  await openRuntime.publish(cssRevision, target);
  assert.equal(modules.renderer.compatibleRendererMountIdentity(openRuntime.resolve(surface)), initialMount);
  assert.equal(hostIdentity.event, projectedEvent);
  assert.equal(hostIdentity.feedSession, feedSession);
  assert.deepEqual(layout.readingAnchor, readingAnchor);
  assert.equal(modules.sticky.stickyCandidate(stickyProjection.snapshot(3_000)[0], { enabled: true, obsEnabled: true, position: "top", giftThreshold: 0, maxCount: 3, sort: "amount" }).expiresAt, deadline);

  await blcRuntime.publish(blcDocument, target);
  assert.notEqual(modules.renderer.compatibleRendererMountIdentity(blcRuntime.resolve(surface)), initialMount);
  assert.equal(hostIdentity.event, projectedEvent);
  assert.equal(hostIdentity.feedSession, feedSession);
  assert.deepEqual(layout.readingAnchor, readingAnchor);
  assert.equal(modules.sticky.stickyCandidate(stickyProjection.snapshot(3_000)[0], { enabled: true, obsEnabled: true, position: "top", giftThreshold: 0, maxCount: 3, sort: "amount" }).expiresAt, deadline);
  assert.ok(publicationNotifications > 0);
  stopNotifications(); stopBlc(); stopOpen();
});

test("三版运行时停止后清空内存快照和绑定，重新启动只采用当前持久状态", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  for (const mode of compatibleModes) {
    const document = {
      ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()),
      themeId: `${mode}-lifecycle`, origin: "custom", revision: 2,
    };
    const context = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 };
    let snapshots = [{ document, context }];
    let storedBindings = [{ targetId: "windows", targetKind: "windows", themeId: document.themeId, revision: 2, displayScale: 1 }];
    let publicationListener;
    let bindingListener;
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort(storedBindings));
    const runtime = factories[mode](registry, {
      load: async () => structuredClone(snapshots),
      loadTarget: async targetId => structuredClone(snapshots.find(value => value.context.targetId === targetId)),
      save: async value => { snapshots = [structuredClone(value)]; },
      remove: async targetId => { snapshots = snapshots.filter(value => value.context.targetId !== targetId); },
      publish: async value => publicationListener?.(structuredClone(value)),
      subscribe: async listener => { publicationListener = listener; return () => { publicationListener = undefined; }; },
      loadBindings: async () => structuredClone(storedBindings),
      subscribeBindings: async listener => { bindingListener = listener; return () => { bindingListener = undefined; }; },
    });

    const stop = await runtime.start();
    assert.equal(runtime.snapshot("windows")?.document.themeId, document.themeId);
    stop();
    assert.equal(publicationListener, undefined);
    assert.equal(bindingListener, undefined);
    assert.equal(runtime.snapshot("windows"), undefined, `${mode} 停止后不得保留旧快照`);

    snapshots = [];
    storedBindings = [];
    const stopAgain = await runtime.start();
    assert.equal(runtime.snapshot("windows"), undefined, `${mode} 重启不得复活旧快照`);
    assert.equal(runtime.resolve({ target: "windows", targetId: "windows", roomId: 42, placement: "main" }), undefined);
    stopAgain();
  }
});

test("同 renderer 主题热更新保留 iframe，跨 renderer 切换销毁旧 iframe", async () => {
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://app.local/", pretendToBeVisual: true });
  const previous = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element, Node: globalThis.Node, MutationObserver: globalThis.MutationObserver, IS_REACT_ACT_ENVIRONMENT: globalThis.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, Element: dom.window.Element, Node: dom.window.Node, MutationObserver: dom.window.MutationObserver, IS_REACT_ACT_ENVIRONMENT: true });
  const descriptor = (protocol, css) => ({ url: protocol === "bb-blivechat" ? "/blivechat/renderer.html" : "/openlive/renderer.html", protocol, title: protocol, css, config: {}, project: () => null });
  const root = modules.reactClient.createRoot(dom.window.document.getElementById("root"));
  try {
    await modules.reactTest.act(async () => root.render(modules.react.createElement(modules.listSurface.CompatibleListSurface, { descriptor: descriptor("bb-blivechat", ".a{}"), events: [] })));
    const first = dom.window.document.querySelector("iframe");
    await modules.reactTest.act(async () => root.render(modules.react.createElement(modules.listSurface.CompatibleListSurface, { descriptor: descriptor("bb-blivechat", ".b{}"), events: [] })));
    assert.equal(dom.window.document.querySelector("iframe"), first, "同 renderer 的主题更新应保留来源队列实例");

    await modules.reactTest.act(async () => root.render(modules.react.createElement(modules.listSurface.CompatibleListSurface, { descriptor: descriptor("bb-openlive", ".c{}"), events: [] })));
    assert.notEqual(dom.window.document.querySelector("iframe"), first, "跨 renderer 切换必须销毁旧来源文档");
  } finally {
    await modules.reactTest.act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
});

test("三版移除发布失败时恢复上一完整快照与绑定", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  for (const mode of compatibleModes) {
    const document = {
      ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()),
      themeId: `${mode}-remove-old`, origin: "custom", revision: 2,
    };
    const context = { target: "windows", targetId: "windows", roomId: "42", displayScale: 1.2 };
    let persisted = { document, context };
    let failRemovePublication = true;
    const bindingPort = memoryBindingPort([
      { targetId: "windows", targetKind: "windows", themeId: document.themeId, revision: 2, displayScale: 1.2 },
    ]);
    const registry = modules.bindings.createThemeBindingRegistry(bindingPort);
    const runtime = factories[mode](registry, {
      load: async () => [structuredClone(persisted)],
      loadTarget: async () => structuredClone(persisted),
      save: async value => { persisted = structuredClone(value); },
      remove: async () => { persisted = undefined; },
      publish: async value => {
        if ("type" in value && failRemovePublication) {
          failRemovePublication = false;
          throw new Error("移除发布失败");
        }
      },
      subscribe: async () => () => {},
    });
    const stop = await runtime.start();
    await assert.rejects(() => runtime.remove("windows", "windows"), /移除发布失败/);
    assert.equal(persisted?.document.themeId, document.themeId, `${mode} 必须恢复旧快照`);
    assert.equal((await registry.load())[0]?.themeId, document.themeId, `${mode} 必须恢复旧绑定`);
    assert.equal(runtime.snapshot("windows")?.document.themeId, document.themeId, `${mode} 必须恢复内存可见状态`);
    stop();
  }
});

test("三版按现场、副窗口和 OBS 独立解析，切回原生只清除对应目标", async () => {
  const factories = {
    blivechat: modules.blivechatRuntime.createBlivechatThemeRuntime,
    "blivechat-open": modules.openliveRuntime.createOpenLiveThemeRuntime,
    laplace: modules.laplaceRuntime.createLaplaceThemeRuntime,
  };
  for (const mode of compatibleModes) {
    const document = {
      ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()),
      themeId: `${mode}-targets`, origin: "custom", revision: 6,
    };
    const contexts = [
      { target: "live", targetId: "live", roomId: "101", displayScale: 1 },
      { target: "windows", targetId: "windows", roomId: "202", displayScale: 0.9 },
      { target: "obs", targetId: "obs:alpha", roomId: "303", displayScale: 1.25 },
      { target: "obs", targetId: "obs:beta", roomId: "404", displayScale: 0.8 },
    ];
    const snapshots = contexts.map(context => ({ document: structuredClone(document), context }));
    let storedBindings = contexts.map(context => ({ targetId: context.targetId, targetKind: context.target, themeId: document.themeId, revision: 6, displayScale: context.displayScale }));
    let bindingListener;
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort(storedBindings));
    const runtime = factories[mode](registry, {
      load: async () => structuredClone(snapshots),
      loadTarget: async targetId => structuredClone(snapshots.find(value => value.context.targetId === targetId)),
      save: async () => {}, remove: async () => {}, publish: async () => {}, subscribe: async () => () => {},
      loadBindings: async () => structuredClone(storedBindings),
      subscribeBindings: async listener => { bindingListener = listener; return () => { bindingListener = undefined; }; },
    });
    const stop = await runtime.start();
    for (const context of contexts) {
      const resolved = runtime.resolve({ target: context.target, targetId: context.targetId, roomId: Number(context.roomId), placement: "main" });
      assert.ok(resolved, `${mode} 应解析 ${context.targetId}`);
      assert.equal(runtime.snapshot(context.targetId)?.context.displayScale, context.displayScale);
    }

    storedBindings = storedBindings.filter(binding => binding.targetId !== "windows");
    bindingListener(structuredClone(storedBindings));
    assert.equal(runtime.resolve({ target: "windows", targetId: "windows", roomId: 202, placement: "main" }), undefined, `${mode} 切回原生后不得残留兼容 renderer`);
    assert.ok(runtime.resolve({ target: "live", targetId: "live", roomId: 101, placement: "main" }), `${mode} 不得影响现场`);
    assert.ok(runtime.resolve({ target: "obs", targetId: "obs:alpha", roomId: 303, placement: "main" }), `${mode} 不得影响其他 OBS`);
    assert.equal(runtime.resolve({ target: "obs", targetId: "obs:alpha", roomId: 404, placement: "main" })?.eventDecision({ roomId: 404, msgType: 1, ts: 1 }), "omit", `${mode} 必须保留房间分区`);
    stop();
  }
});

test("BLC 两版副窗口缩放通知失败后恢复旧绑定与旧快照", async () => {
  const factories = [
    ["blivechat", modules.blivechatRuntime.createBlivechatThemeRuntime],
    ["blivechat-open", modules.openliveRuntime.createOpenLiveThemeRuntime],
  ];
  for (const [mode, factory] of factories) {
    const document = { ...structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme()), themeId: `${mode}-scale`, origin: "custom", revision: 2 };
    let persisted = { document, context: { target: "windows", targetId: "windows", roomId: "42", displayScale: 1 } };
    const registry = modules.bindings.createThemeBindingRegistry(memoryBindingPort([{ targetId: "windows", targetKind: "windows", themeId: document.themeId, revision: 2, displayScale: 1 }]));
    const runtime = factory(registry, {
      load: async () => [structuredClone(persisted)], loadTarget: async () => structuredClone(persisted),
      save: async value => { persisted = structuredClone(value); }, remove: async () => {}, publish: async () => {}, subscribe: () => () => {},
      loadBindings: () => registry.load(), subscribeBindings: () => () => {},
      captureWindowProjection: async () => ({ projection: { displayScale: 1 } }),
      publishWindowProjection: async () => { throw new Error("窗口通知失败"); },
      restoreWindowProjection: async () => {},
    });
    const stop = await runtime.start();
    await assert.rejects(() => runtime.updateScale("windows", "windows", .9), /窗口通知失败/);
    assert.equal((await registry.load())[0].displayScale, 1, `${mode} 绑定必须回退`);
    assert.equal(persisted.context.displayScale, 1, `${mode} 持久快照必须回退`);
    assert.equal(runtime.snapshot("windows").context.displayScale, 1, `${mode} 内存快照必须回退`);
    stop();
  }
});
test("兼容主题按输出目标保留关闭事件并限制 OBS 补位", () => {
  const resolvers = { blivechat: modules.blivechatRuntime.resolvePublishedBlivechatRender, "blivechat-open": modules.openliveRuntime.resolvePublishedOpenLiveRender, laplace: modules.laplaceRuntime.resolvePublishedLaplaceRender };
  const event = { id: "disabled-message", roomId: 42, msgType: 0, ts: Date.now(), text: "关闭分类的弹幕", user: { uid: 7, uname: "用户" } };
  for (const mode of compatibleModes) {
    const document = structuredClone(modules.adapters.getThemeModeAdapter(mode).createBuiltinTheme());
    document.settings.eventVisibility = { categories: { danmaku: false }, children: {} };
    for (const target of ["live", "windows", "obs"]) {
      const render = resolvers[mode]({ document, context: { target, targetId: target, roomId: "42", displayScale: 1 } }, { target, targetId: target, roomId: 42, placement: "main" });
      assert.equal(render.eventDecision(event), target === "obs" ? "omit" : "render", `${mode}/${target} 关闭分类`);
      const unsupported = { ...event, msgType: 26, text: "封面审核通知" };
      assert.equal(render.eventDecision(unsupported), target === "obs" ? "omit" : "fallback", `${mode}/${target} 不支持分类`);
      assert.equal(render.eventDecision({ ...event, isComboUpdate: true }), "omit");
      assert.equal(render.eventDecision({ ...event, roomId: 99 }), "omit");
    }
  }
});
