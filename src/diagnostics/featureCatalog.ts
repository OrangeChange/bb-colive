export type FeatureDiagnosticStream = "app" | "source" | "render" | "tts" | "markers";

export type FeatureDiagnosticStage =
  | "open"
  | "setting-change"
  | "request"
  | "query"
  | "success"
  | "failure"
  | "cancel"
  | "render";

export interface FeatureSnapshotSchema {
  version: number;
  keys: readonly string[];
}

export interface FeatureDiagnosticContract {
  id: string;
  panel: string;
  streams: readonly FeatureDiagnosticStream[];
  stages: readonly FeatureDiagnosticStage[];
  snapshotSchema: FeatureSnapshotSchema;
  failureHooks: readonly string[];
}

const COMMON_FAILURE_HOOKS = ["feature-failure"] as const;
const FULL_FEATURE_STAGES = ["open", "setting-change", "request", "success", "failure", "cancel", "render"] as const;
const NO_SETTING_FEATURE_STAGES = ["open", "request", "success", "failure", "cancel", "render"] as const;

/** 生产代码已声明、需要诊断覆盖的功能 ID；新增功能需同步加入此 registry 和 catalog。 */
export const PRODUCTION_FEATURE_IDS = [
  "scene",
  "floating-windows",
  "voice",
  "personal-broadcast",
  "event-interaction",
  "event-personalization",
  "startup-behavior",
  "room-insights",
  "gift-effects",
  "diagnostics",
  "review-archive",
  "cloud-recovery",
  "session",
] as const;

/** 新功能或新面板必须先在这里登记自己的诊断覆盖契约。 */
export const FEATURE_DIAGNOSTIC_CATALOG: FeatureDiagnosticContract[] = [
  {
    id: "scene",
    panel: "现场",
    streams: ["app", "source", "render"],
    stages: FULL_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["settings.scene"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "floating-windows",
    panel: "副窗口",
    streams: ["app", "render"],
    stages: FULL_FEATURE_STAGES,
    snapshotSchema: { version: 2, keys: ["environment.live", "settings.general.stickyEvents"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "voice",
    panel: "语音",
    streams: ["app", "tts"],
    stages: FULL_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["settings.voice"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "personal-broadcast",
    panel: "个性播报",
    streams: ["app", "tts", "render"],
    stages: FULL_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["settings.voice.personalBroadcast"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "event-interaction",
    panel: "事件交互",
    streams: ["app", "render", "markers"],
    stages: FULL_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["settings.voice.eventIntervalSeconds", "settings.voice.shortcutActions"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "event-personalization",
    panel: "样式",
    streams: ["app", "render"],
    stages: FULL_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["settings.general.eventFontSize", "settings.general.windowEventFontSize", "settings.general.eventDisplayPreferences", "settings.general.eventStyleSettings"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "startup-behavior",
    panel: "启动行为",
    streams: ["app"],
    stages: ["open", "setting-change", "request", "success", "failure", "cancel"],
    snapshotSchema: { version: 1, keys: ["settings.general.startOnBoot", "settings.general.autoConnectOnStartup"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "room-insights",
    panel: "直播间概览",
    streams: ["app", "source", "render"],
    stages: NO_SETTING_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["environment.live"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "gift-effects",
    panel: "礼物特效",
    streams: ["app", "source", "render"],
    stages: NO_SETTING_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["environment.live.giftOpen"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "diagnostics",
    panel: "诊断与日志",
    streams: ["app", "markers"],
    stages: NO_SETTING_FEATURE_STAGES,
    snapshotSchema: { version: 1, keys: ["build"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
  {
    id: "review-archive",
    panel: "回看档案",
    streams: ["app", "source", "render"],
    stages: ["open", "setting-change", "request", "query", "success", "failure", "cancel", "render"],
    snapshotSchema: {
      version: 2,
      keys: ["environment.appVersion", "environment.webview", "environment.webviewRuntimeVersion", "settings.general.reviewOpenCurrentOwner", "settings.general.reviewArchiveRetentionDays", "settings.general.reviewOwnerRetentionDays", "settings.general.reviewPinnedOwnerRoomIds", "archive", "review", "review.ownerMode", "review.ownerSessionFilters", "review.ownerEventSearch", "review.ownerEventResultNavigation"],
    },
    failureHooks: [
      "archive-open",
      "archive-write",
      "archive-query",
      "archive-render",
      "archive-favorite",
      "archive-nickname",
      "archive-import",
      "archive-export",
      "archive-delete",
    ],
  },
  {
    id: "cloud-recovery",
    panel: "云端记录恢复",
    streams: ["app"],
    stages: ["open", "setting-change", "request", "success", "failure", "cancel"],
    snapshotSchema: { version: 1, keys: ["archive"] },
    failureHooks: ["cloud-recovery-binding", "cloud-recovery-download", "cloud-recovery-restore"],
  },
  {
    id: "session",
    panel: "登录",
    streams: ["app"],
    stages: ["open", "request", "success", "failure", "cancel"],
    snapshotSchema: { version: 1, keys: ["environment.appVersion"] },
    failureHooks: COMMON_FAILURE_HOOKS,
  },
];

/** 测试和 CI 使用；运行时诊断不调用此断言，仍保持旁路和非阻断。 */
export function assertProductionFeatureCoverage(
  ids: readonly string[] = PRODUCTION_FEATURE_IDS,
): void {
  const catalogIds = new Set(FEATURE_DIAGNOSTIC_CATALOG.map((feature) => feature.id));
  const registeredIds = new Set(ids);
  const missingIds = ids.filter((id) => !catalogIds.has(id));
  const unregisteredIds = [...catalogIds].filter((id) => !registeredIds.has(id));
  if (missingIds.length > 0 || unregisteredIds.length > 0) {
    const details = [
      ...(missingIds.length > 0 ? [`not in catalog: ${missingIds.join(", ")}`] : []),
      ...(unregisteredIds.length > 0 ? [`not in registry: ${unregisteredIds.join(", ")}`] : []),
    ];
    throw new Error(`Production feature diagnostic coverage is incomplete (${details.join("; ")})`);
  }
}

export interface FeatureCoverageExpectation {
  streams?: readonly FeatureDiagnosticStream[];
  stages?: readonly FeatureDiagnosticStage[];
  snapshotKeys?: readonly string[];
  failureHooks?: readonly string[];
}

export function getFeatureDiagnosticContract(featureId: string): FeatureDiagnosticContract | undefined {
  return FEATURE_DIAGNOSTIC_CATALOG.find((feature) => feature.id === featureId);
}

/** 测试和开发检查使用；业务诊断记录本身仍保持旁路，不因缺失注册而抛错。 */
export function assertFeatureCoverage(
  featureId: string,
  expected: FeatureCoverageExpectation = {},
): FeatureDiagnosticContract {
  const feature = getFeatureDiagnosticContract(featureId);
  if (!feature) throw new Error(`Feature diagnostic coverage is not registered: ${featureId}`);

  const assertIncludes = (label: string, actual: readonly string[], required: readonly string[] | undefined) => {
    for (const item of required ?? []) {
      if (!actual.includes(item)) throw new Error(`Feature ${featureId} is missing ${label}: ${item}`);
    }
  };
  assertIncludes("stream", feature.streams, expected.streams);
  assertIncludes("stage", feature.stages, expected.stages);
  assertIncludes("snapshot key", feature.snapshotSchema.keys, expected.snapshotKeys);
  assertIncludes("failure hook", feature.failureHooks, expected.failureHooks);
  return feature;
}
