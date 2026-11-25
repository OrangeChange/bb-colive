import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { ThemeImagePicker } from "./ThemeImagePicker.tsx";
import { ThemeImageDialog } from "./ThemeImageDialog.tsx";
import { UiSelect } from "./ui/Select.tsx";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";
import { useEffect, useState, useRef } from "react";
import {
  ArrowDown,
  ArrowUp,
  ImagePlus,
  Link,
  Link2Off,
  RotateCcw,
  Eye,
  EyeOff,
  GripVertical,
  X,
} from "lucide-react";
import {
  type ThemeImageAsset,
  useThemeImageAssets,
} from "./ThemeImageAssets.tsx";
import {
  readImageBackground,
  moveImageLayer,
  backgroundAnchorPosition,
  resolveImageLengthCss,
  scaleImageLengthCss,
  type ImageBackgroundDraft,
  isImageBackgroundDraft,
  imageBackgroundCss,
} from "./themeImageValue.ts";
import "./themeImageEditor.css";

interface Props {
  disabled?: boolean;
  scale?: { variable: string; value: number };
  value: string | ImageBackgroundDraft;
  onChange: (value: string | ImageBackgroundDraft) => void;
  onPreviewChange?: (value: string | ImageBackgroundDraft) => void;
  onPreviewCancel?: () => void;
}

