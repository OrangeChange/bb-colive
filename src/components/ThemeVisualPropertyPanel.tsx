import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { ThemeImageEditingContext } from "./ThemeImagePreview.tsx";

export interface ThemeVisualContextItem {
  label: string;
  value: string;
  path?: boolean;
}

export function ThemeVisualPropertyPanel({ title, context, canRestore, onRestore, children, imageTarget }: {
  title: string;
  context: readonly ThemeVisualContextItem[];
  canRestore: boolean;
  onRestore: () => void;
  children: ReactNode;
  imageTarget?: {root?: HTMLElement | null; selector: string};
}) {
  useUiLanguage();
  return <section className="native-property-panel">
    <header>
      <div>
        <h3>{title}</h3>
        <div className="native-edit-context">{context.map(item => <div className={item.path ? "is-path" : undefined} key={`${item.label}-${item.value}`}><span>{item.label}</span><strong title={item.path ? item.value : undefined}>{item.value}</strong></div>)}</div>
      </div>
      {canRestore && <Button variant="ghost" type="button" className="settings-icon-action native-target-restore" title={uiText("themeVisualPropertyPanel.title")} aria-label={uiText("themeVisualPropertyPanel.aria_label")} onClick={onRestore}><RotateCcw size={16} aria-hidden="true" /></Button>}
    </header>
    <ThemeImageEditingContext.Provider value={{scope:context.map(item=>item.value).join(" · "),...imageTarget}}>{children}</ThemeImageEditingContext.Provider>
  </section>;
}
