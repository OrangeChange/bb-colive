import { ChevronLeft as LucideChevronLeft, Check, Save, MoreHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import { ThemeActionMenu } from "./ThemeActionMenu.tsx";
import type { ThemeDocument } from "../themes/themeTypes.ts";

export type ThemeEditorSection = "basic" | "visual" | "advanced";

function ChevronLeftIcon() {
  return <LucideChevronLeft aria-hidden="true" width="16" height="16" />;
}

export function ThemeEditorHeader({ document, description, dirty = false, saving = false, draftStatus = "saved", onRetryDraft, onBack, onEditMetadata, onApply, applyLabel = "应用", applyTargets, onSaveAs, onRestore }: {
  document: ThemeDocument; description: string; dirty?: boolean; saving?: boolean;
  draftStatus?: "saving" | "saved" | "error"; onRetryDraft?: () => void;
  onBack: () => void; onEditMetadata: () => void; onApply: () => void;
  applyLabel?: string; applyTargets?: readonly { label: string; action: () => void }[];
  onSaveAs?: () => void; onRestore?: (scope: string) => void;
}) {
  return <header className="native-editor-header">
    <div className="native-editor-heading">
      <button type="button" className="theme-editor-back" onClick={onBack}><ChevronLeftIcon /><span>返回样式</span></button>
      <div><h1>{document.metadata.name}</h1><p className="native-editor-description">{description}</p><span className="native-editor-save-state" role="status">{saving ? "处理中…" : dirty ? draftStatus === "saving" ? "正在保留草稿…" : draftStatus === "error" ? "草稿未能保留" : "草稿已保留" : "已保存"}</span>{dirty && draftStatus === "error" && <button type="button" className="theme-draft-retry" onClick={onRetryDraft}>重试保留草稿</button>}</div>
    </div>
    <div className="native-editor-actions">
      {applyTargets ? <ThemeActionMenu label="选择应用位置" className="is-primary" disabled={saving} items={[{ label: "更新已有输出", action: onApply }, ...applyTargets]}><Check size={16} aria-hidden="true" />应用</ThemeActionMenu> : <button type="button" className="is-primary" disabled={saving} aria-busy={saving} onClick={onApply}><Check size={16} aria-hidden="true" />{applyLabel}</button>}
      {onSaveAs && <button type="button" disabled={saving} onClick={onSaveAs}><Save size={16} aria-hidden="true" />另存为</button>}
      <ThemeActionMenu label="更多操作" items={[
        { label: "主题信息", action: onEditMetadata },
        ...(onRestore ? ([["basic", "恢复基础设置"], ["visual", "恢复可视化 CSS"], ["custom", "恢复自定义 CSS"], ["all", "恢复主题默认"]] as const).map(([scope, label], index) => ({label, action: () => onRestore(scope), separator: index === 0})) : []),
      ]}><MoreHorizontal size={18} aria-hidden="true" /></ThemeActionMenu>
    </div>
  </header>;
}

const SECTIONS: readonly [ThemeEditorSection, string][] = [["basic", "基础设置"], ["visual", "可视化编辑"], ["advanced", "高级编辑"]];

export function ThemeEditorTabs({ section, onChange }: { section: ThemeEditorSection; onChange: (section: ThemeEditorSection) => void }) {
  return <nav className="native-editor-tabs" role="tablist" aria-label="主题编辑区域">
    {SECTIONS.map(([id, label], index) => <button type="button" role="tab" id={`theme-editor-tab-${id}`} aria-controls={`theme-editor-panel-${id}`} tabIndex={section === id ? 0 : -1} aria-selected={section === id} className={section === id ? "is-active" : ""} onKeyDown={event => {
      const next = event.key === "Home" ? 0 : event.key === "End" ? SECTIONS.length - 1 : event.key === "ArrowRight" ? (index + 1) % SECTIONS.length : event.key === "ArrowLeft" ? (index + SECTIONS.length - 1) % SECTIONS.length : -1;
      if (next < 0) return; event.preventDefault(); onChange(SECTIONS[next][0]); (event.currentTarget.parentElement?.children[next] as HTMLElement)?.focus();
    }} onClick={() => onChange(id)} key={id}>{label}</button>)}
  </nav>;
}

export function ThemeEditorContent({ section, children }: { section: ThemeEditorSection; children: ReactNode }) {
  return <main role="tabpanel" id={`theme-editor-panel-${section}`} aria-labelledby={`theme-editor-tab-${section}`} className={`native-editor-content${section === "visual" ? " is-visual" : section === "advanced" ? " is-advanced" : ""}`}>{children}</main>;
}
