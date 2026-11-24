import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { getDiagnosticConnectionId, getDiagnosticContext, registerDiagnosticLogger } from "../diagnostics/diagnosticLogger.ts";
import type { DiagnosticFlushResult, DiagnosticHealthSnapshot } from "../diagnostics/diagnosticTypes.ts";
import { DiagnosticBatch } from "../diagnostics/diagnosticBatch.ts";

const FLUSH_INTERVAL_MS = 2000;
const FLUSH_THRESHOLD = 20;
const MAX_BUFFER_LINES = 1000;

export type TtsDiagnosticOutcome = "success" | "failure" | "cancelled";
export type TtsDiagnosticStage = "validate" | "request" | "response" | "decode" | "complete" | "cancelled" | "provider";

export interface TtsDiagnosticInput {
  timestamp?: number;
  requestId?: string;
  provider: string;
  route?: string;
  endpoint?: string;
  model?: string;
  outcome: TtsDiagnosticOutcome;
  stage: TtsDiagnosticStage;
  durationMs?: number;
  audioBytes?: number;
  error?: unknown;
  sessionId?: string;
  connectionId?: string;
  eventId?: string;
  queueDepth?: number;
  phase?: string;
}

export interface TtsDiagnosticRecord {
  t: number;
  kind: "tts";
  requestId: string;
  provider: string;
  route: string | null;
  endpoint: string | null;
  model: string | null;
  outcome: TtsDiagnosticOutcome;
  stage: TtsDiagnosticStage;
  durationMs: number;
  audioBytes: number | null;
  httpStatus: number | null;
  remoteCode: string | null;
  errorClass: string | null;
  sessionId?: string;
  connectionId?: string;
  eventId?: string;
  queueDepth?: number;
  phase?: string;
}

export interface TtsDiagnostics {
  record(input: TtsDiagnosticInput): void;
}

function featureStageForTts(input: Pick<TtsDiagnosticInput, "outcome" | "stage">): "request" | "success" | "failure" | "cancel" {
  if (input.outcome === "failure") return "failure";
  if (input.outcome === "cancelled") return "cancel";
  return input.stage === "request" || input.stage === "validate" ? "request" : "success";
}

export function recordTtsStage(input: TtsDiagnosticInput): void {
  const context = getDiagnosticContext();
  const sessionId = input.sessionId ?? context.sessionId;
  const connectionId = input.connectionId ?? getDiagnosticConnectionId(context);
  try {
    ttsDiagnosticsLogger.record({ ...input, sessionId, connectionId });
  } catch {}
  try {
    context.record({
      subsystem: "tts",
      action: input.phase ?? input.stage,
      outcome: input.outcome,
      connectionId,
      eventId: input.eventId,
      requestId: input.requestId,
      phase: input.phase,
      queueDepth: input.queueDepth,
      data: { featureId: "voice", stage: featureStageForTts(input) },
    });
  } catch { /* diagnostics never blocks playback */ }
}

export function recordPlaybackStage(input: { channel: "tts" | "personal"; eventId?: string; requestId?: string; action: string; outcome: TtsDiagnosticOutcome; device?: string; phase?: string; queueDepth?: number; data?: Record<string, string | number | boolean | null> }): void {
  try {
    const context = getDiagnosticContext();
    context.record({
      subsystem: "playback",
      action: input.action,
      outcome: input.outcome,
      connectionId: getDiagnosticConnectionId(context),
      eventId: input.eventId,
      requestId: input.requestId,
      phase: input.phase ?? input.action,
      queueDepth: input.queueDepth,
      data: {
        ...(input.device ? { device: input.device } : {}),
        ...(input.data ?? {}),
        featureId: input.channel === "personal" ? "personal-broadcast" : "voice",
        stage: input.outcome === "failure" ? "failure" : input.outcome === "cancelled" ? "cancel" : "success",
      },
    });
  } catch { /* diagnostics never blocks playback */ }
}

export interface TtsDiagnosticLoggerDependencies {
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  now?: () => number;
}

export interface TtsErrorClassification {
  stage: Exclude<TtsDiagnosticStage, "complete">;
  errorClass: string;
  httpStatus: number | null;
  remoteCode: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return String(error ?? "");
}

function isCancelledError(error: unknown): boolean {
  if (error && typeof error === "object" && "kind" in error && error.kind === "cancelled") return true;
  if (error && typeof error === "object" && "name" in error && error.name === "AbortError") return true;
  return /\b(?:abort|aborted|cancel|cancelled|canceled)\b|取消|中止/iu.test(errorMessage(error));
}

/** 把接口地址限制为 origin + path，避免 query 中的 token/API key 进入日志。 */
export function sanitizeTtsEndpoint(endpoint: string | undefined): string | null {
  const value = endpoint?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    // 地址格式非法时不回写原值，避免把误填的 token/凭据带进诊断日志。
    return null;
  }
}

