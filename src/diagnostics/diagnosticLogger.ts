import { DiagnosticBatch } from "./diagnosticBatch.ts";
import { submitWindowAppDiagnostic } from "./windowDiagnosticBridge.ts";
import type {
  DiagnosticFlushResult,
  DiagnosticHealthSnapshot,
  DiagnosticLoggerDependencies,
  DiagnosticRecord,
  DiagnosticRecordInput,
  DiagnosticScalar,
  DiagnosticStreamRecordInput,
  DiagnosticStatus,
} from "./diagnosticTypes.ts";

export const DIAGNOSTIC_MAX_PENDING_LINES = 1000;
const REDACTED_VALUE = "[redacted]";

const FORBIDDEN_KEY_PATTERN = /cookie|token|authorization|api[\s_-]?key|secret|password|bearer|buvid|headers?/i;
const SENSITIVE_CONTENT_PATTERN = /\b(?:cookie|token|authorization|api[\s_-]?key|secret|password|bearer)\b/iu;
const FILE_URI_PATTERN = /file:\/\/[^\s"'<>]+/iu;
const WINDOWS_PATH_PATTERN = /(?<![\/A-Za-z0-9_])(?:[A-Za-z]:[\\/]|\\\\)[^\s"'<>]*/u;
const POSIX_PATH_PATTERN = /(?<![\/A-Za-z0-9_])\/(?!\/)[^\s"'<>]*/u;

export interface DiagnosticContext {
  readonly sessionId: string;
  nextConnectionId(): string;
  nextSequence(): number;
  record(input: DiagnosticRecordInput): string;
  getHealthSnapshot(): DiagnosticHealthSnapshot;
  stop?(): void;
}

export interface DiagnosticFlushable {
  flush(): Promise<DiagnosticFlushResult>;
  getHealthSnapshot?(): DiagnosticHealthSnapshot;
}

interface DiagnosticContextState {
  currentConnectionId?: string;
}

const registeredRecorders: DiagnosticFlushable[] = [];
const contextStates = new WeakMap<DiagnosticContext, DiagnosticContextState>();
let activeContext: DiagnosticContext | null = null;

const emptyFlushResult = (): DiagnosticFlushResult => ({
  failed: 0,
  flushed: 0,
  pending: 0,
  writeFailures: 0,
  droppedRecords: 0,
});

function addFlushResult(total: DiagnosticFlushResult, next: DiagnosticFlushResult): DiagnosticFlushResult {
  return {
    failed: total.failed + next.failed,
    flushed: total.flushed + next.flushed,
    pending: total.pending + next.pending,
    writeFailures: total.writeFailures + next.writeFailures,
    droppedRecords: total.droppedRecords + next.droppedRecords,
  };
}

/** 注册仍可能持有内存缓冲的记录器；返回值用于记录器结束时解除注册。 */
export function registerDiagnosticLogger(recorder: DiagnosticFlushable): () => void {
  if (!registeredRecorders.includes(recorder)) registeredRecorders.push(recorder);
  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;
    const index = registeredRecorders.indexOf(recorder);
    if (index >= 0) registeredRecorders.splice(index, 1);
  };
}

/** 按注册顺序等待所有记录器，避免不同日志文件的退出刷盘互相覆盖。 */
export async function flushAllDiagnosticLogs(): Promise<DiagnosticFlushResult> {
  let total = emptyFlushResult();
  for (const recorder of [...registeredRecorders]) {
    try {
      total = addFlushResult(total, await recorder.flush());
    } catch {
      total = addFlushResult(total, { ...emptyFlushResult(), failed: 1, writeFailures: 1 });
    }
  }
  return total;
}

export function getDiagnosticHealthSnapshot(): DiagnosticHealthSnapshot {
  const snapshots = registeredRecorders.flatMap((recorder) => {
    try {
      const snapshot = recorder.getHealthSnapshot?.();
      return snapshot ? [snapshot] : [];
    } catch {
      return [];
    }
  });
  return {
    status: snapshots.some((snapshot) => snapshot.status === "full")
      ? "full"
      : snapshots.some((snapshot) => snapshot.status === "degraded")
        ? "degraded"
        : "healthy",
    pending: snapshots.reduce((total, snapshot) => total + snapshot.pending, 0),
    writeFailures: snapshots.reduce((total, snapshot) => total + snapshot.writeFailures, 0),
    droppedRecords: snapshots.reduce((total, snapshot) => total + snapshot.droppedRecords, 0),
  };
}

function dateStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}${month}${day}`;
}

function containsLocalPath(value: string): boolean {
  return FILE_URI_PATTERN.test(value) || WINDOWS_PATH_PATTERN.test(value) || POSIX_PATH_PATTERN.test(value);
}

export function sanitizeDiagnosticString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  if (SENSITIVE_CONTENT_PATTERN.test(value) || containsLocalPath(value)) return undefined;
  return value;
}

function sanitizeDiagnosticScalar(value: unknown): DiagnosticScalar | undefined {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return sanitizeDiagnosticString(value);
}

export function sanitizeDiagnosticData(data: Record<string, unknown> | undefined): Record<string, DiagnosticScalar> {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};

  const sanitized: Record<string, DiagnosticScalar> = {};
  for (const [key, value] of Object.entries(data)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) continue;
    const sanitizedValue = sanitizeDiagnosticScalar(value);
    if (sanitizedValue === undefined) continue;
    sanitized[key] = sanitizedValue;
  }
  return sanitized;
}

function defaultSessionId(): string {
  return `launch-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitizeOptionalString(value: string | undefined): string | undefined {
  return value === undefined ? undefined : sanitizeDiagnosticString(value);
}

function sanitizeOptionalRelation(value: string | number | undefined): string | number | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  return sanitizeDiagnosticString(value);
}

