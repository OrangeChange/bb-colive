import assert from "node:assert/strict";
import test from "node:test";

import {
  collectFeatureManifest,
  collectFeatureActivity,
  collectFeatureSettingHistory,
  collectFeatureSnapshots,
  FEATURE_DIAGNOSTIC_CATALOG,
  getChangedSettingPaths,
  assertFeatureCoverage,
  assertProductionFeatureCoverage,
  PRODUCTION_FEATURE_IDS,
  recordFeatureDiagnostic,
} from "../src/diagnostics/featureDiagnostics.ts";
import { createDiagnosticContext, flushAllDiagnosticLogs } from "../src/diagnostics/diagnosticLogger.ts";

test("功能诊断目录包含唯一且完整的功能契约", () => {
  const ids = FEATURE_DIAGNOSTIC_CATALOG.map((feature) => feature.id);
  const streams = new Set(["app", "source", "render", "tts", "markers"]);
  const stages = new Set(["open", "setting-change", "request", "query", "success", "failure", "cancel", "render"]);
  assert.ok(ids.length >= 10);
  assert.equal(new Set(ids).size, ids.length);
  for (const feature of FEATURE_DIAGNOSTIC_CATALOG) {
    assert.ok(feature.panel);
    assert.ok(feature.streams.length > 0);
    assert.ok(feature.streams.every((stream) => streams.has(stream)));
    assert.ok(feature.stages.every((stage) => stages.has(stage)));
    assert.ok(feature.stages.includes("success"));
    assert.ok(feature.stages.includes("failure"));
    assert.ok(feature.snapshotSchema.version >= 1);
    assert.ok(feature.snapshotSchema.keys.length > 0);
    assert.ok(feature.failureHooks.length > 0);
  }
});

test("review archive 在单一目录中声明 app/source/render 覆盖和快照契约", () => {
  const archive = FEATURE_DIAGNOSTIC_CATALOG.find((feature) => feature.id === "review-archive");
  assert.ok(archive);
  assert.deepEqual(archive.streams, ["app", "source", "render"]);
  assert.deepEqual(archive.stages, ["open", "setting-change", "request", "query", "success", "failure", "cancel", "render"]);
  assert.ok(archive.snapshotSchema.version >= 1);
  assert.ok(archive.snapshotSchema.keys.includes("archive"));
  assert.ok(archive.snapshotSchema.keys.includes("review"));
  for (const key of [
    "review.ownerMode",
    "review.ownerSessionFilters",
    "review.ownerEventSearch",
    "review.ownerEventResultNavigation",
  ]) assert.ok(archive.snapshotSchema.keys.includes(key), `缺少诊断快照键 ${key}`);
  assert.ok(archive.failureHooks.includes("archive-write"));
  assert.ok(archive.failureHooks.includes("archive-export"));
});

test("生产功能 ID registry 中的每个 ID 都有 catalog 覆盖", () => {
  assert.ok(PRODUCTION_FEATURE_IDS.includes("review-archive"));
  assert.ok(PRODUCTION_FEATURE_IDS.includes("session"));
  assert.doesNotThrow(() => assertProductionFeatureCoverage());
  assert.throws(
    () => assertProductionFeatureCoverage([...PRODUCTION_FEATURE_IDS, "catalog-missing-feature"]),
    /catalog-missing-feature/,
  );
});

test("当前目录中的每个生产功能都进入 registry", () => {
  const catalogIds = FEATURE_DIAGNOSTIC_CATALOG.map((feature) => feature.id).sort();
  assert.deepEqual([...PRODUCTION_FEATURE_IDS].sort(), catalogIds);
});

test("登录会话有独立的功能诊断契约", () => {
  const session = FEATURE_DIAGNOSTIC_CATALOG.find((feature) => feature.id === "session");
  assert.ok(session);
  assert.equal(session.panel, "登录");
  assert.deepEqual(session.streams, ["app"]);
  assert.deepEqual(session.stages, ["open", "request", "success", "failure", "cancel"]);
  assert.deepEqual(session.snapshotSchema.keys, ["environment.appVersion"]);
});

test("功能流越界时会被标记为 stream-unregistered", async () => {
  const { getFeatureCoverageIssue } = await import("../src/diagnostics/featureDiagnostics.ts");
  assert.equal(getFeatureCoverageIssue("voice", "success", "render"), "stream-unregistered");
  assert.equal(getFeatureCoverageIssue("voice", "success", "tts"), undefined);
  assert.equal(getFeatureCoverageIssue("voice", "render", "tts"), undefined);
});

