import { uiText } from "../i18n/index.ts";
import { Bell as LucideBell } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MsgType, type DanmakuEvent } from "../protocol/types";
import { formatSystemReminderText, getSystemReminderEvents } from "./systemReminder";

const hhmmss = (ts: number) => new Date(ts).toLocaleTimeString("zh-CN", { hour12: false });

function IconBell() {
  return (
    <LucideBell className="size-4" aria-hidden="true" />
  );
}

export function SystemReminderBell({ events, placement = "bottom", children }: { events: DanmakuEvent[]; placement?: "top" | "bottom"; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [readCount, setReadCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const reminders = getSystemReminderEvents(events);
  const latest = reminders.slice(-20).reverse();
  const unreadCount = Math.max(0, reminders.length - readCount);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      if (next && reminders.length > 0) {
        setReadCount(reminders.length);
      }
      return next;
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={uiText("systemReminderBell.aria_label")}
        aria-expanded={open}
        title={uiText("systemReminderBell.title")}
        onClick={toggle}
        className="relative inline-flex size-7 items-center justify-center rounded-md border border-line text-t2 transition-colors hover:border-accent/50 hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
      >
        <IconBell />
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-danger-solid px-1 text-center ui-type-micro font-semibold text-danger-fg">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {children && <div hidden={open}>{children}</div>}
      {open && (
        <div
          role="dialog"
          aria-label={uiText("systemReminderBell.aria_label")}
          className={`ui-motion-enter absolute right-0 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-line bg-surface shadow-xl shadow-black/20 ${placement === "top" ? "bottom-9" : "top-9"}`}
        >
          <div className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="ui-type-section-title font-semibold text-t1">{uiText("systemReminderBell.SystemReminderBell")}</h2>
            <span className="font-mono ui-type-meta text-t3">{uiText("systemReminderBell.SystemReminderBell2")}{reminders.length} {uiText("systemReminderBell.SystemReminderBell3")}</span>
          </div>
          {latest.length > 0 ? (
            <ul className="max-h-72 overflow-y-auto py-1">
              {latest.map((event) => (
                <li key={event.reactKey ?? event.id} className="flex gap-2 border-b border-line/60 px-3 py-2 last:border-b-0">
                  <time className="shrink-0 pt-0.5 font-mono ui-type-micro text-t3">{hhmmss(event.ts)}</time>
                  <span className={event.msgType === MsgType.Warning || event.msgType === MsgType.CutOff ? "ui-type-control font-medium text-danger" : event.msgType === MsgType.RoomBlock ? "min-w-0 break-words ui-type-control font-medium text-ev-red" : "min-w-0 break-words ui-type-control text-t2"}>
                    {formatSystemReminderText(event)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-3 py-6 text-center ui-type-control text-t3">{uiText("systemReminderBell.SystemReminderBell4")}</div>
          )}
        </div>
      )}
    </div>
  );
}
