import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import * as Popover from "@radix-ui/react-popover";
import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ThemeColorField } from "./ThemeColorField.tsx";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";
import { ThemeAngleInput } from "./ThemeAngleInput.tsx";
import { UiSelect } from "./ui/Select.tsx";
import { createThemeColorDragInteraction } from "./themeColorInteraction.ts";
import {
  parseBackground,
  parseGradient,
  replaceGradient,
  serializeGradient,
  solidLayerColor,
  replaceSolidLayerColor,
  insertGradientStop,
  hasBackgroundImage,
  type BackgroundGradient,
} from "./themeBackgroundValue.ts";
import { STYLE_PREVIEW_POINTER_DOWN_EVENT } from "./stylePreviewInteraction.ts";

type Props = {
  value: string;
  label: string;
  mixed?: boolean;
  onChange: (value: string) => void;
  onPreviewChange: (value: string) => void;
  onPreviewCancel?: () => void;
};
const initialGradient = (
  kind: "linear" | "radial",
  color: string,
): BackgroundGradient => ({
  kind,
  angle: 180,
  shape: "ellipse",
  extent: "",
  center: [50, 50],
  stops: [
    { color, position: 0, unit: "%" },
    { color: "transparent", position: 100, unit: "%" },
  ],
});

export function ThemeBackgroundField({
  value,
  label,
  mixed,
  onChange,
  onPreviewChange,
  onPreviewCancel,
}: Props) {
  useUiLanguage();
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(value),
    [layer, setLayer] = useState(0),
    [stop, setStop] = useState(0),
    [pixelRange, setPixelRange] = useState<number | null>(null);
  const committed = useRef(value),
    dragging = useRef(false),
    track = useRef<HTMLDivElement>(null);
  const trackBounds = useRef<DOMRect | null>(null);
  const callbacks = useRef({ onChange, onPreviewChange, onPreviewCancel });
  callbacks.current = { onChange, onPreviewChange, onPreviewCancel };
  const interaction = useMemo(
    () =>
      createThemeColorDragInteraction({
        preview: (next) => {
          setDraft(next);
          callbacks.current.onPreviewChange(next);
        },
        commit: (next) => {
          setDraft(next);
          committed.current = next;
          callbacks.current.onChange(next);
        },
      }),
    [],
  );
  useEffect(() => {
    if (!open) {
      setDraft(value);
      committed.current = value;
    }
  }, [value, open]);
  useEffect(() => () => interaction.cancel(), [interaction]);
  const cancel = () => {
    interaction.cancel();
    dragging.current = false;
    setDraft(committed.current);
    callbacks.current.onPreviewCancel?.();
  };
  useEffect(() => {
    if (!open) return;
    const close = () => {
      cancel();
      setOpen(false);
    };
    window.addEventListener(STYLE_PREVIEW_POINTER_DOWN_EVENT, close);
    return () =>
      window.removeEventListener(STYLE_PREVIEW_POINTER_DOWN_EVENT, close);
  }, [open]);
  const background = parseBackground(draft),
    selected = Math.min(layer, Math.max(0, background.layers.length - 1));
  const currentLayer = background.layers[selected] ?? "transparent",
    gradient = parseGradient(currentLayer);
  const stopIndex = Math.min(
    stop,
    Math.max(0, (gradient?.stops.length ?? 1) - 1),
  );
  const pixelTrack = Boolean(
    gradient?.stops.every((item) => item.unit === "px" || item.position === 0),
  );
  const trackExtent = pixelTrack
    ? Math.max(pixelRange ?? 1, ...gradient!.stops.map((item) => item.position))
    : track.current?.clientWidth || 100;
  const trackPosition = (item: { position: number; unit: string }) =>
    pixelTrack
      ? `${(item.position / trackExtent) * 100}%`
      : `${item.position}${item.unit}`;
  const containsImage = hasBackgroundImage(draft);
  const editableSolid =
    !hasBackgroundImage(currentLayer) && !/gradient\(/i.test(currentLayer);
  const publish = (next: string, preview = false) => {
    if (preview) interaction.move(next);
    else {
      setDraft(next);
      interaction.cancel();
      committed.current = next;
      onChange(next);
    }
  };
  const update = (next: BackgroundGradient, preview = false) =>
    publish(replaceGradient(background, selected, next), preview);
  const changeStop = (color: string, preview = false) => {
    if (gradient)
      update(
        {
          ...gradient,
          stops: gradient.stops.map((s, i) =>
            i === stopIndex ? { ...s, color } : s,
          ),
        },
        preview,
      );
  };
  const positionStop = (position: number, preview = false) => {
    if (gradient)
      update(
        {
          ...gradient,
          stops: gradient.stops.map((s, i) =>
            i === stopIndex ? { ...s, position } : s,
          ),
        },
        preview,
      );
  };
  const switchKind = (kind: string) => {
    if (kind === (gradient?.kind ?? (editableSolid ? "solid" : "css"))) return;
    if (kind === "solid")
      publish(
        gradient?.stops[stopIndex]?.color ?? solidLayerColor(currentLayer),
      );
    else if (gradient)
      update({ ...gradient, kind: kind as "linear" | "radial" });
    else {
      const layers = [...background.layers],
        next = serializeGradient(
          initialGradient(
            kind as "linear" | "radial",
            editableSolid ? solidLayerColor(currentLayer) : "#ffffff",
          ),
        );
      if (editableSolid) layers[selected] = next;
      else layers.splice(selected, 0, next);
      setStop(0);
      publish(layers.join(", "));
    }
  };
  const addStop = (at?: number) => {
    if (!gradient) return;
    const next = insertGradientStop(
      gradient,
      stopIndex,
      pixelTrack ? trackExtent : track.current?.clientWidth || 100,
      at,
    );
    setStop(next.index);
    update(next.gradient);
  };
  const removeStop = (index = stopIndex) => {
    if (!gradient || gradient.stops.length <= 2) return;
    update({
      ...gradient,
      stops: gradient.stops.filter((_, i) => i !== index),
    });
    setStop(Math.max(0, index - 1));
  };
  const removeLayer = () => {
    const layers = background.layers.filter((_, i) => i !== selected);
    setLayer(Math.min(selected, layers.length - 1));
    setPixelRange(null);
    setStop(0);
    publish(layers.join(", "));
  };
  const moveStop = (clientX: number) => {
    if (!gradient || !track.current) return;
    const rect = trackBounds.current ?? track.current.getBoundingClientRect(),
      unit = pixelTrack ? "px" : gradient.stops[stopIndex].unit;
    const raw =
      Math.max(0, Math.min(rect.width, clientX - rect.left)) *
      (unit === "%"
        ? 100 / rect.width
        : pixelTrack
          ? trackExtent / rect.width
          : 1);
    const previous = gradient.stops[stopIndex - 1],
      following = gradient.stops[stopIndex + 1];
    const position = Number(
      Math.max(
        previous?.unit === unit ? previous.position : 0,
        Math.min(
          following?.unit === unit
            ? following.position
            : unit === "%"
              ? 100
              : pixelTrack
                ? trackExtent
                : rect.width,
          raw,
        ),
      ).toFixed(2),
    );
    update(
      {
        ...gradient,
        stops: gradient.stops.map((item, i) =>
          i === stopIndex ? { ...item, position, unit } : item,
        ),
      },
      true,
    );
  };
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          committed.current = value;
          setDraft(value);
          const first = parseBackground(value).layers.findIndex((item) =>
            parseGradient(item),
          );
          setLayer(Math.max(0, first));
          setPixelRange(null);
          setStop(0);
        } else cancel();
        setOpen(next);
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          className="theme-color-trigger"
          aria-label={label}
        >
          <span className="theme-color-swatch" style={{ background: value }} />
          <span>
            {mixed
              ? uiText("themeBackgroundField.ThemeBackgroundField")
              : /gradient\(/i.test(value)
                ? uiText("themeBackgroundField.ThemeBackgroundField2")
                : value === "transparent"
                  ? uiText("themeBackgroundField.ThemeBackgroundField3")
                  : value}
          </span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className="theme-background-popover"
          aria-label={uiText("themeBackgroundField.aria_label", { label: label })}
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={8}
          onEscapeKeyDown={cancel}
        >
          <div className="theme-color-popover-header">
            <strong>{label}</strong>
            <Popover.Close aria-label={uiText("themeBackgroundField.aria_label2")} title={uiText("common.close")}>
              <X size={16} />
            </Popover.Close>
          </div>
          <div
            className="theme-background-preview theme-fill-checker"
            aria-label={uiText("themeBackgroundField.aria_label3")}
            title={uiText("themeBackgroundField.title")}
          >
            <span style={{ background: draft }} />
          </div>
          {containsImage && (
            <span className="theme-background-image-notice">{uiText("themeBackgroundField.ThemeBackgroundField4")}</span>
          )}
          {background.layers.length > 1 && (
            <div className="theme-background-layers">
              <span
                className="theme-layer-swatch theme-fill-checker"
                aria-hidden="true"
              >
                <span style={{ background: currentLayer }} />
              </span>
              <UiSelect
                ariaLabel={uiText("themeBackgroundField.ariaLabel")}
                contentClassName="theme-background-select-menu"
                value={String(selected)}
                onValueChange={(next) => {
                  setLayer(Number(next));
                  setPixelRange(null);
                  setStop(0);
                }}
                options={background.layers.map((item, i) => ({
                  value: String(i),
                  label: `${i === 0 ? uiText("themeBackgroundField.options.label") : i === background.layers.length - 1 ? uiText("themeBackgroundField.options.label2") : uiText("themeBackgroundField.options.label3", { value: i + 1 })} · ${parseGradient(item) ? uiText("themeBackgroundField.options.label4") : hasBackgroundImage(item) ? uiText("themeBackgroundField.options.label5") : uiText("themeBackgroundField.options.label6")}`,
                }))}
              />
              <button
                type="button"
                className="theme-fill-icon"
                aria-label={uiText("themeBackgroundField.aria_label4")}
                title={uiText("themeBackgroundField.title2")}
                disabled={!gradient}
                onClick={removeLayer}
              >
                <Trash2 size={16} />
              </button>
            </div>
          )}
          <div
            className="theme-background-modes"
            role="group"
            aria-label={uiText("themeBackgroundField.aria_label5")}
          >
            {(
              [
                { value: "solid", label: uiText("themeBackgroundField.ThemeBackgroundField.label") },
                { value: "linear", label: uiText("themeBackgroundField.ThemeBackgroundField.label2") },
                { value: "radial", label: uiText("themeBackgroundField.ThemeBackgroundField.label3") },
              ] as const
            ).map((mode) => (
              <button
                key={mode.value}
                type="button"
                aria-pressed={
                  (gradient?.kind ?? (editableSolid ? "solid" : "css")) ===
                  mode.value
                }
                disabled={
                  mode.value === "solid" &&
                  !editableSolid &&
                  (!gradient || background.layers.length > 1)
                }
                title={
                  mode.value === "solid" &&
                  gradient &&
                  background.layers.length > 1
                    ? uiText("themeBackgroundField.title3")
                    : undefined
                }
                onClick={() => switchKind(mode.value)}
              >
                {mode.label}
              </button>
            ))}
          </div>
          {gradient && (
            <>
              <div className="theme-gradient-geometry">
                {gradient.kind === "linear" ? (
                  <ThemeAngleInput
                    value={gradient.angle}
                    onChange={(angle) => update({ ...gradient, angle })}
                    onPreviewChange={(angle) =>
                      update({ ...gradient, angle }, true)
                    }
                    onPreviewCancel={cancel}
                  />
                ) : (
                  <>
                    <div className="theme-gradient-shape">
                      <span>{uiText("themeBackgroundField.ThemeBackgroundField5")}</span>
                      <div
                        className="theme-gradient-options"
                        role="group"
                        aria-label={uiText("themeBackgroundField.aria_label6")}
                      >
                        {(["circle", "ellipse"] as const).map((shape) => (
                          <button
                            key={shape}
                            type="button"
                            aria-pressed={gradient.shape === shape}
                            onClick={() => update({ ...gradient, shape })}
                          >
                            {shape === "circle" ? uiText("themeBackgroundField.ThemeBackgroundField6") : uiText("themeBackgroundField.ThemeBackgroundField7")}
                          </button>
                        ))}
                      </div>
                    </div>
                    {(["X", "Y"] as const).map((axis, i) => (
                      <label key={axis}>
                        {uiText("themeBackgroundField.ThemeBackgroundField8")}{axis} %
                        <ThemeNumberInput
                          label={uiText("themeBackgroundField.label", { axis: axis })}
                          value={gradient.center[i]}
                          onChange={(number) => {
                            const center: [number, number] = [
                              ...gradient.center,
                            ];
                            center[i] = number;
                            update({ ...gradient, center });
                          }}
                          onPreviewChange={(number) => {
                            const center: [number, number] = [
                              ...gradient.center,
                            ];
                            center[i] = number;
                            update({ ...gradient, center }, true);
                          }}
                          onPreviewCancel={cancel}
                        />
                      </label>
                    ))}
                  </>
                )}
              </div>
              <div
                ref={track}
                className="theme-gradient-track theme-fill-checker"
                aria-label={uiText("themeBackgroundField.aria_label7")}
                title={uiText("themeBackgroundField.title4")}
                onClick={(event) => {
                  if (event.target === event.currentTarget) {
                    const rect = event.currentTarget.getBoundingClientRect();
                    addStop(((event.clientX - rect.left) / rect.width) * 100);
                  }
                }}
              >
                <span
                  className="theme-gradient-ramp"
                  style={{
                    background: serializeGradient({
                      ...gradient,
                      kind: "linear",
                      angle: 90,
                      stops: pixelTrack
                        ? gradient.stops.map((item) => ({
                            ...item,
                            unit: "%" as const,
                            position: (item.position / trackExtent) * 100,
                          }))
                        : gradient.stops,
                    }),
                  }}
                />
                {gradient.stops.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    role="slider"
                    className={`theme-gradient-stop${i === stopIndex ? " is-selected" : ""}`}
                    style={{
                      left: `clamp(0px, ${trackPosition(item)}, 100%)`,
                      width: `max(4px, min(28px${i > 0 ? `, calc(${trackPosition(item)} - ${trackPosition(gradient.stops[i - 1])})` : ""}${i < gradient.stops.length - 1 ? `, calc(${trackPosition(gradient.stops[i + 1])} - ${trackPosition(item)})` : ""}))`,
                    }}
                    aria-label={uiText("themeBackgroundField.aria_label8", { value: i + 1 })}
                    aria-valuenow={item.position}
                    aria-valuemin={Math.min(0, item.position)}
                    aria-valuemax={Math.max(
                      item.unit === "%"
                        ? 100
                        : track.current?.clientWidth || 100,
                      item.position,
                    )}
                    aria-valuetext={`${item.position}${item.unit}`}
                    title={uiText("themeBackgroundField.title5", { value: i + 1, position: item.position, unit: item.unit })}
                    onFocus={() => setStop(i)}
                    onClick={(event) => {
                      event.stopPropagation();
                      setStop(i);
                    }}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      trackBounds.current =
                        track.current?.getBoundingClientRect() ?? null;
                      if (pixelTrack) setPixelRange(trackExtent);
                      setStop(i);
                      dragging.current = true;
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      if (
                        dragging.current &&
                        event.currentTarget.hasPointerCapture(event.pointerId)
                      )
                        moveStop(event.clientX);
                    }}
                    onPointerUp={(event) => {
                      if (!dragging.current) return;
                      dragging.current = false;
                      event.currentTarget.releasePointerCapture(
                        event.pointerId,
                      );
                      interaction.end();
                    }}
                    onPointerCancel={cancel}
                    onKeyDown={(event) => {
                      if (event.key === "Delete" || event.key === "Backspace") {
                        event.preventDefault();
                        removeStop(i);
                      } else if (
                        event.key === "ArrowLeft" ||
                        event.key === "ArrowRight"
                      ) {
                        event.preventDefault();
                        setStop(i);
                        update({
                          ...gradient,
                          stops: gradient.stops.map((s, j) =>
                            j === i
                              ? {
                                  ...s,
                                  position:
                                    s.position +
                                    (event.key === "ArrowRight" ? 1 : -1) *
                                      (event.shiftKey ? 10 : 1),
                                }
                              : s,
                          ),
                        });
                      }
                    }}
                  >
                    <span className="theme-fill-checker">
                      <span style={{ background: item.color }} />
                    </span>
                  </button>
                ))}
              </div>
              <div className="theme-gradient-stop-actions">
                <span className="theme-gradient-stop-label">
                  {uiText("themeBackgroundField.ThemeBackgroundField9")}{stopIndex + 1}
                </span>
                <ThemeNumberInput
                  key={`${selected}:${stopIndex}`}
                  label={uiText("themeBackgroundField.label2")}
                  value={gradient.stops[stopIndex].position}
                  onChange={(position) => positionStop(position)}
                  onPreviewChange={(position) => positionStop(position, true)}
                  onPreviewCancel={cancel}
                />
                <div
                  className="theme-gradient-options is-unit"
                  role="group"
                  aria-label={uiText("themeBackgroundField.aria_label9")}
                >
                  {(["%", "px"] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      aria-pressed={gradient.stops[stopIndex].unit === unit}
                      title={
                        unit === "%" ? uiText("themeBackgroundField.title6") : uiText("themeBackgroundField.title7")
                      }
                      onClick={() =>
                        update({
                          ...gradient,
                          stops: gradient.stops.map((item, i) =>
                            i === stopIndex ? { ...item, unit } : item,
                          ),
                        })
                      }
                    >
                      {unit}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="theme-fill-icon"
                  aria-label={uiText("themeBackgroundField.aria_label10")}
                  title={uiText("themeBackgroundField.title8")}
                  onClick={() => addStop()}
                >
                  <Plus size={16} />
                </button>
                <button
                  type="button"
                  className="theme-fill-icon"
                  aria-label={uiText("themeBackgroundField.aria_label11")}
                  title={uiText("themeBackgroundField.title9")}
                  disabled={gradient.stops.length <= 2}
                  onClick={() => removeStop()}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </>
          )}
          {gradient ? (
            <ThemeColorField
              inline
              label={uiText("themeBackgroundField.label3")}
              value={gradient.stops[stopIndex].color}
              onChange={(color) => changeStop(color)}
              onPreviewChange={(color) => changeStop(color, true)}
              onPreviewCancel={cancel}
            />
          ) : editableSolid ? (
            <ThemeColorField
              inline
              label={uiText("themeBackgroundField.label4")}
              value={solidLayerColor(currentLayer)}
              onChange={(color) => {
                const layers = [...background.layers];
                layers[selected] = replaceSolidLayerColor(currentLayer, color);
                publish(layers.join(", "));
              }}
              onPreviewChange={(color) => {
                const layers = [...background.layers];
                layers[selected] = replaceSolidLayerColor(currentLayer, color);
                publish(layers.join(", "), true);
              }}
              onPreviewCancel={cancel}
            />
          ) : (
            <p className="theme-background-note">
              {uiText("themeBackgroundField.ThemeBackgroundField10")}</p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
