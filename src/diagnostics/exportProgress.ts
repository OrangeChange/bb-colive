import { uiText } from "../i18n/index.ts";
export type ExportProgressSample = {
  processedBytes: number;
  totalBytes: number;
  complete?: boolean;
};

const ETA_MIN_SAMPLE_ELAPSED_MS = 500;
const ETA_MIN_SAMPLE_BYTES = 4 * 1024 * 1024;

export function exportProgressPercent(sample: ExportProgressSample): number {
  if (sample.complete) return 100;
  if (!Number.isFinite(sample.totalBytes) || sample.totalBytes <= 0) return 0;
  const processed = Math.max(0, Number.isFinite(sample.processedBytes) ? sample.processedBytes : 0);
  return Math.min(99, Math.max(0, Math.round((processed / sample.totalBytes) * 100)));
}

export function hasReliableExportProgressSample(sample: ExportProgressSample & { elapsedMs: number; sampleCount?: number }): boolean {
  return Number.isFinite(sample.elapsedMs)
    && sample.elapsedMs >= ETA_MIN_SAMPLE_ELAPSED_MS
    && Number.isFinite(sample.processedBytes)
    && sample.processedBytes >= ETA_MIN_SAMPLE_BYTES
    && Number.isFinite(sample.sampleCount)
    && (sample.sampleCount ?? 0) >= 2
    && Number.isFinite(sample.totalBytes)
    && sample.totalBytes > sample.processedBytes;
}

export function estimateExportRemainingSeconds(sample: ExportProgressSample & { elapsedMs: number; rateBytesPerMs?: number }): number | null {
  if (!Number.isFinite(sample.elapsedMs) || sample.elapsedMs <= 0) return null;
  if (!Number.isFinite(sample.processedBytes) || sample.processedBytes <= 0) return null;
  if (!Number.isFinite(sample.totalBytes) || sample.totalBytes <= sample.processedBytes) return 0;
  const rateBytesPerMs = Number.isFinite(sample.rateBytesPerMs) && (sample.rateBytesPerMs ?? 0) > 0
    ? sample.rateBytesPerMs
    : sample.processedBytes / sample.elapsedMs;
  if (!rateBytesPerMs || rateBytesPerMs <= 0) return null;
  return Math.max(1, Math.ceil((sample.totalBytes - sample.processedBytes) / rateBytesPerMs / 1000));
}

export function formatExportRemaining(seconds: number | null): string {
  if (seconds == null) return uiText("exportProgress.formatExportRemaining");
  if (seconds <= 1) return uiText("exportProgress.formatExportRemaining2");
  if (seconds < 60) return uiText("exportProgress.formatExportRemaining3", { seconds: seconds });
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0 ? uiText("exportProgress.formatExportRemaining4", { minutes: minutes }) : uiText("exportProgress.formatExportRemaining5", { minutes: minutes, remainder: remainder });
}
