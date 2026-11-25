import { useUiLanguage } from "../../../../src/i18n/react.ts";
import { uiText } from "../../../../src/i18n/index.ts";
import { Search, X } from "lucide-react";
import { useRef, type ComponentPropsWithoutRef } from "react";
import "../../../../src/components/ui/SearchInput.css";

type SearchInputProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
};

export function UiSearchInput({ value, onValueChange, className = "", ...props }: SearchInputProps) {
  useUiLanguage();
  const input = useRef<HTMLInputElement>(null);
  return <div className={`ui-search-field flex h-8 min-w-0 items-center gap-2 rounded-md border border-line bg-bg px-2 text-t2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent-ring ${className}`}>
    <Search size={16} className="shrink-0 text-t3" aria-hidden="true" />
    <input {...props} ref={input} type="search" value={value} onChange={event => onValueChange(event.target.value)} className="ui-search-input min-w-0 flex-1 bg-transparent p-0 ui-type-control text-t1 outline-none placeholder:text-t3" />
    {value && <button type="button" aria-label={uiText("searchInput.aria_label", { value: props["aria-label"] ?? uiText("common.search") })} title={uiText("searchInput.title")} disabled={props.disabled} className="ui-search-clear inline-flex size-5 shrink-0 items-center justify-center rounded text-t3 hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" onClick={() => { onValueChange(""); input.current?.focus(); }}><X size={14} aria-hidden="true" /></button>}
  </div>;
}
