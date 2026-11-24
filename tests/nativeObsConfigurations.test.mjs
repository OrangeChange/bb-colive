import test from "node:test";
import assert from "node:assert/strict";
import { createNativeObsConfigurationStore, obsThemeOptions } from "../src/obs/nativeObsConfigurations.ts";

test("多个 OBS 配置独立保存房间、主题和修订版本", async () => {
  let saved = [];
  const store = createNativeObsConfigurationStore({
    read: async () => structuredClone(saved),
    write: async value => { saved = structuredClone(value); },
  });
  await store.save({ id: "obs-a", name: "A", roomId: "100", themeId: "theme-a", themeRevision: 2 });
  await store.save({ id: "obs-b", name: "B", roomId: "200", themeId: "theme-b", themeRevision: 7 });
  assert.deepEqual(await store.load(), [
    { id: "obs-a", name: "A", roomId: "100", themeId: "theme-a", themeRevision: 2 },
    { id: "obs-b", name: "B", roomId: "200", themeId: "theme-b", themeRevision: 7 },
  ]);
  await store.save({ id: "obs-a", name: "A", roomId: "101", themeId: "theme-a", themeRevision: 3 });
  assert.deepEqual((await store.load()).map(item => [item.id, item.roomId, item.themeRevision]), [["obs-a", "101", 3], ["obs-b", "200", 7]]);
});

test("删除 OBS 配置只删除对应记录", async () => {
  let saved = [
    { id: "obs-a", name: "A", roomId: "100", themeId: "theme-a", themeRevision: 2 },
    { id: "obs-b", name: "B", roomId: "200", themeId: "theme-b", themeRevision: 7 },
  ];
  const store = createNativeObsConfigurationStore({ read: async () => structuredClone(saved), write: async value => { saved = structuredClone(value); } });
  await store.remove("obs-a");
  assert.deepEqual((await store.load()).map(item => item.id), ["obs-b"]);
});

test("OBS 配置引用已删除主题时保留原名称并允许改选", () => {
  const themes = [{ themeId: "theme-b", name: "可用主题" }];
  assert.deepEqual(obsThemeOptions({ themeId: "theme-a", themeName: "旧主题" }, themes), [
    { value: "theme-a", label: "旧主题（已删除）", disabled: true },
    { value: "theme-b", label: "可用主题" },
  ]);
  assert.deepEqual(obsThemeOptions({ themeId: "theme-b", themeName: "旧名称" }, themes), [
    { value: "theme-b", label: "可用主题" },
  ]);
});
