import { getDiagnosticContext, type DiagnosticContext } from "../diagnostics/diagnosticLogger.ts";

export type WindowDiagnosticAction =
  | "sticky"
  | "selection"
  | "open"
  | "restore"
  | "lock"
  | "reload"
  | "bridge"
  | "layout"
  | "close"
  | "destroy";

export interface WindowDiagnosticInput {
  context?: Pick<DiagnosticContext, "record">;
  windowLabel: string;
  action: WindowDiagnosticAction;
  outcome: string;
  data?: Record<string, string | number | boolean | null>;
  roomId?: string | number;
  connectionId?: string;
  eventId?: string;
}

/** 副窗口生命周期的统一旁路记录；失败不能改变窗口行为。 */
export function recordWindowDiagnostic(input: WindowDiagnosticInput): void {
  try {
    (input.context ?? getDiagnosticContext()).record({
      subsystem: "window",
      action: input.action,
      outcome: input.outcome,
      windowLabel: input.windowLabel,
      ...(input.roomId === undefined ? {} : { roomId: input.roomId }),
      ...(input.connectionId === undefined ? {} : { connectionId: input.connectionId }),
      ...(input.eventId === undefined ? {} : { eventId: input.eventId }),
      ...(input.data ? { data: input.data } : {}),
    });
  } catch {
    // 诊断记录失败不能阻断副窗口。
  }
}
