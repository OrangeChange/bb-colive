import { Check as LucideCheck, ChevronDown as LucideChevronDown, ChevronUp as LucideChevronUp } from "lucide-react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Fragment, type FocusEventHandler, type ReactNode } from "react";
import { groupUiSelectOptions, type UiSelectOption } from "../../../../src/components/ui/selectOptions";

export type { UiSelectOption } from "../../../../src/components/ui/selectOptions";

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

export function resolveUiSelectValue(options: readonly UiSelectOption[], value?: string): string | undefined {
  if (value === undefined || !options.some((option) => option.value === value)) return undefined;
  return toInternalValue(value);
}

function CheckIcon(): ReactNode {
  return (
    <LucideCheck width="14" height="14" aria-hidden="true" />
  );
}

function ChevronIcon(): ReactNode {
  return (
    <LucideChevronDown width="16" height="16" aria-hidden="true" />
  );
}

function ScrollIcon({ direction }: { direction: "up" | "down" }): ReactNode {
  return (
    (direction === "up" ? <LucideChevronUp width="13" height="13" aria-hidden="true" /> : <LucideChevronDown width="13" height="13" aria-hidden="true" />)
  );
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
  const selectedOption = options.find((option) => option.value === value);
  const internalValue = resolveUiSelectValue(options, value) ?? EMPTY_VALUE;
  const optionGroups = groupUiSelectOptions(options);

  const renderOption = (option: UiSelectOption) => {
    const internalOptionValue = toInternalValue(option.value);
    return (
      <SelectPrimitive.Item
        key={option.value || EMPTY_VALUE}
        value={internalOptionValue}
        disabled={option.disabled}
        title={option.title ?? option.label}
        className="ui-select-item"
      >
        <SelectPrimitive.ItemText data-ui-select-item-text="true">
          <span className="ui-select-item-label" style={option.style}>{option.label}</span>
        </SelectPrimitive.ItemText>
        <SelectPrimitive.ItemIndicator className="ui-select-item-indicator">{CheckIcon()}</SelectPrimitive.ItemIndicator>
      </SelectPrimitive.Item>
    );
  };

  return (
    <SelectPrimitive.Root
      open={open}
      value={internalValue}
      onValueChange={(nextValue) => onValueChange(fromInternalValue(nextValue))}
      onOpenChange={onOpenChange}
      disabled={disabled}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        title={selectedOption?.title ?? selectedOption?.label}
        data-size={size}
        onFocus={onFocus}
        className={joinClassNames("ui-select-trigger ui-type-control", className)}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          {selectedOption ? <span className="ui-select-item-label" style={selectedOption.style}>{selectedOption.label}</span> : placeholder}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="ui-select-trigger-icon">{ChevronIcon()}</SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={8}
          data-size={size}
          data-ui-overlay="true"
          onPointerDown={(event) => event.stopPropagation()}
          className={joinClassNames("ui-select-content", contentClassName)}
        >
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll-button">{ScrollIcon({ direction: "up" })}</SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {optionGroups.map((group, index) => group.label ? (
              <SelectPrimitive.Group key={`group:${group.label}:${index}`}>
                <SelectPrimitive.Label className="ui-select-group-label">{group.label}</SelectPrimitive.Label>
                {group.options.map(renderOption)}
              </SelectPrimitive.Group>
            ) : (
              <Fragment key={`group:ungrouped:${index}`}>{group.options.map(renderOption)}</Fragment>
            ))}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll-button">{ScrollIcon({ direction: "down" })}</SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
