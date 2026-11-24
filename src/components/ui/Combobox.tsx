import { uiText } from "../../i18n/index.ts";
import { Search as LucideSearch, Check as LucideCheck, X } from "lucide-react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { filterComboboxOptions, type ComboboxOption } from "./comboboxOptions";
import { moveComboboxHighlight } from "./comboboxState";

type UiComboboxProps = {
  id: string;
  ariaLabel: string;
  placeholder?: string;
  value: string;
  options: readonly ComboboxOption[];
  onValueChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
  disabled?: boolean;
};

function joinClassNames(...classNames: Array<string | undefined>): string {
  return classNames.filter(Boolean).join(" ");
}

function groupLabel(group: ComboboxOption["group"]): string {
  return group === "recent" ? uiText("combobox.groupLabel") : uiText("combobox.groupLabel2");
}

function SearchIcon(): ReactNode {
  return (
    <LucideSearch width="15" height="15" aria-hidden="true" />
  );
}

function CheckIcon(): ReactNode {
  return (
    <LucideCheck width="14" height="14" aria-hidden="true" />
  );
}

export function UiCombobox({
  id,
  ariaLabel,
  placeholder,
  value,
  options,
  onValueChange,
  onKeyDown,
  className,
  disabled = false,
}: UiComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = `${id}-listbox-${useId().replace(/:/g, "")}`;
  const filteredOptions = useMemo(() => filterComboboxOptions(options, value), [options, value]);

  useEffect(() => {
    setHighlightedIndex((current) => Math.min(current, Math.max(0, filteredOptions.length - 1)));
  }, [filteredOptions.length]);

  const openIfOptionsExist = (nextValue = value) => {
    setOpen(filterComboboxOptions(options, nextValue).length > 0);
  };

  const selectOption = (option: ComboboxOption) => {
    onValueChange(option.value);
    setOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openIfOptionsExist();
        return;
      }
      setHighlightedIndex((current) => moveComboboxHighlight(filteredOptions.length, current, event.key as "ArrowDown" | "ArrowUp"));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      if (!open) return;
      event.preventDefault();
      setHighlightedIndex((current) => moveComboboxHighlight(filteredOptions.length, current, event.key as "Home" | "End"));
      return;
    }
    if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing && open && filteredOptions[highlightedIndex]) {
      event.preventDefault();
      selectOption(filteredOptions[highlightedIndex]);
      return;
    }
    onKeyDown?.(event);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Anchor asChild>
        <div ref={anchorRef} className={joinClassNames("ui-combobox-anchor", className)}>
          <span className="ui-combobox-icon" aria-hidden="true">{SearchIcon()}</span>
          <input
            ref={inputRef}
            id={id}
            type="search"
            role="combobox"
            aria-label={ariaLabel}
            aria-autocomplete="list"
            aria-controls={open ? listboxId : undefined}
            aria-expanded={open}
            aria-activedescendant={open && filteredOptions[highlightedIndex] ? `${listboxId}-option-${highlightedIndex}` : undefined}
            placeholder={placeholder}
            value={value}
            disabled={disabled}
            onFocus={() => openIfOptionsExist()}
            onChange={(event) => {
              onValueChange(event.target.value);
              setHighlightedIndex(0);
              openIfOptionsExist(event.target.value);
            }}
            onKeyDown={handleKeyDown}
            className="ui-combobox-input ui-type-control"
          />
          {value && <button type="button" className="ui-combobox-clear" aria-label={uiText("combobox.aria_label", { ariaLabel: ariaLabel })} title={uiText("combobox.title")} disabled={disabled} onClick={() => { onValueChange(""); setHighlightedIndex(0); anchorRef.current?.querySelector("input")?.focus(); }}><X size={14} aria-hidden="true" /></button>}
        </div>
      </PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          data-ui-overlay="true"
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          className="ui-combobox-content"
        >
          <div id={listboxId} role="listbox" aria-label={uiText("combobox.aria_label2", { ariaLabel: ariaLabel })} className="ui-combobox-list">
            {filteredOptions.map((option, index) => {
              const previous = filteredOptions[index - 1];
              const showGroupLabel = !previous || previous.group !== option.group;
              return (
                <div key={`${option.group}:${option.value}`}>
                  {showGroupLabel && <div className="ui-combobox-group-label">{groupLabel(option.group)}</div>}
                  <button
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    tabIndex={-1}
                    className={`ui-combobox-option ${index === highlightedIndex ? "is-highlighted" : ""}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlightedIndex(index)}
                    onClick={() => selectOption(option)}
                  >
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.value === value && <span className="ui-combobox-check" aria-hidden="true">{CheckIcon()}</span>}
                  </button>
                </div>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
