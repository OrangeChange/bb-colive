import { getDiagnosticContext } from "./diagnosticLogger.ts";
import { FEATURE_DIAGNOSTIC_CATALOG, getFeatureDiagnosticContract } from "./featureCatalog.ts";
import { sourceDiagnosticLogger } from "./sourceLogger.ts";
import { renderDiagnosticLogger } from "./renderLogger.ts";
import type {
  FeatureDiagnosticContract,
  FeatureDiagnosticStage,
  FeatureDiagnosticStream,
} from "./featureCatalog.ts";
export { FEATURE_DIAGNOSTIC_CATALOG } from "./featureCatalog.ts";
export {
  assertFeatureCoverage,
  assertProductionFeatureCoverage,
  getFeatureDiagnosticContract,
  PRODUCTION_FEATURE_IDS,
} from "./featureCatalog.ts";
export type {
  FeatureCoverageExpectation,
  FeatureDiagnosticContract,
  FeatureDiagnosticStage,
  FeatureDiagnosticStream,
  FeatureSnapshotSchema,
} from "./featureCatalog.ts";

export function getFeatureCoverageIssue(
  featureId: string,
  stage: FeatureDiagnosticStage,
  stream?: FeatureDiagnosticStream,
): "unregistered" | "stage-unregistered" | "stream-unregistered" | undefined {
  const feature = getFeatureDiagnosticContract(featureId);
  if (!feature) return "unregistered";
  if (!feature.stages.includes(stage)) return "stage-unregistered";
  if (stream !== undefined && !feature.streams.includes(stream)) return "stream-unregistered";
  return undefined;
}

export interface FeatureDiagnosticInput {
  featureId: string;
  stage: FeatureDiagnosticStage;
  action: string;
  outcome: string;
  eventId?: string;
  requestId?: string;
  roomId?: string | number;
  connectionId?: string;
  windowLabel?: string;
  data?: Record<string, string | number | boolean | null>;
}

export interface FeatureSnapshotMissingItem {
  featureId: string;
  key: string;
}

export interface FeatureSnapshotCollection {
  snapshots: Record<string, Record<string, unknown>>;
  missing: FeatureSnapshotMissingItem[];
}

export interface FeatureDiagnosticActivity {
  count: number;
  stages: Record<string, number>;
  streams: Record<string, number>;
  outcomes: Record<string, number>;
}

export interface FeatureSettingChangeInput {
  featureId: string;
  changedKeys: readonly string[];
  action?: string;
  previousValues?: Record<string, unknown>;
  currentValues?: Record<string, unknown>;
}

export interface FeatureSettingHistoryEntry {
  changedAt: number;
  featureId: string;
  changedKeys: string[];
  previous: Record<string, string | number | boolean | null>;
  current: Record<string, string | number | boolean | null>;
}

export interface FeatureStreamDiagnosticInput {
  featureId: string;
  stream: "source" | "render";
  stage: FeatureDiagnosticStage;
  action: string;
  outcome: string;
  sessionId?: string;
  eventId?: string;
  connectionId?: string;
  roomId?: string | number;
  windowLabel?: string;
  data?: Record<string, string | number | boolean | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const featureActivity = new Map<string, FeatureDiagnosticActivity>();
const featureSettingHistory: FeatureSettingHistoryEntry[] = [];
const MAX_FEATURE_SETTING_HISTORY = 64;

function increment(target: Record<string, number>, key: string): void {
  target[key] = (target[key] ?? 0) + 1;
}

function normalizeActivityOutcome(value: string): string {
  const normalized = value.trim();
  return /^[A-Za-z0-9._:-]{1,64}$/.test(normalized) ? normalized : "other";
}

/** 当前进程中实际记录过的功能活动；只保存计数，不复制事件内容或设置值。 */
export function recordFeatureActivity(
  featureId: string,
  stage: FeatureDiagnosticStage,
  outcome: string,
  stream?: FeatureDiagnosticStream,
): void {
  const current = featureActivity.get(featureId) ?? {
    count: 0,
    stages: {},
    streams: {},
    outcomes: {},
  };
  current.count += 1;
  increment(current.stages, stage);
  increment(current.outcomes, normalizeActivityOutcome(outcome));
  if (stream) increment(current.streams, stream);
  featureActivity.set(featureId, current);
}

export function collectFeatureActivity(): Record<string, FeatureDiagnosticActivity> {
  return Object.fromEntries([...featureActivity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([featureId, activity]) => [featureId, {
      count: activity.count,
      stages: Object.fromEntries(Object.entries(activity.stages).sort(([left], [right]) => left.localeCompare(right))),
      streams: Object.fromEntries(Object.entries(activity.streams).sort(([left], [right]) => left.localeCompare(right))),
      outcomes: Object.fromEntries(Object.entries(activity.outcomes).sort(([left], [right]) => left.localeCompare(right))),
    }]));
}

function toDiagnosticScalar(value: unknown): string | number | boolean | null | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function collectChangedValues(source: Record<string, unknown> | undefined, changedKeys: readonly string[]): Record<string, string | number | boolean | null> {
  if (!source) return {};
  const values: Record<string, string | number | boolean | null> = {};
  for (const key of changedKeys) {
    const value = toDiagnosticScalar(readPath(source, key));
    if (value !== undefined) values[key] = value;
  }
  return values;
}

export function collectFeatureSettingHistory(): FeatureSettingHistoryEntry[] {
  return featureSettingHistory.map((entry) => ({
    changedAt: entry.changedAt,
    featureId: entry.featureId,
    changedKeys: [...entry.changedKeys],
    previous: { ...entry.previous },
    current: { ...entry.current },
  }));
}

/** 比较设置快照的键路径，不返回设置值，避免高频配置变化膨胀普通日志。 */
export function getChangedSettingPaths(previous: unknown, current: unknown, prefix = ""): string[] {
  if (Object.is(previous, current)) return [];
  if (!isRecord(previous) || !isRecord(current)) return prefix ? [prefix] : [];

  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  const changed: string[] = [];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    changed.push(...getChangedSettingPaths(previous[key], current[key], path));
  }
  return changed.length > 0 ? changed : (prefix ? [prefix] : []);
}

