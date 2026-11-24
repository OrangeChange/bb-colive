import { uiText } from "../i18n/index.ts";
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
  { value: "permanent", label: uiText("reviewArchiveSettings.retentionOptions.label") },
  { value: "7", label: uiText("reviewArchiveSettings.retentionOptions.label2") },
  { value: "30", label: uiText("reviewArchiveSettings.retentionOptions.label3") },
  { value: "90", label: uiText("reviewArchiveSettings.retentionOptions.label4") },
  { value: "180", label: uiText("reviewArchiveSettings.retentionOptions.label5") },
  { value: "365", label: uiText("reviewArchiveSettings.retentionOptions.label6") },
  { value: "custom", label: uiText("reviewArchiveSettings.retentionOptions.label7") },
] as const;
const archiveCleanupOptions = [
  { value: "all", label: uiText("reviewArchiveSettings.archiveCleanupOptions.label") },
  { value: "retention", label: uiText("reviewArchiveSettings.archiveCleanupOptions.label2") },
  { value: "before", label: uiText("reviewArchiveSettings.archiveCleanupOptions.label3") },
  { value: "range", label: uiText("reviewArchiveSettings.archiveCleanupOptions.label4") },
  { value: "keep-owner", label: uiText("reviewArchiveSettings.archiveCleanupOptions.label5") },
] as const;
const ownerRetentionPolicyOptions = [
  { value: "global", label: uiText("reviewArchiveSettings.ownerRetentionPolicyOptions.label") },
  { value: "permanent", label: uiText("reviewArchiveSettings.ownerRetentionPolicyOptions.label2") },
  { value: "custom", label: uiText("reviewArchiveSettings.ownerRetentionPolicyOptions.label3") },
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
    <p>{uiText("reviewArchiveSettings.DeletePreview")}</p>
    <dl className="archive-summary mt-1">
      <div><dt>{uiText("reviewArchiveSettings.DeletePreview2")}</dt><dd>{preview.ownerCount ?? 0} {uiText("reviewArchiveSettings.DeletePreview3")}</dd></div>
      <div><dt>{uiText("reviewArchiveSettings.DeletePreview4")}</dt><dd>{preview.sessionCount} {uiText("reviewArchiveSettings.DeletePreview5")}</dd></div>
      <div><dt>{uiText("reviewArchiveSettings.DeletePreview6")}</dt><dd>{preview.eventCount} {uiText("reviewArchiveSettings.DeletePreview7")}</dd></div>
      <div><dt>{uiText("reviewArchiveSettings.DeletePreview8")}</dt><dd>{preview.favoriteCount} {uiText("reviewArchiveSettings.DeletePreview7")}</dd></div>
      <div><dt>{uiText("reviewArchiveSettings.DeletePreview9")}</dt><dd>{preview.resourceReferenceCount} {uiText("reviewArchiveSettings.DeletePreview7")}</dd></div>
      <div><dt>{uiText("reviewArchiveSettings.DeletePreview10")}</dt><dd>{formatBytes(preview.bytes)}</dd></div>
    </dl>
    {preview.blockedSessionCount > 0 && <p className="mt-2 text-warning">{uiText("reviewArchiveSettings.DeletePreview11")}{preview.blockedSessionCount} {uiText("reviewArchiveSettings.DeletePreview12")}</p>}
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
    if (!service) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.exportAll"));
    const requestId = createArchiveRequestId("export-all");
    const path = await save({
      defaultPath: `danmu-archive-all-${formatExportDate()}.json`,
      filters: [{ name: uiText("reviewArchiveSettings.path.filters.name"), extensions: ["json"] }],
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
      setNotice(uiText("reviewArchiveSettings.ReviewArchiveSettings.exportAll2", { path: path }));
    } catch (reason) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", { requestId, pathProvided: true, data: { phase: "write", scope: "all", error: formatError(reason) } });
      throw reason;
    }
  });

  const importAll = () => run(async () => {
    if (!service) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.importAll"));
    const requestId = createArchiveRequestId("import-all");
    const selected = await open({ multiple: false, directory: false, filters: [{ name: uiText("reviewArchiveSettings.selected.filters.name"), extensions: ["json"] }] });
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
    if (!service) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.exportDateRange"));
    const fromTs = Date.parse(`${exportFromDate}T00:00:00`);
    const toStartTs = Date.parse(`${exportToDate}T00:00:00`);
    const toTs = toStartTs + DAY_MS;
    if (!exportFromDate || !exportToDate || !Number.isFinite(fromTs) || !Number.isFinite(toStartTs) || fromTs >= toTs) {
      throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.exportDateRange2"));
    }
    const requestId = createArchiveRequestId("export-date-range");
    const path = await save({
      defaultPath: `danmu-archive-${exportFromDate}-${exportToDate}.json`,
      filters: [{ name: uiText("reviewArchiveSettings.path.filters.name"), extensions: ["json"] }],
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
      setNotice(uiText("reviewArchiveSettings.ReviewArchiveSettings.exportDateRange3", { path: path }));
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
    if (!service) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.previewDelete"));
    const requestId = createArchiveRequestId("delete-all");
    let scope;
    if (deleteMode === "all") {
      scope = { all: true };
    } else if (deleteMode === "before") {
      const beforeTs = Date.parse(`${deleteDate}T00:00:00`);
      if (!Number.isFinite(beforeTs)) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.previewDelete2"));
      scope = { beforeTs };
    } else if (deleteMode === "range") {
      const fromTs = Date.parse(`${deleteFromDate}T00:00:00`);
      const toStartTs = Date.parse(`${deleteToDate}T00:00:00`);
      const toTs = toStartTs + DAY_MS;
      if (!deleteFromDate || !deleteToDate || !Number.isFinite(fromTs) || !Number.isFinite(toStartTs) || fromTs >= toTs) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.previewDelete3"));
      scope = { fromTs, toTs };
    } else if (deleteMode === "keep-owner") {
      if (!keepOwnerId) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.previewDelete4"));
      scope = { keepOnlyOwnerId: keepOwnerId };
    } else {
      const beforeTs = Date.now() - Number(retentionDraft) * DAY_MS;
      if (!Number.isFinite(Number(retentionDraft)) || Number(retentionDraft) <= 0 || !Number.isFinite(beforeTs)) throw new Error(uiText("reviewArchiveSettings.ReviewArchiveSettings.previewDelete5"));
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
      setNotice(uiText("reviewArchiveSettings.ReviewArchiveSettings.confirmDelete"));
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
      <section className="settings-review-group settings-review-task" aria-label={uiText("reviewArchiveSettings.aria_label")}>
        <h3 className="settings-subsection-title settings-review-group-title"><SettingsIcon name="archiveTransfer" />{uiText("reviewArchiveSettings.ReviewArchiveSettings")}</h3>
      <div className="settings-review-setting settings-control-row settings-switch-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title={uiText("reviewArchiveSettings.title")}>{uiText("reviewArchiveSettings.ReviewArchiveSettings2")}</div>
        </div>
        <div className="settings-review-setting-actions settings-review-actions flex gap-1.5">
          <button type="button" disabled={!repository || busy} className="settings-action-button settings-inline-button ui-type-control" onClick={importAll}><Upload size={15} aria-hidden="true" />{uiText("reviewArchiveSettings.ReviewArchiveSettings3")}</button>
          <button type="button" disabled={!repository || busy} className="settings-action-button settings-inline-button ui-type-control" onClick={exportAll}><Download size={15} aria-hidden="true" />{uiText("reviewArchiveSettings.ReviewArchiveSettings4")}</button>
        </div>
      </div>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title={uiText("reviewArchiveSettings.title2")}>{uiText("reviewArchiveSettings.ReviewArchiveSettings5")}</div>
        </div>
        <div className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          <label className="settings-date-pair"><span className="ui-type-meta text-t2">{uiText("reviewArchiveSettings.ReviewArchiveSettings6")}</span><input type="date" value={exportFromDate} aria-label={uiText("reviewArchiveSettings.aria_label2")} onChange={(event) => setExportFromDate(event.target.value)} className="settings-date-input ui-type-control" /></label>
          <label className="settings-date-pair"><span className="ui-type-meta text-t2">{uiText("reviewArchiveSettings.ReviewArchiveSettings7")}</span><input type="date" value={exportToDate} aria-label={uiText("reviewArchiveSettings.aria_label3")} onChange={(event) => setExportToDate(event.target.value)} className="settings-date-input ui-type-control" /></label>
          <button type="button" disabled={!repository || busy || !exportFromDate || !exportToDate} className="settings-action-button settings-inline-button ui-type-control" onClick={exportDateRange}><Download size={15} aria-hidden="true" />{uiText("common.export")}</button>
        </div>
      </div>
      {importPreview && (
        <div className="mt-2 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 ui-type-meta text-t3">
          <div>{uiText("reviewArchiveSettings.ReviewArchiveSettings8")}</div>
          <dl className="archive-summary mt-1">
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings9")}</dt><dd>{importPreview.ownerCount} {uiText("reviewArchiveSettings.ReviewArchiveSettings10")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings11")}</dt><dd>{importPreview.sessionCount} {uiText("reviewArchiveSettings.ReviewArchiveSettings12")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings13")}</dt><dd>{importPreview.imported} {uiText("reviewArchiveSettings.ReviewArchiveSettings14")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings15")}</dt><dd>{importPreview.skipped} {uiText("reviewArchiveSettings.ReviewArchiveSettings14")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings16")}</dt><dd>{importPreview.conflicts} {uiText("reviewArchiveSettings.ReviewArchiveSettings14")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings17")}</dt><dd>{importPreview.completedFields} {uiText("reviewArchiveSettings.ReviewArchiveSettings14")}</dd></div>
          </dl>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={busy} className="settings-inline-button ui-type-control" onClick={confirmImport}>{uiText("reviewArchiveSettings.ReviewArchiveSettings18")}</button>
            <button type="button" disabled={busy} className="settings-inline-button ui-type-control" onClick={cancelImport}>{uiText("common.cancel")}</button>
          </div>
        </div>
      )}
      {importResult && <div className="mt-2 ui-type-meta text-success">{uiText("reviewArchiveSettings.ReviewArchiveSettings19")}{importResult.imported} {uiText("reviewArchiveSettings.ReviewArchiveSettings20")}{importResult.skipped} {uiText("reviewArchiveSettings.ReviewArchiveSettings21")}{importResult.conflicts} {uiText("reviewArchiveSettings.ReviewArchiveSettings22")}</div>}
      </section>

      <section className="settings-review-group settings-review-task" aria-label={uiText("reviewArchiveSettings.aria_label4")}>
        <h3 className="settings-subsection-title settings-review-group-title"><SettingsIcon name="retention" />{uiText("reviewArchiveSettings.ReviewArchiveSettings23")}</h3>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <span className="settings-control-label ui-type-control text-t2">{uiText("reviewArchiveSettings.ReviewArchiveSettings24")}</span>
        <span className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          <UiSelect ariaLabel={uiText("reviewArchiveSettings.ariaLabel")} size="standard" className="settings-inline-select ui-type-control" options={retentionOptions} value={retentionPreset} onValueChange={(value) => {
            if (value === "permanent") onRetentionDaysChange(null);
            else if (value === "custom") onRetentionDaysChange(retentionDays ?? 30);
            else onRetentionDaysChange(Number(value));
          }} />
          {retentionPreset === "custom" && <><input type="number" min="1" value={retentionDays ?? ""} placeholder={uiText("reviewArchiveSettings.placeholder")} onChange={(event) => {
            const value = event.target.value;
            const days = value === "" ? null : Number(value);
            setRetentionDraft(value || "30");
            onRetentionDaysChange(days === null || !Number.isFinite(days) || days <= 0 ? null : days);
          }} className="settings-number-input ui-type-control" aria-label={uiText("reviewArchiveSettings.aria_label5")} /><span className="ui-type-meta text-t3">{uiText("reviewArchiveSettings.ReviewArchiveSettings25")}</span></>}
        </span>
      </div>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title={uiText("reviewArchiveSettings.title3")}>{uiText("reviewArchiveSettings.ReviewArchiveSettings26")}</div>
        </div>
        <span className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          {owners.length > 0 ? <>
            <UiSelect ariaLabel={uiText("reviewArchiveSettings.ariaLabel2")} size="standard" className="settings-inline-select ui-type-control" options={owners.map((owner) => ({ value: owner.ownerId, label: getArchiveOwnerLabel(owner, anchors) }))} value={selectedOwnerId} onValueChange={setSelectedOwnerId} />
            <UiSelect ariaLabel={uiText("reviewArchiveSettings.ariaLabel3")} size="standard" className="settings-inline-select ui-type-control" options={ownerRetentionPolicyOptions} value={selectedOwnerPolicyMode} onValueChange={(value) => {
              setOwnerRetentionDays(selectedOwnerId, value === "global" ? undefined : value === "permanent" ? null : Number(ownerRetentionDraft));
              recordArchiveDiagnostic("setting-change", "review-owner-retention", "changed", { data: { ownerId: selectedOwnerId, policy: value, source: "settings" } });
            }} />
            {selectedOwnerPolicyMode === "custom" && <><input type="number" min="1" value={selectedOwnerPolicy ?? ownerRetentionDraft} aria-label={uiText("reviewArchiveSettings.aria_label6")} className="settings-number-input ui-type-control" onChange={(event) => { setOwnerRetentionDraft(event.target.value); const days = Number(event.target.value); if (Number.isFinite(days) && days > 0) setOwnerRetentionDays(selectedOwnerId, days); }} /><span className="ui-type-meta text-t3">{uiText("reviewArchiveSettings.ReviewArchiveSettings25")}</span></>}
          </> : <span className="ui-type-meta text-t3">{uiText("reviewArchiveSettings.ReviewArchiveSettings27")}</span>}
        </span>
      </div>
      </section>

      <section className="settings-review-group settings-review-task" aria-label={uiText("reviewArchiveSettings.aria_label7")}>
        <h3 className="settings-subsection-title settings-review-group-title"><SettingsIcon name="storage" />{uiText("reviewArchiveSettings.ReviewArchiveSettings28")}</h3>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <div className="min-w-0">
          <div className="settings-control-label ui-type-control text-t2" title={uiText("reviewArchiveSettings.title4")}>{uiText("reviewArchiveSettings.ReviewArchiveSettings29")}</div>
        </div>
        <div className="settings-review-setting-value text-left ui-type-meta text-t2" aria-live="polite">
          {healthLoading ? uiText("reviewArchiveSettings.ReviewArchiveSettings30") : health?.available ? <><div className="ui-type-section-title text-t1">{formatBytes(health.bytes)}</div><dl className="archive-summary mt-1 text-t3">
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings9")}</dt><dd>{health.ownerCount} {uiText("reviewArchiveSettings.ReviewArchiveSettings10")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings11")}</dt><dd>{health.sessionCount} {uiText("reviewArchiveSettings.ReviewArchiveSettings12")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings31")}</dt><dd>{health.eventCount} {uiText("reviewArchiveSettings.ReviewArchiveSettings14")}</dd></div>
            <div><dt>{uiText("reviewArchiveSettings.ReviewArchiveSettings32")}</dt><dd>{health.favoriteCount} {uiText("reviewArchiveSettings.ReviewArchiveSettings14")}</dd></div>
          </dl></> : <span className="text-warning">{uiText("reviewArchiveSettings.ReviewArchiveSettings33")}</span>}
        </div>
      </div>
      <div className="settings-review-setting settings-control-row settings-input-row">
        <span className="settings-control-label ui-type-control text-t2" title={uiText("reviewArchiveSettings.title5")}>{uiText("reviewArchiveSettings.ReviewArchiveSettings34")}</span>
        <span className="settings-review-setting-actions settings-review-actions flex flex-wrap items-center gap-1.5">
          <UiSelect ariaLabel={uiText("reviewArchiveSettings.ariaLabel4")} size="standard" className="settings-inline-select ui-type-control" options={archiveCleanupOptions} value={deleteMode} onValueChange={(value) => setDeleteMode(value as DeleteMode)} />
          {deleteMode === "all" ? (
            <span className="ui-type-meta text-warning">{uiText("reviewArchiveSettings.ReviewArchiveSettings35")}</span>
          ) : deleteMode === "retention" ? (
            <span className="flex items-center gap-1"><input type="number" min="1" value={retentionDraft} onChange={(event) => setRetentionDraft(event.target.value)} className="settings-number-input ui-type-control" aria-label={uiText("reviewArchiveSettings.aria_label8")} /><span className="ui-type-meta text-t3">{uiText("reviewArchiveSettings.ReviewArchiveSettings25")}</span></span>
          ) : deleteMode === "before" ? <input type="date" value={deleteDate} onChange={(event) => setDeleteDate(event.target.value)} className="settings-inline-select ui-type-control" aria-label={uiText("reviewArchiveSettings.aria_label9")} />
            : deleteMode === "range" ? <><label className="settings-date-pair"><span className="ui-type-meta text-t2">{uiText("reviewArchiveSettings.ReviewArchiveSettings6")}</span><input type="date" value={deleteFromDate} onChange={(event) => setDeleteFromDate(event.target.value)} className="settings-inline-select ui-type-control" aria-label={uiText("reviewArchiveSettings.aria_label10")} /></label><label className="settings-date-pair"><span className="ui-type-meta text-t2">{uiText("reviewArchiveSettings.ReviewArchiveSettings7")}</span><input type="date" value={deleteToDate} onChange={(event) => setDeleteToDate(event.target.value)} className="settings-inline-select ui-type-control" aria-label={uiText("reviewArchiveSettings.aria_label11")} /></label></>
              : <UiSelect ariaLabel={uiText("reviewArchiveSettings.ariaLabel5")} size="standard" className="settings-inline-select ui-type-control" options={[{ value: "", label: uiText("reviewArchiveSettings.options.label") }, ...owners.map((owner) => ({ value: owner.ownerId, label: getArchiveOwnerLabel(owner, anchors) }))]} value={keepOwnerId} onValueChange={setKeepOwnerId} />}
          <button type="button" disabled={!repository || busy || (deleteMode === "keep-owner" && !keepOwnerId)} className="settings-action-button settings-inline-button ui-type-control" onClick={previewDelete}><Eye size={15} aria-hidden="true" />{uiText("reviewArchiveSettings.ReviewArchiveSettings36")}</button>
        </span>
      </div>
      {deletePreview && <DeletePreview preview={deletePreview} />}
      {deletePreview && <div className="mt-2 flex justify-end gap-2"><button type="button" disabled={busy} className="settings-inline-button settings-inline-button-danger ui-type-control" onClick={() => setDeleteConfirmOpen(true)}>{uiText("reviewArchiveSettings.ReviewArchiveSettings37")}</button><button type="button" disabled={busy} className="settings-inline-button ui-type-control" onClick={cancelDelete}>{uiText("common.cancel")}</button></div>}
      </section>
      {notice && <div role="status" className="mt-2 ui-type-meta text-success">{notice}</div>}
      {error && <div role="alert" className="mt-2 ui-type-meta text-danger">{error}</div>}
      {deleteConfirmOpen && deletePreview && <ConfirmDialog title={uiText("reviewArchiveSettings.title6")} description={uiText("reviewArchiveSettings.description", { value: deletePreview.ownerCount ?? 0, sessionCount: deletePreview.sessionCount, eventCount: deletePreview.eventCount, favoriteCount: deletePreview.favoriteCount })} confirmLabel={uiText("reviewArchiveSettings.confirmLabel")} confirmTone="danger" errorMessage={uiText("reviewArchiveSettings.errorMessage")} cancelAriaLabel="取消清理" onCancel={() => { if (!busy) setDeleteConfirmOpen(false); }} onConfirm={confirmDelete} />}
    </div>
  );
}
