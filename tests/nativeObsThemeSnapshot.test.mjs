import test from "node:test";
import assert from "node:assert/strict";
import { createBuiltinNativeTheme } from "../src/themes/nativeBuiltinThemes.ts";
import { projectNativeTheme } from "../src/themes/nativeThemeProjection.ts";
import { buildNativeObsThemeSnapshot, snapshotForNativeObsTarget } from "../src/obs/nativeObsTheme.ts";
import { buildBlivechatObsSnapshot } from "../src/compat/blivechat/obs.ts";
import { buildOpenLiveObsSnapshot } from "../src/compat/openlive/obs.ts";
import { buildLaplaceObsSnapshot } from "../src/compat/laplace/obs.ts";

test("OBS 快照保留目标、绑定房间与可复用呈现数据", () => {
  const theme = createBuiltinNativeTheme("native-default");
  const projection = projectNativeTheme(theme);
  const snapshot = buildNativeObsThemeSnapshot(theme, "obs-a", projection, "2026-10-29T00:00:00Z", undefined, "12345");
  assert.equal(snapshot.targetId, "obs-a");
  assert.equal(snapshot.roomId, 12345);
  assert.equal(snapshot.themeId, theme.themeId);
  assert.equal(snapshot.css, projection.css);
  assert.equal(snapshot.eventFontSize, projection.display.baseFontSize);
});

test("OBS 快照使用配置绑定的显示缩放而不是重新投影为 100%", () => {
  const theme = createBuiltinNativeTheme("native-default");
  const projection = { ...projectNativeTheme(theme), displayScale: 1.5 };
  const snapshot = buildNativeObsThemeSnapshot(theme, "obs-two", projection, "2026-10-22T00:00:00.000Z");
  assert.equal(snapshot.targetId, "obs-two");
  assert.equal(snapshot.displayScale, 1.5);
});

test("OBS 快照保存独立的置顶开关和共享规则", () => {
  const theme = createBuiltinNativeTheme("native-default");
  const projection = projectNativeTheme(theme);
  const stickyEvents = { enabled: false, obsEnabled: true, position: "bottom", giftThreshold: 50, maxCount: 20, sort: "time" };
  const snapshot = buildNativeObsThemeSnapshot(theme, "obs", projection, "2026-10-22T00:00:00.000Z", stickyEvents);
  assert.deepEqual(snapshot.stickyEvents, stickyEvents);
});

test("三版兼容 OBS 快照保存每个目标的软件置顶设置", () => {
  const sticky = { enabled: true, obsEnabled: false, position: "bottom", giftThreshold: 88, maxCount: 7, sort: "time" };
  const context = { target: "obs", targetId: "obs-special", roomId: "42", displayScale: 1.3 };
  for (const [mode, build] of [["blivechat", buildBlivechatObsSnapshot], ["blivechat-open", buildOpenLiveObsSnapshot], ["laplace", buildLaplaceObsSnapshot]]) {
    const document = { themeId: mode, revision: 1, mode, origin: "custom", metadata: { name: mode, author: "test", version: "1" }, settings: {}, styles: { baseCss: "", visualCss: "", customCss: "" }, assets: [] };
    const snapshot = mode === "blivechat-open" ? build(document, context, {}, sticky) : mode === "blivechat" ? build(document, context, {}, sticky) : build(document, context, sticky);
    assert.deepEqual(snapshot.stickyEvents, sticky);
    assert.equal(snapshot.targetId, "obs-special");
  }
});

test("OBS 从有快照配置切到无快照配置时不会沿用旧目标快照", () => {
  const theme = createBuiltinNativeTheme("native-default");
  const snapshotA = buildNativeObsThemeSnapshot(theme, "obs-a", projectNativeTheme(theme));

  assert.strictEqual(snapshotForNativeObsTarget("obs-a", snapshotA), snapshotA);
  assert.equal(snapshotForNativeObsTarget("obs-empty", snapshotA), undefined);
});

test("OBS 从快照 A 切到 B 时只消费与当前目标一致的快照", () => {
  const theme = createBuiltinNativeTheme("native-default");
  const projection = projectNativeTheme(theme);
  const snapshotA = buildNativeObsThemeSnapshot(theme, "obs-a", projection);
  const snapshotB = buildNativeObsThemeSnapshot(theme, "obs-b", projection);

  assert.equal(snapshotForNativeObsTarget("obs-b", snapshotA), undefined);
  assert.strictEqual(snapshotForNativeObsTarget("obs-b", snapshotB), snapshotB);
});
