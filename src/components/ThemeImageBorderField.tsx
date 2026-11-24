import { ThemeImagePicker } from "./ThemeImagePicker.tsx";
import { ThemeImageDialog } from "./ThemeImageDialog.tsx";
import { UiSelect } from "./ui/Select.tsx";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";
import {
  resolveImageLengthCss,
  scaleImageLengthCss,
  type ImageScale,
} from "./themeImageValue.ts";
import { useState, useRef, useEffect } from "react";
import { ImagePlus, X } from "lucide-react";
import {
  type ThemeImageAsset,
  useThemeImageAssets,
} from "./ThemeImageAssets.tsx";

export function ThemeImageBorderField({
  disabled,
  value,
  onChange,
  scale,
  onPreviewChange,
  onPreviewCancel,
}: {
  disabled?: boolean;
  scale?: ImageScale;
  value: string;
  onChange: (value: string) => void;
  onPreviewChange?: (value: string) => void;
  onPreviewCancel?: () => void;
}) {
  const assets = useThemeImageAssets();
  const [originalWidth, setOriginalWidth] = useState<string | null>(null);
  const [originalOutset, setOriginalOutset] = useState<string | null>(null);
  const [sliceUnits, setSliceUnits] = useState<string[]>(["", "", "", ""]);
  const setUnit = (unit: string) => setSliceUnits([unit, unit, unit, unit]);
  const [linked, setLinked] = useState(false);
  const [imageSize, setImageSize] = useState<[number, number]>([100, 100]);
  const [open, setOpen] = useState(false),
    [source, setSource] = useState(""),
    [cuts, setCuts] = useState([20, 20, 20, 20]),
    [width, setWidth] = useState(12),
    [outset, setOutset] = useState(0),
    [fill, setFill] = useState(false),
    [repeat, setRepeat] = useState("stretch");
  const start = () => {
    if (!value || value === "none") {
      setSource("");
      setOriginalWidth(null);
      setOriginalOutset(null);
      setCuts([20, 20, 20, 20]);
      setUnit("");
      setFill(false);
      setWidth(12);
      setOutset(0);
      setRepeat("stretch");
      setOpen(true);
      return;
    }
    const style = document.createElement("div").style;
    style.borderImage = resolveImageLengthCss(value, scale);
    setSource(
      style.borderImageSource === "none" ? "" : style.borderImageSource,
    );
    const raw = style.borderImageSlice || "100%";
    setFill(raw.includes("fill"));
    const tokens = raw.replace("fill", "").trim().split(/\s+/);
    const unitTokens = tokens.map((token) => (token.endsWith("%") ? "%" : ""));
    setSliceUnits([
      unitTokens[0] ?? "",
      unitTokens[1] ?? unitTokens[0] ?? "",
      unitTokens[2] ?? unitTokens[0] ?? "",
      unitTokens[3] ?? unitTokens[1] ?? unitTokens[0] ?? "",
    ]);
    setOriginalWidth(
      /^[-\d.]+px$/.test(style.borderImageWidth)
        ? null
        : style.borderImageWidth,
    );
    setOriginalOutset(
      /^[-\d.]+px$/.test(style.borderImageOutset) ||
        style.borderImageOutset === "0"
        ? null
        : style.borderImageOutset,
    );
    const values = raw.replace("fill", "").trim().split(/\s+/).map(parseFloat);
    setCuts([
      values[0] || 0,
      values[1] ?? values[0] ?? 0,
      values[2] ?? values[0] ?? 0,
      values[3] ?? values[1] ?? values[0] ?? 0,
    ]);
    setRepeat(style.borderImageRepeat || "stretch");
    setWidth(
      Number.isFinite(parseFloat(style.borderImageWidth))
        ? parseFloat(style.borderImageWidth)
        : 12,
    );
    setOutset(parseFloat(style.borderImageOutset) || 0);
    setOpen(true);
  };
  const result = () =>
    `${source} ${cuts.map((n, i) => `${n}${sliceUnits[i]}`).join(" ")}${fill ? " fill" : ""} / ${originalWidth ?? scaleImageLengthCss(`${width}px`, scale)} / ${originalOutset ?? scaleImageLengthCss(`${outset}px`, scale)} ${repeat}`;
  const callbacks = useRef({ onPreviewChange, onPreviewCancel });
  callbacks.current = { onPreviewChange, onPreviewCancel };
  useEffect(() => {
    if (open && source) callbacks.current.onPreviewChange?.(result());
    else if (open) callbacks.current.onPreviewChange?.("none");
    else callbacks.current.onPreviewCancel?.();
  }, [
    open,
    source,
    cuts,
    sliceUnits,
    fill,
    width,
    outset,
    repeat,
    originalWidth,
    originalOutset,
  ]);
  useEffect(() => () => callbacks.current.onPreviewCancel?.(), []);
  const chooseImage = (asset: ThemeImageAsset) => {
    setSource(`url(${JSON.stringify(asset.path)})`);
    if (!source && asset.path.toLowerCase().endsWith(".svg")) {
      setUnit("%");
      setCuts([20, 20, 20, 20]);
    }
  };
  const apply = () => {
    onChange(source ? result() : "none");
    setOpen(false);
  };
  return (
    <div className="theme-image-field">
      <button
        type="button"
        aria-label="图片边框"
        onClick={start}
        disabled={disabled}
      >
        <ImagePlus size={18} />
        图片边框
      </button>
      {open && (
        <ThemeImageDialog
          title="图片边框"
          onClose={() => setOpen(false)}
          actions={
            <>
              <button type="button" onClick={() => setOpen(false)}>
                取消
              </button>
              <button
                type="button"
                disabled={!source && (!value || value === "none")}
                onClick={apply}
              >
                完成设置
              </button>
            </>
          }
        >
          <ThemeImagePicker
            label="边框图片"
            single
            onChoose={chooseImage}
            onReplace={source ? chooseImage : undefined}
          />
          {source && (
            <button
              type="button"
              onClick={() => {
                setSource("");
              }}
            >
              <X size={18} />
              移除图片
            </button>
          )}
          {!source && (
            <section>
              <h4>边框效果</h4>
              <p className="theme-image-hint">选择图片后预览。</p>
            </section>
          )}
          {source && (
            <div className="theme-image-border-workbench">
              <section>
                <h4>边缘切分</h4>
                <p className="theme-image-hint">
                  拖动分界线，保留四角形状。
                </p>{" "}
                <div className="theme-image-slice-preview">
                  <img
                    alt="边框切片预览"
                    src={
                      assets?.images.find(
                        (a) =>
                          `url(${JSON.stringify(a.path)})` === source ||
                          `url(${JSON.stringify(a.url)})` === source,
                      )?.url ?? /^url\(["']?(.*?)["']?\)$/.exec(source)?.[1]
                    }
                    onLoad={(e) =>
                      setImageSize([
                        e.currentTarget.naturalWidth,
                        e.currentTarget.naturalHeight,
                      ])
                    }
                  />
                  {cuts.map((cut, index) => {
                    const vertical = index % 2 === 1,
                      dimension = imageSize[vertical ? 0 : 1],
                      percent =
                        sliceUnits[index] === "%"
                          ? cut
                          : (cut / dimension) * 100;
                    return (
                      <button
                        key={index}
                        type="button"
                        aria-label={`拖动${["上", "右", "下", "左"][index]}切片`}
                        className={`theme-image-slice-line ${vertical ? "is-vertical" : "is-horizontal"}`}
                        style={{
                          [["top", "right", "bottom", "left"][index]]:
                            `${percent}%`,
                          transform:
                            index === 1
                              ? "translateX(50%)"
                              : index === 2
                                ? "translateY(50%)"
                                : undefined,
                        }}
                        onKeyDown={(e) => {
                          if (
                            ![
                              "ArrowUp",
                              "ArrowDown",
                              "ArrowLeft",
                              "ArrowRight",
                            ].includes(e.key)
                          )
                            return;
                          e.preventDefault();
                          const delta =
                            (e.key === "ArrowDown" || e.key === "ArrowRight"
                              ? 1
                              : -1) * (index === 1 || index === 2 ? -1 : 1);
                          setCuts((current) =>
                            current.map((n, i) =>
                              linked || i === index
                                ? Math.max(
                                    0,
                                    Math.min(
                                      sliceUnits[index] === "%"
                                        ? 100
                                        : dimension,
                                      n + delta,
                                    ),
                                  )
                                : n,
                            ),
                          );
                        }}
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                        }}
                        onPointerMove={(e) => {
                          if (!e.currentTarget.hasPointerCapture(e.pointerId))
                            return;
                          const rect =
                            e.currentTarget.parentElement!.getBoundingClientRect();
                          const fraction =
                            index === 0
                              ? (e.clientY - rect.top) / rect.height
                              : index === 1
                                ? (rect.right - e.clientX) / rect.width
                                : index === 2
                                  ? (rect.bottom - e.clientY) / rect.height
                                  : (e.clientX - rect.left) / rect.width;
                          const next = Math.round(
                            Math.max(0, Math.min(1, fraction)) *
                              (sliceUnits[index] === "%" ? 100 : dimension),
                          );
                          setCuts((current) =>
                            current.map((n, i) =>
                              linked || i === index ? next : n,
                            ),
                          );
                        }}
                        onPointerUp={(e) =>
                          e.currentTarget.releasePointerCapture(e.pointerId)
                        }
                      ></button>
                    );
                  })}
                </div>
                <fieldset
                  className="theme-image-cuts"
                  aria-label="边缘切分数值"
                >
                  <label>
                    四边联动
                    <input
                      type="checkbox"
                      checked={linked}
                      onChange={(e) => setLinked(e.target.checked)}
                    />
                  </label>
                  {["上", "右", "下", "左"].map((label, index) => (
                    <label key={label} className={`theme-image-cut-${index}`}>
                      {label}
                      <ThemeNumberInput
                        label={`切片${label}`}
                        value={Number(cuts[index])}
                        onChange={(next) =>
                          setCuts(
                            cuts.map((n, i) =>
                              linked || i === index ? next : n,
                            ),
                          )
                        }
                        onPreviewChange={(next) =>
                          setCuts(
                            cuts.map((n, i) =>
                              linked || i === index ? next : n,
                            ),
                          )
                        }
                        min={0}
                      />
                    </label>
                  ))}
                  <UiSelect
                    ariaLabel="切片单位"
                    value={
                      new Set(sliceUnits).size === 1 ? sliceUnits[0] : "mixed"
                    }
                    onValueChange={(selectedValue) => {
                      const next = selectedValue;
                      setCuts(
                        cuts.map((n, i) =>
                          Number(
                            (next === "%"
                              ? (n / imageSize[i % 2 === 1 ? 0 : 1]) * 100
                              : (n / 100) * imageSize[i % 2 === 1 ? 0 : 1]
                            ).toFixed(2),
                          ),
                        ),
                      );
                      setUnit(next);
                    }}
                    options={[
                      { value: "mixed", label: "混合单位", disabled: true },
                      { value: "", label: "原图单位" },
                      { value: "%", label: "百分比" },
                    ]}
                  />
                </fieldset>
              </section>
            </div>
          )}
          <label>
            边框粗细
            <input
              aria-label="图片边框厚度"
              type="number"
              min="0"
              value={originalWidth !== null ? "" : width}
              placeholder={originalWidth !== null ? "沿用现有" : ""}
              onChange={(e) => {
                setOriginalWidth(null);
                setWidth(Number(e.target.value));
              }}
            />
            px
          </label>
          <label>
            边缘显示
            <UiSelect
              ariaLabel="边缘重复"
              value={repeat}
              onValueChange={(selectedValue) => setRepeat(selectedValue)}
              options={[
                ...(!["stretch", "repeat", "round"].includes(repeat)
                  ? [{ value: repeat, label: "当前重复方式" }]
                  : []),
                { value: "stretch", label: "拉伸" },
                { value: "repeat", label: "重复" },
                { value: "round", label: "整段重复" },
              ]}
            />
          </label>
          <label>
            填充内部
            <input
              type="checkbox"
              checked={fill}
              onChange={(e) => setFill(e.target.checked)}
            />
          </label>
          <details>
            <summary>向外延伸</summary>
            <p className="theme-image-hint">向外绘制，不增加事件间距。</p>
            <input
              aria-label="边框外扩"
              type="number"
              min="0"
              value={originalOutset !== null ? "" : outset}
              placeholder={originalOutset !== null ? "沿用现有" : ""}
              onChange={(e) => {
                setOriginalOutset(null);
                setOutset(Number(e.target.value));
              }}
            />
            px
          </details>
        </ThemeImageDialog>
      )}
    </div>
  );
}
