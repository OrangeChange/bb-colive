import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { zhCN, zhTW, enUS, ja } from "react-day-picker/locale";
import { useUiLanguage } from "../i18n/react";
import { uiText } from "../i18n";
import { Button } from "./shadcn/button";
import { Calendar } from "./shadcn/calendar";
import {
  Popover,
  PopoverAnchor,
  PopoverTrigger,
  PopoverContent,
} from "./shadcn/popover";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
  InputGroupButton,
} from "./shadcn/input-group";
import { RadioGroup, RadioGroupItem } from "./shadcn/radio-group";
import { ScrollArea } from "./shadcn/scroll-area";

function TimeColumn({
  label,
  count,
  value,
  onChange,
}: {
  label: string;
  count: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const root = useRef<HTMLDivElement>(null),
    positioned = useRef(false);
  useLayoutEffect(() => {
    const viewport = root.current?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    );
    const selected = root.current?.querySelector<HTMLElement>(
      '[data-state="checked"]',
    );
    if (!viewport || !selected) return;
    const top =
      selected.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top +
      viewport.scrollTop;
    if (!positioned.current) {
      viewport.scrollTop =
        top - (viewport.clientHeight - selected.offsetHeight) / 2;
      positioned.current = true;
    } else if (top < viewport.scrollTop) viewport.scrollTop = top;
    else if (
      top + selected.offsetHeight >
      viewport.scrollTop + viewport.clientHeight
    )
      viewport.scrollTop = top + selected.offsetHeight - viewport.clientHeight;
  }, [value]);
  return (
    <div className="date-time-column" ref={root}>
      <div className="date-time-column-title">{label}</div>
      <ScrollArea className="date-time-column-scroll">
        <RadioGroup
          aria-label={label}
          value={String(value)}
          onValueChange={(next) => onChange(Number(next))}
          className="date-time-column-options"
        >
          {Array.from({ length: count }, (_, n) => (
            <RadioGroupItem
              key={n}
              value={String(n)}
              className="date-time-column-option"
            >
              {String(n).padStart(2, "0")}
            </RadioGroupItem>
          ))}
        </RadioGroup>
      </ScrollArea>
    </div>
  );
}