function requiredDiagnosticString(value: string): string {
  return sanitizeDiagnosticString(value) ?? REDACTED_VALUE;
}

function unrefTimer(timer: ReturnType<typeof setInterval>): void {
  const candidate = timer as unknown as { unref?: () => void };
  candidate.unref?.();
}

function startFlushTimer(intervalMs: number, flush: () => void): ReturnType<typeof setInterval> | null {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  const timer = setInterval(flush, intervalMs);
  unrefTimer(timer);
  return timer;
}

function appendSafeCorrelation(target: Record<string, unknown>, input: DiagnosticStreamRecordInput): void {
  const connectionId = sanitizeOptionalString(input.connectionId);
  if (connectionId !== undefined) target.connectionId = connectionId;
  const roomId = sanitizeOptionalRelation(input.roomId);
  if (roomId !== undefined) target.roomId = roomId;
  const eventId = sanitizeOptionalString(input.eventId);
  if (eventId !== undefined) target.eventId = eventId;
  const windowLabel = sanitizeOptionalString(input.windowLabel);
  if (windowLabel !== undefined) target.windowLabel = windowLabel;
}

export class DiagnosticLogger {
  private readonly invokeImpl: (command: "append_log", args: { file: string; lines: string }) => Promise<unknown>;
  private readonly now: () => number;
  private readonly sessionId: string;
  private readonly missingInvoke: boolean;
  private nextSeq = 1;
  private readonly batch = new DiagnosticBatch(DIAGNOSTIC_MAX_PENDING_LINES);
  private readonly unregister: () => void;
  private readonly flushTimer: ReturnType<typeof setInterval> | null;
  private stopped = false;

  constructor(dependencies: DiagnosticLoggerDependencies = {}) {
    this.missingInvoke = dependencies.invoke === undefined;
    this.invokeImpl = dependencies.invoke ?? (async () => {
      throw new Error("append_log invoke dependency is required");
    });
    this.now = dependencies.now ?? (() => Date.now());
    this.sessionId = requiredDiagnosticString(dependencies.sessionId ?? defaultSessionId());
    this.unregister = registerDiagnosticLogger(this);
    this.flushTimer = startFlushTimer(dependencies.flushIntervalMs ?? 2000, () => { void this.flush(); });
  }

  nextSequence(): number {
    return this.nextSeq++;
  }

  record(input: DiagnosticRecordInput): string {
    if (submitWindowAppDiagnostic(input)) return "";
    const record: DiagnosticRecord = {
      t: this.now(),
      seq: this.nextSequence(),
      kind: "app",
      sessionId: this.sessionId,
      ...(input.level === undefined ? {} : { level: input.level }),
      subsystem: requiredDiagnosticString(input.subsystem),
      action: requiredDiagnosticString(input.action),
      outcome: requiredDiagnosticString(input.outcome),
      ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
      ...(input.phase === undefined ? {} : { phase: requiredDiagnosticString(input.phase) }),
      ...(input.queueDepth === undefined ? {} : { queueDepth: input.queueDepth }),
    };

    const connectionId = sanitizeOptionalString(input.connectionId);
    if (connectionId !== undefined) record.connectionId = connectionId;
    const roomId = sanitizeOptionalRelation(input.roomId);
    if (roomId !== undefined) record.roomId = roomId;
    const eventId = sanitizeOptionalString(input.eventId);
    if (eventId !== undefined) record.eventId = eventId;
    const requestId = sanitizeOptionalString(input.requestId);
    if (requestId !== undefined) record.requestId = requestId;
    const windowLabel = sanitizeOptionalString(input.windowLabel);
    if (windowLabel !== undefined) record.windowLabel = windowLabel;

    const data = sanitizeDiagnosticData(input.data);
    if (Object.keys(data).length > 0) record.data = data;

    const line = JSON.stringify(record);
    this.batch.record(line);
    return line;
  }

  async flush(): Promise<DiagnosticFlushResult> {
    return this.batch.flush(lines => this.invokeImpl("append_log", {
      file: `app-${dateStamp(this.now())}.ndjson`, lines,
    }));
  }

  getStatus(): DiagnosticStatus {
    if (this.batch.droppedRecords > 0 || this.batch.pending >= DIAGNOSTIC_MAX_PENDING_LINES) return "full";
    if (this.missingInvoke || this.batch.writeFailures > 0) return "degraded";
    return "healthy";
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.unregister();
  }

