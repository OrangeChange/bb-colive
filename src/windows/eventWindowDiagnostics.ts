import {
  getDiagnosticConnectionId,
  getDiagnosticContext,
  recordDiagnosticContext,
} from "../diagnostics/diagnosticLogger.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { EVENT_WINDOW_DELIVERY_FAILURE_REASON } from "./eventWindowChannels.ts";

export interface EventWindowRenderDiagnosticContext {
  sessionId: string;
  connectionId?: string;
}

/** 副窗口是独立 WebView，随事件传递主窗口的诊断关联，不改变主事件对象。 */
export type EventWindowEvent = DanmakuEvent & {
  __renderDiagnostic?: EventWindowRenderDiagnosticContext;
  __roomGeneration?: number;
};

export function withEventWindowDiagnosticContext(
  event: DanmakuEvent,
  context: ReturnType<typeof getDiagnosticContext> = getDiagnosticContext(),
): EventWindowEvent {
  const connectionId = getDiagnosticConnectionId(context);
  return {
    ...event,
    __renderDiagnostic: {
      sessionId: context.sessionId,
      ...(connectionId === undefined ? {} : { connectionId }),
    },
  };
}

export type WindowEventDeliveryPhase = "display-window" | "gift-window" | "gift-effect-window";

export interface WindowEventDeliveryDetails {
  eventId: string;
  roomId: number;
  msgType: number;
  region: string;
  windowLabel: string;
  phase: WindowEventDeliveryPhase;
}

function recordWindowEventDeliveryFailure(details: WindowEventDeliveryDetails): void {
  try {
    const context = getDiagnosticContext();
    recordDiagnosticContext(context, {
      level: "error",
      subsystem: "event",
      action: details.phase,
      outcome: "failure",
      connectionId: getDiagnosticConnectionId(context),
      roomId: details.roomId,
      eventId: details.eventId,
      windowLabel: details.windowLabel,
      data: {
        reason: EVENT_WINDOW_DELIVERY_FAILURE_REASON,
        msgType: details.msgType,
        region: details.region,
      },
    });
  } catch {
    // 诊断失败不能阻断窗口清理或主事件链。
  }
}

/** 观察异步副窗口投递；失败只追加元数据诊断并执行既有清理。 */
export function observeWindowEventDelivery(
  delivery: Promise<unknown>,
  details: WindowEventDeliveryDetails,
  onFailure: () => void,
): void {
  void delivery.catch(() => {
    recordWindowEventDeliveryFailure(details);
    try {
      onFailure();
    } catch {
      // 清理失败也不能制造未处理 rejection。
    }
  });
}