test("新增事件个性化和启动行为具有独立诊断契约", () => {
  const personalization = FEATURE_DIAGNOSTIC_CATALOG.find((feature) => feature.id === "event-personalization");
  const startup = FEATURE_DIAGNOSTIC_CATALOG.find((feature) => feature.id === "startup-behavior");
  assert.deepEqual(personalization, {
    id: "event-personalization",
    panel: "样式",
    streams: ["app", "render"],
    stages: ["open", "setting-change", "request", "success", "failure", "cancel", "render"],
    snapshotSchema: {
      version: 1,
      keys: [
        "settings.general.eventFontSize",
        "settings.general.windowEventFontSize",
        "settings.general.eventDisplayPreferences",
        "settings.general.eventStyleSettings",
      ],
    },
    failureHooks: ["feature-failure"],
  });
  assert.deepEqual(startup, {
    id: "startup-behavior",
    panel: "启动行为",
    streams: ["app"],
    stages: ["open", "setting-change", "request", "success", "failure", "cancel"],
    snapshotSchema: { version: 1, keys: ["settings.general.startOnBoot", "settings.general.autoConnectOnStartup"] },
    failureHooks: ["feature-failure"],
  });
});

test("功能诊断记录带有功能标识和阶段，并进入统一 app 流", async () => {
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "launch-feature-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });

  recordFeatureDiagnostic({
    featureId: "voice",
    stage: "failure",
    action: "synthesis",
    outcome: "network-error",
    requestId: "request-1",
    data: { retryable: true },
  });
  await flushAllDiagnosticLogs();
  context.stop?.();

  const record = JSON.parse(writes.join("").trim());
  assert.equal(record.kind, "app");
  assert.equal(record.subsystem, "feature");
  assert.equal(record.data.featureId, "voice");
  assert.equal(record.data.stage, "failure");
  assert.equal(record.requestId, "request-1");
  const activity = collectFeatureActivity();
  assert.ok(activity.voice.count >= 1);
  assert.ok(activity.voice.stages.failure >= 1);
});

test("设置变更诊断只记录功能和变更键，不复制完整设置值", async () => {
  const writes = [];
  const context = createDiagnosticContext({
    sessionId: "setting-change-test",
    invoke: async (_command, args) => writes.push(args.lines),
    flushIntervalMs: 0,
  });

  const { recordFeatureSettingChange } = await import("../src/diagnostics/featureDiagnostics.ts");
  recordFeatureSettingChange({
    featureId: "event-personalization",
    changedKeys: ["eventDisplayPreferences.eventAnimationDurationMs", "eventStyleSettings.fontFamily"],
  });
  await flushAllDiagnosticLogs();
  context.stop?.();

  const record = JSON.parse(writes.join("").trim());
  assert.equal(record.data.featureId, "event-personalization");
  assert.equal(record.data.stage, "setting-change");
  assert.equal(record.data.changedKeys, "eventDisplayPreferences.eventAnimationDurationMs,eventStyleSettings.fontFamily");
  assert.equal(record.data.eventAnimationDurationMs, undefined);
});

test("设置变更历史保留可安全还原的前后值和时间", async () => {
  const before = collectFeatureSettingHistory().length;
  const previousValues = { eventDisplayPreferences: { eventSpacing: 2 } };
  const currentValues = { eventDisplayPreferences: { eventSpacing: 6 } };
  const { recordFeatureSettingChange } = await import("../src/diagnostics/featureDiagnostics.ts");
  recordFeatureSettingChange({
    featureId: "event-personalization",
    changedKeys: ["eventDisplayPreferences.eventSpacing"],
    previousValues,
    currentValues,
  });
  const entry = collectFeatureSettingHistory()[before];
  assert.ok(entry.changedAt > 0);
  assert.deepEqual(entry.previous, { "eventDisplayPreferences.eventSpacing": 2 });
  assert.deepEqual(entry.current, { "eventDisplayPreferences.eventSpacing": 6 });
});

test("设置变更路径能定位到嵌套样式字段并合并数组字段", () => {
  assert.deepEqual(getChangedSettingPaths(
    { eventAnimationDurationMs: 300, eventTypes: { danmu: { content: "#fff" } }, roles: ["anchor"] },
    { eventAnimationDurationMs: 350, eventTypes: { danmu: { content: "#000" } }, roles: ["captain"] },
  ), [
    "eventAnimationDurationMs",
    "eventTypes.danmu.content",
    "roles",
  ]);
});