export function collectFeatureManifest(): FeatureDiagnosticContract[] {
  return FEATURE_DIAGNOSTIC_CATALOG.map((feature) => ({
    ...feature,
    streams: [...feature.streams],
    stages: [...feature.stages],
    snapshotSchema: {
      version: feature.snapshotSchema.version,
      keys: [...feature.snapshotSchema.keys],
    },
    failureHooks: [...feature.failureHooks],
  }));
}

/** 记录功能级生命周期；记录失败不能反过来阻断业务功能。 */
export function recordFeatureDiagnostic(input: FeatureDiagnosticInput): void {
  recordFeatureActivity(input.featureId, input.stage, input.outcome, "app");
  try {
    const coverage = getFeatureCoverageIssue(input.featureId, input.stage);
    getDiagnosticContext().record({
      subsystem: "feature",
      action: input.action,
      outcome: input.outcome,
      eventId: input.eventId,
      requestId: input.requestId,
      roomId: input.roomId,
      connectionId: input.connectionId,
      windowLabel: input.windowLabel,
      data: {
        ...(input.data ?? {}),
        featureId: input.featureId,
        stage: input.stage,
        ...(coverage ? { coverage } : {}),
      },
    });
  } catch {
    // 诊断是旁路能力，不能让日志异常影响现场处理或语音播报。
  }
}

/** 把功能生命周期同时写入 source/render 详细流；异常只丢弃该条旁路记录。 */
export function recordFeatureStreamDiagnostic(input: FeatureStreamDiagnosticInput): void {
  recordFeatureActivity(input.featureId, input.stage, input.outcome, input.stream);
  try {
    const coverage = getFeatureCoverageIssue(input.featureId, input.stage, input.stream);
    const data = {
      ...(input.data ?? {}),
      featureId: input.featureId,
      stage: input.stage,
      action: input.action,
      outcome: input.outcome,
      ...(coverage ? { coverage } : {}),
    };
    if (input.stream === "source") {
      sourceDiagnosticLogger.recordFeature({
        featureId: input.featureId,
        stage: input.stage,
        action: input.action,
        outcome: input.outcome,
        sessionId: input.sessionId,
        eventId: input.eventId,
        connectionId: input.connectionId,
        roomId: input.roomId,
        data,
      });
    } else {
      renderDiagnosticLogger.recordFeature({
        featureId: input.featureId,
        stage: input.stage,
        action: input.action,
        outcome: input.outcome,
        sessionId: input.sessionId,
        eventId: input.eventId,
        connectionId: input.connectionId,
        roomId: input.roomId,
        windowLabel: input.windowLabel,
        data,
      });
    }
  } catch {
    // source/render 详细诊断是旁路能力，不能阻断数据接收或实际渲染。
  }
}

/** 记录稳定后的设置变更键；具体值从导出快照读取，避免把整份设置重复写入 app 流。 */
export function recordFeatureSettingChange(input: FeatureSettingChangeInput): void {
  const changedKeys = input.changedKeys.filter((key) => key.trim().length > 0);
  if (changedKeys.length === 0) return;
  featureSettingHistory.push({
    changedAt: Date.now(),
    featureId: input.featureId,
    changedKeys: [...changedKeys],
    previous: collectChangedValues(input.previousValues, changedKeys),
    current: collectChangedValues(input.currentValues, changedKeys),
  });
  if (featureSettingHistory.length > MAX_FEATURE_SETTING_HISTORY) featureSettingHistory.splice(0, featureSettingHistory.length - MAX_FEATURE_SETTING_HISTORY);
  recordFeatureDiagnostic({
    featureId: input.featureId,
    stage: "setting-change",
    action: input.action ?? "settings-updated",
    outcome: "changed",
    data: { changedKeys: changedKeys.join(",") },
  });
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function writePath(target: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split(".");
  let cursor = target;
  for (const key of keys.slice(0, -1)) {
    const existing = cursor[key];
    if (!isRecord(existing)) cursor[key] = {};
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1]] = value;
}

/**
 * 根据功能契约从导出快照中取值，并显式返回缺失项。
 * 缺失不会伪装成“已覆盖”，便于新面板上线后立即发现忘记提供快照。
 */
export function collectFeatureSnapshots(context: Record<string, unknown>): FeatureSnapshotCollection {
  const snapshots: Record<string, Record<string, unknown>> = {};
  const missing: FeatureSnapshotMissingItem[] = [];

  for (const feature of FEATURE_DIAGNOSTIC_CATALOG) {
    const featureSnapshot: Record<string, unknown> = {};
    let found = false;
    for (const key of feature.snapshotSchema.keys) {
      const value = readPath(context, key);
      if (value === undefined) {
        missing.push({ featureId: feature.id, key });
        continue;
      }
      writePath(featureSnapshot, key, value);
      found = true;
    }
    if (found) snapshots[feature.id] = featureSnapshot;
  }

  return { snapshots, missing };
}
