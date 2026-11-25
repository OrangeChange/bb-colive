import { Fragment, type FocusEventHandler } from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "../shadcn/select";
import { groupUiSelectOptions, type UiSelectOption } from "./selectOptions";
export type { UiSelectOption } from "./selectOptions";

export type UiSelectSize = "micro" | "compact" | "standard";

type UiSelectProps = {
  ariaLabel: string;
  options: readonly UiSelectOption[];
  value?: string;
  open?: boolean;
  onValueChange: (value: string) => void;
  onOpenChange?: (open: boolean) => void;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  placeholder?: string;
  size?: UiSelectSize;
  className?: string;
  contentClassName?: string;
  disabled?: boolean;
  id?: string;
};

const EMPTY_VALUE = "__ui_select_empty__";

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function toInternalValue(value: string): string {
  return value === "" ? EMPTY_VALUE : value;
}

function fromInternalValue(value: string): string {
  return value === EMPTY_VALUE ? "" : value;
}

export function resolveUiSelectValue(
  options: readonly UiSelectOption[],
  value?: string,
): string | undefined {
  if (value === undefined || !options.some((option) => option.value === value))
    return undefined;
  return toInternalValue(value);
}

export function UiSelect({
  ariaLabel,
  options,
  value,
  open,
  onValueChange,
  onOpenChange,
  onFocus,
  placeholder,
  size = "compact",
  className,
  contentClassName,
  disabled = false,
  id,
}: UiSelectProps) {
  const selected = options.find((option) => option.value === value);
  const renderOption = (option: UiSelectOption) => (
    <Fragment key={option.value || EMPTY_VALUE}>
    {option.separatorBefore && <SelectSeparator />}
    <SelectItem
      value={toInternalValue(option.value)}
      disabled={option.disabled}
      title={option.title ?? option.label}
    >
      <span className="ui-select-item-label" style={option.style}>
        {option.label}
      </span>
    </SelectItem>
    </Fragment>
  );
  return (
    <Select
      open={open}
      value={resolveUiSelectValue(options, value) ?? EMPTY_VALUE}
      onValueChange={(next) => onValueChange(fromInternalValue(next))}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        title={selected?.title ?? selected?.label}
        size={size === "micro" ? "sm" : "default"}
        data-density={size}
        onFocus={onFocus}
        className={joinClassNames("min-w-0 max-w-full", className)}
      >
        <SelectValue placeholder={placeholder}>
          {selected ? (
            <span className="truncate" style={selected.style}>
              {selected.label}
            </span>
          ) : (
            placeholder
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent
        position="popper"
        collisionPadding={8}
        data-ui-overlay="true"
        onPointerDown={(event) => event.stopPropagation()}
        className={contentClassName}
      >
        {groupUiSelectOptions(options).map((group, i) =>
          group.label ? (
            <SelectGroup key={i}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map(renderOption)}
            </SelectGroup>
          ) : (
            <Fragment key={i}>{group.options.map(renderOption)}</Fragment>
          ),
        )}
      </SelectContent>
    </Select>
  );
}
