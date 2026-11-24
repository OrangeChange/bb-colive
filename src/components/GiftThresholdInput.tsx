import { ChevronUp as LucideChevronUp, ChevronDown as LucideChevronDown } from "lucide-react";
import { GIFT_THRESHOLD_INPUT_STEP, normalizeGiftThreshold, stepGiftThreshold, type GiftThresholdMode } from "../giftThreshold";

export function GiftThresholdInput({
  value,
  onChange,
  compact = false,
  mode = "unit",
  searchId,
}: {
  value: number;
  onChange: (value: number) => void;
  compact?: boolean;
  mode?: GiftThresholdMode;
  searchId?: string;
}) {
  const normalizedValue = normalizeGiftThreshold(value);
  const label = compact
    ? mode === "cumulative" ? "事件总额 ≥" : "单件金额 ≥"
    : "最低显示金额";
  const inputLabel = mode === "cumulative" ? "事件累计显示金额" : "事件单件显示金额";
  const changeByStep = (direction: 1 | -1) => onChange(stepGiftThreshold(normalizedValue, direction));

  return (
    <label className={`gift-threshold-input ${compact ? "is-compact" : ""}`} data-settings-search={searchId}>
      <span className="gift-threshold-input-label">{label}</span>
      <span className="gift-threshold-input-control">
        <span aria-hidden="true">¥</span>
        <input
          aria-label={inputLabel}
          type="number"
          min="0"
          step="any"
          inputMode="decimal"
          value={normalizedValue}
          onChange={(event) => {
            const next = Number(event.target.value);
            onChange(normalizeGiftThreshold(next));
          }}
          className="gift-threshold-input-field"
        />
        <span className="gift-threshold-input-steppers" data-step={GIFT_THRESHOLD_INPUT_STEP}>
          <button
            type="button"
            aria-label={`增加${inputLabel}`}
            title={`增加${inputLabel}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeByStep(1)}
            className="gift-threshold-input-step"
          >
            <LucideChevronUp aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`减少${inputLabel}`}
            title={`减少${inputLabel}`}
            disabled={normalizedValue <= 0}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeByStep(-1)}
            className="gift-threshold-input-step"
          >
            <LucideChevronDown aria-hidden="true" />
          </button>
        </span>
      </span>
    </label>
  );
}
