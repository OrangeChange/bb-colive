import { Slider } from "./shadcn/slider";
import type { ReactNode } from "react";
import { SettingsIcon } from "./SettingsIcon";

export const controlClass = "rounded-md border border-line bg-bg px-2.5 py-1.5 ui-type-control text-t2 text-t1 outline-none transition-colors whitespace-nowrap focus:border-accent focus:ring-2 focus:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45";
export const selectClass = "voice-select-control w-full min-w-0 whitespace-nowrap";
export const sectionClass = "border-b border-line px-4 py-4 last:border-b-0";

export { SwitchButton as PanelSwitch } from "./SettingsSwitch";

export function SettingRow({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="voice-setting-row">
      <div className="voice-setting-label" title={label}>
        <div className="voice-setting-label-text ui-type-control text-t2">{label}</div>
        {hint && <div className="voice-setting-hint ui-type-meta text-t3">{hint}</div>}
      </div>
      <div className="voice-setting-control">{children}</div>
    </div>
  );
}

export function SectionHeading({ children, iconName }: { children: ReactNode; iconName?: string }) {
  return <h2 className="settings-experience-heading mb-3 ui-type-section-title font-medium text-t1">{iconName && <SettingsIcon name={iconName} />}{children}</h2>;
}

export function SectionToolbar({ title, actionsClassName, children, status, iconName }: { title: string; iconName?: string; actionsClassName: string; children: ReactNode; status?: ReactNode }) {
  return (
    <div className="voice-section-toolbar mb-3">
      <div className="voice-section-heading">
        <h2 className="settings-experience-heading voice-section-title ui-type-section-title font-medium text-t1"><SettingsIcon name={iconName ?? ""} />{title}</h2>
        {status}
      </div>
      <div className={`voice-section-actions ${actionsClassName}`}>{children}</div>
    </div>
  );
}

export function VoiceRange({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
  return (
    <div className="flex min-w-0 w-full items-center gap-2">
      <Slider aria-label={label} aria-valuetext={display} className="min-w-0 flex-1" min={min} max={max} step={step} value={[value]} onValueChange={([next]) => onChange(next)} />
      <output className="min-w-14 rounded-md border border-line bg-bg px-2 py-1 text-center font-mono ui-type-control tabular-nums text-t1">{display}</output>
    </div>
  );
}
