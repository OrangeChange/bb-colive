import { RadioGroup, RadioGroupItem } from "./shadcn/radio-group";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useState } from "react";
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
  useUiLanguage();
  const [includeArchive, setIncludeArchive] = useState(false);
  const [archive, setArchive] = useState<ArchiveState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
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
        if (!disposed) setArchive({ status: "error", message: error instanceof Error ? error.message : uiText("anchorRemovalDialog.AnchorRemovalDialog.message") });
      }
    })();
    return () => { disposed = true; if (prepared) prepared.service.cancelDeletePreview(prepared.preview.previewId); };
  }, [anchor.realRoomId, attempt]);
  const prepared = archive.status === "ready" ? archive.value : null;
  const preview = prepared?.preview;
  const canDeleteArchive = Boolean(preview && preview.sessionCount > 0 && preview.blockedSessionCount === 0);
  return <ConfirmDialog title={uiText("anchorRemovalDialog.title")} description={uiText("anchorRemovalDialog.description", { uname: anchor.uname, realRoomId: anchor.realRoomId })}
    confirmLabel={includeArchive ? uiText("anchorRemovalDialog.confirmLabel") : uiText("anchorRemovalDialog.confirmLabel2")}
    confirmTone={includeArchive ? "danger" : "accent"} confirmDisabled={includeArchive && !canDeleteArchive}
    errorMessage={error => error instanceof Error ? error.message : uiText("anchorRemovalDialog.errorMessage")}
    onCancel={onClose} onConfirm={async () => {
      let archiveDeleted = false;
      if (includeArchive) {
        if (!prepared || !canDeleteArchive) throw new Error(uiText("anchorRemovalDialog.onConfirm"));
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
        if (archiveDeleted) throw new Error(uiText("anchorRemovalDialog.onConfirm2"));
        throw error;
      }
    }}>
    <RadioGroup className="anchor-removal-options" value={String(includeArchive)} onValueChange={value=>setIncludeArchive(value === "true")}>
      <label><RadioGroupItem value="false" aria-label={uiText("anchorRemovalDialog.aria_label")} />
        <span>{uiText("anchorRemovalDialog.AnchorRemovalDialog")}<small>{uiText("anchorRemovalDialog.AnchorRemovalDialog2")}</small></span></label>
      <label><RadioGroupItem value="true" disabled={!canDeleteArchive} aria-label={uiText("anchorRemovalDialog.aria_label2")} />
        <span>{uiText("anchorRemovalDialog.AnchorRemovalDialog3")}<small>{archive.status === "loading" ? uiText("anchorRemovalDialog.AnchorRemovalDialog4") : archive.status === "error" ? uiText("anchorRemovalDialog.AnchorRemovalDialog5") : preview?.blockedSessionCount ? uiText("anchorRemovalDialog.AnchorRemovalDialog6", { blockedSessionCount: preview.blockedSessionCount }) : preview?.sessionCount ? uiText("anchorRemovalDialog.AnchorRemovalDialog7", { sessionCount: preview.sessionCount, eventCount: preview.eventCount, favoriteCount: preview.favoriteCount }) : uiText("anchorRemovalDialog.AnchorRemovalDialog8")}</small></span></label>
      {archive.status === "error" && <div><p role="alert" className="ui-type-control text-danger">{archive.message}</p><Button variant="outline" type="button" className="settings-inline-button" onClick={() => setAttempt(value => value + 1)}>{uiText("common.retry")}</Button></div>}
    </RadioGroup>
  </ConfirmDialog>;
}
