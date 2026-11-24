export type DiagnosticLevel = "debug" | "info" | "warn" | "error";

export type DiagnosticScalar = string | number | boolean | null;

export type DiagnosticStatus = "healthy" | "degraded" | "full";

export interface DiagnosticHealthSnapshot {
  status: DiagnosticStatus;
  pending: number;
  writeFailures: number;
  droppedRecords: number;
}

export type IssueMarkerStatus = "collecting" | "complete";

export interface DiagnosticRecordInput {
  level?: DiagnosticLevel;
  subsystem: string;
  action: string;
  outcome: string;
  durationMs?: number;
  connectionId?: string;
  roomId?: string | number;
  eventId?: string;
  requestId?: string;
  phase?: string;
  queueDepth?: number;
  windowLabel?: string;
  data?: Record<string, unknown>;
}

export interface DiagnosticRecord {
  t: number;
  seq: number;
  kind: "app";
  sessionId: string;
  level?: DiagnosticLevel;
  subsystem: string;
  action: string;
  outcome: string;
  connectionId?: string;
  roomId?: string | number;
  eventId?: string;
  requestId?: string;
  windowLabel?: string;
  durationMs?: number;
  phase?: string;
  queueDepth?: number;
  data?: Record<string, DiagnosticScalar>;
}

export interface DiagnosticFlushResult {
  windowFlush?: { requestId: string; complete: boolean; incompleteWindows: string[] };
  /** 本次刷盘失败的批次数；失败后保留记录，下一次显式调用可重试。 */
  failed: number;
  /** 本次操作成功写入的记录数；并发调用共享推进后的刷盘边界。 */
  flushed: number;
  /** 返回时仍未写入的记录数，包括正在写入的记录。 */
  pending: number;
  /** 记录器生命周期内累计失败批次数与丢弃记录数。 */
  writeFailures: number;
  droppedRecords: number;
}

export interface DiagnosticLoggerDependencies {
  invoke?: (command: "append_log", args: { file: string; lines: string }) => Promise<unknown>;
  now?: () => number;
  sessionId?: string;
  flushIntervalMs?: number;
}

export interface DiagnosticStreamRecordInput {
  sessionId?: string;
  connectionId?: string;
  roomId?: string | number;
  eventId?: string;
  windowLabel?: string;
  record: Record<string, unknown>;
}

export interface IssueMarker {
  id: string;
  markedAt: number;
  note?: string;
  sessionId: string;
  connectionId?: string;
  roomId?: string | number;
}
