import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { ChevronLeft as LucideChevronLeft, Check, Save, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeActionMenu } from "./ThemeActionMenu.tsx";
import type { ThemeDocument } from "../themes/themeTypes.ts";

export type ThemeEditorSection = "basic" | "visual" | "advanced";

function ChevronLeftIcon() {
  return <LucideChevronLeft aria-hidden="true" width="16" height="16" />;
}

export function ThemeEditorHeader({ document, description, dirty = false, saving = false, draftStatus = "saved", onRetryDraft, onBack, onEditMetadata, onApply, applyLabel = uiText("common.apply"), applyTargets, onSaveAs, onRestore }: {
  document: ThemeDocument; description: string; dirty?: boolean; saving?: boolean;
  draftStatus?: "saving" | "saved" | "error"; onRetryDraft?: () => void;
  onBack: () => void; onEditMetadata: () => void; onApply: () => void;
  applyLabel?: string; applyTargets?: readonly { label: string; action: () => void }[];
  onSaveAs?: () => void; onRestore?: (scope: string) => void;
}) {
  useUiLanguage();
  return <header className="native-editor-header">
    <div className="native-editor-heading">
      <button type="button" className="theme-editor-back" onClick={onBack}><ChevronLeftIcon /><span>{uiText("themeEditorChrome.ThemeEditorHeader")}</span></button>
      <div><h1>{document.metadata.name}</h1><p className="native-editor-description">{description}</p><span className="native-editor-save-state" role="status">{saving ? uiText("themeEditorChrome.ThemeEditorHeader2") : dirty ? draftStatus === "saving" ? uiText("themeEditorChrome.ThemeEditorHeader3") : draftStatus === "error" ? uiText("themeEditorChrome.ThemeEditorHeader4") : uiText("themeEditorChrome.ThemeEditorHeader5") : uiText("themeEditorChrome.ThemeEditorHeader6")}</span>{dirty && draftStatus === "error" && <button type="button" className="theme-draft-retry" onClick={onRetryDraft}>{uiText("themeEditorChrome.ThemeEditorHeader7")}</button>}</div>
    </div>
    <div className="native-editor-actions">
      {applyTargets ? <ThemeActionMenu label={uiText("themeEditorChrome.label")} className="is-primary" disabled={saving} items={[{ label: uiText("themeEditorChrome.items.label"), action: onApply }, ...applyTargets]}><Check size={16} aria-hidden="true" />{uiText("common.apply")}</ThemeActionMenu> : <button type="button" className="is-primary" disabled={saving} aria-busy={saving} onClick={onApply}><Check size={16} aria-hidden="true" />{applyLabel}</button>}
      {onSaveAs && <button type="button" disabled={saving} onClick={onSaveAs}><Save size={16} aria-hidden="true" />{uiText("themeEditorChrome.ThemeEditorHeader8")}</button>}
      <ThemeActionMenu label={uiText("themeEditorChrome.label2")} items={[
        { label: uiText("themeEditorChrome.items.label2"), action: onEditMetadata },
        ...(onRestore ? ([["basic", uiText("themeEditorChrome.items")], ["visual", uiText("themeEditorChrome.items2")], ["custom", uiText("themeEditorChrome.items3")], ["all", uiText("themeEditorChrome.items4")]] as const).map(([scope, label], index) => ({label, action: () => onRestore(scope), separator: index === 0})) : []),
      ]}><MoreHorizontal size={18} aria-hidden="true" /></ThemeActionMenu>
    </div>
  </header>;
}

const SECTIONS: readonly [ThemeEditorSection, string][] = localized(() => ([["basic", uiText("themeEditorChrome.SECTIONS")], ["visual", uiText("themeEditorChrome.SECTIONS2")], ["advanced", uiText("themeEditorChrome.SECTIONS3")]]));

export function ThemeEditorTabs({ section, onChange }: { section: ThemeEditorSection; onChange: (section: ThemeEditorSection) => void }) {
  useUiLanguage();
  return <nav className="native-editor-tabs" role="tablist" aria-label={uiText("themeEditorChrome.aria_label")}>
    {SECTIONS.map(([id, label], index) => <button type="button" role="tab" id={`theme-editor-tab-${id}`} aria-controls={`theme-editor-panel-${id}`} tabIndex={section === id ? 0 : -1} aria-selected={section === id} className={section === id ? "is-active" : ""} onKeyDown={event => {
      const next = event.key === "Home" ? 0 : event.key === "End" ? SECTIONS.length - 1 : event.key === "ArrowRight" ? (index + 1) % SECTIONS.length : event.key === "ArrowLeft" ? (index + SECTIONS.length - 1) % SECTIONS.length : -1;
      if (next < 0) return; event.preventDefault(); onChange(SECTIONS[next][0]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
    }} onClick={() => onChange(id)} key={id}>{label}</button>)}
  </nav>;
}

export function ThemeEditorContent({ section, children }: { section: ThemeEditorSection; children: ReactNode }) {
  useUiLanguage();
  return <main role="tabpanel" id={`theme-editor-panel-${section}`} aria-labelledby={`theme-editor-tab-${section}`} className={`native-editor-content${section === "visual" ? " is-visual" : section === "advanced" ? " is-advanced" : ""}`}>{children}</main>;
}
