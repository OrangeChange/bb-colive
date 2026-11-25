import { useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import * as Popover from "@radix-ui/react-popover";

export function ThemeActionMenu({ label, children, items, className = "", disabled = false }: {
  label: string; children: ReactNode; className?: string; disabled?: boolean;
  items: readonly { label: string; action: () => void; separator?: boolean; icon?: ReactNode; current?: boolean; disabled?: boolean; title?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const last = useRef(false);
  const buttons = () => [...menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []];
  const focusEntry = () => { const list = buttons(); list[last.current ? list.length - 1 : 0]?.focus(); };
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild><button ref={trigger} type="button" disabled={disabled} className={className} title={label} aria-label={label} aria-haspopup="menu" onClick={() => { last.current = false; }} onKeyDown={event => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      event.preventDefault(); last.current = event.key === "ArrowUp" || event.key === "End";
      if (open) focusEntry(); else setOpen(true);
    }}>{children}</button></Popover.Trigger>
    <Popover.Portal><Popover.Content align="end" sideOffset={4} collisionPadding={8} className="native-editor-more-popover ui-motion-enter" data-ui-overlay="true" onClick={event => event.stopPropagation()} onOpenAutoFocus={event => { event.preventDefault(); focusEntry(); }} onCloseAutoFocus={event => { event.preventDefault(); trigger.current?.focus({ preventScroll: true }); }}>
      <div ref={menu} className="native-editor-more-menu" role="menu" aria-label={label} onKeyDown={event => {
        const list = buttons(), index = list.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : event.key === "ArrowDown" ? (index + 1) % list.length : event.key === "ArrowUp" ? (index + list.length - 1) % list.length : -1;
        if (next >= 0) { event.preventDefault(); list[next]?.focus(); }
        if (event.key === "Tab") { event.preventDefault(); setOpen(false); }
      }}>{items.map((item, index) => <div key={item.label}>{item.separator && index > 0 && <div role="separator" className="native-editor-more-separator" />}<button type="button" role="menuitem" title={item.title ?? item.label} disabled={item.disabled} aria-current={item.current ? "true" : undefined} onClick={() => { setOpen(false); item.action(); }}>{item.icon}<span className="theme-action-label">{item.label}</span>{item.current && <Check size={14} aria-hidden="true" />}</button></div>)}</div>
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