test("功能快照缺失时返回缺失项，而不是静默当作完整", () => {
  const result = collectFeatureSnapshots({
    settings: { voice: { enabled: true } },
    environment: { live: { roomId: 123 } },
  });
  assert.ok(result.snapshots.voice);
  assert.ok(result.missing.some((item) => item.featureId === "scene"));
});

test("功能覆盖检查能验证已注册功能的声明", () => {
  assert.doesNotThrow(() => assertFeatureCoverage("review-archive", {
    streams: ["app", "source", "render"],
    stages: ["query", "failure", "render"],
    snapshotKeys: ["archive", "review"],
    failureHooks: ["archive-export"],
  }));
});

test("功能清单按声明的嵌套键逐项报告缺失快照", () => {
  const result = collectFeatureSnapshots({
    build: "development",
    environment: { live: { roomId: 123, giftOpen: false } },
    settings: {
      scene: {},
      general: {
        eventStyleSettings: {},
        autoConnectOnStartup: false,
      },
      voice: {
        enabled: false,
        personalBroadcast: {},
        shortcutActions: ["speak"],
      },
    },
  });
  const missing = result.missing.map((item) => `${item.featureId}:${item.key}`);
  assert.ok(missing.includes("event-interaction:settings.voice.eventIntervalSeconds"));
  assert.ok(missing.includes("event-personalization:settings.general.eventDisplayPreferences"));
  assert.ok(missing.includes("startup-behavior:settings.general.startOnBoot"));
});

test("功能快照保留同一功能下的所有同级字段", () => {
  const result = collectFeatureSnapshots({
    build: "development",
    environment: {
      appVersion: "0.2.8",
      webview: "edge",
      webviewRuntimeVersion: "153",
      live: { giftOpen: false, roomId: 123 },
    },
    settings: {
      scene: {},
      general: {
        eventFontSize: 16,
        windowEventFontSize: 16,
        eventDisplayPreferences: { showAvatar: true },
        stickyEvents: { enabled: false, position: 'top', giftThreshold: 30, maxCount: 10, sort: 'amount' },
        eventStyleSettings: { fontFamily: "MiSans" },
        startOnBoot: false,
        autoConnectOnStartup: false,
        reviewOpenCurrentOwner: true,
        reviewArchiveRetentionDays: null,
        reviewOwnerRetentionDays: { "room:123": 30 },
        reviewPinnedOwnerRoomIds: [],
      },
      voice: {
        eventIntervalSeconds: 0,
        shortcutActions: ["speak"],
        personalBroadcast: { enabled: false },
      },
    },
    archive: {},
    review: {
      ownerMode: "events",
      ownerSessionFilters: { activeKeys: [] },
      ownerEventSearch: { activeFilterKeys: [], groupCount: 1, matchCount: 1, durationMs: 2 },
      ownerEventResultNavigation: { count: 1, lastTargetFound: true },
    },
  });

  assert.deepEqual(result.missing, []);
  assert.equal(result.snapshots["event-personalization"].settings.general.eventFontSize, 16);
  assert.ok(result.snapshots["event-personalization"].settings.general.eventDisplayPreferences);
  assert.ok(result.snapshots["event-personalization"].settings.general.eventStyleSettings);
  assert.equal(result.snapshots["review-archive"].environment.appVersion, "0.2.8");
  assert.equal(result.snapshots["review-archive"].settings.general.reviewOwnerRetentionDays["room:123"], 30);
  assert.equal(result.snapshots["review-archive"].review.ownerMode, "events");
  assert.ok(result.snapshots["review-archive"].review.ownerSessionFilters);
  assert.ok(result.snapshots["review-archive"].review.ownerEventSearch);
  assert.ok(result.snapshots["review-archive"].review.ownerEventResultNavigation);
});

test("导出的功能清单保留契约元数据和快照缺失状态", () => {
  const manifest = collectFeatureManifest();
  assert.equal(manifest.length, FEATURE_DIAGNOSTIC_CATALOG.length);
  assert.deepEqual(manifest.find((feature) => feature.id === "voice"), {
    id: "voice",
    panel: "语音",
    streams: ["app", "tts"],
    stages: ["open", "setting-change", "request", "success", "failure", "cancel", "render"],
    snapshotSchema: { version: 1, keys: ["settings.voice"] },
    failureHooks: ["feature-failure"],
  });
  assert.deepEqual(manifest.find((feature) => feature.id === "event-interaction").snapshotSchema.keys, [
    "settings.voice.eventIntervalSeconds",
    "settings.voice.shortcutActions",
  ]);
});
