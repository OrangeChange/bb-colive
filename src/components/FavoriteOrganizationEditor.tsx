import { Input } from "./shadcn/input";
import { Textarea } from "./shadcn/textarea";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "./shadcn/dialog";
import type { ArchiveFavoriteTag } from "../archive/archiveTypes.ts";
import { mergeFavoriteTags, toggleFavoriteTag } from "../favoriteOrganization.ts";

const inputClass = "h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t1 outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring";
const buttonClass = "inline-flex h-8 items-center rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45";

export interface FavoriteOrganizationEditorProps {
  initialNote: string;
  initialTags: readonly string[];
  tags: readonly ArchiveFavoriteTag[];
  title?: string;
  onCreateTag: (name: string) => Promise<ArchiveFavoriteTag>;
  onSave: (note: string, tags: readonly string[]) => Promise<void>;
  onCancel: () => void;
}

export function FavoriteOrganizationEditor({
  initialNote,
  initialTags,
  tags,
  title = uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor"),
  onCreateTag,
  onSave,
  onCancel,
}: FavoriteOrganizationEditorProps) {
  useUiLanguage();
  const [note, setNote] = useState(initialNote);
  const [selectedTags, setSelectedTags] = useState<string[]>([...initialTags]);
  const [availableTags, setAvailableTags] = useState<ArchiveFavoriteTag[]>([...tags]);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setNote(initialNote);
    setSelectedTags([...initialTags]);
  }, [initialNote, initialTags]);

  useEffect(() => {
    setAvailableTags((current) => mergeFavoriteTags(current, tags));
  }, [tags]);

  const toggleTag = (name: string) => {
    setSelectedTags((current) => toggleFavoriteTag(current, name));
  };

  const addTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    const existing = availableTags.find((tag) => tag.name === name);
    if (existing) {
      setSelectedTags((current) => current.includes(name) ? current : [...current, name]);
      setNewTag("");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const created = await onCreateTag(name);
      setAvailableTags((current) => current.some((tag) => tag.name === created.name) ? current : [...current, created]);
      setSelectedTags((current) => current.includes(created.name) ? current : [...current, created.name]);
      setNewTag("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(note.trim(), selectedTags);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <div className="ui-modal-surface w-[min(520px,calc(100vw-32px))] rounded-xl border border-line bg-surface p-4 shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between gap-3">
        <DialogTitle asChild><strong className="ui-type-section-title text-t1">{title}</strong></DialogTitle>
        <Button variant="outline" type="button" className={buttonClass} disabled={busy} onClick={onCancel}>{uiText("common.close")}</Button>
      </div>
      <label className="mt-3 block ui-type-meta text-t2">
        <span>{uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor.content")}</span>
        <Textarea autoFocus disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 ui-type-control text-t1 outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring" placeholder={uiText("favoriteOrganizationEditor.placeholder")} />
      </label>
      <div className="mt-3">
        <div className="ui-type-meta text-t2">{uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor.content2")}</div>
        <div className="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {availableTags.map((tag) => (
            <Button variant="outline" key={tag.tagId} type="button" disabled={busy} aria-pressed={selectedTags.includes(tag.name)} aria-label={uiText("favoriteOrganizationEditor.aria_label", { name: tag.name, value: selectedTags.includes(tag.name) ? uiText("favoriteOrganizationEditor.aria_label.value") : uiText("favoriteOrganizationEditor.aria_label.value2") })} title={selectedTags.includes(tag.name) ? uiText("favoriteOrganizationEditor.title") : uiText("favoriteOrganizationEditor.title2")} className={`${buttonClass} h-7 px-2 ${selectedTags.includes(tag.name) ? "border-accent bg-accent-subtle text-accent-text" : ""}`} onClick={() => toggleTag(tag.name)}>{selectedTags.includes(tag.name) ? "✓ " : ""}{tag.name}</Button>
          ))}
          {availableTags.length === 0 && <span className="ui-type-meta text-t3">{uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor.content3")}</span>}
        </div>
        <div className="mt-2 flex gap-2">
          <Input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); void addTag(); } }} className={`${inputClass} min-w-0 flex-1`} placeholder={uiText("favoriteOrganizationEditor.placeholder2")} aria-label={uiText("favoriteOrganizationEditor.aria_label2")} disabled={busy} />
          <Button variant="outline" type="button" className={buttonClass} disabled={busy || !newTag.trim()} onClick={() => void addTag()}>{uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor.content4")}</Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 ui-type-meta text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" type="button" className={buttonClass} disabled={busy} onClick={onCancel}>{uiText("common.cancel")}</Button>
        <Button variant="default" type="button" className="inline-flex h-8 items-center rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:opacity-50" disabled={busy} onClick={() => void save()}>{busy ? uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor.content5") : uiText("favoriteOrganizationEditor.FavoriteOrganizationEditor.content6")}</Button>
      </div>
    </div>
  );

  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onCancel();}}><DialogContent asChild aria-label={title} aria-describedby={undefined} showCloseButton={false} className="max-w-none p-0 gap-0" onEscapeKeyDown={event=>{if(busy)event.preventDefault();}} onInteractOutside={event=>{if(busy)event.preventDefault();}}>{content}</DialogContent></Dialog>;
}
