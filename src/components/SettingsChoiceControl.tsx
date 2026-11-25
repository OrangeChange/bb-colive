import type { ReactNode } from "react";
import { RadioGroup, RadioGroupItem } from "./shadcn/radio-group";

export function SettingsChoiceControl<T extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  decoration,
  iconOnly = false,
  className = "",
}: {
  label: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  decoration?: (value: T) => ReactNode;
  iconOnly?: boolean;
  className?: string;
}) {
  return (
    <RadioGroup
      className={`ui-segmented settings-choice-control ui-type-control ${className}`}
      aria-label={label}
      value={value === undefined ? "" : String(value)}
      disabled={disabled}
      onValueChange={(next) => {
        const option = options.find((option) => String(option.value) === next);
        if (option) onChange(option.value);
      }}
    >
      {options.map((option) => (
        <RadioGroupItem
          className="ui-segmented-item settings-choice-option"
          value={String(option.value)}
          key={option.value}
          title={iconOnly ? option.label : undefined}
          aria-label={option.label}
        >
          {decoration && (
            <span className="settings-choice-decoration" aria-hidden="true">
              {decoration(option.value)}
            </span>
          )}
          <span className={iconOnly ? "sr-only" : undefined}>
            {option.label}
          </span>
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