  getHealthSnapshot(): DiagnosticHealthSnapshot {
    return {
      status: this.getStatus(),
      pending: this.batch.pending,
      writeFailures: this.batch.writeFailures,
      droppedRecords: this.batch.droppedRecords,
    };
  }

}

export interface DiagnosticStreamLoggerDependencies extends DiagnosticLoggerDependencies {
  stream: "source" | "render";
  context?: DiagnosticContext;
}

/**
 * 新诊断系统的结构化详细流：保留 source/render 所需的结构化内容，
 * 但共享诊断系统的缓冲、刷盘和健康状态。
 */
export class DiagnosticStreamLogger implements DiagnosticFlushable {
  private readonly invokeImpl: (command: "append_log", args: { file: string; lines: string }) => Promise<unknown>;
  private readonly now: () => number;
  private readonly stream: "source" | "render";
  private readonly context?: DiagnosticContext;
  private readonly missingInvoke: boolean;
  private readonly unregister: () => void;
  private readonly flushTimer: ReturnType<typeof setInterval> | null;
  private readonly batch = new DiagnosticBatch(DIAGNOSTIC_MAX_PENDING_LINES);
  private stopped = false;

  constructor(dependencies: DiagnosticStreamLoggerDependencies) {
    this.stream = dependencies.stream;
    this.context = dependencies.context;
    this.missingInvoke = dependencies.invoke === undefined;
    this.invokeImpl = dependencies.invoke ?? (async () => {
      throw new Error("append_log invoke dependency is required");
    });
    this.now = dependencies.now ?? (() => Date.now());
    this.unregister = registerDiagnosticLogger(this);
    this.flushTimer = startFlushTimer(dependencies.flushIntervalMs ?? 2000, () => { void this.flush(); });
  }

  record(input: DiagnosticStreamRecordInput): string {
    const context = this.context ?? getDiagnosticContext();
    const sessionId = sanitizeOptionalString(input.sessionId) ?? context.sessionId;
    const record: Record<string, unknown> = {
      t: this.now(),
      seq: context.nextSequence(),
      kind: this.stream,
      sessionId,
      ...input.record,
    };
    appendSafeCorrelation(record, input);

    let line: string;
    try {
      line = JSON.stringify(record);
    } catch {
      this.batch.droppedRecords++;
      return "";
    }
    this.batch.record(line);
    return line;
  }

  async flush(): Promise<DiagnosticFlushResult> {
    return this.batch.flush(lines => this.invokeImpl("append_log", {
      file: `${this.stream}-${dateStamp(this.now())}.ndjson`, lines,
    }));
  }

  getStatus(): DiagnosticStatus {
    if (this.batch.droppedRecords > 0 || this.batch.pending >= DIAGNOSTIC_MAX_PENDING_LINES) return "full";
    if (this.missingInvoke || this.batch.writeFailures > 0) return "degraded";
    return "healthy";
  }

  getHealthSnapshot(): DiagnosticHealthSnapshot {
    return {
      status: this.getStatus(),
      pending: this.batch.pending,
      writeFailures: this.batch.writeFailures,
      droppedRecords: this.batch.droppedRecords,
    };
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.unregister();
  }

}

export function createDiagnosticLogger(dependencies: DiagnosticLoggerDependencies = {}): DiagnosticLogger {
  return new DiagnosticLogger(dependencies);
}

export function createDiagnosticContext(dependencies: DiagnosticLoggerDependencies = {}): DiagnosticContext {
  const sessionId = requiredDiagnosticString(dependencies.sessionId ?? defaultSessionId());
  const logger = createDiagnosticLogger({ ...dependencies, sessionId });
  let nextConnection = 1;
  const context: DiagnosticContext = {
    sessionId,
    nextSequence: () => logger.nextSequence(),
    nextConnectionId: () => {
      const connectionId = `connect-${nextConnection++}`;
      const state = contextStates.get(context);
      if (state) state.currentConnectionId = connectionId;
      return connectionId;
    },
    record: (input) => logger.record(input),
    getHealthSnapshot: () => logger.getHealthSnapshot(),
    stop: () => logger.stop(),
  };
  contextStates.set(context, {});
  activeContext = context;
  return context;
}

export function getDiagnosticContext(): DiagnosticContext {
  return activeContext ?? createDiagnosticContext();
}

export function getDiagnosticConnectionId(context: DiagnosticContext): string | undefined {
  return contextStates.get(context)?.currentConnectionId;
}

/** 为专项日志分配同一启动会话内的 seq；失败时不阻断专项日志本身。 */
export function recordDiagnosticContext(
  context: DiagnosticContext,
  input: DiagnosticRecordInput,
): DiagnosticRecord | undefined {
  try {
    const record = JSON.parse(context.record(input)) as Partial<DiagnosticRecord>;
    return typeof record.seq === "number" && Number.isSafeInteger(record.seq) ? record as DiagnosticRecord : undefined;
  } catch {
    return undefined;
  }
}
