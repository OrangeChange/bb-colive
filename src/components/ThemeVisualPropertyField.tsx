import {
  imageBackgroundCss,
  isImageBackgroundDraft,
  readImageBackground,
  resolveImageLengthCss,
  mergeImageBackground,
} from "./themeImageValue.ts";
import { ThemeImageBorderField } from "./ThemeImageBorderField.tsx";
import { ThemeNumberInput } from "./ThemeNumberInput.tsx";
import { RotateCcw } from "lucide-react";
import { useRef } from "react";
import { parseThemeColor } from "./themeColorValue.ts";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { ThemeColorField } from "./ThemeColorField.tsx";
import { ThemeBackgroundField } from "./ThemeBackgroundField.tsx";
import { ThemeImageField } from "./ThemeImageField.tsx";
import { SettingsFontFamilySelect } from "./SettingsListSelect.tsx";
import type {
  NativeVisualProperty,
  NativeVisualValue,
} from "../themes/nativeComponentAppearance.ts";
import { NATIVE_PROPERTY_GROUPS } from "../themes/nativeThemeCapabilities.ts";

export const THEME_NUMBER_FIELDS: Partial<
  Record<NativeVisualProperty, readonly [string, number, number, number]>
> = {
  fontWeight: ["字重", 100, 900, 100],
  fontSize: ["字号", 0, 640, 0.5],
  lineHeight: ["行高", 0, 640, 0.1],
  paddingX: ["水平内边距", 0, 640, 0.5],
  paddingY: ["垂直内边距", 0, 640, 0.5],
  marginX: ["水平外边距", -640, 640, 0.5],
  marginY: ["垂直外边距", -640, 640, 0.5],
  gap: ["元素间距", 0, 640, 0.5],
  width: ["宽度", 0, 2048, 0.5],
  height: ["高度", 0, 2048, 0.5],
  borderWidth: ["边框宽度", 0, 80, 0.5],
  borderRadius: ["圆角", 0, 640, 0.5],
};
const labels: Partial<Record<NativeVisualProperty, string>> = {
  visible: "可见性",
  fontFamily: "字体",
  color: "颜色",
  background: "背景填充",
  borderImage: "图片边框",
  borderColor: "边框颜色",
};
const groupLabels: Record<string, string> = {
  display: "可见性",
  typography: "文字",
  surface: "颜色与背景",
  spacing: "间距",
  border: "边框",
  layout: "排版",
  media: "媒体",
};
export function themeVisualPropertyGroups(
  properties: readonly NativeVisualProperty[],
) {
  return Object.entries(NATIVE_PROPERTY_GROUPS)
    .map(([id, fields]) => ({
      id,
      label: groupLabels[id],
      properties: fields.filter((property) => properties.includes(property)),
    }))
    .filter((group) => group.properties.length);
}
export function ThemeVisualPropertyField({
  property,
  label: customLabel,
  value,
  status,
  controlled = false,
  mixed = false,
  missing = false,
  unit,
  fontFamilyOptions,
  onOpenFonts,
  onChange: commitChange,
  onPreviewChange: previewChange,
  onPreviewCancel: cancelPreview,
  onRestore,
  limits,
  allowGradient = true,
  imageScale,
  imageAvailable = true,
  saved = false,
}: {
  property: NativeVisualProperty;
  label?: string;
  value: unknown;
  status: string;
  controlled?: boolean;
  mixed?: boolean;
  missing?: boolean;
  unit?: string;
  fontFamilyOptions: string[];
  onOpenFonts: () => void;
  onChange: (value: NativeVisualValue) => void;
  onPreviewChange: (value: NativeVisualValue) => void;
  onPreviewCancel?: () => void;
  onRestore?: () => void;
  limits?: readonly [number, number, number];
  allowGradient?: boolean;
  imageAvailable?: boolean;
  saved?: boolean;
  imageScale?: { variable: string; value: number };
}) {
  const inheritedValue = useRef<{ value: unknown } | null>(null);
  const previewing = useRef(false);
  if (!previewing.current && !onRestore && !mixed && !missing && !controlled) inheritedValue.current = { value };
  if (saved && onRestore) inheritedValue.current = null;
  const sameValue = (left: unknown, right: unknown) => {
    if (Object.is(left, right)) return true;
    if (["color", "borderColor", "background"].includes(property) && typeof left === "string" && typeof right === "string") {
      const a = parseThemeColor(left), b = parseThemeColor(right);
      return Boolean(a && b && a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a);
    }
    return false;
  };
  const onChange = (next: NativeVisualValue) => {
    const hadPreview = previewing.current;
    try {
      if (inheritedValue.current && sameValue(next, inheritedValue.current.value)) {
        onRestore?.();
        return;
      }
      if (!hadPreview && !mixed && sameValue(next, value)) return;
      commitChange(next);
    } finally {
      previewing.current = false;
      if (hadPreview) cancelPreview?.();
    }
  };
  const onPreviewChange = (next: NativeVisualValue) => {
    previewing.current = true;
    previewChange(next);
  };
  const onPreviewCancel = () => {
    previewing.current = false;
    cancelPreview?.();
  };
  const label =
    customLabel ??
    labels[property] ??
    THEME_NUMBER_FIELDS[property]?.[0] ??
    property;
  const backgroundChange = (next: string, preview = false) => {
    if (!isImageBackgroundDraft(value)) {
      (preview ? onPreviewChange : onChange)(next);
      return;
    }
    const style = document.createElement("div").style;
    style.background = resolveImageLengthCss(next, imageScale);
    const parsed = readImageBackground(style);
    (preview ? onPreviewChange : onChange)(mergeImageBackground(value, parsed));
  };
  const number = THEME_NUMBER_FIELDS[property];
  const [min, max, step] =
    limits ?? (number ? [number[1], number[2], number[3]] : [0, 640, 0.5]);
  const blank = mixed || missing;
  const input =
    property === "borderImage" ? (
      <ThemeImageBorderField
        disabled={controlled || missing || !imageAvailable}
        scale={imageScale}
        value={mixed ? "none" : String(value ?? "none")}
        onChange={onChange}
        onPreviewChange={onPreviewChange}
        onPreviewCancel={onPreviewCancel}
      />
    ) : controlled ? (
      <strong>由 CSS 控制</strong>
    ) : missing ? (
      <span>当前样例没有此部件</span>
    ) : property === "visible" ? (
      <SettingsChoiceControl label={label} value={blank ? undefined : value === false ? "hidden" : "visible"}
        options={[{ value: "visible", label: "显示" }, { value: "hidden", label: "隐藏" }]}
        onChange={next => onChange(next === "visible")} />
    ) : property === "fontFamily" ? (
      <SettingsFontFamilySelect
        emptyLabel={mixed ? "混合值" : "继承主题"}
        options={fontFamilyOptions}
        value={blank ? "" : String(value ?? "")}
        onChange={onChange}
        onOpen={onOpenFonts}
      />
    ) : property === "background" && allowGradient ? (
      <ThemeBackgroundField
        label={label}
        mixed={mixed}
        value={mixed ? "transparent" : imageBackgroundCss(value)}
        onChange={(next) => backgroundChange(next)}
        onPreviewChange={(next) => backgroundChange(next, true)}
        onPreviewCancel={onPreviewCancel}
      />
    ) : ["color", "background", "borderColor"].includes(property) ? (
      <ThemeColorField
        label={label}
        mixed={mixed}
        value={mixed ? "" : imageBackgroundCss(value)}
        onChange={onChange}
        onPreviewChange={onPreviewChange}
        onPreviewCancel={onPreviewCancel}
      />
    ) : (
      <><div className="native-number-control">
        <ThemeNumberInput
          label={`${label}精确值`}
          min={min}
          max={max}
          step={step}
          value={blank || typeof value !== "number" ? undefined : value}
          placeholder={mixed ? "混合值" : undefined}
          onChange={onChange}
          onPreviewChange={onPreviewChange}
          onPreviewCancel={onPreviewCancel}
        />
        {unit && <span>{unit}</span>}
      </div>
      {property === "fontWeight" && <SettingsChoiceControl label="常用字重" value={blank || typeof value !== "number" ? undefined : value}
        options={[{ value: 400, label: "常规" }, { value: 500, label: "中等" }, { value: 700, label: "粗体" }]} onChange={onChange} />}</>
    );
  return (
    <div className={`native-property-group is-${property}`}>
      <div className={`native-property-field is-${property}`}>
        <span className="native-property-label">
          {label}
          <small>{status}</small>
        </span>
        <div>
          {input}
          {onRestore && (
            <button
              type="button"
              className="native-property-restore"
              title="恢复继承"
              aria-label="恢复继承"
              onClick={onRestore}
            >
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
      {property === "background" && allowGradient && (
        <ThemeImageField
          disabled={controlled || missing || !imageAvailable}
          scale={imageScale}
          value={
            mixed
              ? "transparent"
              : isImageBackgroundDraft(value)
                ? value
                : imageBackgroundCss(value)
          }
          onChange={onChange}
          onPreviewChange={onPreviewChange}
          onPreviewCancel={onPreviewCancel}
        />
      )}
      {mixed && (property === "background" || property === "borderImage") && (
        <small>
          完成后统一此范围的{property === "background" ? "背景" : "图片边框"}
          设置。
        </small>
      )}
    </div>
  );
}
