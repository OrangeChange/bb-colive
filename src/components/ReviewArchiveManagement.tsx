import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  ArchiveDeletePreview,
  ArchiveDeleteScope,
  ArchiveImportPreview,
  ArchiveImportResult,
  ArchiveOwnerSummary,
  ArchiveRepositoryContract,
  ArchiveSessionSummary,
} from "../archive/archiveTypes.ts";
import { ArchiveTransferService } from "../archive/archiveTransfer.ts";
import { createArchiveRequestId, recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import { flushArchiveWriter, runArchiveTransfer } from "../archive/archiveRuntime.ts";
import { ConfirmDialog } from "./ConfirmDialog";
import { actionButtonClass, dangerSolidButtonClass } from "./actionButtonStyles";
import { UiSelect } from "./ui/Select";
import { useGeneralSettings } from "../generalSettings.ts";
import { isArchiveSessionRecording } from "../archive/archiveSessionState.ts";
import { formatArchiveSessionStatus, formatArchiveRecordingStatus } from "../archive/archiveDisplay.ts";

export interface ReviewArchiveManagementProps {
  repository: ArchiveRepositoryContract;
  owner: ArchiveOwnerSummary | null;
  ownerId: string;
  ownerUid?: string | null;
  sessions: readonly ArchiveSessionSummary[];
  /** 场次页进入管理档案时，只展示当前场次相关操作。 */
  sessionOnly?: boolean;
  focusedSessionId?: string;
  onExportResult?: (favoritesOnly: boolean) => void;
  resultExportBusy?: boolean;
  onChanged: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const archiveManagementDeleteOptions = localized(() => ([
  { value: "single", label: uiText("reviewArchiveManagement.archiveManagementDeleteOptions.label") },
  { value: "owner", label: uiText("reviewArchiveManagement.archiveManagementDeleteOptions.label2") },
  { value: "before", label: uiText("reviewArchiveManagement.archiveManagementDeleteOptions.label3") },
  { value: "retention", label: uiText("reviewArchiveManagement.archiveManagementDeleteOptions.label4") },
] as const));
const ownerRetentionPolicyOptions = localized(() => ([
  { value: "global", label: uiText("reviewArchiveManagement.ownerRetentionPolicyOptions.label") },
  { value: "permanent", label: uiText("reviewArchiveManagement.ownerRetentionPolicyOptions.label2") },
  { value: "custom", label: uiText("reviewArchiveManagement.ownerRetentionPolicyOptions.label3") },
] as const));

function selectedDeleteScope(
  mode: "single" | "owner" | "before" | "retention",
  ownerId: string,
  sessionId: string,
  date: string,
  retentionDays: string,
): ArchiveDeleteScope {
  if (mode === "single") return { sessionId };
  if (mode === "owner") return { ownerId, ownerAll: true };
  if (mode === "before") {
    const beforeTs = Date.parse(`${date}T00:00:00`);
    if (!Number.isFinite(beforeTs)) throw new Error(uiText("reviewArchiveManagement.selectedDeleteScope"));
    return { ownerId, beforeTs };
  }
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error(uiText("reviewArchiveManagement.selectedDeleteScope2"));
  return { ownerId, beforeTs: Date.now() - days * 86_400_000 };
}

function DeletePreview({ preview }: { preview: ArchiveDeletePreview }) {
  useUiLanguage();
  return <div className="archive-delete-preview mt-3 border-l-2 border-warning pl-3 ui-type-meta text-t2">
    <p>{uiText("reviewArchiveManagement.DeletePreview")}</p>
    <dl className="archive-summary mt-1">
      <div><dt>{uiText("reviewArchiveManagement.DeletePreview2")}</dt><dd>{preview.ownerCount ?? 0} {uiText("reviewArchiveManagement.DeletePreview3")}</dd></div>
      <div><dt>{uiText("reviewArchiveManagement.DeletePreview4")}</dt><dd>{preview.sessionCount} {uiText("reviewArchiveManagement.DeletePreview5")}</dd></div>
      <div><dt>{uiText("reviewArchiveManagement.DeletePreview6")}</dt><dd>{preview.eventCount} {uiText("reviewArchiveManagement.DeletePreview7")}</dd></div>
      <div><dt>{uiText("reviewArchiveManagement.DeletePreview8")}</dt><dd>{preview.favoriteCount} {uiText("reviewArchiveManagement.DeletePreview7")}</dd></div>
      <div><dt>{uiText("reviewArchiveManagement.DeletePreview9")}</dt><dd>{preview.resourceReferenceCount} {uiText("reviewArchiveManagement.DeletePreview7")}</dd></div>
      <div><dt>{uiText("reviewArchiveManagement.DeletePreview10")}</dt><dd>{formatBytes(preview.bytes)}</dd></div>
    </dl>
    {preview.blockedSessionCount > 0 && <p className="mt-2 text-warning">{uiText("review.deleteBlockedSessions", { count: preview.blockedSessionCount })}</p>}
  </div>;
}

export function ReviewArchiveManagement({
  repository,
  owner,
  ownerId,
  ownerUid,
  sessions,
  sessionOnly = false,
  focusedSessionId,
  onExportResult,
  resultExportBusy = false,
  onChanged,
}: ReviewArchiveManagementProps) {
  useUiLanguage();
  const service = useMemo(() => new ArchiveTransferService({
    repository,
    flushArchiveWriter,
    runArchiveTransfer,
  }), [repository]);
  const [deleteMode, setDeleteMode] = useState<"single" | "owner" | "before" | "retention">("single");
  const [selectedSessionId, setSelectedSessionId] = useState(focusedSessionId ?? sessions[0]?.sessionId ?? "");
  const [deleteDate, setDeleteDate] = useState("");
  const [retentionDays, setRetentionDays] = useState("30");
  const [deletePreview, setDeletePreview] = useState<(ArchiveDeletePreview & { previewId: string }) | null>(null);
  const [importPreview, setImportPreview] = useState<ArchiveImportPreview | null>(null);
  const [importRequestId, setImportRequestId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ArchiveImportResult | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedSessionRecording = sessions.some(session => session.sessionId === selectedSessionId && isArchiveSessionRecording(session));
  const ownerRetentionDays = useGeneralSettings((state) => state.reviewOwnerRetentionDays[ownerId]);
  const setReviewOwnerRetentionDays = useGeneralSettings((state) => state.setReviewOwnerRetentionDays);
  const [ownerRetentionDraft, setOwnerRetentionDraft] = useState(String(ownerRetentionDays ?? 30));

  useEffect(() => {
    setOwnerRetentionDraft(String(ownerRetentionDays ?? 30));
  }, [ownerRetentionDays]);

  useEffect(() => {
    if (focusedSessionId) setSelectedSessionId(focusedSessionId);
    else if (!selectedSessionId && sessions[0]) setSelectedSessionId(sessions[0].sessionId);
  }, [focusedSessionId, selectedSessionId, sessions]);

  const run = async (action: () => Promise<void>) => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setBusy(false);
    }
  };

  const exportOwner = () => run(async () => {
    const requestId = createArchiveRequestId("export");
    const path = await save({
      defaultPath: `danmu-archive-${owner?.roomId ?? ownerId}.json`,
      filters: [{ name: uiText("reviewArchiveManagement.path.filters.name"), extensions: ["json"] }],
    });
    if (!path) {
      recordArchiveDiagnostic("cancel", "archive-export", "canceled", {
        requestId,
        pathProvided: false,
        data: { phase: "path-select" },
      });
      return;
    }
    try {
      recordArchiveDiagnostic("request", "archive-export", "started", {
        requestId,
        pathProvided: true,
        data: { phase: "write" },
      });
      const content = await service.exportArchiveText(
        { kind: "owner", ownerId, ownerUid: ownerUid ?? undefined },
        { requestId },
      );
      const manifest = JSON.parse(content).manifest as { counts?: { eventCount?: number } };
      await invoke("write_archive_transfer", { path, contents: content });
      recordArchiveDiagnostic("success", "archive-export", "written", {
        requestId,
        pathProvided: true,
        count: manifest.counts?.eventCount,
        data: { phase: "write", pathSelected: true },
      });
      setNotice(uiText("reviewArchiveManagement.ReviewArchiveManagement.exportOwner", { path: path }));
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", {
        requestId,
        pathProvided: true,
        data: { phase: "write", pathSelected: true, error: formatError(error) },
      });
      throw error;
    }
  });

  const exportSession = () => run(async () => {
    if (!selectedSessionId) return;
    const requestId = createArchiveRequestId("export-session");
    const path = await save({
      defaultPath: `danmu-archive-${owner?.roomId ?? ownerId}-session-${selectedSessionId}.json`,
      filters: [{ name: uiText("reviewArchiveManagement.path.filters.name"), extensions: ["json"] }],
    });
    if (!path) {
      recordArchiveDiagnostic("cancel", "archive-export", "canceled", {
        requestId,
        pathProvided: false,
        data: { phase: "path-select", scope: "session", sessionId: selectedSessionId },
      });
      return;
    }
    try {
      recordArchiveDiagnostic("request", "archive-export", "started", {
        requestId,
        pathProvided: true,
        data: { phase: "write", scope: "session", sessionId: selectedSessionId },
      });
      const content = await service.exportArchiveText(
        { kind: "session", sessionId: selectedSessionId },
        { requestId },
      );
      const manifest = JSON.parse(content).manifest as { counts?: { eventCount?: number } };
      await invoke("write_archive_transfer", { path, contents: content });
      recordArchiveDiagnostic("success", "archive-export", "written", {
        requestId,
        pathProvided: true,
        count: manifest.counts?.eventCount,
        data: { phase: "write", scope: "session", sessionId: selectedSessionId, pathSelected: true },
      });
      setNotice(uiText("reviewArchiveManagement.ReviewArchiveManagement.exportSession", { path: path }));
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", {
        requestId,
        pathProvided: true,
        data: { phase: "write", scope: "session", sessionId: selectedSessionId, pathSelected: true, error: formatError(error) },
      });
      throw error;
    }
  });

  const importOwner = () => run(async () => {
    const requestId = createArchiveRequestId("import");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: uiText("reviewArchiveManagement.path.filters.name"), extensions: ["json"] }],
    });
    const selectedPath = Array.isArray(path) ? path[0] : path;
    if (!selectedPath) {
      recordArchiveDiagnostic("cancel", "archive-import", "canceled", {
        requestId,
        pathProvided: false,
        data: { phase: "path-select" },
      });
      return;
    }
    try {
      recordArchiveDiagnostic("request", "archive-import", "started", {
        requestId,
        pathProvided: true,
        data: { phase: "read" },
      });
      const content = await invoke<string>("read_archive_transfer", { path: selectedPath });
      const preview = await service.previewImportArchive(content, { requestId });
      recordArchiveDiagnostic("success", "archive-import", "previewed", {
        requestId,
        pathProvided: true,
        count: preview.imported,
        data: { phase: "preview", conflicts: preview.conflicts, unmatched: preview.unmatched },
      });
      setImportResult(null);
      setImportPreview(preview);
      setImportRequestId(requestId);
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-import", "failed", {
        requestId,
        pathProvided: true,
        data: { phase: "read", error: formatError(error) },
      });
      throw error;
    }
  });

  const confirmImport = () => run(async () => {
    if (!importPreview) return;
    const requestId = createArchiveRequestId("import-commit");
    try {
      recordArchiveDiagnostic("request", "archive-import", "started", {
        requestId,
        data: { phase: "commit" },
      });
      const result = await service.commitImportArchive(importPreview.previewId, importPreview.previewId, { requestId });
      recordArchiveDiagnostic("success", "archive-import", "committed", {
        requestId,
        count: result.imported,
        data: { phase: "commit", conflicts: result.conflicts },
      });
      setImportResult(result);
      setImportPreview(null);
      setImportRequestId(null);
      onChanged();
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-import", "failed", {
        requestId,
        data: { phase: "commit", error: formatError(error) },
      });
      throw error;
    }
  });

  const previewDelete = () => run(async () => {
    if (deleteMode === "single" && selectedSessionRecording) return;
    const requestId = createArchiveRequestId("delete");
    try {
      recordArchiveDiagnostic("request", "archive-delete", "started", {
        requestId,
        data: { phase: "preview", mode: deleteMode },
      });
      const scope = selectedDeleteScope(deleteMode, ownerId, selectedSessionId, deleteDate, retentionDays);
      const preview = await service.previewDelete(scope, { requestId });
      recordArchiveDiagnostic("success", "archive-delete", "previewed", {
        requestId,
        count: preview.eventCount,
        data: { phase: "preview", sessionCount: preview.sessionCount, blockedSessionCount: preview.blockedSessionCount },
      });
      setDeletePreview(preview);
      setDeleteRequestId(requestId);
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-delete", "failed", {
        requestId,
        data: { phase: "preview", error: formatError(error) },
      });
      throw error;
    }
  });

  const confirmDelete = async () => {
    if (!deletePreview) return;
    const requestId = createArchiveRequestId("delete-commit");
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      recordArchiveDiagnostic("request", "archive-delete", "started", {
        requestId,
        data: { phase: "commit" },
      });
      await service.deleteArchive(deletePreview.previewId, deletePreview.previewId, { requestId });
      recordArchiveDiagnostic("success", "archive-delete", "deleted", {
        requestId,
        count: deletePreview.eventCount,
        data: { phase: "commit", sessionCount: deletePreview.sessionCount },
      });
      setDeletePreview(null);
      setDeleteRequestId(null);
      setDeleteConfirmOpen(false);
      setNotice(uiText("reviewArchiveManagement.ReviewArchiveManagement.confirmDelete"));
      onChanged();
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-delete", "failed", {
        requestId,
        data: { phase: "commit", error: formatError(error) },
      });
      setError(formatError(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };

  const cancelImport = () => {
    if (importPreview) {
      const requestId = importRequestId ?? undefined;
      service.cancelImportPreview(importPreview.previewId, requestId);
      recordArchiveDiagnostic("cancel", "archive-import", "canceled", {
        requestId,
        data: { phase: "preview-dismissed", previewId: importPreview.previewId },
      });
    }
    setImportPreview(null);
    setImportRequestId(null);
  };

  const cancelDelete = () => {
    if (deletePreview) {
      const requestId = deleteRequestId ?? undefined;
      service.cancelDeletePreview(deletePreview.previewId, requestId);
      recordArchiveDiagnostic("cancel", "archive-delete", "canceled", {
        requestId,
        data: { phase: "preview-dismissed", previewId: deletePreview.previewId },
      });
    }
    setDeletePreview(null);
    setDeleteRequestId(null);
    setDeleteConfirmOpen(false);
  };

  return (
    <section aria-label={sessionOnly ? uiText("reviewArchiveManagement.aria_label") : uiText("reviewArchiveManagement.aria_label2")} className="archive-management bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ui-type-section-title text-t1">{sessionOnly ? uiText("reviewArchiveManagement.ReviewArchiveManagement") : uiText("reviewArchiveManagement.ReviewArchiveManagement2")}</h2>
          <p className="mt-1 ui-type-meta text-t3">{sessionOnly ? uiText("reviewArchiveManagement.ReviewArchiveManagement3") : uiText("reviewArchiveManagement.ReviewArchiveManagement4")}</p>
        </div>
      </header>

      <div className="archive-management-sections mt-4 grid gap-5">
        <section className="archive-management-section" aria-label={uiText("reviewArchiveManagement.aria_label3")}>
          <h3 className="ui-type-control text-t1">{uiText("reviewArchiveManagement.ReviewArchiveManagement5")}</h3>
          <p className="mt-1 ui-type-meta text-t3">{uiText("reviewArchiveManagement.ReviewArchiveManagement6")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!sessionOnly && <button type="button" disabled={busy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={exportOwner}>{uiText("reviewArchiveManagement.ReviewArchiveManagement7")}</button>}
            <button type="button" disabled={busy || !selectedSessionId} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={exportSession}>{uiText("reviewArchiveManagement.ReviewArchiveManagement8")}</button>
            {sessionOnly && onExportResult && <>
              <button type="button" disabled={busy || resultExportBusy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={() => onExportResult(false)}>{uiText("reviewArchiveManagement.ReviewArchiveManagement9")}</button>
              <button type="button" disabled={busy || resultExportBusy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={() => onExportResult(true)}>{uiText("reviewArchiveManagement.ReviewArchiveManagement10")}</button>
            </>}
            {!sessionOnly && <button type="button" disabled={busy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={importOwner}>{uiText("reviewArchiveManagement.ReviewArchiveManagement11")}</button>}
          </div>
          {importPreview && (
            <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 ui-type-meta text-t2">
              <div>{uiText("reviewArchiveManagement.ReviewArchiveManagement12")}</div>
              <dl className="archive-summary mt-1">
                <div><dt>{uiText("reviewArchiveManagement.ReviewArchiveManagement13")}</dt><dd>{importPreview.ownerCount} {uiText("reviewArchiveManagement.ReviewArchiveManagement14")}</dd></div>
                <div><dt>{uiText("reviewArchiveManagement.ReviewArchiveManagement15")}</dt><dd>{importPreview.sessionCount} {uiText("reviewArchiveManagement.ReviewArchiveManagement16")}</dd></div>
                <div><dt>{uiText("reviewArchiveManagement.ReviewArchiveManagement17")}</dt><dd>{importPreview.imported} {uiText("reviewArchiveManagement.ReviewArchiveManagement18")}</dd></div>
                <div><dt>{uiText("reviewArchiveManagement.ReviewArchiveManagement19")}</dt><dd>{importPreview.skipped} {uiText("reviewArchiveManagement.ReviewArchiveManagement18")}</dd></div>
                <div><dt>{uiText("reviewArchiveManagement.ReviewArchiveManagement20")}</dt><dd>{importPreview.conflicts} {uiText("reviewArchiveManagement.ReviewArchiveManagement18")}</dd></div>
                <div><dt>{uiText("reviewArchiveManagement.ReviewArchiveManagement21")}</dt><dd>{importPreview.completedFields} {uiText("reviewArchiveManagement.ReviewArchiveManagement18")}</dd></div>
              </dl>
              {importPreview.unmatched > 0 && <div className="mt-1">{uiText("reviewArchiveManagement.ReviewArchiveManagement22")}{importPreview.unmatched} {uiText("reviewArchiveManagement.ReviewArchiveManagement23")}</div>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="rounded-md bg-accent-solid px-3 py-1.5 ui-type-control text-accent-fg disabled:opacity-50" onClick={confirmImport}>{uiText("reviewArchiveManagement.ReviewArchiveManagement24")}</button>
                <button type="button" disabled={busy} className="rounded-md border border-line px-3 py-1.5 ui-type-control enabled:hover:border-accent disabled:opacity-50" onClick={cancelImport}>{uiText("common.cancel")}</button>
              </div>
            </div>
          )}
          {importResult && <p className="mt-3 ui-type-meta text-success">{uiText("reviewArchiveManagement.ReviewArchiveManagement25")}{importResult.imported} {uiText("reviewArchiveManagement.ReviewArchiveManagement26")}{importResult.skipped} {uiText("reviewArchiveManagement.ReviewArchiveManagement27")}{importResult.conflicts} {uiText("reviewArchiveManagement.ReviewArchiveManagement28")}</p>}
        </section>

        <section className="archive-management-section" aria-label={uiText("reviewArchiveManagement.aria_label4")}>
          <h3 className="ui-type-control text-t1">{uiText("reviewArchiveManagement.ReviewArchiveManagement29")}</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="ui-type-meta text-t3" htmlFor="review-delete-mode">{uiText("reviewArchiveManagement.ReviewArchiveManagement30")}</label>
            {sessionOnly ? (
              <div id="review-delete-mode" className="rounded-md border border-line bg-surface px-2 py-1.5 ui-type-control text-t1">{uiText("reviewArchiveManagement.ReviewArchiveManagement31")}</div>
            ) : (
              <UiSelect id="review-delete-mode" ariaLabel={uiText("reviewArchiveManagement.ariaLabel")} size="standard" options={archiveManagementDeleteOptions} value={deleteMode} onValueChange={(value) => setDeleteMode(value as typeof deleteMode)} />
            )}
            {deleteMode === "single" ? (
              <>
                <label className="ui-type-meta text-t3" htmlFor="review-delete-session">{uiText("reviewArchiveManagement.ReviewArchiveManagement15")}</label>
                <UiSelect id="review-delete-session" ariaLabel={uiText("reviewArchiveManagement.ariaLabel2")} size="standard" options={[{ value: "", label: uiText("reviewArchiveManagement.options.label") }, ...sessions.map((session) => ({ value: session.sessionId, label: `${session.title ?? uiText("reviewArchiveManagement.options.label2")} · ${formatArchiveSessionStatus(session.status)} · ${formatArchiveRecordingStatus(session.recordingStatus)}`, disabled: isArchiveSessionRecording(session) }))]} value={selectedSessionId} onValueChange={setSelectedSessionId} />
              </>
            ) : deleteMode === "owner" ? (
              <p className="sm:col-span-2 ui-type-meta text-warning">{uiText("reviewArchiveManagement.ReviewArchiveManagement32")}</p>
            ) : deleteMode === "before" ? (
              <>
                <label className="ui-type-meta text-t3" htmlFor="review-delete-date">{uiText("reviewArchiveManagement.ReviewArchiveManagement33")}</label>
                <input id="review-delete-date" type="date" value={deleteDate} onChange={(event) => setDeleteDate(event.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 ui-type-control text-t1" />
              </>
            ) : (
              <>
                <label className="ui-type-meta text-t3" htmlFor="review-retention-days">{uiText("reviewArchiveManagement.ReviewArchiveManagement34")}</label>
                <input id="review-retention-days" type="number" min="1" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 ui-type-control text-t1" />
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || (deleteMode === "single" && (!selectedSessionId || selectedSessionRecording))} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={previewDelete}>{uiText("reviewArchiveManagement.ReviewArchiveManagement35")}</button>
            {deletePreview && (
              <>
                <button type="button" disabled={busy} className={dangerSolidButtonClass} onClick={() => setDeleteConfirmOpen(true)}>{uiText("reviewArchiveManagement.ReviewArchiveManagement36")}</button>
                <button type="button" disabled={busy} className={actionButtonClass} onClick={cancelDelete}>{uiText("common.cancel")}</button>
              </>
            )}
          </div>
          {deletePreview && <DeletePreview preview={deletePreview} />}
        </section>
      </div>

      {!sessionOnly && <section className="mt-3 rounded-lg border border-line bg-bg p-3" aria-label={uiText("reviewArchiveManagement.aria_label5")}>
        <h3 className="ui-type-control text-t1">{uiText("reviewArchiveManagement.ReviewArchiveManagement37")}</h3>
        <p className="mt-1 ui-type-meta text-t3">{uiText("reviewArchiveManagement.ReviewArchiveManagement38")}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="ui-type-meta text-t3" htmlFor="review-owner-retention-policy">{uiText("reviewArchiveManagement.ReviewArchiveManagement39")}</label>
          <UiSelect
            id="review-owner-retention-policy"
            ariaLabel={uiText("reviewArchiveManagement.ariaLabel3")}
            size="standard"
            className="ui-type-control"
            options={ownerRetentionPolicyOptions}
            value={Object.prototype.hasOwnProperty.call(useGeneralSettings.getState().reviewOwnerRetentionDays, ownerId) ? ownerRetentionDays === null ? "permanent" : "custom" : "global"}
            onValueChange={(value) => {
              setReviewOwnerRetentionDays(ownerId, value === "global" ? undefined : value === "permanent" ? null : Number(ownerRetentionDraft));
              recordArchiveDiagnostic("setting-change", "review-owner-retention", "changed", { data: { ownerId, policy: value } });
            }}
          />
          {Object.prototype.hasOwnProperty.call(useGeneralSettings.getState().reviewOwnerRetentionDays, ownerId) && ownerRetentionDays !== null && (
            <label className="flex items-center gap-1 ui-type-control text-t2">
              <input type="number" min="1" value={ownerRetentionDraft} aria-label={uiText("reviewArchiveManagement.aria_label6")} className="w-24 rounded-md border border-line bg-surface px-2 py-1.5 text-right ui-type-control text-t1" onChange={(event) => { setOwnerRetentionDraft(event.target.value); const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) setReviewOwnerRetentionDays(ownerId, value); }} />
              <span className="ui-type-meta text-t3">{uiText("reviewArchiveManagement.ReviewArchiveManagement40")}</span>
            </label>
          )}
        </div>
      </section>}

      {notice && <p role="status" className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 ui-type-meta text-success">{notice}</p>}
      {error && <p role="alert" className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">{error}</p>}
      {deleteConfirmOpen && deletePreview && (
        <ConfirmDialog
          title={uiText("reviewArchiveManagement.title")}
          description={uiText("reviewArchiveManagement.description", { sessionCount: deletePreview.sessionCount, eventCount: deletePreview.eventCount, favoriteCount: deletePreview.favoriteCount })}
          confirmLabel={uiText("reviewArchiveManagement.confirmLabel")}
          confirmTone="danger"
          errorMessage={uiText("reviewArchiveManagement.errorMessage")}
          cancelAriaLabel="取消删除"
          onCancel={() => { if (!busy) setDeleteConfirmOpen(false); }}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}
