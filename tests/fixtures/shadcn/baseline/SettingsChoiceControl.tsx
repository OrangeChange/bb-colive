import { useId, type ReactNode } from "react";

export function SettingsChoiceControl<T extends string | number>({ label, value, options, onChange, disabled = false, decoration, iconOnly = false, className = "" }: {
  label: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  decoration?: (value: T) => ReactNode;
  iconOnly?: boolean;
  className?: string;
}) {
  const name = useId();
  return <div className={`settings-choice-control ui-type-control ${className}`} role="radiogroup" aria-label={label} aria-disabled={disabled || undefined}>
    {options.map(option => <label className="settings-choice-option" key={option.value} title={iconOnly ? option.label : undefined}>
      <input type="radio" name={name} value={option.value} checked={value === option.value} disabled={disabled} onChange={() => onChange(option.value)} />
      {decoration && <span className="settings-choice-decoration" aria-hidden="true">{decoration(option.value)}</span>}<span className={iconOnly ? "sr-only" : undefined}>{option.label}</span>
    </label>)}
  </div>;
}
