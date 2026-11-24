import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { flushAllDiagnosticLogs as flushLogs } from "./diagnosticLogger.ts";
import type { DiagnosticFlushResult, DiagnosticStatus } from "./diagnosticTypes.ts";
import type { FeatureDiagnosticContract } from "./featureCatalog.ts";
import type { FeatureDiagnosticActivity, FeatureSettingHistoryEntry, FeatureSnapshotMissingItem } from "./featureDiagnostics.ts";
export {
  buildDiagnosticExportFileName,
  formatDiagnosticExportTimestamp,
  generateDiagnosticExportId,
  getDiagnosticExportId,
} from "./exportFileName.ts";

export interface DiagnosticStatusSnapshot {
  status: DiagnosticStatus;
  totalBytes: number;
  normalBytes: number;
  detailedBytes: number;
  writeFailures: number;
  discarded: number;
  truncated: number;
  pending: number;
  droppedRecords: number;
  queueFull?: boolean;
}

export interface DiagnosticExportResult {
  outputPath: string;
  files: string[];
  mode: "24h" | "full";
  bytes: number;
  missingSnapshots?: string[];
  flush?: DiagnosticFlushResult;
}

export interface DiagnosticExportProgress {
  mode: "24h" | "full";
  processedBytes: number;
  totalBytes: number;
  complete: boolean;
}

type DiagnosticInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export interface DiagnosticFeatureManifest {
  version: number;
  features: readonly FeatureDiagnosticContract[];
  snapshots: Record<string, Record<string, unknown>>;
  missingSnapshots: readonly FeatureSnapshotMissingItem[];
  activity?: Record<string, FeatureDiagnosticActivity>;
  settingHistory?: readonly FeatureSettingHistoryEntry[];
}

/** 导出时附带的运行态快照；只允许传递已脱敏的结构化数据。 */
export interface DiagnosticSnapshot extends Record<string, unknown> {
  featureManifest?: DiagnosticFeatureManifest;
}

export interface DiagnosticBridgeDependencies {
  flush?: () => Promise<DiagnosticFlushResult>;
  invoke?: DiagnosticInvoke;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeStatus(value: unknown): DiagnosticStatus {
  return value === "full" || value === "degraded" ? value : "healthy";
}

function mapStatus(value: Record<string, unknown>): DiagnosticStatusSnapshot {
  return {
    status: normalizeStatus(value.status),
    totalBytes: toNumber(value.totalBytes ?? value.total_bytes),
    normalBytes: toNumber(value.normalBytes ?? value.normal_bytes),
    detailedBytes: toNumber(value.detailedBytes ?? value.detailed_bytes),
    writeFailures: toNumber(value.writeFailures ?? value.write_failures),
    discarded: toNumber(value.discarded),
    truncated: toNumber(value.truncated),
    pending: toNumber(value.pending),
    droppedRecords: toNumber(value.droppedRecords ?? value.dropped_records),
  };
}

function mapExport(
  value: Record<string, unknown>,
  mode: "24h" | "full",
  outputPath: string,
  flushResult: DiagnosticFlushResult,
): DiagnosticExportResult {
  return {
    outputPath: typeof value.output_path === "string" ? value.output_path : typeof value.outputPath === "string" ? value.outputPath : outputPath,
    files: Array.isArray(value.files) ? value.files.filter((file): file is string => typeof file === "string") : [],
    mode: value.mode === "full" ? "full" : mode,
    bytes: toNumber(value.bytes),
    missingSnapshots: Array.isArray(value.missing_snapshots)
      ? value.missing_snapshots.filter((item): item is string => typeof item === "string")
      : [],
    flush: flushResult,
  };
}

export function createDiagnosticBridge(dependencies: DiagnosticBridgeDependencies = {}) {
  const flush = dependencies.flush ?? flushLogs;
  const invoke = dependencies.invoke ?? tauriInvoke;

  return {
    flushAllDiagnosticLogs: () => flush(),
    async getDiagnosticStatus(): Promise<DiagnosticStatusSnapshot> {
      const value = await invoke<Record<string, unknown>>("get_diagnostic_status");
      return mapStatus(value);
    },
    async exportBundle(mode: "24h" | "full", outputPath: string, snapshot?: DiagnosticSnapshot): Promise<DiagnosticExportResult> {
      const flushResult = await flush();
      const exportSnapshot = {
        ...snapshot,
        diagnostics: {
          ...(typeof snapshot?.diagnostics === "object" && snapshot.diagnostics !== null && !Array.isArray(snapshot.diagnostics)
            ? snapshot.diagnostics as Record<string, unknown>
            : {}),
          flush: flushResult,
        },
      };
      const value = await invoke<Record<string, unknown>>("export_diagnostic_bundle", {
        outputPath,
        mode,
        snapshot: exportSnapshot,
      });
      return mapExport(value, mode, outputPath, flushResult);
    },
    async openLogDirectory(): Promise<string> {
      return invoke<string>("open_diagnostic_log_directory");
    },
  };
}

export const diagnosticBridge = createDiagnosticBridge();
