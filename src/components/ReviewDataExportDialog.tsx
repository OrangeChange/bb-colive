import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { bindUiDismissableLayer } from "./ui/layer";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import type {
  ArchiveDataExportBundle,
  ArchiveDataExportCategory,
  ArchiveDataExportFormat,
  ArchiveDataExportScope,
} from "../archive/archiveDataExportTypes.ts";
import {
  buildArchiveDataBundle,
  collectArchiveDataExportSnapshot,
} from "../archive/archiveDataExport.ts";
import {
  archiveCsvFileName,
  serializeArchiveDataAiJson,
  serializeArchiveDataCsv,
  serializeArchiveDataExcel,
  zipArchiveDataCsv,
} from "../archive/archiveDataExportFormats.ts";
import type { ArchiveRepositoryContract, ArchiveSortDirection } from "../archive/archiveTypes.ts";
import { createArchiveRequestId, recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import { flushArchiveWriter, runArchiveTransfer } from "../archive/archiveRuntime.ts";

export interface ReviewDataExportScopeOption {
  id: string;
  label: string;
  description: string;
  scope: ArchiveDataExportScope;
}

interface ReviewDataExportDialogProps {
  repository: ArchiveRepositoryContract;
  scopeOptions: readonly ReviewDataExportScopeOption[];
  defaultScopeId: string;
  ownerName: string;
  sessionStartedAt?: number | null;
  onClose: () => void;
  onCompleted?: (path: string) => void;
}

const CATEGORIES: readonly { id: ArchiveDataExportCategory; label: string }[] = localized(() => ([
  { id: "danmaku", label: uiText("reviewDataExportDialog.CATEGORIES.label") },
  { id: "interaction", label: uiText("reviewDataExportDialog.CATEGORIES.label2") },
  { id: "gift", label: uiText("reviewDataExportDialog.CATEGORIES.label3") },
  { id: "superchat", label: uiText("reviewDataExportDialog.CATEGORIES.label4") },
  { id: "guard", label: uiText("reviewDataExportDialog.CATEGORIES.label5") },
]));

function formatError(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function compareItems(a: ArchiveDataExportBundle["items"][number], b: ArchiveDataExportBundle["items"][number]): number {
  return a.eventTs - b.eventTs
    || a.ordinal - b.ordinal
    || a.eventKey.localeCompare(b.eventKey);
}

function sortBundle(bundle: ArchiveDataExportBundle, direction: ArchiveSortDirection): ArchiveDataExportBundle {
  const items = [...bundle.items].sort(compareItems);
  if (direction === "desc") items.reverse();
  const rowsByCategory = Object.fromEntries(CATEGORIES.map(({ id }) => [
    id,
    items.filter((item) => item.category === id).map((item) => item.row),
  ])) as ArchiveDataExportBundle["rowsByCategory"];
  return { ...bundle, items, rowsByCategory };
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/[. ]+$/g, "")
    .slice(0, 48) || uiText("reviewDataExportDialog.safeFilePart");
}

function sessionFilePart(timestamp: number | null | undefined): string | null {
  if (timestamp === null || timestamp === undefined) return null;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(date.getFullYear()).slice(-2)}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function exportFilePart(timestamp: number): string {
  return sessionFilePart(timestamp) ?? uiText("reviewDataExportDialog.exportFilePart");
}

function scopeFilePart(scopeId: string, scope: ArchiveDataExportScope, sessionStartedAt: number | null | undefined): string {
  if (scopeId === "session-current" || scopeId === "session-all") return sessionFilePart(sessionStartedAt) ?? uiText("reviewDataExportDialog.scopeFilePart");
  if (scopeId === "session-filtered" || scopeId === "owner-event-results" || scopeId === "owner-filtered-sessions") return uiText("reviewDataExportDialog.scopeFilePart2");
  if (scope.kind === "session") return sessionFilePart(sessionStartedAt) ?? uiText("reviewDataExportDialog.scopeFilePart");
  if (scope.kind === "sessions") return uiText("reviewDataExportDialog.scopeFilePart3", { length: scope.sessionIds.length });
  if (scopeId === "owner-all") return uiText("reviewDataExportDialog.scopeFilePart4");
  return uiText("reviewDataExportDialog.scopeFilePart2");
}

function defaultFileName(
  format: ArchiveDataExportFormat,
  ownerName: string,
  scopeId: string,
  scope: ArchiveDataExportScope,
  sessionStartedAt: number | null | undefined,
  category?: ArchiveDataExportCategory,
  exportedAt = Date.now(),
): string {
  const scopePart = scopeFilePart(scopeId, scope, sessionStartedAt);
  const stableSessionName = scopeId === "session-current" || scopeId === "session-all";
  const stem = `${safeFilePart(ownerName)}_${scopePart}${stableSessionName ? "" : `_${exportFilePart(exportedAt)}`}`;
  if (format === "csv" && category) {
    const categoryName = category === "danmaku" ? uiText("reviewDataExportDialog.defaultFileName.categoryName") : category === "interaction" ? uiText("reviewDataExportDialog.defaultFileName.categoryName2") : category === "gift" ? uiText("reviewDataExportDialog.defaultFileName.categoryName3") : category === "superchat" ? uiText("reviewDataExportDialog.defaultFileName.categoryName4") : uiText("reviewDataExportDialog.defaultFileName.categoryName5");
    return `${stem}_${categoryName}.csv`;
  }
  if (format === "excel") return `${stem}.xlsx`;
  if (format === "csv") return `${stem}.zip`;
  return `${stem}.json`;
}

export function ReviewDataExportDialog({ repository, scopeOptions, defaultScopeId, ownerName, sessionStartedAt, onClose, onCompleted }: ReviewDataExportDialogProps) {
  useUiLanguage();
  const [format, setFormat] = useState<ArchiveDataExportFormat>("excel");
  const [scopeId, setScopeId] = useState(defaultScopeId);
  const [direction, setDirection] = useState<ArchiveSortDirection>("asc");
  const [categories, setCategories] = useState<Set<ArchiveDataExportCategory>>(() => new Set(CATEGORIES.map(({ id }) => id)));
  const [busy, setBusy] = useState(false);
  const [cancelable, setCancelable] = useState(false);
  const [phase, setPhase] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);
  busyRef.current = busy;
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!dialogRef.current) return;
    return bindUiDismissableLayer(dialogRef.current, () => onCloseRef.current(), { canClose: () => !busyRef.current, modal: true });
  }, []);
  const selectedScope = scopeOptions.find((option) => option.id === scopeId) ?? scopeOptions[0];
  const selectedCategoryList = useMemo(() => CATEGORIES.filter(({ id }) => categories.has(id)), [categories]);

  const toggleCategory = (category: ArchiveDataExportCategory) => {
    setCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const cancel = () => {
    if (cancelable) abortRef.current?.abort();
  };

  const exportData = async () => {
    if (busy || !selectedScope) return;
    if (format === "csv" && selectedCategoryList.length === 0) {
      setError(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData"));
      return;
    }
    setError(null);
    setNotice(null);
    const requestId = createArchiveRequestId("archive-data-export");
    const defaultName = defaultFileName(
      format,
      ownerName,
      selectedScope.id,
      selectedScope.scope,
      sessionStartedAt,
      format === "csv" && selectedCategoryList.length === 1 ? selectedCategoryList[0].id : undefined,
    );
    const path = await save({
      defaultPath: defaultName,
      filters: [{ name: format === "excel" ? uiText("reviewDataExportDialog.path.filters.name") : format === "csv" ? uiText("reviewDataExportDialog.path.filters.name2") : "JSON", extensions: format === "excel" ? ["xlsx"] : format === "csv" ? ["csv", "zip"] : ["json"] }],
    });
    if (!path) {
      recordArchiveDiagnostic("cancel", "archive-data-export", "canceled", {
        requestId,
        pathProvided: false,
        data: { phase: "path-select", format, scope: selectedScope.scope.kind },
      });
      return;
    }

    recordArchiveDiagnostic("request", "archive-data-export", "started", {
      requestId,
      pathProvided: true,
      data: { phase: "collect", format, scope: selectedScope.scope.kind, categoryCount: format === "csv" ? selectedCategoryList.length : CATEGORIES.length },
    });

    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setCancelable(true);
    setPhase(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData2"));
    try {
      await flushArchiveWriter();
      const snapshot = await runArchiveTransfer(async () => collectArchiveDataExportSnapshot(repository, selectedScope.scope, {
          signal: controller.signal,
          onProgress: (progress) => {
            setPhase(progress.phase === "sessions"
              ? uiText("reviewDataExportDialog.exportData.snapshot.onProgress", { completed: progress.completed, total: progress.total })
              : uiText("reviewDataExportDialog.exportData.snapshot.onProgress2", { value: progress.eventCount ?? 0 }));
          },
        }));
      if (controller.signal.aborted) throw new DOMException(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData3"), "AbortError");
      setCancelable(false);
      setPhase(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData4"));
      const filters = "filters" in selectedScope.scope ? selectedScope.scope.filters : undefined;
      const exportSessions = snapshot.sessions.map((session) => ({
        ...session,
        ownerName: ownerName.trim() || null,
      }));
      const baseBundle = buildArchiveDataBundle({ ...snapshot, sessions: exportSessions }, selectedScope.scope, filters);
      const bundle: ArchiveDataExportBundle = {
        scope: selectedScope.scope,
        sessions: exportSessions,
        ...baseBundle,
      };
      if (bundle.items.length === 0) throw new Error(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData5"));

      setPhase(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData6"));
      let contents: Uint8Array;
      let extension: string;
      if (format === "excel") {
        contents = serializeArchiveDataExcel(sortBundle(bundle, direction));
        extension = "xlsx";
      } else if (format === "ai-json") {
        contents = serializeArchiveDataAiJson(sortBundle(bundle, "asc"));
        extension = "json";
      } else {
        const sorted = sortBundle(bundle, direction);
        const files = selectedCategoryList.reduce<Record<string, Uint8Array>>((result, { id }) => {
          result[archiveCsvFileName(id)] = serializeArchiveDataCsv(id, sorted.rowsByCategory[id]);
          return result;
        }, {});
        if (selectedCategoryList.length === 1) {
          contents = files[archiveCsvFileName(selectedCategoryList[0].id)];
          extension = "csv";
        } else {
          contents = zipArchiveDataCsv(files);
          extension = "zip";
        }
      }
      setPhase(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData7"));
      const finalPath = path.toLowerCase().endsWith(`.${extension}`) ? path : `${path}.${extension}`;
      await invoke("write_archive_export_bytes", { path: finalPath, contentsBase64: toBase64(contents) });
      recordArchiveDiagnostic("success", "archive-data-export", "written", {
        requestId,
        pathProvided: true,
        count: bundle.items.length,
        data: { phase: "write", format, scope: selectedScope.scope.kind, categoryCount: format === "csv" ? selectedCategoryList.length : CATEGORIES.length },
      });
      onCompleted?.(finalPath);
      setNotice(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData8", { length: bundle.items.length, finalPath: finalPath }));
      setPhase("");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") {
        recordArchiveDiagnostic("cancel", "archive-data-export", "canceled", {
          requestId,
          pathProvided: true,
          data: { phase: "collect", format, scope: selectedScope.scope.kind },
        });
        setPhase("");
        setNotice(uiText("reviewDataExportDialog.ReviewDataExportDialog.exportData9"));
      } else {
        recordArchiveDiagnostic("failure", "archive-data-export", "failed", {
          requestId,
          pathProvided: true,
          data: { phase: "export", format, scope: selectedScope.scope.kind, error: formatError(reason) },
        });
        setError(formatError(reason));
        setPhase("");
      }
    } finally {
      abortRef.current = null;
      setCancelable(false);
      setBusy(false);
    }
  };

  return (
    <div className="ui-modal-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section ref={dialogRef} tabIndex={-1} className="ui-modal-surface flex max-h-[min(720px,calc(100vh-40px))] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="review-data-export-title">
        <header className="flex shrink-0 items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 id="review-data-export-title" className="ui-type-section-title text-t1">{uiText("reviewDataExportDialog.ReviewDataExportDialog")}</h2>
            <p className="mt-1 ui-type-meta text-t3">{uiText("reviewDataExportDialog.ReviewDataExportDialog2")}</p>
          </div>
          <button type="button" className="h-8 rounded-md px-2 ui-type-control text-t2 enabled:hover:bg-raised enabled:hover:text-t1 disabled:opacity-40" disabled={busy} onClick={onClose}>{uiText("common.close")}</button>
        </header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <fieldset className="space-y-2">
            <legend className="ui-type-control text-t1">{uiText("reviewDataExportDialog.ReviewDataExportDialog3")}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopeOptions.map((option) => (
                <label key={option.id} className={`cursor-pointer rounded-lg border px-3 py-2 transition-colors ${scopeId === option.id ? "border-accent bg-accent-subtle" : "border-line bg-bg hover:border-accent/50"}`}>
                  <span className="flex items-center gap-2 ui-type-control text-t1"><input type="radio" name="review-export-scope" checked={scopeId === option.id} onChange={() => setScopeId(option.id)} />{option.label}</span>
                  <span className="mt-1 block pl-5 ui-type-meta text-t3">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="ui-type-control text-t1">{uiText("reviewDataExportDialog.ReviewDataExportDialog4")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className={`cursor-pointer rounded-lg border px-3 py-2 ${format === "excel" ? "border-accent bg-accent-subtle" : "border-line bg-bg"}`}><span className="flex items-center gap-2 ui-type-control text-t1"><input type="radio" name="review-export-format" checked={format === "excel"} onChange={() => setFormat("excel")} />Excel</span><span className="mt-1 block pl-5 ui-type-meta text-t3">{uiText("reviewDataExportDialog.ReviewDataExportDialog5")}</span></label>
              <label className={`cursor-pointer rounded-lg border px-3 py-2 ${format === "csv" ? "border-accent bg-accent-subtle" : "border-line bg-bg"}`}><span className="flex items-center gap-2 ui-type-control text-t1"><input type="radio" name="review-export-format" checked={format === "csv"} onChange={() => setFormat("csv")} />CSV</span><span className="mt-1 block pl-5 ui-type-meta text-t3">{uiText("reviewDataExportDialog.ReviewDataExportDialog6")}</span></label>
              <label className={`cursor-pointer rounded-lg border px-3 py-2 ${format === "ai-json" ? "border-accent bg-accent-subtle" : "border-line bg-bg"}`}><span className="flex items-center gap-2 ui-type-control text-t1"><input type="radio" name="review-export-format" checked={format === "ai-json"} onChange={() => setFormat("ai-json")} />JSON</span><span className="mt-1 block pl-5 ui-type-meta text-t3">{uiText("reviewDataExportDialog.ReviewDataExportDialog7")}</span></label>
            </div>
          </fieldset>
          {format === "ai-json" && <p className="ui-type-meta text-t3">{uiText("reviewDataExportDialog.ReviewDataExportDialog8")}</p>}
          {format === "csv" && (
            <fieldset className="space-y-2">
              <legend className="ui-type-control text-t1">{uiText("reviewDataExportDialog.ReviewDataExportDialog9")}</legend>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(({ id, label }) => <label key={id} className="inline-flex items-center gap-2 py-1 ui-type-control text-t2"><input type="checkbox" checked={categories.has(id)} onChange={() => toggleCategory(id)} />{label}</label>)}
              </div>
            </fieldset>
          )}
          {format !== "ai-json" && (
            <fieldset className="space-y-2">
              <legend className="ui-type-control text-t1">{uiText("reviewDataExportDialog.ReviewDataExportDialog10")}</legend>
              <div className="flex gap-2">
                {(["asc", "desc"] as const).map((value) => <label key={value} className="inline-flex items-center gap-2 ui-type-control text-t2"><input type="radio" name="review-export-direction" checked={direction === value} onChange={() => setDirection(value)} />{value === "asc" ? uiText("reviewDataExportDialog.ReviewDataExportDialog11") : uiText("reviewDataExportDialog.ReviewDataExportDialog12")}</label>)}
              </div>
            </fieldset>
          )}
          {phase && <p role="status" className="rounded-lg border border-line bg-bg px-3 py-2 ui-type-control text-t2">{phase}</p>}
          {notice && <p role="status" className="rounded-lg border border-accent/40 bg-accent-subtle px-3 py-2 ui-type-control text-accent-text">{notice}</p>}
          {error && <p role="alert" className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 ui-type-control text-danger">{uiText("reviewDataExportDialog.ReviewDataExportDialog13")}{error}</p>}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">
          {busy && cancelable && <button type="button" className="h-8 rounded-md border border-danger/50 px-3 ui-type-control text-danger hover:bg-danger/10" onClick={cancel}>{uiText("reviewDataExportDialog.ReviewDataExportDialog14")}</button>}
          <button type="button" className="h-8 rounded-md border border-line px-3 ui-type-control text-t2 enabled:hover:bg-raised disabled:opacity-40" disabled={busy} onClick={onClose}>{uiText("common.close")}</button>
          <button type="button" className="h-8 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !selectedScope} onClick={() => void exportData()}>{busy ? uiText("reviewDataExportDialog.ReviewDataExportDialog15") : uiText("reviewDataExportDialog.ReviewDataExportDialog16")}</button>
        </footer>
      </section>
    </div>
  );
}
