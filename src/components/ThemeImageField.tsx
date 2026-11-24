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
      setError("背景由 CSS 控制，请在高级编辑中调整。");
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
    image.onerror = () => setError("图片未能载入，请重新选择素材。");
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
        图片背景
      </button>
      {error && <p role="status">{error}</p>}
      {draft && (
        <ThemeImageDialog
          title="图片背景"
          onClose={() => setDraft(null)}
          actions={
            <>
              <button type="button" onClick={() => setDraft(null)}>
                取消
              </button>
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
                完成设置
              </button>
            </>
          }
        >
          <ThemeImagePicker
            label="图片素材"
            onChoose={(asset) => choose(asset, false)}
            onReplace={editable ? (asset) => choose(asset, true) : undefined}
          />
          <p className="theme-image-hint">上面的图层覆盖下面的图层。</p>
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
                <span className="theme-image-grip" title="拖动排序">
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
                      )?.name ?? "图片")
                    : /gradient\(/i.test(item.image)
                      ? "渐变"
                      : "背景"}{" "}
                  {index + 1}
                </button>
                {/\burl\(/i.test(item.image) && (
                  <button
                    type="button"
                    aria-label={`显示或隐藏图层 ${index + 1}`}
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
                  title="上移"
                  aria-label={`上移图层 ${index + 1}`}
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
                  title="下移"
                  aria-label={`下移图层 ${index + 1}`}
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
                  title="移除图片"
                  aria-label={`移除图片 ${index + 1}`}
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
                      {front ? "置于填充前" : "置于填充后"}
                    </button>
                  ))}
                </div>
              )}
              <label>
                显示方式
                <UiSelect
                  ariaLabel="显示方式"
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
                            label: "现有设置：" + layer.size,
                          },
                        ]
                      : []),
                    { value: "auto", label: "原始大小" },
                    { value: "contain", label: "完整显示" },
                    { value: "cover", label: "铺满" },
                    { value: "tile", label: "平铺" },
                    { value: "custom", label: "自定义尺寸" },
                  ]}
                />
              </label>
              {size && (
                <div className="theme-image-dimensions">
                  <label>
                    宽
                    <ThemeNumberInput
                      label={"图片宽度"}
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
                    title={locked ? "解除比例" : "锁定比例"}
                    aria-label={locked ? "解除比例" : "锁定比例"}
                    onClick={() => {
                      setRatio(+size[1] / +size[2]);
                      setLocked(!locked);
                    }}
                  >
                    {locked ? <Link size={18} /> : <Link2Off size={18} />}
                  </button>
                  <label>
                    高
                    <ThemeNumberInput
                      label={"图片高度"}
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
                      setError("图片未能载入，请重新选择素材。");
                    image.src = asset.url;
                  }}
                >
                  <RotateCcw size={18} />
                  恢复原图比例
                </button>
              )}
              <label>
                图片位置
                <div className="theme-image-grid">
                  {["left", "center", "right"].flatMap((_, y) =>
                    ["left", "center", "right"].map((x, i) => {
                      const position = `${x} ${["top", "center", "bottom"][y]}`;
                      const label = [
                        "左上",
                        "上中",
                        "右上",
                        "左中",
                        "居中",
                        "右中",
                        "左下",
                        "下中",
                        "右下",
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
                  <h4>移动</h4>
                  {(["左右", "上下"] as const).map((label, axis) => (
                    <label key={label}>
                      {label}
                      <ThemeNumberInput
                        label={`图片${label}移动`}
                        value={Number(move[axis])}
                        onChange={(value) => changeMove(axis, value)}
                        onPreviewChange={(value) => changeMove(axis, value)}
                      />
                      <UiSelect
                        ariaLabel={`${label}移动单位`}
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
                  <small>百分比相对参照区域。</small>
                </section>
              )}
              {size && (
                <section className="theme-image-coordinate">
                  <h4>图片锚点</h4>
                  {(["横向", "纵向"] as const).map((label, axis) => (
                    <label key={label}>
                      {label}
                      <ThemeNumberInput
                        label={`图片锚点${label}`}
                        value={Number(anchor[axis])}
                        onChange={(value) => changeAnchor(axis, value)}
                        onPreviewChange={(value) => changeAnchor(axis, value)}
                      />
                      <UiSelect
                        ariaLabel={`${label}锚点单位`}
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
                平铺
                <UiSelect
                  ariaLabel="平铺"
                  value={layer.repeat}
                  onValueChange={(selectedValue) =>
                    update({ repeat: selectedValue })
                  }
                  options={["no-repeat", "repeat", "repeat-x", "repeat-y"].map(
                    (value, i) => ({
                      value,
                      label: ["不平铺", "全部", "横向", "纵向"][i],
                    }),
                  )}
                />
              </label>
            </div>
          )}
          {!editable && layer && (
            <p className="theme-image-hint">渐变与底色在背景填充中调整。</p>
          )}
        </ThemeImageDialog>
      )}
    </div>
  );
}
