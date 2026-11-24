import { uiText } from "../i18n/index.ts";
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
  fontWeight: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.fontWeight"), 100, 900, 100],
  fontSize: [uiText("common.fontSize"), 0, 640, 0.5],
  lineHeight: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.lineHeight"), 0, 640, 0.1],
  paddingX: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.paddingX"), 0, 640, 0.5],
  paddingY: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.paddingY"), 0, 640, 0.5],
  marginX: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.marginX"), -640, 640, 0.5],
  marginY: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.marginY"), -640, 640, 0.5],
  gap: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.gap"), 0, 640, 0.5],
  width: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.width"), 0, 2048, 0.5],
  height: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.height"), 0, 2048, 0.5],
  borderWidth: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.borderWidth"), 0, 80, 0.5],
  borderRadius: [uiText("themeVisualPropertyField.THEME_NUMBER_FIELDS.borderRadius"), 0, 640, 0.5],
};
const labels: Partial<Record<NativeVisualProperty, string>> = {
  visible: uiText("themeVisualPropertyField.labels.visible"),
  fontFamily: uiText("common.font"),
  color: uiText("common.color"),
  background: uiText("themeVisualPropertyField.labels.background"),
  borderImage: uiText("themeVisualPropertyField.labels.borderImage"),
  borderColor: uiText("themeVisualPropertyField.labels.borderColor"),
};
const groupLabels: Record<string, string> = {
  display: uiText("themeVisualPropertyField.groupLabels.display"),
  typography: uiText("themeVisualPropertyField.groupLabels.typography"),
  surface: uiText("themeVisualPropertyField.groupLabels.surface"),
  spacing: uiText("themeVisualPropertyField.groupLabels.spacing"),
  border: uiText("themeVisualPropertyField.groupLabels.border"),
  layout: uiText("themeVisualPropertyField.groupLabels.layout"),
  media: uiText("themeVisualPropertyField.groupLabels.media"),
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
      <strong>{uiText("themeVisualPropertyField.ThemeVisualPropertyField.input")}</strong>
    ) : missing ? (
      <span>{uiText("themeVisualPropertyField.ThemeVisualPropertyField.input2")}</span>
    ) : property === "visible" ? (
      <SettingsChoiceControl label={label} value={blank ? undefined : value === false ? "hidden" : "visible"}
        options={[{ value: "visible", label: uiText("common.show") }, { value: "hidden", label: uiText("common.hide") }]}
        onChange={next => onChange(next === "visible")} />
    ) : property === "fontFamily" ? (
      <SettingsFontFamilySelect
        emptyLabel={mixed ? uiText("themeVisualPropertyField.emptyLabel") : uiText("themeVisualPropertyField.emptyLabel2")}
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
          label={uiText("themeVisualPropertyField.label", { label: label })}
          min={min}
          max={max}
          step={step}
          value={blank || typeof value !== "number" ? undefined : value}
          placeholder={mixed ? uiText("themeVisualPropertyField.placeholder") : undefined}
          onChange={onChange}
          onPreviewChange={onPreviewChange}
          onPreviewCancel={onPreviewCancel}
        />
        {unit && <span>{unit}</span>}
      </div>
      {property === "fontWeight" && <SettingsChoiceControl label={uiText("themeVisualPropertyField.label2")} value={blank || typeof value !== "number" ? undefined : value}
        options={[{ value: 400, label: uiText("themeVisualPropertyField.options.label") }, { value: 500, label: uiText("themeVisualPropertyField.options.label2") }, { value: 700, label: uiText("themeVisualPropertyField.options.label3") }]} onChange={onChange} />}</>
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
              title={uiText("themeVisualPropertyField.title")}
              aria-label={uiText("themeVisualPropertyField.aria_label")}
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
          {uiText("themeVisualPropertyField.ThemeVisualPropertyField")}{property === "background" ? uiText("themeVisualPropertyField.ThemeVisualPropertyField2") : uiText("themeVisualPropertyField.ThemeVisualPropertyField3")}
          {uiText("themeVisualPropertyField.ThemeVisualPropertyField4")}</small>
      )}
    </div>
  );
}
