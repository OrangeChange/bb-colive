import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useRef } from "react";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";

type Props = {
  value: number;
  onChange: (value: number) => void;
  onPreviewChange: (value: number) => void;
  onPreviewCancel: () => void;
};

export function ThemeAngleInput({
  value,
  onChange,
  onPreviewChange,
  onPreviewCancel,
}: Props) {
  useUiLanguage();
  const gesture = useRef<{ bounds: DOMRect; angle: number } | null>(null);
  const move = (x: number, y: number) => {
    if (!gesture.current) return;
    const { bounds } = gesture.current;
    const dx = x - bounds.left - bounds.width / 2;
    const dy = y - bounds.top - bounds.height / 2;
    if (Math.hypot(dx, dy) < 2) return;
    const angle = Math.round(
      ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360,
    );
    gesture.current.angle = angle;
    onPreviewChange(angle);
  };
  return (
    <div className="theme-gradient-angle">
      <span>{uiText("themeAngleInput.ThemeAngleInput")}</span>
      <Button variant="outline"
        type="button"
        role="slider"
        aria-label={uiText("themeAngleInput.aria_label")}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={((value % 360) + 360) % 360}
        aria-valuetext={`${value}°`}
        className="theme-angle-dial"
        onPointerDown={(event) => {
          gesture.current = {
            bounds: event.currentTarget.getBoundingClientRect(),
            angle: value,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
          move(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            move(event.clientX, event.clientY);
        }}
        onPointerUp={(event) => {
          if (!gesture.current) return;
          move(event.clientX, event.clientY);
          onChange(gesture.current.angle);
          gesture.current = null;
          event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={() => {
          gesture.current = null;
          onPreviewCancel();
        }}
        onKeyDown={(event) => {
          const direction =
            event.key === "ArrowRight" || event.key === "ArrowUp"
              ? 1
              : event.key === "ArrowLeft" || event.key === "ArrowDown"
                ? -1
                : 0;
          if (!direction) return;
          event.preventDefault();
          onChange((value + direction * (event.shiftKey ? 10 : 1) + 360) % 360);
        }}
      >
        <span
          className="theme-angle-pointer"
          style={{ transform: `rotate(${value}deg)` }}
        />
      </Button>
      <ThemeNumberInput
        label={uiText("themeAngleInput.label")}
        value={value}
        onChange={onChange}
        onPreviewChange={onPreviewChange}
        onPreviewCancel={onPreviewCancel}
      />
      <span>°</span>
    </div>
  );
}