export function classifyTtsDiagnosticError(error: unknown, cancelled = false): TtsErrorClassification {
  if (cancelled || isCancelledError(error)) {
    return { stage: "cancelled", errorClass: "cancelled", httpStatus: null, remoteCode: null };
  }

  const message = errorMessage(error);
  if (error && typeof error === "object" && "kind" in error && error.kind === "invalid") {
    return { stage: "validate", errorClass: "invalid", httpStatus: null, remoteCode: null };
  }
  const statusMatch = message.match(/\bHTTP\s+([45]\d{2})\b|\bstatus(?:\s*code)?\s*[:=]?\s*([45]\d{2})\b/i);
  const httpStatus = statusMatch ? Number(statusMatch[1] ?? statusMatch[2]) : null;
  const remoteCode = message.match(/error\s*code\s*[:=]\s*([A-Za-z0-9_-]+)/i)?.[1] ?? null;

  if (httpStatus !== null) return { stage: "response", errorClass: "http", httpStatus, remoteCode };
  if (/空音频|empty\s+audio|no\s+audio/i.test(message)) {
    return { stage: "response", errorClass: "empty_audio", httpStatus, remoteCode };
  }
  if (/读取.*响应|read(?:ing)?\s+(?:the\s+)?response/i.test(message)) {
    return { stage: "response", errorClass: "read_response", httpStatus, remoteCode };
  }
  if (/解码|base64|音频无效|decode|invalid\s+audio/i.test(message)) {
    return { stage: "decode", errorClass: "decode_audio", httpStatus, remoteCode };
  }
  if (/error\s+sending\s+request|request\s+(?:failed|error)|请求失败|连接.*失败|timed?\s*out|timeout/i.test(message)) {
    return { stage: "request", errorClass: "transport", httpStatus, remoteCode };
  }
  return { stage: "provider", errorClass: "provider", httpStatus, remoteCode };
}

export function buildTtsDiagnosticRecord(input: TtsDiagnosticInput): TtsDiagnosticRecord {
  const classification = input.error !== undefined
    ? classifyTtsDiagnosticError(input.error, input.outcome === "cancelled")
    : null;
  const stage = classification?.stage ?? input.stage;
  return {
    t: input.timestamp ?? Date.now(),
    kind: "tts",
    requestId: input.requestId?.trim() || "unknown",
    provider: input.provider,
    route: input.route?.trim() || null,
    endpoint: sanitizeTtsEndpoint(input.endpoint),
    model: input.model?.trim() || null,
    outcome: input.outcome,
    stage,
    durationMs: Math.max(0, Math.round(input.durationMs ?? 0)),
    audioBytes: input.audioBytes === undefined ? null : Math.max(0, Math.round(input.audioBytes)),
    httpStatus: classification?.httpStatus ?? null,
    remoteCode: classification?.remoteCode ?? null,
    errorClass: classification?.errorClass ?? null,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.connectionId ? { connectionId: input.connectionId } : {}),
    ...(input.eventId ? { eventId: input.eventId } : {}),
    ...(input.queueDepth === undefined ? {} : { queueDepth: Math.max(0, Math.round(input.queueDepth)) }),
    ...(input.phase ? { phase: input.phase } : {}),
  };
}

function dateStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}${month}${day}`;
}

export class TtsDiagnosticLogger implements TtsDiagnostics {
  private readonly invokeImpl: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  private readonly now: () => number;
  private readonly batch = new DiagnosticBatch(MAX_BUFFER_LINES);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(dependencies: TtsDiagnosticLoggerDependencies = {}) {
    this.invokeImpl = dependencies.invoke ?? (<T>(command: string, args?: Record<string, unknown>) => tauriInvoke<T>(command, args));
    this.now = dependencies.now ?? (() => Date.now());
    registerDiagnosticLogger(this);
  }

  record(input: TtsDiagnosticInput): void {
    if (this.batch.pending >= MAX_BUFFER_LINES) {
      this.batch.droppedRecords += 1;
      return;
    }
    this.batch.record(JSON.stringify(buildTtsDiagnosticRecord({ ...input, timestamp: input.timestamp ?? this.now() })));
    if (!this.timer) {
      this.timer = setInterval(() => void this.flush(), FLUSH_INTERVAL_MS);
      // Node 测试进程不应被诊断日志的后台定时器阻止退出；浏览器/桌面端没有 unref 时不影响正常定时刷盘。
      (this.timer as unknown as { unref?: () => void }).unref?.();
    }
    if (this.batch.pending >= FLUSH_THRESHOLD) void this.flush();
  }

  async flush(): Promise<DiagnosticFlushResult> {
    return this.batch.flush(lines => this.invokeImpl("append_log", {
      file: `tts-${dateStamp(this.now())}.ndjson`, lines,
    }));
  }

  getHealthSnapshot(): DiagnosticHealthSnapshot {
    return {
      status: this.batch.droppedRecords > 0 || this.batch.pending >= MAX_BUFFER_LINES ? "full" : this.batch.writeFailures > 0 ? "degraded" : "healthy",
      pending: this.batch.pending,
      writeFailures: this.batch.writeFailures,
      droppedRecords: this.batch.droppedRecords,
    };
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    void this.flush();
  }
}

export function createTtsDiagnosticLogger(dependencies: TtsDiagnosticLoggerDependencies = {}): TtsDiagnosticLogger {
  return new TtsDiagnosticLogger(dependencies);
}

export const ttsDiagnosticsLogger = createTtsDiagnosticLogger();
