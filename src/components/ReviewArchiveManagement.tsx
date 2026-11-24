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

const archiveManagementDeleteOptions = [
  { value: "single", label: "单场删除" },
  { value: "owner", label: "删除该主播全部档案" },
  { value: "before", label: "按日期删除" },
  { value: "retention", label: "按保留周期删除" },
] as const;
const ownerRetentionPolicyOptions = [
  { value: "global", label: "跟随全局设置" },
  { value: "permanent", label: "永久保留" },
  { value: "custom", label: "单独设置保留时长" },
] as const;

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
    if (!Number.isFinite(beforeTs)) throw new Error("请选择删除日期");
    return { ownerId, beforeTs };
  }
  const days = Number(retentionDays);
  if (!Number.isFinite(days) || days <= 0) throw new Error("保留周期必须是正数");
  return { ownerId, beforeTs: Date.now() - days * 86_400_000 };
}

function DeletePreview({ preview }: { preview: ArchiveDeletePreview }) {
  return <div className="archive-delete-preview mt-3 border-l-2 border-warning pl-3 ui-type-meta text-t2">
    <p>将删除</p>
    <dl className="archive-summary mt-1">
      <div><dt>主播</dt><dd>{preview.ownerCount ?? 0} 位</dd></div>
      <div><dt>场次</dt><dd>{preview.sessionCount} 场</dd></div>
      <div><dt>事件</dt><dd>{preview.eventCount} 个</dd></div>
      <div><dt>收藏</dt><dd>{preview.favoriteCount} 个</dd></div>
      <div><dt>关联资源地址</dt><dd>{preview.resourceReferenceCount} 个</dd></div>
      <div><dt>预计释放</dt><dd>{formatBytes(preview.bytes)}</dd></div>
    </dl>
    {preview.blockedSessionCount > 0 && <p className="mt-2 text-warning">记录中或重连中的场次 {preview.blockedSessionCount} 场不会删除。</p>}
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
      filters: [{ name: "回看档案 JSON", extensions: ["json"] }],
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
      setNotice(`档案已导出：${path}`);
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
      filters: [{ name: "回看档案 JSON", extensions: ["json"] }],
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
      setNotice(`场次档案已导出：${path}`);
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
      filters: [{ name: "回看档案 JSON", extensions: ["json"] }],
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
      setNotice("档案已删除，收藏关系和阅读位置已一并清理。");
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
    <section aria-label={sessionOnly ? "管理当前场次" : "管理档案"} className="archive-management bg-surface p-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="ui-type-section-title text-t1">{sessionOnly ? "管理当前场次" : "管理档案"}</h2>
          <p className="mt-1 ui-type-meta text-t3">{sessionOnly ? "导出、结果导出和删除当前场次。" : "导入、导出和删除当前主播的档案。"}</p>
        </div>
      </header>

      <div className="archive-management-sections mt-4 grid gap-5">
        <section className="archive-management-section" aria-label="导入导出">
          <h3 className="ui-type-control text-t1">导入与导出</h3>
          <p className="mt-1 ui-type-meta text-t3">导出包含事件内容和资源地址，不包含图片文件、设置或凭证。</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!sessionOnly && <button type="button" disabled={busy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={exportOwner}>导出主播档案</button>}
            <button type="button" disabled={busy || !selectedSessionId} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={exportSession}>导出本场档案</button>
            {sessionOnly && onExportResult && <>
              <button type="button" disabled={busy || resultExportBusy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={() => onExportResult(false)}>导出当前结果</button>
              <button type="button" disabled={busy || resultExportBusy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={() => onExportResult(true)}>导出当前收藏</button>
            </>}
            {!sessionOnly && <button type="button" disabled={busy} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={importOwner}>导入主播档案</button>}
          </div>
          {importPreview && (
            <div className="mt-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 ui-type-meta text-t2">
              <div>导入预览</div>
              <dl className="archive-summary mt-1">
                <div><dt>主播</dt><dd>{importPreview.ownerCount} 位</dd></div>
                <div><dt>场次</dt><dd>{importPreview.sessionCount} 场</dd></div>
                <div><dt>新增事件</dt><dd>{importPreview.imported} 个</dd></div>
                <div><dt>跳过事件</dt><dd>{importPreview.skipped} 个</dd></div>
                <div><dt>冲突事件</dt><dd>{importPreview.conflicts} 个</dd></div>
                <div><dt>补全字段</dt><dd>{importPreview.completedFields} 个</dd></div>
              </dl>
              {importPreview.unmatched > 0 && <div className="mt-1">无法关联 {importPreview.unmatched} 项，不会自动合并。</div>}
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} className="rounded-md bg-accent-solid px-3 py-1.5 ui-type-control text-accent-fg disabled:opacity-50" onClick={confirmImport}>确认导入</button>
                <button type="button" disabled={busy} className="rounded-md border border-line px-3 py-1.5 ui-type-control enabled:hover:border-accent disabled:opacity-50" onClick={cancelImport}>取消</button>
              </div>
            </div>
          )}
          {importResult && <p className="mt-3 ui-type-meta text-success">导入完成：新增 {importResult.imported} 个事件，跳过 {importResult.skipped} 个，冲突 {importResult.conflicts} 个。</p>}
        </section>

        <section className="archive-management-section" aria-label="删除档案">
          <h3 className="ui-type-control text-t1">删除档案</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
            <label className="ui-type-meta text-t3" htmlFor="review-delete-mode">范围</label>
            {sessionOnly ? (
              <div id="review-delete-mode" className="rounded-md border border-line bg-surface px-2 py-1.5 ui-type-control text-t1">当前场次</div>
            ) : (
              <UiSelect id="review-delete-mode" ariaLabel="删除档案范围" size="standard" options={archiveManagementDeleteOptions} value={deleteMode} onValueChange={(value) => setDeleteMode(value as typeof deleteMode)} />
            )}
            {deleteMode === "single" ? (
              <>
                <label className="ui-type-meta text-t3" htmlFor="review-delete-session">场次</label>
                <UiSelect id="review-delete-session" ariaLabel="删除档案场次" size="standard" options={[{ value: "", label: "请选择场次" }, ...sessions.map((session) => ({ value: session.sessionId, label: `${session.title ?? "未命名场次"} · ${formatArchiveSessionStatus(session.status)} · ${formatArchiveRecordingStatus(session.recordingStatus)}`, disabled: isArchiveSessionRecording(session) }))]} value={selectedSessionId} onValueChange={setSelectedSessionId} />
              </>
            ) : deleteMode === "owner" ? (
              <p className="sm:col-span-2 ui-type-meta text-warning">将预览并删除该主播的可删除档案；记录中或重连中的场次不会删除。</p>
            ) : deleteMode === "before" ? (
              <>
                <label className="ui-type-meta text-t3" htmlFor="review-delete-date">日期之前</label>
                <input id="review-delete-date" type="date" value={deleteDate} onChange={(event) => setDeleteDate(event.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 ui-type-control text-t1" />
              </>
            ) : (
              <>
                <label className="ui-type-meta text-t3" htmlFor="review-retention-days">保留天数</label>
                <input id="review-retention-days" type="number" min="1" value={retentionDays} onChange={(event) => setRetentionDays(event.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 ui-type-control text-t1" />
              </>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy || (deleteMode === "single" && (!selectedSessionId || selectedSessionRecording))} className="ui-type-control rounded-md border border-line px-3 py-1.5 enabled:hover:border-accent disabled:opacity-50" onClick={previewDelete}>预览删除</button>
            {deletePreview && (
              <>
                <button type="button" disabled={busy} className={dangerSolidButtonClass} onClick={() => setDeleteConfirmOpen(true)}>确认删除</button>
                <button type="button" disabled={busy} className={actionButtonClass} onClick={cancelDelete}>取消</button>
              </>
            )}
          </div>
          {deletePreview && <DeletePreview preview={deletePreview} />}
        </section>
      </div>

      {!sessionOnly && <section className="mt-3 rounded-lg border border-line bg-bg p-3" aria-label="主播保留策略">
        <h3 className="ui-type-control text-t1">本主播保留策略</h3>
        <p className="mt-1 ui-type-meta text-t3">仅影响手动清理，不会自动删除。</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label className="ui-type-meta text-t3" htmlFor="review-owner-retention-policy">策略</label>
          <UiSelect
            id="review-owner-retention-policy"
            ariaLabel="主播档案保留策略"
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
              <input type="number" min="1" value={ownerRetentionDraft} aria-label="主播保留天数" className="w-24 rounded-md border border-line bg-surface px-2 py-1.5 text-right ui-type-control text-t1" onChange={(event) => { setOwnerRetentionDraft(event.target.value); const value = Number(event.target.value); if (Number.isFinite(value) && value > 0) setReviewOwnerRetentionDays(ownerId, value); }} />
              <span className="ui-type-meta text-t3">天</span>
            </label>
          )}
        </div>
      </section>}

      {notice && <p role="status" className="mt-3 rounded-md border border-success/30 bg-success/10 px-3 py-2 ui-type-meta text-success">{notice}</p>}
      {error && <p role="alert" className="mt-3 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 ui-type-meta text-danger">{error}</p>}
      {deleteConfirmOpen && deletePreview && (
        <ConfirmDialog
          title="确认删除档案"
          description={`将删除 ${deletePreview.sessionCount} 场、${deletePreview.eventCount} 个事件和 ${deletePreview.favoriteCount} 个收藏。删除后无法恢复。`}
          confirmLabel="确认删除"
          confirmTone="danger"
          errorMessage="删除失败，请重新预览后重试。"
          cancelAriaLabel="取消删除"
          onCancel={() => { if (!busy) setDeleteConfirmOpen(false); }}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}
