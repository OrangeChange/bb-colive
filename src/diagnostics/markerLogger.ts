import {
  getDiagnosticConnectionId,
  getDiagnosticContext,
  recordDiagnosticContext,
  registerDiagnosticLogger,
  type DiagnosticContext,
  type DiagnosticFlushable,
} from "./diagnosticLogger.ts";
import type { DiagnosticFlushResult, DiagnosticHealthSnapshot, IssueMarker } from "./diagnosticTypes.ts";
import { DiagnosticBatch } from "./diagnosticBatch.ts";
import { getIssueMarkerWindow } from "./issueMarkers.ts";

type InvokeAppendLog = (command: "append_log", args: { file: string; lines: string }) => Promise<unknown>;

export const ISSUE_MARKER_MAX_PENDING_LINES = 1000;

export interface IssueMarkerLoggerDependencies {
  invoke: InvokeAppendLog;
  context?: DiagnosticContext;
  now?: () => number;
}

function dateStamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

/** 问题标记的专项日志；不复制事件日志，只写标记窗口和关联字段。 */
export class IssueMarkerLogger implements DiagnosticFlushable {
  private readonly invoke: InvokeAppendLog;
  private readonly context: DiagnosticContext;
  private readonly now: () => number;
  private readonly batch = new DiagnosticBatch(ISSUE_MARKER_MAX_PENDING_LINES);
  private readonly unregister: () => void;

  constructor(dependencies: IssueMarkerLoggerDependencies) {
    this.invoke = dependencies.invoke;
    this.context = dependencies.context ?? getDiagnosticContext();
    this.now = dependencies.now ?? (() => Date.now());
    this.unregister = registerDiagnosticLogger(this);
  }

  record(marker: IssueMarker): void {
    const window = getIssueMarkerWindow(marker);
    const correlation = recordDiagnosticContext(this.context, {
      level: "info",
      subsystem: "markers",
      action: "mark",
      outcome: "created",
      connectionId: marker.connectionId ?? getDiagnosticConnectionId(this.context),
      roomId: marker.roomId,
      data: { markerId: marker.id, windowStart: window.start, windowEnd: window.end },
    });
    const line = JSON.stringify({
      timestamp: marker.markedAt,
      t: marker.markedAt,
      kind: "marker",
      id: marker.id,
      markedAt: marker.markedAt,
      start: window.start,
      end: window.end,
      status: "collecting",
      ...(marker.note === undefined ? {} : { note: marker.note }),
      ...(marker.sessionId ? { sessionId: marker.sessionId } : {}),
      ...(marker.connectionId ? { connectionId: marker.connectionId } : {}),
      ...(marker.roomId === undefined ? {} : { roomId: marker.roomId }),
      ...(correlation?.seq === undefined ? {} : { seq: correlation.seq }),
    });
    this.batch.record(line);
  }

  async flush(): Promise<DiagnosticFlushResult> {
    return this.batch.flush(lines => this.invoke("append_log", {
      file: `markers-${dateStamp(this.now())}.ndjson`, lines,
    }));
  }

  getHealthSnapshot(): DiagnosticHealthSnapshot {
    return {
      status: this.batch.droppedRecords > 0 || this.batch.pending >= ISSUE_MARKER_MAX_PENDING_LINES
        ? "full"
        : this.batch.writeFailures > 0
          ? "degraded"
          : "healthy",
      pending: this.batch.pending,
      writeFailures: this.batch.writeFailures,
      droppedRecords: this.batch.droppedRecords,
    };
  }

  stop(): void {
    this.unregister();
  }

}
