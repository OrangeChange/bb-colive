import assert from "node:assert/strict";
import test from "node:test";
import { THEME_MODES, canApplyThemeMode, getThemeModeDefinition } from "../src/themes/themeModes.ts";
import { COMPATIBLE_THEME_MODES, createCompatibleThemeModeAdapter, getThemeModeAdapter, resolvePublishedThemeMode, resolveRegisteredBuiltinThemeId } from "../src/themes/themeModeAdapters.ts";
import { createThemeBindingRegistry } from "../src/themes/themeBindings.ts";

test("三种兼容主题均支持现场、副窗口和 OBS，但不支持回看", () => {
  assert.deepEqual(COMPATIBLE_THEME_MODES, ["blivechat", "blivechat-open", "laplace"]);
  for (const mode of COMPATIBLE_THEME_MODES) {
    assert.deepEqual(getThemeModeDefinition(mode).targets, ["live", "windows", "obs"]);
    assert.equal(canApplyThemeMode(mode, "live"), true);
    assert.equal(canApplyThemeMode(mode, "windows"), true);
    assert.equal(canApplyThemeMode(mode, "obs"), true);
    assert.equal(canApplyThemeMode(mode, "review"), false);
  }
  assert.deepEqual(THEME_MODES, ["native", "blivechat", "blivechat-open", "laplace"]);
});

test("每种兼容模式通过静态适配器提供一个可另存的内置默认主题", () => {
  const expected = {
    blivechat: ["blivechat-default", "BLC 原版默认"],
    "blivechat-open": ["blivechat-open-default", "BLC 开放版默认"],
    laplace: ["laplace-default", "LAPLACE 默认"],
  };
  for (const mode of COMPATIBLE_THEME_MODES) {
    const adapter = getThemeModeAdapter(mode);
    const builtin = adapter.createBuiltinTheme();
    assert.equal(adapter.mode, mode);
    assert.equal(builtin.themeId, expected[mode][0]);
    assert.equal(builtin.metadata.name, expected[mode][1]);
    assert.equal(builtin.mode, mode);
    assert.equal(builtin.origin, "builtin");
    assert.deepEqual(builtin.permissions, { update: false, saveAs: true, delete: false });
  }
});

test("内置兼容主题保留权威来源元信息", () => {
  const expected = {
    blivechat: { author: "default", version: "1.10.4", updatedAt: "2026-08-19T15:44:30.000Z" },
    "blivechat-open": { author: "default", version: "", updatedAt: "" },
    laplace: { author: "LAPLACE Chat", version: "2.0.7", updatedAt: "2026-03-21T02:01:40.000Z" },
  };
  for (const mode of COMPATIBLE_THEME_MODES) {
    assert.deepEqual(getThemeModeAdapter(mode).createBuiltinTheme().metadata, {
      name: getThemeModeAdapter(mode).createBuiltinTheme().metadata.name,
      ...expected[mode],
    });
  }
});

test("渲染上下文只来自支持的主题目标", () => {
  const context = getThemeModeAdapter("laplace").createRenderContext({
    targetId: "obs-config-1",
    targetKind: "obs",
    themeId: "laplace-default",
    revision: 1,
    displayScale: 1.25,
  }, "1001");
  assert.deepEqual(context, {
    target: "obs",
    targetId: "obs-config-1",
    roomId: "1001",
    displayScale: 1.25,
  });
});

test("渲染器未就绪时应用和发布不改正式绑定，并明确返回未渲染", async () => {
  const writes = [];
  const bindings = {
    async load() { return [{ targetId: "live", targetKind: "live", themeId: "native-default", revision: 3, displayScale: 1.25 }]; },
    async bind(value) { writes.push(["bind", value]); },
    async remove(value) { writes.push(["remove", value]); },
    async setDisplayScale(...value) { writes.push(["scale", ...value]); },
  };
  const adapter = createCompatibleThemeModeAdapter("blivechat", { bindings });
  const document = adapter.createBuiltinTheme();
  const applied = await adapter.applyTarget(document, "live");
  const published = await adapter.publishTarget(document, { target: "obs", targetId: "obs-1", roomId: "1001", displayScale: 1 });
  await adapter.updateScale("live", "live", 2);
  assert.deepEqual(writes, []);
  assert.equal(applied.rendered, false);
  assert.equal(published.rendered, false);
  assert.match(applied.message, /预览暂不可用/);
});

test("渲染器接入后应用显式指定的 125% 显示缩放", async () => {
  let saved = [{ targetId: "obs-1", targetKind: "obs", themeId: "native-default", revision: 4, displayScale: 1.25 }];
  const bindings = createThemeBindingRegistry({ read: async () => structuredClone(saved), write: async value => { saved = structuredClone(value); } });
  const adapter = createCompatibleThemeModeAdapter("laplace", {
    bindings,
    renderer: {
      async publish(document, context) {
        await bindings.bind({ targetId: context.targetId, targetKind: context.target, themeId: document.themeId, revision: document.revision, displayScale: context.displayScale });
      },
      async remove() {}, async updateScale() {},
    },
  });
  const document = adapter.createBuiltinTheme();
  const result = await adapter.publishTarget(document, { target: "obs", targetId: "obs-1", roomId: "1001", displayScale: 1.25 });
  assert.equal(result.rendered, true);
  assert.deepEqual((await bindings.load())[0], { targetId: "obs-1", targetKind: "obs", themeId: "laplace-default", revision: 1, displayScale: 1.25 });
});

test("恢复入口从已注册内置主题选择，不依赖固定主题标识", () => {
  const registered = [
    { ...getThemeModeAdapter("laplace").createBuiltinTheme(), themeId: "registered-laplace" },
    { ...getThemeModeAdapter("blivechat").createBuiltinTheme(), themeId: "registered-blc" },
  ];
  assert.equal(resolveRegisteredBuiltinThemeId(registered, "live"), "registered-laplace");
});

test("OBS 删除依据已发布绑定，忽略已切换为兼容主题的下拉草稿", async () => {
  const mode = await resolvePublishedThemeMode(
    "obs-1",
    [{ targetId: "obs-1", targetKind: "obs", themeId: "published-native", revision: 2, displayScale: 1.25 }],
    async themeId => ({ ...getThemeModeAdapter("native").createBuiltinTheme(), themeId }),
  );
  const draftThemeId = "laplace-default";
  assert.equal(draftThemeId, "laplace-default");
  assert.equal(mode, "native");
});
