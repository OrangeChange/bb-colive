import {
  useMemo,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Search, X } from "lucide-react";
import { useUiLanguage } from "../../i18n/react";
import { uiText } from "../../i18n";
import { Popover, PopoverAnchor, PopoverContent } from "../shadcn/popover";
import {
  Command,
  CommandList,
  CommandGroup,
  CommandItem,
} from "../shadcn/command";
import { Input } from "../shadcn/input";
import { Button } from "../shadcn/button";
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

export function UiCombobox({
  id,
  ariaLabel,
  placeholder,
  value,
  options,
  onValueChange,
  onKeyDown,
  className = "",
  disabled = false,
}: UiComboboxProps) {
  useUiLanguage();
  const [open, setOpen] = useState(false),
    [highlight, setHighlight] = useState(0);
  const [relationship, setRelationship] = useState<{
    list?: string;
    active?: string;
  }>({});
  const anchor = useRef<HTMLDivElement>(null);
  const [list, setList] = useState<HTMLDivElement | null>(null);
  const matches = useMemo(
    () => filterComboboxOptions(options, value),
    [options, value],
  );
  useLayoutEffect(() => {
    const node = list;
    const selected = [
      ...(node?.querySelectorAll<HTMLElement>("[cmdk-item]") ?? []),
    ].find(
      (item) => item.getAttribute("data-value") === matches[highlight]?.value,
    );
    const next = { list: node?.id, active: selected?.id };
    setRelationship((current) =>
      current.list === next.list && current.active === next.active
        ? current
        : next,
    );
  }, [list, open, matches, highlight]);
  const choose = (option: ComboboxOption) => {
    onValueChange(option.value);
    setOpen(false);
    anchor.current?.querySelector("input")?.focus();
  };
  return (
    <Popover open={open && matches.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div ref={anchor} className={`ui-combobox-anchor ${className}`}>
          <span className="ui-combobox-icon"><Search size={15} aria-hidden /></span>
          <Input
            id={id}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={open ? relationship.list : undefined}
            aria-activedescendant={open ? relationship.active : undefined}
            aria-label={ariaLabel}
            aria-expanded={open && matches.length > 0}
            placeholder={placeholder}
            disabled={disabled}
            value={value}
            className="ui-combobox-input"
            onFocus={() => setOpen(matches.length > 0)}
            onChange={(event) => {
              onValueChange(event.target.value);
              setHighlight(0);
              setOpen(
                filterComboboxOptions(options, event.target.value).length > 0,
              );
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) {
                event.stopPropagation();
                return;
              }
              if (event.key === "Escape" && open) {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
                return;
              }
              if (
                ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) &&
                (open || event.key.startsWith("Arrow"))
              ) {
                event.preventDefault();
                if (!open) setOpen(matches.length > 0);
                else
                  setHighlight((current) =>
                    moveComboboxHighlight(
                      matches.length,
                      current,
                      event.key as "ArrowDown" | "ArrowUp" | "Home" | "End",
                    ),
                  );
                return;
              }
              if (event.key === "Enter" && open && matches[highlight]) {
                event.preventDefault();
                choose(matches[highlight]);
                return;
              }
              onKeyDown?.(event);
            }}
          />
          {value && (
            <Button
              variant="ghost"
              size="icon-xs"
              className="ui-combobox-clear"
              disabled={disabled}
              aria-label={uiText("combobox.aria_label", { ariaLabel })}
              title={uiText("combobox.title")}
              onClick={() => {
                onValueChange("");
                setHighlight(0);
                anchor.current?.querySelector("input")?.focus();
              }}
            >
              <X size={14} aria-hidden />
            </Button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        collisionPadding={8}
        data-ui-overlay="true"
        className="ui-combobox-content p-1"
        onInteractOutside={(event) => {
          if (anchor.current?.contains(event.target as Node))
            event.preventDefault();
        }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Command
          shouldFilter={false}
          disablePointerSelection
          value={matches[highlight]?.value ?? ""}
        >
          <CommandList
            ref={setList}
            label={uiText("combobox.aria_label2", { ariaLabel })}
          >
            {(["recent", "suggestion"] as const).map((group) => (
              <CommandGroup
                key={group}
                heading={
                  group === "recent"
                    ? uiText("combobox.groupLabel")
                    : uiText("combobox.groupLabel2")
                }
              >
                {matches.map(
                  (option, index) =>
                    option.group === group && (
                      <CommandItem
                        key={`${group}:${option.value}`}
                        value={option.value}
                        data-checked={option.value === value}
                        onMouseEnter={() => setHighlight(index)}
                        onMouseDown={(event) => event.preventDefault()}
                        onSelect={() => choose(option)}
                      >
                        {option.label}
                      </CommandItem>
                    ),
                )}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
