import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import type { CSSProperties } from "react";
import { UiSelect } from "./ui/Select";
import { fontFamilyPresentation } from "./fontFamilyPresentation.ts";
export type SettingsListOption = {
  value: string;
  label: string;
  title?: string;
  style?: CSSProperties;
};
export type SettingsListSelectProps = {
  ariaLabel: string;
  options: readonly SettingsListOption[];
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onOpen?: () => void;
};
export function SettingsListSelect({
  ariaLabel,
  options,
  value,
  onChange,
  onFocus,
  onOpen,
}: SettingsListSelectProps) {
  useUiLanguage();
  const values =
    value && !options.some((option) => option.value === value)
      ? [
          {
            value,
            label: uiText(
              "settingsListSelect.SettingsListSelect.selectedOption.label",
            ),
            title: value,
          },
          ...options,
        ]
      : options;
  return (
    <div className="settings-list-select-wrap">
      <UiSelect
        ariaLabel={ariaLabel}
        options={values}
        value={value}
        onValueChange={onChange}
        onFocus={onFocus}
        onOpenChange={(open) => {
          if (open) onOpen?.();
        }}
        className="w-full"
      />
    </div>
  );
}
export function SettingsFontFamilySelect({
  options,
  value,
  onChange,
  onOpen,
  emptyLabel = uiText("settingsListSelect.SettingsFontFamilySelect"),
}: {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  onOpen?: () => void;
  emptyLabel?: string;
}) {
  useUiLanguage();
  const values =
    value && !options.includes(value) ? [value, ...options] : options;
  const selectOptions: {
    value: string;
    label: string;
    title?: string;
    disabled?: boolean;
  }[] = values.map((option) => ({
    value: option,
    ...fontFamilyPresentation(option),
  }));
  if (!value)
    selectOptions.unshift({ value: "", label: emptyLabel, disabled: true });
  return (
    <div className="settings-list-select-wrap">
      <UiSelect
        ariaLabel={uiText("common.font")}
        options={selectOptions}
        value={value}
        onValueChange={onChange}
        onOpenChange={(open) => {
          if (open) onOpen?.();
        }}
        size="compact"
        className="settings-list-select-trigger"
      />
    </div>
  );
}
