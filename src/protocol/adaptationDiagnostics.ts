export type AdaptationDiagnosticOutcome = "accepted" | "ignored" | "failure";
export type AdaptationDiagnosticReason = "adapted-event" | "no-event" | "laplace-state-only" | "adapter-threw";

export interface AdaptationDiagnosticResult {
  outcome: AdaptationDiagnosticOutcome;
  reason: AdaptationDiagnosticReason;
  eventCount: number;
}

/** 将适配器结果归一为固定原因，便于区分未识别报文、兼容状态和适配异常。 */
export function classifyAdaptationResult(
  adapted: unknown,
  laplaceStateUpdated: boolean,
  error?: unknown,
): AdaptationDiagnosticResult {
  if (error !== undefined) {
    return { outcome: "failure", reason: "adapter-threw", eventCount: 0 };
  }
  const eventCount = Array.isArray(adapted) ? adapted.length : adapted ? 1 : 0;
  if (eventCount > 0) return { outcome: "accepted", reason: "adapted-event", eventCount };
  return {
    outcome: "ignored",
    reason: laplaceStateUpdated ? "laplace-state-only" : "no-event",
    eventCount: 0,
  };
}
