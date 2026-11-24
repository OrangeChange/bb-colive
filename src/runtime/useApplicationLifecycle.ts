import { useEffect, useRef, type RefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useConnection } from "../stores/connection";
import { flushArchiveWriter } from "../archive/archiveRuntime.ts";
import { sanitizeDiagnosticString, type DiagnosticContext } from "../diagnostics/diagnosticLogger";
import { flushWindowDiagnosticLogs } from "../diagnostics/windowDiagnosticBridge.ts";
import type { DiagnosticFlushResult } from "../diagnostics/diagnosticTypes";
import type { CloseBehavior } from "../generalSettings.ts";
import { EVENT_WINDOW_LABELS } from '../windows/eventWindowChannels';

const DIAGNOSTIC_SESSION_MARKER = "bb-colive.diagnostic-session";

export function readDiagnosticSessionMarker(): string | null {
  try {
    return window.localStorage.getItem(DIAGNOSTIC_SESSION_MARKER);
  } catch {
    return null;
  }
}

function writeDiagnosticSessionMarker(value: "active" | "clean"): void {
  try {
    window.localStorage.setItem(DIAGNOSTIC_SESSION_MARKER, value);
  } catch {
    // 本地存储不可用时不影响应用启动或退出。
  }
}

function diagnosticErrorCategory(value: unknown): string {
  if (value instanceof TypeError) return "type-error";
  if (value instanceof Error) return "error";
  if (typeof value === "string") return "string-error";
  return "non-error-rejection";
}

export function diagnosticErrorMessage(value: unknown): string {
  const raw = value instanceof Error ? value.message : typeof value === "string" ? value : "";
  return sanitizeDiagnosticString(raw)?.slice(0, 240) || "unclassified error";
}

