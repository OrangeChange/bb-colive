import { useEffect, useMemo, useState } from "react";
import { Upload, Download, Eye } from "lucide-react";
import { SettingsIcon } from "./SettingsIcon";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type {
  ArchiveDatabaseHealth,
  ArchiveDeletePreview,
  ArchiveImportPreview,
  ArchiveImportResult,
  ArchiveRepositoryContract,
} from "../archive/archiveTypes.ts";
import { ArchiveTransferService } from "../archive/archiveTransfer.ts";
import { createArchiveRequestId, recordArchiveDiagnostic } from "../archive/archiveDiagnostics.ts";
import { useConnection } from "../stores/connection";
import { flushArchiveWriter, runArchiveTransfer } from "../archive/archiveRuntime.ts";
import { ConfirmDialog } from "./ConfirmDialog";
import { UiSelect } from "./ui/Select";
import { useGeneralSettings } from "../generalSettings.ts";
import { getArchiveOwnerLabel } from "../archive/archiveState.ts";

export interface ReviewArchiveSettingsProps {
  repository: ArchiveRepositoryContract | null;
  retentionDays: number | null;
  onRetentionDaysChange: (days: number | null) => void;
  onChanged?: () => void;
}

type DeleteMode = "all" | "before" | "range" | "retention" | "keep-owner";

const retentionOptions = [
  { value: "permanent", label: "永久保留" },
  { value: "7", label: "最近 7 天" },
  { value: "30", label: "最近 30 天" },
  { value: "90", label: "最近 90 天" },
  { value: "180", label: "最近 180 天" },
  { value: "365", label: "最近一年" },
  { value: "custom", label: "自定义时长" },
] as const;
const archiveCleanupOptions = [
  { value: "all", label: "全部档案" },
  { value: "retention", label: "按保留周期" },
  { value: "before", label: "按日期之前" },
  { value: "range", label: "按日期范围" },
  { value: "keep-owner", label: "仅保留指定主播" },
] as const;
const ownerRetentionPolicyOptions = [
  { value: "global", label: "跟随全局设置" },
  { value: "permanent", label: "永久保留" },
  { value: "custom", label: "单独设置保留时长" },
] as const;

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatExportDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

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

