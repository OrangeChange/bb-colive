import test from "node:test";
import assert from "node:assert/strict";
import { createThemeBindingRegistry } from "../src/themes/themeBindings.ts";
import { listThemeReferences } from "../src/themes/themeReferences.ts";
import { resolveWindowThemeTarget, windowThemeTargets } from "../src/themes/windowThemeTargets.ts";

test("公共模式保留全部独立配置，分别设置只在存在配置时启用独立目标", async () => {
  let saved = [{ targetId: "windows", targetKind: "windows", themeId: "shared", revision: 1, displayScale: 1.2 }];
  const registry = createThemeBindingRegistry({
    read: async () => structuredClone(saved),
    write: async bindings => { saved = structuredClone(bindings); },
  });
  assert.equal(resolveWindowThemeTarget("separate", "display", await registry.load()), "windows");
  await registry.bind({ targetId: "windows:display", targetKind: "windows", themeId: "chat", revision: 2, displayScale: 1.5 });
  await registry.bind({ targetId: "windows:guard", targetKind: "windows", themeId: "guard", revision: 3, displayScale: .9 });
  const bindings = await registry.load();
  assert.equal(resolveWindowThemeTarget("unified", "display", bindings), "windows");
  assert.equal(resolveWindowThemeTarget("separate", "display", bindings), "windows:display");
  assert.equal(resolveWindowThemeTarget("separate", "gift-only", bindings), "windows");
  assert.equal(resolveWindowThemeTarget("separate", "guard", bindings), "windows:guard");
  assert.equal(bindings.find(binding => binding.targetId === "windows").displayScale, 1.2);
  assert.equal(bindings.find(binding => binding.targetId === "windows:display").displayScale, 1.5);
  assert.equal((await registry.load()).length, 3);
});

test("窗口设置入口跟随组合与分拆模式，保留弹幕窗和关闭窗口的设置", () => {
  assert.deepEqual(windowThemeTargets("unified", "split").map(target => target.id), ["windows"]);
  assert.deepEqual(windowThemeTargets("separate", "combined").map(target => target.id), ["windows:display", "windows:gift"]);
  assert.deepEqual(windowThemeTargets("separate", "split").map(target => target.label), ["弹幕窗", "礼物窗", "醒目留言窗", "大航海窗"]);
});

test("独立窗口的主题引用使用对应窗口名称", () => {
  assert.deepEqual(listThemeReferences("theme", [
    { targetId: "windows:gift", targetKind: "windows", themeId: "theme", revision: 1 },
    { targetId: "windows:gift-only", targetKind: "windows", themeId: "theme", revision: 1 },
    { targetId: "windows:superchat", targetKind: "windows", themeId: "theme", revision: 1 },
  ]).map(reference => reference.label), ["收益窗", "礼物窗", "醒目留言窗"]);
});
