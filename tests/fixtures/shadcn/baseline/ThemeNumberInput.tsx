import { useRef, useState } from "react";

const numberText = (value: number | undefined) => value === undefined ? "" : String(Number(value.toFixed(2)));

export function ThemeNumberInput({
  label,
  value,
  onChange,
  onPreviewChange,
  onPreviewCancel,
  min,
  max,
  step = 1,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number) => void;
  onPreviewChange?: (value: number) => void;
  onPreviewCancel?: () => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(numberText(value));
  const editing = useRef(false),
    skipCommit = useRef(false),
    dirty = useRef(false);
  const bounded = (number: number) =>
    Math.max(min ?? -Infinity, Math.min(max ?? Infinity, number));
  const parse = (text: string) =>
    /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) && Number.isFinite(Number(text))
      ? Number(text)
      : undefined;
  const commit = () => {
    editing.current = false;
    if (skipCommit.current) {
      skipCommit.current = false;
      return;
    }
    if (!dirty.current) return;
    const number = parse(draft);
    if (number === undefined) {
      setDraft(numberText(value));
      onPreviewCancel?.();
    } else {
      const next = bounded(number);
      setDraft(String(next));
      onChange(next);
    }
  };
  return (
    <input
      type="text"
      inputMode="decimal"
      role="spinbutton"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      value={editing.current ? draft : numberText(value)}
      placeholder={placeholder}
      onFocus={() => {
        setDraft(numberText(value));
        editing.current = true;
        skipCommit.current = false;
        dirty.current = false;
      }}
      onChange={(event) => {
        const text = event.target.value;
        dirty.current = true;
        setDraft(text);
        const number = parse(text);
        if (number !== undefined) onPreviewChange?.(bounded(number));
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          skipCommit.current = true;
          setDraft(numberText(value));
          onPreviewCancel?.();
          event.currentTarget.blur();
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          dirty.current = true;
          const next = bounded(
            (parse(draft) ?? value ?? 0) + (event.key === "ArrowUp" ? step : -step),
          );
          setDraft(String(Number(next.toFixed(2))));
          onPreviewChange?.(next);
        }
      }}
    />
  );
}