function diagnosticSourceSummary(source: string | undefined): string {
  const value = source?.trim();
  if (!value) return "unknown";

  try {
    const url = new URL(value);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const leaf = pathParts[pathParts.length - 1]?.slice(0, 120);
    if (url.protocol === "file:") return leaf ? `file:${leaf}` : "file";
    if (url.origin !== "null") return leaf ? `${url.origin}/${leaf}` : url.origin;
    return leaf ? `${url.protocol}${leaf}` : url.protocol;
  } catch {
    const pathParts = value.split(/[\\/]/).filter(Boolean);
    const leaf = pathParts[pathParts.length - 1]?.split(/[?#]/, 1)[0];
    return `local:${sanitizeDiagnosticString(leaf)?.slice(0, 120) ?? "unknown"}`;
  }
}

function recordGlobalDiagnosticError(
  context: DiagnosticContext,
  handlerSource: string,
  source: string | undefined,
  value: unknown,
): void {
  try {
    context.record({
      level: "error",
      subsystem: "app",
      action: "exception",
      outcome: "failure",
      data: {
        category: diagnosticErrorCategory(value),
        handler: handlerSource,
        source: diagnosticSourceSummary(source),
        message: diagnosticErrorMessage(value),
      },
    });
  } catch {
    // 全局诊断失败不能改变浏览器原有错误处理。
  }
}


export function useApplicationLifecycle({
  closeBehavior, diagnosticContext, diagnosticExportInProgressRef, diagnosticExportCompletionRef, setDiagnosticFlushResult,
}: {
  closeBehavior: CloseBehavior;
  diagnosticContext: DiagnosticContext;
  diagnosticExportInProgressRef: RefObject<boolean>;
  diagnosticExportCompletionRef: RefObject<Promise<void> | null>;
  setDiagnosticFlushResult: (result: DiagnosticFlushResult) => void;
}) {
  const sessionLifecycleRecordedRef = useRef(false);
  const shutdownConnectionRequestedRef = useRef(false);
  useEffect(() => {
    const shouldRecordSessionStart = !sessionLifecycleRecordedRef.current;
    sessionLifecycleRecordedRef.current = true;
    if (shouldRecordSessionStart) {
      if (readDiagnosticSessionMarker() === "active") {
        diagnosticContext.record({
          level: "warn",
          subsystem: "app",
          action: "session",
          outcome: "previousSessionUnclean",
        });
      }
      diagnosticContext.record({ subsystem: "app", action: "session", outcome: "start" });
      writeDiagnosticSessionMarker("active");
    }

    let shutdownRecorded = false;
    let shutdownPromise: Promise<DiagnosticFlushResult> | null = null;
    let closeInProgress = false;
    let closeAllowed = false;
    let disposed = false;
    const appWindow = getCurrentWindow();

    const recordShutdown = () => {
      if (shutdownRecorded) return;
      shutdownRecorded = true;
      try {
        diagnosticContext.record({ subsystem: "app", action: "shutdown", outcome: "preparing" });
      } catch {
        // 退出路径不应因诊断记录失败而阻断窗口关闭。
      }
    };

    const flushDiagnostics = (): Promise<DiagnosticFlushResult> => {
      shutdownPromise ??= (async () => {
        if (!shutdownConnectionRequestedRef.current) {
          shutdownConnectionRequestedRef.current = true;
          try {
            useConnection.getState().disconnect("app-exit");
            await flushArchiveWriter();
          } catch {
            // 退出路径仍需继续刷诊断日志；档案状态由下一次启动恢复收口。
          }
        }
        recordShutdown();
        try {
          let closeResult: { complete: boolean; incompleteWindows: string[] };
          try {
            closeResult = await invoke("prepare_floating_windows_close");
          } catch {
            closeResult = { complete: false, incompleteWindows: [...EVENT_WINDOW_LABELS] };
          }
          const diagnosticFlushResult = await flushWindowDiagnosticLogs();
          if (!closeResult.complete) {
            diagnosticFlushResult.failed += diagnosticFlushResult.windowFlush?.complete === false ? 0 : 1;
            diagnosticFlushResult.windowFlush = {
              requestId: diagnosticFlushResult.windowFlush?.requestId ?? "window-close",
              complete: false,
              incompleteWindows: [...new Set([...closeResult.incompleteWindows, ...(diagnosticFlushResult.windowFlush?.incompleteWindows ?? [])])],
            };
          }
          setDiagnosticFlushResult(diagnosticFlushResult);
          if (diagnosticFlushResult.failed > 0 || diagnosticFlushResult.writeFailures > 0 || diagnosticFlushResult.pending > 0 || diagnosticFlushResult.droppedRecords > 0) {
            console.warn("诊断日志刷盘健康计数", diagnosticFlushResult);
          }
          if (diagnosticFlushResult.failed === 0 && diagnosticFlushResult.pending === 0 && diagnosticFlushResult.droppedRecords === 0 && diagnosticFlushResult.windowFlush?.complete !== false) {
            writeDiagnosticSessionMarker("clean");
          }
          return diagnosticFlushResult;
        } catch {
          const diagnosticFlushResult: DiagnosticFlushResult = {
            failed: 1,
            flushed: 0,
            pending: 0,
            writeFailures: 1,
            droppedRecords: 0,
          };
          setDiagnosticFlushResult(diagnosticFlushResult);
          console.warn("诊断日志刷盘健康计数", diagnosticFlushResult);
          return diagnosticFlushResult;
        }
      })();
      return shutdownPromise;
    };

    const shutdown = () => {
      void flushDiagnostics();
    };

    const previousOnError = window.onerror;
    const onError: OnErrorEventHandler = (message, _source, _lineno, _colno, error) => {
      recordGlobalDiagnosticError(diagnosticContext, "window.onerror", _source, error ?? message);
      if (typeof previousOnError === "function") {
        try {
          return previousOnError.call(window, message, _source, _lineno, _colno, error);
        } catch {
          return false;
        }
      }
      return false;
    };
    window.onerror = onError;

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      recordGlobalDiagnosticError(diagnosticContext, "window.unhandledrejection", undefined, event.reason);
    };
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("beforeunload", shutdown);

    const prepareQuit = async () => {
      if (closeInProgress) return;
      closeInProgress = true;
      try {
        await invoke("begin_app_quit");
        if (diagnosticExportInProgressRef.current && diagnosticExportCompletionRef.current) {
          await diagnosticExportCompletionRef.current.catch(() => {});
        }
        await flushDiagnostics();
        closeAllowed = true;
        await invoke("quit_app");
        diagnosticContext.stop?.();
      } catch {
        closeAllowed = false;
        closeInProgress = false;
        shutdownPromise = null;
        writeDiagnosticSessionMarker("active");
        diagnosticContext.record({
          level: "error",
          subsystem: "app",
          action: "shutdown",
          outcome: "window-close-failed",
        });
      }
    };
    let unlistenTray: (() => void) | undefined;
    void listen("app:prepare-quit", prepareQuit).then((stop) => {
      if (disposed) stop(); else unlistenTray = stop;
    }).catch(() => {});
    let unlistenClose: (() => void) | undefined;
    void appWindow.onCloseRequested(async (event) => {
      if (closeAllowed || disposed) return;
      event.preventDefault();
      if (closeBehavior === "tray") {
        if (diagnosticExportInProgressRef.current && diagnosticExportCompletionRef.current) {
          await diagnosticExportCompletionRef.current.catch(() => {});
        }
        await appWindow.hide().catch(() => {});
        return;
      }
      await prepareQuit();
    }).then((stop) => {
      if (disposed || closeAllowed) stop();
      else unlistenClose = stop;
    }).catch(() => {});

    return () => {
      disposed = true;
      unlistenClose?.();
      unlistenTray?.();
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("beforeunload", shutdown);
      if (window.onerror === onError) window.onerror = previousOnError;
    };
  }, [closeBehavior, diagnosticContext]);
}
