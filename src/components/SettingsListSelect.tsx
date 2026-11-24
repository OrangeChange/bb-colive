import { uiText } from "../i18n/index.ts";
import { ChevronDown as LucideChevronDown } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { resolveSettingsMenuPosition } from "./settingsListSelectPosition";
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
  const [open, setOpen] = useState(false);
  const selectedOptionIndex = options.findIndex((option) => option.value === value);
  const selectedIndex = Math.max(0, selectedOptionIndex);
  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex);
  const [position, setPosition] = useState({ left: 0, top: 0, width: 224, maxHeight: 320, ready: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const menuId = `settings-listbox-${useId().replace(/:/g, "")}`;
  const selectedOption = selectedOptionIndex >= 0
    ? options[selectedOptionIndex]
    : value
      ? { value, label: uiText("settingsListSelect.SettingsListSelect.selectedOption.label"), title: value }
      : options[0];

  const openMenu = () => {
    setHighlightedIndex(selectedIndex);
    setPosition((current) => ({ ...current, ready: false }));
    setOpen(true);
    onOpen?.();
  };

  useEffect(() => setHighlightedIndex(selectedIndex), [selectedIndex]);

  useEffect(() => () => {
    if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const resolved = resolveSettingsMenuPosition({
        triggerTop: rect.top,
        triggerBottom: rect.bottom,
        triggerLeft: rect.left,
        triggerWidth: rect.width,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        contentHeight: menuRef.current?.getBoundingClientRect().height ?? 0,
      });
      setPosition({ left: resolved.left, top: resolved.top, width: rect.width, maxHeight: Math.max(1, resolved.maxHeight), ready: true });
    };
    let frame: number | null = null;
    const schedulePositionUpdate = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => { frame = null; updatePosition(); });
    };
    schedulePositionUpdate();
    window.addEventListener("resize", schedulePositionUpdate);
    window.addEventListener("scroll", schedulePositionUpdate, true);
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedulePositionUpdate);
    if (menuRef.current) resizeObserver?.observe(menuRef.current);
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedulePositionUpdate);
      window.removeEventListener("scroll", schedulePositionUpdate, true);
      resizeObserver?.disconnect();
    };
  }, [open, options.length]);

  const commit = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const isComposing = (event.nativeEvent as globalThis.KeyboardEvent).isComposing;
    if (isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) { openMenu(); return; }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setHighlightedIndex((current) => Math.min(options.length - 1, Math.max(0, current + delta)));
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      if (!open) openMenu();
      setHighlightedIndex(event.key === "Home" ? 0 : Math.max(0, options.length - 1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) openMenu();
      else if (options[highlightedIndex]) commit(options[highlightedIndex].value);
      return;
    }
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); return; }
    if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey && !isComposing) {
      typeaheadRef.current += event.key.toLocaleLowerCase();
      const match = options.findIndex((option) => option.label.toLocaleLowerCase().startsWith(typeaheadRef.current));
      if (match >= 0) { event.preventDefault(); if (!open) openMenu(); setHighlightedIndex(match); }
      if (typeaheadTimerRef.current) window.clearTimeout(typeaheadTimerRef.current);
      typeaheadTimerRef.current = window.setTimeout(() => { typeaheadRef.current = ""; }, 500);
    }
  };

  return (
    <div className="settings-list-select-wrap">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        data-state={open ? "open" : "closed"}
        data-size="standard"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-activedescendant={open ? `${menuId}-option-${highlightedIndex}` : undefined}
        title={selectedOption?.title ?? selectedOption?.label}
        className="settings-list-select-trigger settings-control-surface ui-type-control"
        onFocus={onFocus}
        onClick={() => open ? setOpen(false) : openMenu()}
        onKeyDown={handleKeyDown}
      >
        <span className="min-w-0 flex-1 truncate">{selectedOption?.label ?? uiText("settingsListSelect.SettingsListSelect")}</span>
        <LucideChevronDown className={`settings-list-select-trigger-chevron ${open ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          data-ui-overlay="true"
          className="settings-control-menu settings-list-select-menu"
          style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight, visibility: position.ready ? "visible" : "hidden" }}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              id={`${menuId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              title={option.title ?? option.label}
              className={`settings-list-select-menu-item ui-type-control ${index === highlightedIndex ? "is-highlighted" : ""} ${option.value === value ? "is-selected" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)}
              onClick={() => commit(option.value)}
            >
              <span className="min-w-0 flex-1 truncate" style={option.style}>{option.label}</span>
              {option.value === value && <span className="settings-list-select-menu-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
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
  const values = value && !options.includes(value) ? [value,...options] : options;
  const selectOptions: {value:string;label:string;title?:string;disabled?:boolean}[] = values.map((option) => ({ value: option, ...fontFamilyPresentation(option) }));
  if (!value) selectOptions.unshift({value:"",label:emptyLabel,disabled:true});
  return (
    <div className="settings-list-select-wrap">
      <UiSelect
        ariaLabel={uiText("common.font")}
        options={selectOptions}
        value={value}
        onValueChange={onChange}
        onOpenChange={(open) => { if (open) onOpen?.(); }}
        size="compact"
        className="settings-list-select-trigger"
      />
    </div>
  );
}
