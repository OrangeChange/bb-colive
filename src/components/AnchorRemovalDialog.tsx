import { useEffect, useId, useState } from "react";
import type { Anchor } from "../protocol/anchors.ts";
import type { ArchiveDeletePreview } from "../archive/archiveTypes.ts";
import { getArchiveRepository, flushArchiveWriter, runArchiveTransfer, notifyArchiveRevision } from "../archive/archiveRuntime.ts";
import { ArchiveTransferService } from "../archive/archiveTransfer.ts";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import "./AnchorMenuRow.css";

type Prepared = { service: ArchiveTransferService; preview: ArchiveDeletePreview & { previewId: string } };
type ArchiveState = { status: "loading" | "empty" } | { status: "ready"; value: Prepared } | { status: "error"; message: string };

export function AnchorRemovalDialog({ anchor, onRemove, onClose }: {
  anchor: Anchor;
  onRemove: () => Promise<void>;
  onClose: () => void;
}) {
  const [includeArchive, setIncludeArchive] = useState(false);
  const [archive, setArchive] = useState<ArchiveState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const group = useId();
  useEffect(() => {
    let disposed = false, prepared: Prepared | undefined;
    setArchive({ status: "loading" });
    setIncludeArchive(false);
    void (async () => {
      try {
        const repository = await getArchiveRepository();
        const owners = await repository.listOwners({ searchText: String(anchor.realRoomId), limit: 100 });
        const owner = owners.find(item => item.roomId === anchor.realRoomId);
        if (!owner) { if (!disposed) setArchive({ status: "empty" }); return; }
        const service = new ArchiveTransferService({ repository, flushArchiveWriter, runArchiveTransfer });
        const preview = await service.previewDelete({ ownerId: owner.ownerId, ownerAll: true });
        prepared = { service, preview };
        if (disposed) service.cancelDeletePreview(preview.previewId);
        else setArchive({ status: "ready", value: prepared });
      } catch (error) {
        if (!disposed) setArchive({ status: "error", message: error instanceof Error ? error.message : "无法读取回看档案，请重试" });
      }
    })();
    return () => { disposed = true; if (prepared) prepared.service.cancelDeletePreview(prepared.preview.previewId); };
  }, [anchor.realRoomId, attempt]);
  const prepared = archive.status === "ready" ? archive.value : null;
  const preview = prepared?.preview;
  const canDeleteArchive = Boolean(preview && preview.sessionCount > 0 && preview.blockedSessionCount === 0);
  return <ConfirmDialog title="删除主播" description={`${anchor.uname} · 房间 ${anchor.realRoomId}`}
    confirmLabel={includeArchive ? "删除主播卡和档案" : "移除主播卡"}
    confirmTone={includeArchive ? "danger" : "accent"} confirmDisabled={includeArchive && !canDeleteArchive}
    errorMessage={error => error instanceof Error ? error.message : "删除失败，请重试"}
    onCancel={onClose} onConfirm={async () => {
      let archiveDeleted = false;
      if (includeArchive) {
        if (!prepared || !canDeleteArchive) throw new Error("档案状态已变化，请重新打开后确认");
        try {
          await prepared.service.deleteArchive(prepared.preview.previewId, prepared.preview.previewId);
        } catch (error) {
          setAttempt(value => value + 1);
          throw error;
        }
        archiveDeleted = true;
        setIncludeArchive(false);
        setArchive({ status: "empty" });
        notifyArchiveRevision();
      }
      try { await onRemove(); }
      catch (error) {
        if (archiveDeleted) throw new Error("回看档案已删除，主播卡移除失败，请重试");
        throw error;
      }
    }}>
    <div className="anchor-removal-options">
      <label><input type="radio" name={group} aria-label="仅移除主播卡" checked={!includeArchive} onChange={() => setIncludeArchive(false)} />
        <span>仅移除主播卡<small>保留全部回看档案。</small></span></label>
      <label><input type="radio" name={group} aria-label="同时删除回看档案" checked={includeArchive} disabled={!canDeleteArchive} onChange={() => setIncludeArchive(true)} />
        <span>同时删除回看档案<small>{archive.status === "loading" ? "正在读取回看档案…" : archive.status === "error" ? "暂时无法读取回看档案。" : preview?.blockedSessionCount ? `仍有 ${preview.blockedSessionCount} 场正在记录或重连，停止记录后再删除。` : preview?.sessionCount ? `将删除 ${preview.sessionCount} 场、${preview.eventCount} 个事件、${preview.favoriteCount} 个收藏。此操作不可恢复。` : "没有回看档案。"}</small></span></label>
      {archive.status === "error" && <div><p role="alert" className="ui-type-control text-danger">{archive.message}</p><button type="button" className="settings-inline-button" onClick={() => setAttempt(value => value + 1)}>重试</button></div>}
    </div>
  </ConfirmDialog>;
}
