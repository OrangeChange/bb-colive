import { useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";
import { zhCN, zhTW, enUS, ja } from "react-day-picker/locale";
import { useUiLanguage } from "../i18n/react";
import { uiText } from "../i18n";
import { Button } from "./shadcn/button";
import { Calendar } from "./shadcn/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "./shadcn/popover";
import { Input } from "./shadcn/input";
import { Label } from "./shadcn/label";
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
  const [open, setOpen] = useState(false);
  const locale = { "zh-CN": zhCN, "zh-Hant": zhTW, en: enUS, ja }[language];
  const time = value
    ? `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
    : "";
  const text = value
    ? new Intl.DateTimeFormat(language, {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(showTime
          ? ({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const)
          : {}),
      }).format(value)
    : label;
  const changeDay = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const next = new Date(day);
    next.setHours(value?.getHours() ?? 0, value?.getMinutes() ?? 0, 0, 0);
    onChange(next);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          aria-label={label}
          className={
            "date-time-field-trigger justify-start font-normal " +
            (!showTime ? "is-date-only " : "") +
            (className ?? "")
          }
        >
          <CalendarDays aria-hidden />
          {text}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        lang={language}
        align="start"
        className="w-auto p-0"
        aria-label={label}
      >
        <Calendar
          mode="single"
          selected={value}
          onSelect={changeDay}
          defaultMonth={value}
          locale={locale}
          className="[--cell-size:32px]"
        />
        <div className="date-time-field-footer">
          {showTime && (
            <Label className="date-time-field-label">
              <Clock3 aria-hidden size={14} />
              {uiText("uiControls.time")}
              <Input
                aria-label={label + " " + uiText("uiControls.time")}
                lang={language}
                type="time"
                step={60}
                value={time}
                onChange={(event) => {
                  const match = /^(\d{2}):(\d{2})$/.exec(event.target.value);
                  if (!match) return;
                  const next = new Date(value ?? new Date());
                  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
                  onChange(next);
                }}
              />
            </Label>
          )}
          <div className="date-time-field-actions">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(undefined)}
            >
              {uiText("common.clear")}
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              {uiText("common.close")}
            </Button>
          </div>
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
