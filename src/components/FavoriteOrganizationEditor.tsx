import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  title = "编辑收藏",
  onCreateTag,
  onSave,
  onCancel,
}: FavoriteOrganizationEditorProps) {
  const [note, setNote] = useState(initialNote);
  const [selectedTags, setSelectedTags] = useState<string[]>([...initialTags]);
  const [availableTags, setAvailableTags] = useState<ArchiveFavoriteTag[]>([...tags]);
  const [newTag, setNewTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);

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
        <strong className="ui-type-section-title text-t1">{title}</strong>
        <button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>关闭</button>
      </div>
      <label className="mt-3 block ui-type-meta text-t2">
        <span>备注</span>
        <textarea autoFocus disabled={busy} value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-md border border-line bg-bg px-2 py-1.5 ui-type-control text-t1 outline-none focus:border-accent focus:ring-2 focus:ring-accent-ring" placeholder="给这条收藏写点说明" />
      </label>
      <div className="mt-3">
        <div className="ui-type-meta text-t2">标签</div>
        <div className="mt-1 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
          {availableTags.map((tag) => (
            <button key={tag.tagId} type="button" disabled={busy} aria-pressed={selectedTags.includes(tag.name)} aria-label={`标签 ${tag.name}，${selectedTags.includes(tag.name) ? "已选，点击取消" : "未选，点击添加"}`} title={selectedTags.includes(tag.name) ? "已选，点击取消" : "未选，点击添加"} className={`${buttonClass} h-7 px-2 ${selectedTags.includes(tag.name) ? "border-accent bg-accent-subtle text-accent-text" : ""}`} onClick={() => toggleTag(tag.name)}>{selectedTags.includes(tag.name) ? "✓ " : ""}{tag.name}</button>
          ))}
          {availableTags.length === 0 && <span className="ui-type-meta text-t3">还没有标签</span>}
        </div>
        <div className="mt-2 flex gap-2">
          <input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === "Enter") { event.preventDefault(); void addTag(); } }} className={`${inputClass} min-w-0 flex-1`} placeholder="新标签" aria-label="新标签名称" disabled={busy} />
          <button type="button" className={buttonClass} disabled={busy || !newTag.trim()} onClick={() => void addTag()}>添加标签</button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 ui-type-meta text-danger">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className={buttonClass} disabled={busy} onClick={onCancel}>取消</button>
        <button type="button" className="inline-flex h-8 items-center rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:opacity-50" disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存整理"}</button>
      </div>
    </div>
  );

  return createPortal(<dialog ref={dialogRef} aria-label={title}
    className="ui-modal-overlay fixed inset-0 z-[80] m-0 h-full max-h-none w-full max-w-none items-center justify-center border-0 bg-black/45 p-4 text-inherit open:flex"
    onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
    onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}>{content}</dialog>, document.body);
}
