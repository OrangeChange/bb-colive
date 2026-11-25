import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { SettingsIcon } from "./SettingsIcon";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import type { IssueMarker } from "../diagnostics/diagnosticTypes.ts";
import type { DiagnosticExportProgress, DiagnosticExportResult, DiagnosticStatusSnapshot } from "../diagnostics/diagnosticBridge.ts";
import { getIssueMarkerStatus } from "../diagnostics/issueMarkers.ts";
import { buildDiagnosticExportFileName, getDiagnosticExportId } from "../diagnostics/exportFileName.ts";
import { estimateExportRemainingSeconds, exportProgressPercent, formatExportRemaining, hasReliableExportProgressSample } from "../diagnostics/exportProgress.ts";

export type DiagnosticExportMode = "24h" | "full";

export type DiagnosticSettingsProps = {
  status: DiagnosticStatusSnapshot | null;
  markers: readonly IssueMarker[];
  openMarkRequest?: number;
  onMarkIssue: (note?: string, markedAt?: number) => void | Promise<void>;
  onExport: (mode: DiagnosticExportMode, outputPath: string) => void | Promise<Pick<DiagnosticExportResult, "outputPath" | "missingSnapshots" | "flush"> | void>;
  onExportStateChange: (busy: boolean) => void;
  onOpenDirectory: () => void | Promise<void>;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function StatusIcon({ tone }: { tone: "success" | "warning" | "danger" }) {
  const color = tone === "success" ? "var(--status-success)" : tone === "warning" ? "var(--status-warning)" : "var(--status-danger)";
  return <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

function DiagnosticDialog({
  title,
  description,
  children,
  onCancel,
  onConfirm,
  confirmLabel,
  busy = false,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  onCancel: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  busy?: boolean;
}) {
  useUiLanguage();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  const busyRef = useRef(busy);
  onCancelRef.current = onCancel;
  busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, []);

  return (
    <div className="diagnostic-dialog-overlay absolute inset-0 z-[80]" role="presentation">
      <button type="button" className="diagnostic-dialog-backdrop absolute inset-0 h-full w-full border-0" aria-label={uiText("diagnosticSettings.aria_label")} onClick={() => { if (!busy) onCancel(); }} />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="diagnostic-dialog-title" aria-describedby="diagnostic-dialog-description" tabIndex={-1} className="diagnostic-dialog absolute left-1/2 top-1/2 w-[min(460px,calc(100%-24px))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface p-4 shadow-2xl shadow-black/30">
        <h3 id="diagnostic-dialog-title" className="ui-type-section-title font-medium text-t1">{title}</h3>
        <p id="diagnostic-dialog-description" className="mt-2 ui-type-control leading-5 text-t2">{description}</p>
        {children}
        {onConfirm && (
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={onCancel} className="h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 transition-colors enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50">{uiText("common.cancel")}</button>
            <button type="button" disabled={busy} onClick={onConfirm} className="h-8 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg transition-colors enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50">{busy ? uiText("diagnosticSettings.DiagnosticDialog") : confirmLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export function DiagnosticSettings({ status, markers, openMarkRequest, onMarkIssue, onExport, onExportStateChange, onOpenDirectory }: DiagnosticSettingsProps) {
  useUiLanguage();
  const [markOpen, setMarkOpen] = useState(false);
  const [fullConfirmOpen, setFullConfirmOpen] = useState(false);
  const [note, setNote] = useState("");
  const markOpenedAtRef = useRef<number | null>(null);
  const [busy, setBusy] = useState<DiagnosticExportMode | "mark" | "directory" | null>(null);
  const [exportProgress, setExportProgress] = useState<DiagnosticExportProgress | null>(null);
  const [exportRemainingSeconds, setExportRemaining] = useState<number | null>(null);
  const exportModeRef = useRef<DiagnosticExportMode | null>(null);
  const exportStartedAtRef = useRef<number | null>(null);
  const exportRateRef = useRef<number | null>(null);
  const previousExportProgressRef = useRef<{ processedBytes: number; observedAt: number } | null>(null);
  const exportProgressSampleCountRef = useRef(0);
  const [displayExportPercent, setDisplayExportPercent] = useState(0);
  const displayExportPercentRef = useRef(0);
  const displayExportAnimationRef = useRef<number | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "error"; text: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const frameRef = useRef<HTMLDivElement>(null);
  const [dialogFrame, setDialogFrame] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listen<DiagnosticExportProgress>("diagnostic:export-progress", (event) => {
      if (disposed || event.payload.mode !== exportModeRef.current) return;
      const observedAt = Date.now();
      const previous = previousExportProgressRef.current;
      if (previous && event.payload.processedBytes > previous.processedBytes) {
        exportProgressSampleCountRef.current += 1;
        const elapsedMs = observedAt - previous.observedAt;
        if (elapsedMs > 0) {
          const instantRate = (event.payload.processedBytes - previous.processedBytes) / elapsedMs;
          exportRateRef.current = exportRateRef.current == null
            ? instantRate
            : exportRateRef.current * 0.7 + instantRate * 0.3;
        }
      }
      previousExportProgressRef.current = { processedBytes: event.payload.processedBytes, observedAt };
      setExportProgress(event.payload);
      const startedAt = exportStartedAtRef.current;
      const elapsedMs = startedAt == null ? 0 : Math.max(0, observedAt - startedAt);
      const sample = { ...event.payload, elapsedMs, sampleCount: exportProgressSampleCountRef.current };
      setExportRemaining(event.payload.complete
        ? 0
        : hasReliableExportProgressSample(sample)
          ? estimateExportRemainingSeconds({ ...sample, rateBytesPerMs: exportRateRef.current ?? undefined })
          : null);
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const target = exportProgress ? exportProgressPercent(exportProgress) : 0;
    const from = displayExportPercentRef.current;
    if (displayExportAnimationRef.current != null) {
      window.cancelAnimationFrame(displayExportAnimationRef.current);
      displayExportAnimationRef.current = null;
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || Math.abs(target - from) < 0.01) {
      displayExportPercentRef.current = target;
      setDisplayExportPercent(target);
      return;
    }

    const distance = Math.abs(target - from);
    const duration = Math.min(720, Math.max(220, distance * 12));
    const startedAt = performance.now();
    const animate = (observedAt: number) => {
      const progress = Math.min(1, (observedAt - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = from + (target - from) * eased;
      displayExportPercentRef.current = next;
      setDisplayExportPercent(next);
      if (progress < 1) {
        displayExportAnimationRef.current = window.requestAnimationFrame(animate);
      } else {
        displayExportPercentRef.current = target;
        displayExportAnimationRef.current = null;
      }
    };
    displayExportAnimationRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (displayExportAnimationRef.current != null) {
        window.cancelAnimationFrame(displayExportAnimationRef.current);
        displayExportAnimationRef.current = null;
      }
    };
  }, [exportProgress]);

  useEffect(() => {
    if (!notice || notice.tone !== "success") return;
    const timer = window.setTimeout(() => setNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (openMarkRequest == null) return;
    setNotice(null);
    markOpenedAtRef.current = Date.now();
    setMarkOpen(true);
  }, [openMarkRequest]);

  useEffect(() => {
    if (!markOpen && !fullConfirmOpen) return;
    const updateFrame = () => {
      const frame = frameRef.current?.closest(".settings-panel-frame")?.getBoundingClientRect();
      if (frame) setDialogFrame({ left: frame.left, top: frame.top, width: frame.width, height: frame.height });
    };
    updateFrame();
    window.addEventListener("resize", updateFrame);
    window.addEventListener("scroll", updateFrame, true);
    return () => {
      window.removeEventListener("resize", updateFrame);
      window.removeEventListener("scroll", updateFrame, true);
    };
  }, [fullConfirmOpen, markOpen]);

  useEffect(() => {
    if (!markers.some((marker) => getIssueMarkerStatus(marker, now) === "collecting")) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [markers, now]);

  const hasLostRecords = Boolean(status && (status.droppedRecords > 0 || status.discarded > 0));
  const hasWriteFailures = Boolean(status && (status.writeFailures > 0 || status.status === "degraded"));
  const queueFull = status?.queueFull === true;
  const statusTone = hasLostRecords ? "danger" : !status || hasWriteFailures || status.status === "full" ? "warning" : "success";
  const statusText = !status ? uiText("diagnosticSettings.DiagnosticSettings.statusText")
    : hasLostRecords ? uiText("diagnosticSettings.DiagnosticSettings.statusText2")
    : hasWriteFailures ? uiText("diagnosticSettings.DiagnosticSettings.statusText3")
    : queueFull ? uiText("diagnosticSettings.DiagnosticSettings.statusText4")
    : status.status === "full" ? uiText("diagnosticSettings.DiagnosticSettings.statusText5")
    : uiText("diagnosticSettings.DiagnosticSettings.statusText6");
  const collectingMarkers = markers.filter((marker) => getIssueMarkerStatus(marker, now) === "collecting");
  const collectingCount = collectingMarkers.length;
  const latestCollectionEnd = collectingMarkers.reduce((latest, marker) => Math.max(latest, marker.markedAt + 180_000), 0);
  const remainingSeconds = Math.max(0, Math.ceil((latestCollectionEnd - now) / 1000));
  const remainingText = remainingSeconds >= 60 ? uiText("diagnosticSettings.DiagnosticSettings.remainingText", { value: Math.floor(remainingSeconds / 60), value2: remainingSeconds % 60 }) : uiText("diagnosticSettings.DiagnosticSettings.remainingText2", { remainingSeconds: remainingSeconds });
  const fullDescription = uiText("diagnosticSettings.DiagnosticSettings.fullDescription", { value: status ? uiText("diagnosticSettings.DiagnosticSettings.fullDescription.value", { value: formatBytes(status.totalBytes) }) : uiText("diagnosticSettings.DiagnosticSettings.fullDescription.value2") });
  const runExport = async (mode: DiagnosticExportMode) => {
    if (busy) return;
    setBusy(mode);
    setNotice(null);
    let exportStarted = false;
    try {
      const outputPath = await save({
        defaultPath: buildDiagnosticExportFileName(mode, getDiagnosticExportId()),
        filters: [{ name: uiText("diagnosticSettings.outputPath.filters.name"), extensions: ["zip"] }],
      });
      if (!outputPath) return;
      exportModeRef.current = mode;
      exportStartedAtRef.current = Date.now();
      exportRateRef.current = null;
      previousExportProgressRef.current = null;
      exportProgressSampleCountRef.current = 0;
      setExportRemaining(null);
      setExportProgress({ mode, processedBytes: 0, totalBytes: 0, complete: false });
      exportStarted = true;
      onExportStateChange(true);
      const result = await onExport(mode, outputPath);
      const savedPath = result && typeof result.outputPath === "string" ? result.outputPath : outputPath;
      setExportRemaining(0);
      setExportProgress((current) => current ? { ...current, complete: true } : current);
      const missingSnapshots = result?.missingSnapshots ?? [];
      const flush = result?.flush;
      const flushDegraded = Boolean(flush && (flush.failed > 0 || flush.pending > 0 || flush.droppedRecords > 0));
      const historicalWarning = flush && flush.writeFailures > 0
        ? uiText("diagnosticSettings.DiagnosticSettings.runExport.historicalWarning", { writeFailures: flush.writeFailures })
        : null;
      const warning = flushDegraded
        ? uiText("diagnosticSettings.DiagnosticSettings.runExport.warning", { value: flush?.failed ?? 0, value2: flush?.pending ?? 0, value3: flush?.droppedRecords ?? 0 })
        : null;
      setNotice({
        tone: missingSnapshots.length > 0 || flushDegraded || historicalWarning ? "warning" : "success",
        text: [
          `诊断包已保存：${savedPath}`,
          missingSnapshots.length > 0 ? `有 ${missingSnapshots.length} 项快照缺失：${missingSnapshots.join("、")}` : null,
          warning,
          historicalWarning,
        ].filter(Boolean).join("；"),
      });
      window.setTimeout(() => {
        setExportProgress((current) => current?.mode === mode && current.complete ? null : current);
      }, 1800);
    } catch (error) {
      setExportProgress(null);
      setExportRemaining(null);
      setNotice({ tone: "error", text: `导出失败，源日志未删除：${error instanceof Error ? error.message : uiText("diagnosticSettings.statusText")}` });
    } finally {
      if (exportStarted) onExportStateChange(false);
      exportModeRef.current = null;
      exportStartedAtRef.current = null;
      exportRateRef.current = null;
      previousExportProgressRef.current = null;
      exportProgressSampleCountRef.current = 0;
      setBusy(null);
    }
  };
  const mark = async () => {
    if (busy) return;
    setBusy("mark");
    try {
      await onMarkIssue(note.trim() || undefined, markOpenedAtRef.current ?? Date.now());
      setNote("");
      markOpenedAtRef.current = null;
      setMarkOpen(false);
      setNotice({ tone: "success", text: uiText("diagnosticSettings.statusText2") });
    } catch (error) {
      setNotice({ tone: "error", text: `标记失败：${error instanceof Error ? error.message : uiText("diagnosticSettings.statusText")}` });
    } finally {
      setBusy(null);
    }
  };
  const openDirectory = async () => {
    if (busy) return;
    setBusy("directory");
    try {
      await onOpenDirectory();
      setNotice({ tone: "success", text: uiText("diagnosticSettings.statusText3") });
    } catch (error) {
      setNotice({ tone: "error", text: `打开日志目录失败：${error instanceof Error ? error.message : uiText("diagnosticSettings.statusText")}` });
    } finally {
      setBusy(null);
    }
  };
  const frameStyle: CSSProperties | undefined = dialogFrame ? { left: dialogFrame.left, top: dialogFrame.top, width: dialogFrame.width, height: dialogFrame.height } : undefined;
  const exportPercent = Math.round(displayExportPercent);

  return (
    <div ref={frameRef} className="diagnostic-settings min-w-0">
      <div className="settings-subsection-title" title={uiText("diagnosticSettings.title")}><SettingsIcon name="diagnostics" />{uiText("diagnosticSettings.DiagnosticSettings")}</div>
      <div className="mt-3 settings-control-row">
        <span className="settings-control-label ui-type-control text-t2">{uiText("diagnosticSettings.DiagnosticSettings2")}</span>
        <span className="flex min-w-0 items-center justify-end gap-2 ui-type-control text-t2"><StatusIcon tone={statusTone} />{statusText}</span>
      </div>
      <div className="settings-control-row">
        <span className="settings-control-label ui-type-control text-t2" title={uiText("diagnosticSettings.title2")}>{uiText("diagnosticSettings.DiagnosticSettings3")}</span>
        <span className="ui-type-control text-t2">{status ? formatBytes(status.totalBytes) : uiText("diagnosticSettings.DiagnosticSettings4")}</span>
      </div>
      <div className="settings-control-row">
        <span className="settings-control-label ui-type-control text-t2">{uiText("diagnosticSettings.DiagnosticSettings5")}</span>
        <span className="ui-type-control text-t2">{status ? uiText("diagnosticSettings.DiagnosticSettings6", { pending: status.pending }) : uiText("diagnosticSettings.DiagnosticSettings4")}</span>
      </div>
      {(status?.writeFailures || status?.discarded || status?.truncated) ? (
        <p className="mt-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 ui-type-meta leading-4 text-t2">{uiText("diagnosticSettings.DiagnosticSettings7")}{status?.writeFailures ?? 0} {uiText("diagnosticSettings.DiagnosticSettings8")}{status?.discarded ?? 0} {uiText("diagnosticSettings.DiagnosticSettings9")}{status?.truncated ?? 0} {uiText("diagnosticSettings.DiagnosticSettings10")}</p>
      ) : null}
      <div className="mt-3 settings-control-row">
        <span className="settings-control-label ui-type-control text-t2">{uiText("diagnosticSettings.DiagnosticSettings11")}</span>
        <span className="ui-type-control text-t2">{markers.length} {uiText("diagnosticSettings.DiagnosticSettings12")}{collectingCount > 0 ? uiText("diagnosticSettings.DiagnosticSettings13", { collectingCount: collectingCount, remainingText: remainingText }) : markers.length > 0 ? uiText("diagnosticSettings.DiagnosticSettings14") : ""}</span>
      </div>
      <div className="diagnostic-export-actions mt-3 flex min-w-0 flex-wrap gap-2" title={uiText("diagnosticSettings.title3")}>
        <button type="button" disabled={busy !== null} onClick={() => { setNotice(null); markOpenedAtRef.current = Date.now(); setMarkOpen(true); }} className="min-h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50">{uiText("diagnosticSettings.DiagnosticSettings15")}</button>
        <button type="button" disabled={busy !== null} onClick={() => void runExport("24h")} className="min-h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50">{busy === "24h" ? uiText("diagnosticSettings.DiagnosticSettings16") : uiText("diagnosticSettings.DiagnosticSettings17")}</button>
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap gap-2">
        <button type="button" disabled={busy !== null} onClick={() => { setNotice(null); setFullConfirmOpen(true); }} className="min-h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50">{uiText("diagnosticSettings.DiagnosticSettings18")}</button>
        <button type="button" disabled={busy !== null} onClick={() => void openDirectory()} className="min-h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50">{busy === "directory" ? uiText("diagnosticSettings.DiagnosticSettings19") : uiText("diagnosticSettings.DiagnosticSettings20")}</button>
      </div>
      {exportProgress && (
        <div className="mt-3" aria-live="polite">
          <div className="flex items-center justify-between ui-type-meta text-t2">
            <span>{exportPercent}%</span>
            <span>{exportProgress.complete ? uiText("diagnosticSettings.DiagnosticSettings21") : formatExportRemaining(exportRemainingSeconds)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={exportPercent} aria-label={uiText("diagnosticSettings.aria_label2")}>
            <div className="h-full origin-left rounded-full bg-accent motion-reduce:transition-none" style={{ transform: `scaleX(${exportPercent / 100})` }} />
          </div>
        </div>
      )}
      {notice && <p role={notice.tone === "error" ? "alert" : "status"} className={`mt-3 rounded-md border px-2.5 py-2 ui-type-meta leading-4 ${notice.tone === "error" ? "border-danger/40 bg-danger/10 text-danger" : notice.tone === "warning" ? "border-warning/40 bg-warning/10 text-t2" : "border-success/40 bg-success/10 text-t2"}`}>{notice.text}</p>}
      {(markOpen || fullConfirmOpen) && createPortal(
        <div className="diagnostic-dialog-frame fixed z-[80]" style={dialogFrame ? { ...frameStyle, pointerEvents: "auto" } : { display: "none" }} role="presentation">
          {markOpen && (
              <DiagnosticDialog title={uiText("diagnosticSettings.title4")} description={uiText("diagnosticSettings.description")} onCancel={() => { if (!busy) { markOpenedAtRef.current = null; setMarkOpen(false); setNote(""); } }} onConfirm={() => void mark()} confirmLabel={uiText("diagnosticSettings.confirmLabel")} busy={busy === "mark"}>
              <label htmlFor="diagnostic-marker-note" className="mt-3 block ui-type-control text-t2">{uiText("diagnosticSettings.DiagnosticSettings22")}</label>
              <textarea id="diagnostic-marker-note" value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-md border border-line bg-bg px-2.5 py-2 ui-type-control text-t1 outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent-ring" placeholder={uiText("diagnosticSettings.placeholder")} />
            </DiagnosticDialog>
          )}
          {fullConfirmOpen && (
            <DiagnosticDialog title={uiText("diagnosticSettings.title5")} description={fullDescription} onCancel={() => { if (!busy) setFullConfirmOpen(false); }} onConfirm={() => { setFullConfirmOpen(false); void runExport("full"); }} confirmLabel={uiText("diagnosticSettings.confirmLabel2")} />
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