/** Uses the same background value as the fill editor so neither can discard the other's layers. */
export function ThemeImageField({
  disabled,
  value,
  onChange,
  scale,
  onPreviewChange,
  onPreviewCancel,
}: Props) {
  useUiLanguage();
  const assets = useThemeImageAssets();
  const [draft, setDraft] = useState<ImageBackgroundDraft | null>(null);
  const previewCallbacks = useRef({ onPreviewChange, onPreviewCancel });
  previewCallbacks.current = { onPreviewChange, onPreviewCancel };
  useEffect(() => {
    if (draft)
      previewCallbacks.current.onPreviewChange?.({
        ...draft,
        kind: "image-background",
      });
    else previewCallbacks.current.onPreviewCancel?.();
  }, [draft]);
  useEffect(() => () => previewCallbacks.current.onPreviewCancel?.(), []);
  const [selected, setSelected] = useState(0);
  const [locked, setLocked] = useState(true);
  const [ratio, setRatio] = useState(1);
  const [error, setError] = useState("");
  const [alignment, setAlignment] = useState<[number, number]>([50, 50]);
  const [anchor, setAnchor] = useState<[number, number]>([50, 50]);
  const [compensation, setCompensation] = useState<[number, number]>([0, 0]);
  const [move, setMove] = useState<[number, number]>([0, 0]);
  const [units, setUnits] = useState<["px" | "%", "px" | "%"]>(["px", "px"]);
  const [anchorUnits, setAnchorUnits] = useState<["px" | "%", "px" | "%"]>([
    "%",
    "%",
  ]);
  const layer = draft?.layers[selected];
  const editable = Boolean(layer && /^url\(/i.test(layer.image));
  useEffect(() => {
    if (!layer) return;
    const dimensions = /^([\d.]+)px\s+([\d.]+)px$/.exec(layer.size);
    if (dimensions) setRatio(Number(dimensions[1]) / Number(dimensions[2]));
    if (layer.geometry) {
      const factor = scale && layer.basis ? scale.value / layer.basis.value : 1;
      setCompensation(
        (layer.geometry.compensation ?? [0, 0]).map((n) => n * factor) as [
          number,
          number,
        ],
      );
      setAlignment(layer.geometry.alignment);
      setAnchor(
        layer.geometry.anchor.map(
          (v) => v.value * (v.unit === "px" ? factor : 1),
        ) as [number, number],
      );
      setAnchorUnits(
        layer.geometry.anchor.map((v) => v.unit) as ["px" | "%", "px" | "%"],
      );
      setMove(
        layer.geometry.move.map(
          (v) => v.value * (v.unit === "px" ? factor : 1),
        ) as [number, number],
      );
      setUnits(
        layer.geometry.move.map((v) => v.unit) as ["px" | "%", "px" | "%"],
      );
      return;
    }
    const axes = layer.position.match(/calc\([^)]*\)|[^\s]+/g) ?? [];
    const positions: [number, number] = [0, 0],
      movements: [number, number] = [0, 0];
    for (const axis of [0, 1]) {
      const token = axes[axis] ?? "0%";
      const named: Record<string, number> = {
        left: 0,
        top: 0,
        center: 50,
        right: 100,
        bottom: 100,
      };
      const calc = /^calc\(([+-]?[\d.]+)% \+ ([+-]?[\d.]+)px\)$/.exec(token);
      if (calc) {
        positions[axis] = Number(calc[1]);
        movements[axis] = Number(calc[2]);
      } else if (token in named) positions[axis] = named[token];
      else if (token.endsWith("%")) positions[axis] = parseFloat(token);
      else if (token.endsWith("px")) movements[axis] = parseFloat(token);
    }
    setCompensation([0, 0]);
    setAlignment(positions);
    setAnchor(positions);
    setMove(movements);
    setUnits(["px", "px"]);
    setAnchorUnits(["%", "%"]);
  }, [layer?.id]);
  const start = () => {
    const style = document.createElement("div").style;
    const expand = (text: string) => resolveImageLengthCss(text, scale);
    const expanded = expand(imageBackgroundCss(value));
    style.background = expanded;
    if (!style.background || /var\(/.test(expanded)) {
      setError(uiText("themeImageField.ThemeImageField.start"));
      return;
    }
    const parsed = readImageBackground(style);
    if (isImageBackgroundDraft(value)) {
      let visible = 0;
      parsed.layers = value.layers.map((original) =>
        original.visible === false
          ? {
              ...structuredClone(original),
              size: expand(original.size),
              position: expand(original.position),
            }
          : {
              ...original,
              ...parsed.layers[visible++],
              id: original.id,
              geometry: original.geometry,
            },
      );
    }
    setDraft(parsed);
    setSelected(0);
    setError("");
  };
  const update = (patch: Partial<NonNullable<typeof layer>>) =>
    setDraft((current) =>
      current
        ? {
            ...current,
            layers: current.layers.map((entry, index) =>
              index === selected ? { ...entry, ...patch } : entry,
            ),
          }
        : current,
    );
  const choose = (asset: ThemeImageAsset, replace: boolean) => {
    if (!asset || !draft) return;
    const image = new Image();
    image.onload = () => {
      const next = {
        id: crypto.randomUUID(),
        image: `url(${JSON.stringify(asset.path)})`,
        size: `${image.naturalWidth}px ${image.naturalHeight}px`,
        position: "center center",
        repeat: "no-repeat",
        origin: "padding-box",
        clip: "border-box",
        attachment: "scroll",
      };
      if (!replace) setRatio(image.naturalWidth / image.naturalHeight);
      setDraft((current) =>
        current
          ? {
              ...current,
              layers: replace
                ? current.layers.map((item, index) =>
                    index === selected ? { ...item, image: next.image } : item,
                  )
                : [next, ...current.layers],
            }
          : current,
      );
      if (!replace) setSelected(0);
    };
    image.onerror = () => setError(uiText("themeImageField.ThemeImageField.choose"));
    image.src = asset.url;
  };
  const size = /^([\d.]+)px\s+([\d.]+)px$/.exec(layer?.size ?? "");
  type GeometryChange = {
    alignment?: [number, number];
    anchor?: [number, number];
    anchorUnits?: ["px" | "%", "px" | "%"];
    move?: [number, number];
    units?: ["px" | "%", "px" | "%"];
    dimensions?: [number, number];
    compensation?: [number, number];
  };
  const positionFor = (next: GeometryChange = {}) =>
    [0, 1]
      .map((axis) =>
        backgroundAnchorPosition(
          (next.alignment ?? alignment)[axis],
          {
            value: (next.anchor ?? anchor)[axis],
            unit: (next.anchorUnits ?? anchorUnits)[axis],
          },
          {
            value: (next.move ?? move)[axis],
            unit: (next.units ?? units)[axis],
          },
          next.dimensions?.[axis] ?? Number(size?.[axis + 1] ?? 100),
          (next.compensation ?? compensation)[axis],
        ),
      )
      .join(" ");
  const changeMove = (axis: number, value: number) => {
    const next: [number, number] = [...move];
    next[axis] = value;
    setMove(next);
    update({ position: positionFor({ move: next }) });
  };
  const changeMoveUnit = (axis: number, unit: "px" | "%") => {
    const next: ["px" | "%", "px" | "%"] = [...units];
    next[axis] = unit;
    setUnits(next);
    update({ position: positionFor({ units: next }) });
  };
  const changeAnchor = (
    axis: number,
    value: number,
    unit = anchorUnits[axis],
  ) => {
    const imageSize = Number(size?.[axis + 1] ?? 100),
      oldPixels =
        anchorUnits[axis] === "%"
          ? (anchor[axis] * imageSize) / 100
          : anchor[axis],
      newPixels = unit === "%" ? (value * imageSize) / 100 : value;
    const nextAnchor: [number, number] = [...anchor],
      nextUnits: ["px" | "%", "px" | "%"] = [...anchorUnits],
      nextMove: [number, number] = [...move],
      nextCompensation: [number, number] = [...compensation];
    nextAnchor[axis] = value;
    nextUnits[axis] = unit;
    if (units[axis] === "px") nextMove[axis] += newPixels - oldPixels;
    else nextCompensation[axis] += newPixels - oldPixels;
    setAnchor(nextAnchor);
    setAnchorUnits(nextUnits);
    setMove(nextMove);
    setCompensation(nextCompensation);
    update({
      position: positionFor({
        anchor: nextAnchor,
        anchorUnits: nextUnits,
        move: nextMove,
        compensation: nextCompensation,
      }),
    });
  };
  const dimensions = (axis: 0 | 1, value: number) => {
    const width = Number(size?.[1] ?? 100),
      height = Number(size?.[2] ?? 100);
    const sizes: [number, number] =
      axis === 0
        ? [value, locked ? value / ratio : height]
        : [locked ? value * ratio : width, value];
    update({
      size: `${sizes[0]}px ${sizes[1]}px`,
      position: positionFor({ dimensions: sizes }),
    });
  };
  return (
    <div className="theme-image-field">
      <button type="button" onClick={start} disabled={disabled}>
        <ImagePlus size={18} />
        {uiText("themeImageField.ThemeImageField")}</button>
      {error && <p role="status">{error}</p>}
      {draft && (
        <ThemeImageDialog
          title={uiText("themeImageField.title")}
          onClose={() => setDraft(null)}
          actions={
            <>
              <button type="button" onClick={() => setDraft(null)}>
                {uiText("common.cancel")}</button>
              <button
                type="button"
                className="is-primary"
                onClick={() => {
                  const scaled = scale
                    ? {
                        ...draft,
                        layers: draft.layers.map((entry) =>
                          /^url\(/i.test(entry.image)
                            ? {
                                ...entry,
                                ...Object.fromEntries(
                                  ["size", "position"].map((key) => [
                                    key,
                                    scaleImageLengthCss(
                                      entry[key as "size" | "position"],
                                      scale,
                                    ),
                                  ]),
                                ),
                              }
                            : entry,
                        ),
                      }
                    : draft;
                  const saved = {
                    ...scaled,
                    kind: "image-background" as const,
                    layers: scaled.layers.map((entry, index) =>
                      index === selected
                        ? {
                            ...entry,
                            basis: scale,
                            geometry: {
                              flow: false,
                              alignment,
                              compensation,
                              anchor: anchor.map((value, index) => ({
                                value,
                                unit: anchorUnits[index],
                              })) as NonNullable<
                                typeof entry.geometry
                              >["anchor"],
                              move: move.map((value, index) => ({
                                value,
                                unit: units[index],
                              })) as NonNullable<typeof entry.geometry>["move"],
                            },
                          }
                        : entry,
                    ),
                  };
                  onChange(saved);
                  setDraft(null);
                }}
              >
                {uiText("themeImageField.actions")}</button>
            </>
          }
        >
          <ThemeImagePicker
            label={uiText("themeImageField.label")}
            onChoose={(asset) => choose(asset, false)}
            onReplace={editable ? (asset) => choose(asset, true) : undefined}
          />
          <p className="theme-image-hint">{uiText("themeImageField.ThemeImageField2")}</p>
          <div className="theme-image-layers">
            {draft.layers.map((item, index) => (
              <div
                key={item.id}
                draggable
                onDragStart={(event) =>
                  event.dataTransfer.setData(
                    "application/x-theme-image-layer",
                    String(index),
                  )
                }
                onDragOver={(event) => {
                  if (
                    event.dataTransfer.types.includes(
                      "application/x-theme-image-layer",
                    )
                  )
                    event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const raw = event.dataTransfer.getData(
                    "application/x-theme-image-layer",
                  );
                  if (raw === "") return;
                  const from = Number(raw);
                  if (from === index || !draft.layers[from]) return;
                  setDraft(moveImageLayer(draft, from, index));
                  setSelected(index);
                }}
                className={index === selected ? "is-selected" : ""}
              >
                <span className="theme-image-grip" title={uiText("themeImageField.title2")}>
                  <GripVertical size={18} />
                </span>
                <span
                  className="theme-image-thumbnail"
                  style={{
                    backgroundImage: (() => {
                      const asset = assets?.images.find(
                        (asset) =>
                          item.image === `url(${JSON.stringify(asset.path)})`,
                      );
                      return asset
                        ? `url(${JSON.stringify(asset.url)})`
                        : item.image;
                    })(),
                  }}
                />
                <button
                  type="button"
                  className="theme-image-layer-name"
                  onClick={() => {
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            layers: current.layers.map((entry, n) =>
                              n === selected
                                ? {
                                    ...entry,
                                    basis: scale,
                                    geometry: {
                                      flow: false,
                                      compensation,
                                      alignment,
                                      anchor: anchor.map((value, a) => ({
                                        value,
                                        unit: anchorUnits[a],
                                      })) as NonNullable<
                                        typeof entry.geometry
                                      >["anchor"],
                                      move: move.map((value, a) => ({
                                        value,
                                        unit: units[a],
                                      })) as NonNullable<
                                        typeof entry.geometry
                                      >["move"],
                                    },
                                  }
                                : entry,
                            ),
                          }
                        : current,
                    );
                    setSelected(index);
                    const s = /^([\d.]+)px\s+([\d.]+)px$/.exec(item.size);
                    setRatio(s ? +s[1] / +s[2] : 1);
                  }}
                >
                  {/^url\(/i.test(item.image)
                    ? (assets?.images.find(
                        (asset) =>
                          item.image === `url(${JSON.stringify(asset.path)})` ||
                          item.image === `url(${JSON.stringify(asset.url)})`,
                      )?.name ?? uiText("themeImageField.ThemeImageField3"))
                    : /gradient\(/i.test(item.image)
                      ? uiText("themeImageField.ThemeImageField4")
                      : uiText("themeImageField.ThemeImageField5")}{" "}
                  {index + 1}
                </button>
                {/\burl\(/i.test(item.image) && (
                  <button
                    type="button"
                    aria-label={uiText("themeImageField.aria_label", { value: index + 1 })}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        layers: draft.layers.map((entry, n) =>
                          n === index
                            ? { ...entry, visible: entry.visible === false }
                            : entry,
                        ),
                      })
                    }
                  >
                    {item.visible === false ? (
                      <EyeOff size={18} />
                    ) : (
                      <Eye size={18} />
                    )}
                  </button>
                )}
                <button
                  type="button"
                  title={uiText("themeImageField.title3")}
                  aria-label={uiText("themeImageField.aria_label2", { value: index + 1 })}
                  disabled={index === 0}
                  onClick={() => {
                    setDraft(moveImageLayer(draft, index, index - 1));
                    setSelected(index - 1);
                  }}
                >
                  <ArrowUp size={18} />
                </button>
                <button
                  type="button"
                  title={uiText("themeImageField.title4")}
                  aria-label={uiText("themeImageField.aria_label3", { value: index + 1 })}
                  disabled={index === draft.layers.length - 1}
                  onClick={() => {
                    setDraft(moveImageLayer(draft, index, index + 1));
                    setSelected(index + 1);
                  }}
                >
                  <ArrowDown size={18} />
                </button>
                <button
                  type="button"
                  title={uiText("themeImageField.title5")}
                  aria-label={uiText("themeImageField.aria_label4", { value: index + 1 })}
                  disabled={!/^url\(/i.test(item.image)}
                  onClick={() => {
                    setDraft({
                      ...draft,
                      layers: draft.layers.filter((_, i) => i !== index),
                    });
                    setSelected(0);
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>
          {editable && layer && (
            <div className="theme-image-properties">
              {draft.layers.some((entry) =>
                /gradient\(/i.test(entry.image),
              ) && (
                <div className="theme-image-dimensions">
                  {[true, false].map((front) => (
                    <button
                      key={String(front)}
                      type="button"
                      onClick={() => {
                        const other = draft.layers.filter(
                          (entry) => entry.id !== layer.id,
                        );
                        const fills = other
                          .map((entry, index) =>
                            /gradient\(/i.test(entry.image) ? index : -1,
                          )
                          .filter((index) => index >= 0);
                        const index = front
                          ? fills[0]
                          : fills[fills.length - 1] + 1;
                        other.splice(index, 0, layer);
                        setDraft({ ...draft, layers: other });
                        setSelected(index);
                      }}
                    >
                      {front ? uiText("themeImageField.ThemeImageField6") : uiText("themeImageField.ThemeImageField7")}
                    </button>
                  ))}
                </div>
              )}
              <label>
                {uiText("themeImageField.ThemeImageField8")}<UiSelect
                  ariaLabel={uiText("themeImageField.ariaLabel3")}
                  value={
                    layer.repeat !== "no-repeat"
                      ? "tile"
                      : size
                        ? "custom"
                        : ["cover", "contain", "auto"].includes(layer.size)
                          ? layer.size
                          : "existing"
                  }
                  onValueChange={(selectedValue) => {
                    if (selectedValue === "tile")
                      update({
                        repeat: "repeat",
                        size: size ? layer.size : "auto",
                      });
                    else if (selectedValue === "custom") {
                      const asset = assets?.images.find(
                        (asset) =>
                          layer.image === `url(${JSON.stringify(asset.path)})`,
                      );
                      if (asset) {
                        const image = new Image();
                        image.onload = () => {
                          setRatio(image.naturalWidth / image.naturalHeight);
                          update({
                            size: `${image.naturalWidth}px ${image.naturalHeight}px`,
                            repeat: "no-repeat",
                          });
                        };
                        image.src = asset.url;
                      } else
                        update({ size: "100px 100px", repeat: "no-repeat" });
                    } else update({ size: selectedValue, repeat: "no-repeat" });
                  }}
                  options={[
                    ...(!size &&
                    !["cover", "contain", "auto"].includes(layer.size)
                      ? [
                          {
                            value: "existing",
                            label: uiText("themeImageField.options.label") + layer.size,
                          },
                        ]
                      : []),
                    { value: "auto", label: uiText("themeImageField.options.label2") },
                    { value: "contain", label: uiText("themeImageField.options.label3") },
                    { value: "cover", label: uiText("themeImageField.options.label4") },
                    { value: "tile", label: uiText("themeImageField.options.label5") },
                    { value: "custom", label: uiText("themeImageField.options.label6") },
                  ]}
                />
              </label>
              {size && (
                <div className="theme-image-dimensions">
                  <label>
                    {uiText("themeImageField.ThemeImageField9")}<ThemeNumberInput
                      label={uiText("themeImageField.label2")}
                      value={Number(size[1])}
                      onChange={(next) => {
                        if (next > 0) dimensions(0, next);
                      }}
                      onPreviewChange={(next) => {
                        if (next > 0) dimensions(0, next);
                      }}
                      min={1}
                    />
                    px
                  </label>
                  <button
                    type="button"
                    title={locked ? uiText("themeImageField.title6") : uiText("themeImageField.title7")}
                    aria-label={locked ? uiText("themeImageField.aria_label5") : uiText("themeImageField.aria_label6")}
                    onClick={() => {
                      setRatio(+size[1] / +size[2]);
                      setLocked(!locked);
                    }}
                  >
                    {locked ? <Link size={18} /> : <Link2Off size={18} />}
                  </button>
                  <label>
                    {uiText("themeImageField.ThemeImageField10")}<ThemeNumberInput
                      label={uiText("themeImageField.label3")}
                      value={Number(size[2])}
                      onChange={(next) => {
                        if (next > 0) dimensions(1, next);
                      }}
                      onPreviewChange={(next) => {
                        if (next > 0) dimensions(1, next);
                      }}
                      min={1}
                    />
                    px
                  </label>
                </div>
              )}
              {size && (
                <button
                  type="button"
                  onClick={() => {
                    const path = /^url\(["']?(.*?)["']?\)$/.exec(
                      layer.image,
                    )?.[1];
                    const asset = assets?.images.find(
                      (item) => item.path === path,
                    );
                    if (!asset) return;
                    const image = new Image();
                    image.onload = () => {
                      const nextRatio =
                        image.naturalWidth / image.naturalHeight;
                      setRatio(nextRatio);
                      setLocked(true);
                      update({
                        size: `${size[1]}px ${Number(size[1]) / nextRatio}px`,
                      });
                    };
                    image.onerror = () =>
                      setError(uiText("themeImageField.onClick"));
                    image.src = asset.url;
                  }}
                >
                  <RotateCcw size={18} />
                  {uiText("themeImageField.ThemeImageField11")}</button>
              )}
              <label>
                {uiText("themeImageField.ThemeImageField12")}<div className="theme-image-grid">
                  {["left", "center", "right"].flatMap((_, y) =>
                    ["left", "center", "right"].map((x, i) => {
                      const position = `${x} ${["top", "center", "bottom"][y]}`;
                      const label = [
                        uiText("themeImageField.ThemeImageField.label"),
                        uiText("themeImageField.ThemeImageField.label2"),
                        uiText("themeImageField.ThemeImageField.label3"),
                        uiText("themeImageField.ThemeImageField.label4"),
                        uiText("themeImageField.ThemeImageField.label5"),
                        uiText("themeImageField.ThemeImageField.label6"),
                        uiText("themeImageField.ThemeImageField.label7"),
                        uiText("themeImageField.ThemeImageField.label8"),
                        uiText("themeImageField.ThemeImageField.label9"),
                      ][y * 3 + i];
                      return (
                        <button
                          type="button"
                          key={position}
                          aria-label={label}
                          aria-pressed={
                            alignment[0] === i * 50 && alignment[1] === y * 50
                          }
                          className={
                            alignment[0] === i * 50 && alignment[1] === y * 50
                              ? "is-selected"
                              : undefined
                          }
                          onClick={() => {
                            setAlignment([i * 50, y * 50]);
                            setAnchor([i * 50, y * 50]);
                            setAnchorUnits(["%", "%"]);
                            setMove([0, 0]);
                            setCompensation([0, 0]);
                            update({ position });
                          }}
                        >
                          <span className="theme-image-position-symbol">
                            <span
                              style={{ left: `${i * 50}%`, top: `${y * 50}%` }}
                            />
                          </span>
                        </button>
                      );
                    }),
                  )}
                </div>
              </label>
              {size && (
                <section className="theme-image-coordinate">
                  <h4>{uiText("themeImageField.ThemeImageField13")}</h4>
                  {([uiText("themeImageField.ThemeImageField14"), uiText("themeImageField.ThemeImageField15")] as const).map((label, axis) => (
                    <label key={label}>
                      {label}
                      <ThemeNumberInput
                        label={uiText("themeImageField.label4", { label: label })}
                        value={Number(move[axis])}
                        onChange={(value) => changeMove(axis, value)}
                        onPreviewChange={(value) => changeMove(axis, value)}
                      />
                      <UiSelect
                        ariaLabel={uiText("themeImageField.ariaLabel", { label: label })}
                        value={units[axis]}
                        onValueChange={(selectedValue) =>
                          changeMoveUnit(axis, selectedValue as "px" | "%")
                        }
                        options={["px", "%"].map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </label>
                  ))}
                  <small>{uiText("themeImageField.ThemeImageField16")}</small>
                </section>
              )}
              {size && (
                <section className="theme-image-coordinate">
                  <h4>{uiText("themeImageField.ThemeImageField17")}</h4>
                  {([uiText("themeImageField.ThemeImageField18"), uiText("themeImageField.ThemeImageField19")] as const).map((label, axis) => (
                    <label key={label}>
                      {label}
                      <ThemeNumberInput
                        label={uiText("themeImageField.label5", { label: label })}
                        value={Number(anchor[axis])}
                        onChange={(value) => changeAnchor(axis, value)}
                        onPreviewChange={(value) => changeAnchor(axis, value)}
                      />
                      <UiSelect
                        ariaLabel={uiText("themeImageField.ariaLabel2", { label: label })}
                        value={anchorUnits[axis]}
                        onValueChange={(selectedValue) =>
                          changeAnchor(
                            axis,
                            anchor[axis],
                            selectedValue as "px" | "%",
                          )
                        }
                        options={["%", "px"].map((value) => ({
                          value,
                          label: value,
                        }))}
                      />
                    </label>
                  ))}
                </section>
              )}
              <label>
                {uiText("themeImageField.ThemeImageField20")}<UiSelect
                  ariaLabel={uiText("themeImageField.ariaLabel4")}
                  value={layer.repeat}
                  onValueChange={(selectedValue) =>
                    update({ repeat: selectedValue })
                  }
                  options={["no-repeat", "repeat", "repeat-x", "repeat-y"].map(
                    (value, i) => ({
                      value,
                      label: [uiText("themeImageField.options.label7"), uiText("themeImageField.options.label8"), uiText("themeImageField.options.label9"), uiText("themeImageField.options.label10")][i],
                    }),
                  )}
                />
              </label>
            </div>
          )}
          {!editable && layer && (
            <p className="theme-image-hint">{uiText("themeImageField.ThemeImageField21")}</p>
          )}
        </ThemeImageDialog>
      )}
    </div>
  );
}
