import type { CSSProperties } from "react";

export type UiSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
  group?: string;
  separatorBefore?: boolean;
};

export type UiSelectOptionGroup = {
  label: string;
  options: UiSelectOption[];
};

export function groupUiSelectOptions(options: readonly UiSelectOption[]): UiSelectOptionGroup[] {
  const groups: UiSelectOptionGroup[] = [];
  for (const option of options) {
    const label = option.group?.trim() ?? "";
    const current = groups[groups.length - 1];
    if (!current || current.label !== label) groups.push({ label, options: [] });
    groups[groups.length - 1].options.push(option);
  }
  return groups;
}
