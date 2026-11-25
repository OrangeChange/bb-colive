import { useUiLanguage } from "../i18n/react.ts";
import { uiCurrencyUnit } from "../i18n/format.ts";
import { uiText } from "../i18n/index.ts";
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
  useUiLanguage();
  const normalizedValue = normalizeGiftThreshold(value);
  const label = compact
    ? mode === "cumulative" ? uiText("giftThresholdInput.GiftThresholdInput.label") : uiText("giftThresholdInput.GiftThresholdInput.label2")
    : uiText("giftThresholdInput.GiftThresholdInput.label3");
  const inputLabel = mode === "cumulative" ? uiText("giftThresholdInput.GiftThresholdInput.inputLabel") : uiText("giftThresholdInput.GiftThresholdInput.inputLabel2");
  const changeByStep = (direction: 1 | -1) => onChange(stepGiftThreshold(normalizedValue, direction));

  return (
    <label className={`gift-threshold-input ${compact ? "is-compact" : ""}`} data-settings-search={searchId}>
      <span className="gift-threshold-input-label">{label}</span>
      <span className="gift-threshold-input-control">
        <span aria-hidden="true">{uiCurrencyUnit()}</span>
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
            aria-label={uiText("giftThresholdInput.aria_label", { inputLabel: inputLabel })}
            title={uiText("giftThresholdInput.title", { inputLabel: inputLabel })}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => changeByStep(1)}
            className="gift-threshold-input-step"
          >
            <LucideChevronUp aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={uiText("giftThresholdInput.aria_label2", { inputLabel: inputLabel })}
            title={uiText("giftThresholdInput.title2", { inputLabel: inputLabel })}
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