export function DateTimeField({
  label,
  value,
  onChange,
  className,
  showTime = true,
  id,
}: {
  id?: string;
  showTime?: boolean;
  className?: string;
  label: string;
  value?: Date;
  onChange: (value: Date | undefined) => void;
}) {
  const language = useUiLanguage();
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(value ?? new Date());
  const displayValue = showTime ? localDateTimeValue(value).replace("T", " ") : localDateTimeValue(value).slice(0, 10);
  const [draft, setDraft] = useState(displayValue);
  useEffect(() => setDraft(displayValue), [displayValue]);
  const commit = () => {
    if (!draft.trim()) { onChange(undefined); return; }
    const next = parseDateTimeInput(draft, showTime);
    if (next) { setMonth(next); onChange(next); }
    else setDraft(displayValue);
  };
  const locale = { "zh-CN": zhCN, "zh-Hant": zhTW, en: enUS, ja }[language];
  const input = useRef<HTMLInputElement>(null),
    group = useRef<HTMLDivElement>(null);
  const changeDay = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const next = new Date(day);
    next.setHours(value?.getHours() ?? 0, value?.getMinutes() ?? 0, 0, 0);
    setMonth(next);
    onChange(next);
  };
  const changeTime = (part: "hour" | "minute", number: number) => {
    const next = value ? new Date(value) : new Date();
    if (!value) next.setHours(0, 0, 0, 0);
    if (part === "hour") next.setHours(number);
    else next.setMinutes(number);
    next.setSeconds(0, 0);
    onChange(next);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setMonth(value ?? new Date());
        setOpen(next);
      }}
    >
      <PopoverAnchor asChild>
        <InputGroup
          ref={group}
          className={
            "date-time-field-trigger " +
            (!showTime ? "is-date-only " : "") +
            (className ?? "")
          }
        >
          <InputGroupInput
            id={id}
            ref={input}
            aria-label={label}
            lang={language}
            type="text"
            inputMode="numeric"
            placeholder={showTime ? "YYYY-MM-DD HH:mm" : "YYYY-MM-DD"}
            value={draft}
            onChange={event => {
              setDraft(event.target.value);
              if (!event.target.value) onChange(undefined);
              else {
                const next = parseDateTimeInput(event.target.value, showTime);
                if (next) { setMonth(next); onChange(next); }
              }
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") { event.preventDefault(); commit(); }
              if ((event.key === "ArrowUp" || event.key === "ArrowDown") && !event.altKey) {
                event.preventDefault();
                const next = parseDateTimeInput(draft, showTime) ?? new Date();
                const direction = event.key === "ArrowUp" ? 1 : -1;
                const cursor = event.currentTarget.selectionStart ?? 0;
                if (cursor <= 4) next.setFullYear(next.getFullYear() + direction);
                else if (cursor <= 7) next.setMonth(next.getMonth() + direction);
                else if (cursor <= 10 || !showTime) next.setDate(next.getDate() + direction);
                else if (cursor <= 13) next.setHours(next.getHours() + direction);
                else next.setMinutes(next.getMinutes() + direction);
                onChange(next); setMonth(next);
              }
              if (event.altKey && event.key === "ArrowDown") {
                event.preventDefault();
                setMonth(value ?? new Date());
                setOpen(true);
              }
            }}
          />
          <InputGroupAddon align="inline-end">
            <PopoverTrigger asChild>
              <InputGroupButton
                className="date-time-field-open"
                size="icon-xs"
                aria-label={uiText("dateTimeField.openCalendar", { label })}
              >
                <CalendarDays aria-hidden />
              </InputGroupButton>
            </PopoverTrigger>
          </InputGroupAddon>
        </InputGroup>
      </PopoverAnchor>
      <PopoverContent
        lang={language}
        align="start"
        className="date-time-picker p-0"
        aria-label={label}
        onInteractOutside={(event) => {
          if (group.current?.contains(event.target as Node))
            event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          input.current?.focus({ preventScroll: true });
        }}
      >
        <div className="date-time-picker-body">
          <Calendar
            mode="single"
            selected={value}
            onSelect={changeDay}
            month={month}
            onMonthChange={setMonth}
            locale={locale}
            autoFocus
            className="[--cell-size:30px]"
          />
          {showTime && (
            <div className="date-time-picker-time">
              <TimeColumn
                label={uiText("dateTimeField.hour")}
                count={24}
                value={value?.getHours() ?? 0}
                onChange={(n) => changeTime("hour", n)}
              />
              <TimeColumn
                label={uiText("dateTimeField.minute")}
                count={60}
                value={value?.getMinutes() ?? 0}
                onChange={(n) => changeTime("minute", n)}
              />
            </div>
          )}
        </div>
        <div className="date-time-field-actions">
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            {uiText("common.clear")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => changeDay(new Date())}
          >
            {uiText("dateTimeField.today")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function localDateTimeValue(value: Date | undefined): string {
  if (!value) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function parseDateTimeInput(text: string, showTime: boolean): Date | undefined {
  const match = text.trim().match(showTime ? /^(\d{4})[-/](\d{2})[-/](\d{2})[ T](\d{2}):(\d{2})$/ : /^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (!match) return;
  const [, y, m, d, h = "0", minute = "0"] = match;
  const result = new Date(Number(y), Number(m) - 1, Number(d), Number(h), Number(minute));
  if (result.getFullYear() === Number(y) && result.getMonth() === Number(m) - 1 && result.getDate() === Number(d) && result.getHours() === Number(h) && result.getMinutes() === Number(minute)) return result;
}
