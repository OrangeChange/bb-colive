import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

export function SettingsHelp({ label, children }: { label: string; children: ReactNode }) {
  return <details className="settings-help" onKeyDown={event => {
    if (event.key === "Escape" && event.currentTarget.open) {
      event.currentTarget.open = false;
      event.currentTarget.querySelector("summary")?.focus();
      event.stopPropagation();
    }
  }}>
    <summary title={label} aria-label={label}><CircleHelp size={16} aria-hidden="true" /><span className="sr-only">{label}</span></summary>
    <div className="settings-help-content ui-type-meta text-t3">{children}</div>
  </details>;
}