export function ReviewArchiveSettings({ repository, retentionDays, onRetentionDaysChange, onChanged }: ReviewArchiveSettingsProps) {
  const service = useMemo(() => repository ? new ArchiveTransferService({
    repository,
    flushArchiveWriter,
    runArchiveTransfer,
  }) : null, [repository]);
  const [deleteMode, setDeleteMode] = useState<DeleteMode>("retention");
  const [deleteDate, setDeleteDate] = useState("");
  const [deleteFromDate, setDeleteFromDate] = useState("");
  const [deleteToDate, setDeleteToDate] = useState("");
  const [keepOwnerId, setKeepOwnerId] = useState("");
  const [retentionDraft, setRetentionDraft] = useState(String(retentionDays ?? 30));
  const [deletePreview, setDeletePreview] = useState<(ArchiveDeletePreview & { previewId: string }) | null>(null);
  const [deleteRequestId, setDeleteRequestId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<ArchiveImportPreview | null>(null);
  const [importRequestId, setImportRequestId] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ArchiveImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exportFromDate, setExportFromDate] = useState("");
  const [exportToDate, setExportToDate] = useState("");
  const [health, setHealth] = useState<ArchiveDatabaseHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthRevision, setHealthRevision] = useState(0);
  const ownerRetentionPolicies = useGeneralSettings((state) => state.reviewOwnerRetentionDays);
  const setOwnerRetentionDays = useGeneralSettings((state) => state.setReviewOwnerRetentionDays);
  const anchors = useConnection((state) => state.anchors);
  const [owners, setOwners] = useState<Awaited<ReturnType<ArchiveRepositoryContract["listOwners"]>>>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState("");
  const [ownerRetentionDraft, setOwnerRetentionDraft] = useState("30");

  const retentionPreset = retentionDays === null
    ? "permanent"
    : [7, 30, 90, 180, 365].includes(retentionDays)
      ? String(retentionDays)
      : "custom";

  useEffect(() => {
    setRetentionDraft(String(retentionDays ?? ""));
  }, [retentionDays]);

  useEffect(() => {
    let disposed = false;
    if (!repository) {
      setHealth(null);
      return () => { disposed = true; };
    }
    setHealthLoading(true);
    void repository.getHealthSnapshot().then((nextHealth) => {
      if (!disposed) setHealth(nextHealth);
    }).catch((reason) => {
      if (!disposed) setHealth({ available: false, schemaVersion: 0, ownerCount: 0, sourceCount: 0, sessionCount: 0, eventCount: 0, favoriteCount: 0, nicknameCount: 0, readingStateCount: 0, pageCount: 0, pageSize: 0, bytes: 0, error: formatError(reason) });
    }).finally(() => {
      if (!disposed) setHealthLoading(false);
    });
    return () => { disposed = true; };
  }, [healthRevision, repository]);

  useEffect(() => {
    let disposed = false;
    if (!repository) {
      setOwners([]);
      return () => { disposed = true; };
    }
    void repository.listOwners({ limit: 500 }).then((nextOwners) => {
      if (disposed) return;
      setOwners(nextOwners);
      setSelectedOwnerId((current) => current || nextOwners[0]?.ownerId || "");
      setKeepOwnerId((current) => current || nextOwners[0]?.ownerId || "");
    }).catch(() => {
      if (!disposed) setOwners([]);
    });
    return () => { disposed = true; };
  }, [healthRevision, repository]);

  const selectedOwnerPolicy = selectedOwnerId && Object.prototype.hasOwnProperty.call(ownerRetentionPolicies, selectedOwnerId)
    ? ownerRetentionPolicies[selectedOwnerId]
    : undefined;
  const selectedOwnerPolicyMode = selectedOwnerId && Object.prototype.hasOwnProperty.call(ownerRetentionPolicies, selectedOwnerId)
    ? selectedOwnerPolicy === null ? "permanent" : "custom"
    : "global";

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (reason) {
      setError(formatError(reason));
    } finally {
      setBusy(false);
    }
  };

  const exportAll = () => run(async () => {
    if (!service) throw new Error("回看档案暂不可用，请稍后再试");
    const requestId = createArchiveRequestId("export-all");
    const path = await save({
      defaultPath: `danmu-archive-all-${formatExportDate()}.json`,
      filters: [{ name: "回看档案 JSON", extensions: ["json"] }],
    });
    if (!path) {
      recordArchiveDiagnostic("cancel", "archive-export", "canceled", { requestId, pathProvided: false, data: { phase: "path-select", scope: "all" } });
      return;
    }
    try {
      const content = await service.exportArchiveText({ kind: "all" }, { requestId });
      const manifest = JSON.parse(content).manifest as { counts?: { eventCount?: number } };
      await invoke("write_archive_transfer", { path, contents: content });
      recordArchiveDiagnostic("success", "archive-export", "written", { requestId, pathProvided: true, count: manifest.counts?.eventCount, data: { phase: "write", scope: "all" } });
      setNotice(`全部主播档案已导出：${path}`);
    } catch (reason) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", { requestId, pathProvided: true, data: { phase: "write", scope: "all", error: formatError(reason) } });
      throw reason;
    }
  });

  const importAll = () => run(async () => {
    if (!service) throw new Error("回看档案暂不可用，请稍后再试");
    const requestId = createArchiveRequestId("import-all");
    const selected = await open({ multiple: false, directory: false, filters: [{ name: "回看档案 JSON", extensions: ["json"] }] });
    const path = Array.isArray(selected) ? selected[0] : selected;
    if (!path) {
      recordArchiveDiagnostic("cancel", "archive-import", "canceled", { requestId, pathProvided: false, data: { phase: "path-select", scope: "all" } });
      return;
    }
    const content = await invoke<string>("read_archive_transfer", { path });
    const preview = await service.previewImportArchive(content, { requestId });
    setImportResult(null);
    setImportPreview(preview);
    setImportRequestId(requestId);
    recordArchiveDiagnostic("success", "archive-import", "previewed", { requestId, pathProvided: true, count: preview.imported, data: { phase: "preview", scope: "all", conflicts: preview.conflicts } });
  });

  const confirmImport = () => run(async () => {
    if (!service || !importPreview) return;
    const requestId = createArchiveRequestId("import-all-commit");
    const result = await service.commitImportArchive(importPreview.previewId, importPreview.previewId, { requestId });
    setImportPreview(null);
    setImportRequestId(null);
    setImportResult(result);
    onChanged?.();
    setHealthRevision((value) => value + 1);
    recordArchiveDiagnostic("success", "archive-import", "committed", { requestId, count: result.imported, data: { phase: "commit", scope: "all", conflicts: result.conflicts } });
  });

  const exportDateRange = () => run(async () => {
    if (!service) throw new Error("回看档案暂不可用，请稍后再试");
    const fromTs = Date.parse(`${exportFromDate}T00:00:00`);
    const toStartTs = Date.parse(`${exportToDate}T00:00:00`);
    const toTs = toStartTs + DAY_MS;
    if (!exportFromDate || !exportToDate || !Number.isFinite(fromTs) || !Number.isFinite(toStartTs) || fromTs >= toTs) {
      throw new Error("请选择有效的开始日期和结束日期");
    }
    const requestId = createArchiveRequestId("export-date-range");
    const path = await save({
      defaultPath: `danmu-archive-${exportFromDate}-${exportToDate}.json`,
      filters: [{ name: "回看档案 JSON", extensions: ["json"] }],
    });
    if (!path) {
      recordArchiveDiagnostic("cancel", "archive-export", "canceled", { requestId, pathProvided: false, data: { phase: "path-select", scope: "date" } });
      return;
    }
    try {
      const content = await service.exportArchiveText({ kind: "date", fromTs, toTs }, { requestId });
      const manifest = JSON.parse(content).manifest as { counts?: { eventCount?: number } };
      await invoke("write_archive_transfer", { path, contents: content });
      recordArchiveDiagnostic("success", "archive-export", "written", { requestId, pathProvided: true, count: manifest.counts?.eventCount, data: { phase: "write", scope: "date", fromTs, toTs } });
      setNotice(`日期范围档案已导出：${path}`);
    } catch (reason) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", { requestId, pathProvided: true, data: { phase: "write", scope: "date", error: formatError(reason) } });
      throw reason;
    }
  });

  const cancelImport = () => {
    if (service && importPreview) service.cancelImportPreview(importPreview.previewId, importRequestId ?? undefined);
    setImportPreview(null);
    setImportRequestId(null);
  };

  const previewDelete = () => run(async () => {
    if (!service) throw new Error("回看档案暂不可用，请稍后再试");
    const requestId = createArchiveRequestId("delete-all");
    let scope;
    if (deleteMode === "all") {
      scope = { all: true };
    } else if (deleteMode === "before") {
      const beforeTs = Date.parse(`${deleteDate}T00:00:00`);
      if (!Number.isFinite(beforeTs)) throw new Error("请选择删除日期");
      scope = { beforeTs };
    } else if (deleteMode === "range") {
      const fromTs = Date.parse(`${deleteFromDate}T00:00:00`);
      const toStartTs = Date.parse(`${deleteToDate}T00:00:00`);
      const toTs = toStartTs + DAY_MS;
      if (!deleteFromDate || !deleteToDate || !Number.isFinite(fromTs) || !Number.isFinite(toStartTs) || fromTs >= toTs) throw new Error("请选择有效的删除开始日期和结束日期");
      scope = { fromTs, toTs };
    } else if (deleteMode === "keep-owner") {
      if (!keepOwnerId) throw new Error("请选择要保留的主播");
      scope = { keepOnlyOwnerId: keepOwnerId };
    } else {
      const beforeTs = Date.now() - Number(retentionDraft) * DAY_MS;
      if (!Number.isFinite(Number(retentionDraft)) || Number(retentionDraft) <= 0 || !Number.isFinite(beforeTs)) throw new Error("保留天数必须是正数");
      scope = { beforeTs };
    }
    const preview = await service.previewDelete(scope, { requestId });
    setDeletePreview(preview);
    setDeleteRequestId(requestId);
  });

  const confirmDelete = async () => {
    if (!service || !deletePreview) return;
    setBusy(true);
    setError(null);
    try {
      await service.deleteArchive(deletePreview.previewId, deletePreview.previewId, { requestId: createArchiveRequestId("delete-all-commit") });
      setDeletePreview(null);
      setDeleteRequestId(null);
      setDeleteConfirmOpen(false);
      setNotice("档案已删除，收藏关系和阅读位置已一并清理。");
      onChanged?.();
      setHealthRevision((value) => value + 1);
    } catch (reason) {
      setError(formatError(reason));
      throw reason;
    } finally {
      setBusy(false);
    }
  };

  const cancelDelete = () => {
    if (service && deletePreview) service.cancelDeletePreview(deletePreview.previewId, deleteRequestId ?? undefined);
    setDeletePreview(null);
    setDeleteRequestId(null);
    setDeleteConfirmOpen(false);
  };

  return (
    <div data-review-archive-settings className="settings-review-settings mt-1 border-t border-line pt-2">
      <section className="settings-review-group settings-review-task" aria-label="档案传输">
        <h3 className="settings-subsection-title settings-review-group-title"><SettingsIcon name="档案传输" />档案传输</h3>
      <div className="settings-review-setting settings-control-row settings-switch-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title="导入或导出全部主播档案；包含事件内容和资源地址，不包含图片、设置或凭证。">全部主播档案</div>
        </div>
        <div className="settings-review-setting-actions settings-review-actions flex gap-1.5">
          <button type="button" disabled={!repository || busy} className="settings-action-button settings-inline-button ui-type-control" onClick={importAll}><Upload size={15} aria-hidden="true" />导入档案</button>
          <button type="button" disabled={!repository || busy} className="settings-action-button settings-inline-button ui-type-control" onClick={exportAll}><Download size={15} aria-hidden="true" />导出档案</button>
        </div>
      </div>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title="按开播日期筛选，结束日期包含当天。">按日期范围导出</div>
        </div>
        <div className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          <label className="settings-date-pair"><span className="ui-type-meta text-t2">开始</span><input type="date" value={exportFromDate} aria-label="导出开始日期" onChange={(event) => setExportFromDate(event.target.value)} className="settings-date-input ui-type-control" /></label>
          <label className="settings-date-pair"><span className="ui-type-meta text-t2">结束</span><input type="date" value={exportToDate} aria-label="导出结束日期" onChange={(event) => setExportToDate(event.target.value)} className="settings-date-input ui-type-control" /></label>
          <button type="button" disabled={!repository || busy || !exportFromDate || !exportToDate} className="settings-action-button settings-inline-button ui-type-control" onClick={exportDateRange}><Download size={15} aria-hidden="true" />导出</button>
        </div>
      </div>
      {importPreview && (
        <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 ui-type-meta text-t3">
          <div>导入预览</div>
          <dl className="archive-summary mt-1">
            <div><dt>主播</dt><dd>{importPreview.ownerCount} 位</dd></div>
            <div><dt>场次</dt><dd>{importPreview.sessionCount} 场</dd></div>
            <div><dt>新增事件</dt><dd>{importPreview.imported} 个</dd></div>
            <div><dt>跳过事件</dt><dd>{importPreview.skipped} 个</dd></div>
            <div><dt>冲突事件</dt><dd>{importPreview.conflicts} 个</dd></div>
            <div><dt>补全字段</dt><dd>{importPreview.completedFields} 个</dd></div>
          </dl>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} className="settings-inline-button ui-type-control" onClick={confirmImport}>确认导入</button>
            <button type="button" disabled={busy} className="settings-inline-button ui-type-control" onClick={cancelImport}>取消</button>
          </div>
        </div>
      )}
      {importResult && <div className="mt-2 ui-type-meta text-success">导入完成：新增 {importResult.imported} 个事件，跳过 {importResult.skipped} 个，冲突 {importResult.conflicts} 个。</div>}
      </section>

      <section className="settings-review-group settings-review-task" aria-label="保留策略">
        <h3 className="settings-subsection-title settings-review-group-title"><SettingsIcon name="保留策略" />保留策略</h3>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <span className="settings-control-label ui-type-control text-t2">默认保留策略</span>
        <span className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          <UiSelect ariaLabel="默认档案保留策略" size="standard" className="settings-inline-select ui-type-control" options={retentionOptions} value={retentionPreset} onValueChange={(value) => {
            if (value === "permanent") onRetentionDaysChange(null);
            else if (value === "custom") onRetentionDaysChange(retentionDays ?? 30);
            else onRetentionDaysChange(Number(value));
          }} />
          {retentionPreset === "custom" && <><input type="number" min="1" value={retentionDays ?? ""} placeholder="天数" onChange={(event) => {
            const value = event.target.value;
            const days = value === "" ? null : Number(value);
            setRetentionDraft(value || "30");
            onRetentionDaysChange(days === null || !Number.isFinite(days) || days <= 0 ? null : days);
          }} className="settings-number-input ui-type-control" aria-label="自定义档案保留天数" /><span className="ui-type-meta text-t3">天</span></>}
        </span>
      </div>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title="可为指定主播单独设置，只影响手动清理。">主播档案保留策略</div>
        </div>
        <span className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          {owners.length > 0 ? <>
            <UiSelect ariaLabel="选择主播保留策略" size="standard" className="settings-inline-select ui-type-control" options={owners.map((owner) => ({ value: owner.ownerId, label: getArchiveOwnerLabel(owner, anchors) }))} value={selectedOwnerId} onValueChange={setSelectedOwnerId} />
            <UiSelect ariaLabel="主播档案保留策略" size="standard" className="settings-inline-select ui-type-control" options={ownerRetentionPolicyOptions} value={selectedOwnerPolicyMode} onValueChange={(value) => {
              setOwnerRetentionDays(selectedOwnerId, value === "global" ? undefined : value === "permanent" ? null : Number(ownerRetentionDraft));
              recordArchiveDiagnostic("setting-change", "review-owner-retention", "changed", { data: { ownerId: selectedOwnerId, policy: value, source: "settings" } });
            }} />
            {selectedOwnerPolicyMode === "custom" && <><input type="number" min="1" value={selectedOwnerPolicy ?? ownerRetentionDraft} aria-label="主播单独保留天数" className="settings-number-input ui-type-control" onChange={(event) => { setOwnerRetentionDraft(event.target.value); const days = Number(event.target.value); if (Number.isFinite(days) && days > 0) setOwnerRetentionDays(selectedOwnerId, days); }} /><span className="ui-type-meta text-t3">天</span></>}
          </> : <span className="ui-type-meta text-t3">暂无主播档案</span>}
        </span>
      </div>
      </section>

      <section className="settings-review-group settings-review-task" aria-label="空间与清理">
        <h3 className="settings-subsection-title settings-review-group-title"><SettingsIcon name="空间与清理" />空间与清理</h3>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title="图片只保存链接，不保存图片文件。">档案占用空间</div>
        </div>
        <div className="settings-review-setting-value text-left ui-type-meta text-t2" aria-live="polite">
          {healthLoading ? "正在读取…" : health?.available ? <><div className="ui-type-section-title text-t1">{formatBytes(health.bytes)}</div><dl className="archive-summary mt-1 text-t3">
            <div><dt>主播</dt><dd>{health.ownerCount} 位</dd></div>
            <div><dt>场次</dt><dd>{health.sessionCount} 场</dd></div>
            <div><dt>事件</dt><dd>{health.eventCount} 个</dd></div>
            <div><dt>收藏</dt><dd>{health.favoriteCount} 个</dd></div>
          </dl></> : <span className="text-warning">暂不可用</span>}
        </div>
      </div>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <span className="settings-control-label ui-type-control text-t2" title="先预览影响范围。仅保留指定主播会删除其他可删除档案。">按范围清理档案</span>
        <span className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          <UiSelect ariaLabel="清理档案范围" size="standard" className="settings-inline-select ui-type-control" options={archiveCleanupOptions} value={deleteMode} onValueChange={(value) => setDeleteMode(value as DeleteMode)} />
          {deleteMode === "all" ? (
            <span className="ui-type-meta text-warning">进行中的场次不会删除</span>
          ) : deleteMode === "retention" ? (
            <span className="flex items-center gap-1"><input type="number" min="1" value={retentionDraft} onChange={(event) => setRetentionDraft(event.target.value)} className="settings-number-input ui-type-control" aria-label="清理保留天数" /><span className="ui-type-meta text-t3">天</span></span>
          ) : deleteMode === "before" ? <input type="date" value={deleteDate} onChange={(event) => setDeleteDate(event.target.value)} className="settings-inline-select ui-type-control" aria-label="删除日期之前" />
            : deleteMode === "range" ? <><label className="settings-date-pair"><span className="ui-type-meta text-t2">开始</span><input type="date" value={deleteFromDate} onChange={(event) => setDeleteFromDate(event.target.value)} className="settings-inline-select ui-type-control" aria-label="删除开始日期" /></label><label className="settings-date-pair"><span className="ui-type-meta text-t2">结束</span><input type="date" value={deleteToDate} onChange={(event) => setDeleteToDate(event.target.value)} className="settings-inline-select ui-type-control" aria-label="删除结束日期" /></label></>
              : <UiSelect ariaLabel="要保留的主播" size="standard" className="settings-inline-select ui-type-control" options={[{ value: "", label: "选择主播" }, ...owners.map((owner) => ({ value: owner.ownerId, label: getArchiveOwnerLabel(owner, anchors) }))]} value={keepOwnerId} onValueChange={setKeepOwnerId} />}
          <button type="button" disabled={!repository || busy || (deleteMode === "keep-owner" && !keepOwnerId)} className="settings-action-button settings-inline-button ui-type-control" onClick={previewDelete}><Eye size={15} aria-hidden="true" />预览清理</button>
        </span>
      </div>
      {deletePreview && <DeletePreview preview={deletePreview} />}
      {deletePreview && <div className="mt-2 flex justify-end gap-2"><button type="button" disabled={busy} className="settings-inline-button settings-inline-button-danger ui-type-control" onClick={() => setDeleteConfirmOpen(true)}>确认清理</button><button type="button" disabled={busy} className="settings-inline-button ui-type-control" onClick={cancelDelete}>取消</button></div>}
      </section>
      {notice && <div role="status" className="mt-2 ui-type-meta text-success">{notice}</div>}
      {error && <div role="alert" className="mt-2 ui-type-meta text-danger">{error}</div>}
      {deleteConfirmOpen && deletePreview && <ConfirmDialog title="确认清理档案" description={`将删除 ${deletePreview.ownerCount ?? 0} 位主播、${deletePreview.sessionCount} 场、${deletePreview.eventCount} 个事件和 ${deletePreview.favoriteCount} 个收藏。删除后无法恢复。`} confirmLabel="确认清理" confirmTone="danger" errorMessage="清理失败，请重新预览后重试。" cancelAriaLabel="取消清理" onCancel={() => { if (!busy) setDeleteConfirmOpen(false); }} onConfirm={confirmDelete} />}
    </div>
  );
}
