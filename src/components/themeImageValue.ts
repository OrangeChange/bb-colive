import { parseBackground } from "./themeBackgroundValue.ts";

export type ImageLength = { value: number; unit: "%" | "px" };
export interface ImageScale {
  variable: string;
  value: number;
}
export function scaleImageLengthCss(text: string, scale?: ImageScale): string {
  return scale
    ? text.replace(
        /(-?(?:\d*\.)?\d+)px/g,
        (_, number) =>
          `calc(var(${scale.variable}, ${scale.value}${scale.variable === "--blc-g" ? "" : "px"}) * ${Number(number) / scale.value}${scale.variable === "--blc-g" ? "px" : ""})`,
      )
    : text;
}
export function resolveImageLengthCss(
  text: string,
  scale?: ImageScale,
): string {
  return text.replace(
    /calc\(var\((--event-font-size|--event-base-size|--blc-g),\s*([\d.]+)(?:px)?\)\s*\*\s*([+-]?[\d.]+)(px)?\)/g,
    (_, variable, fallback, ratio) =>
      `${Number(ratio) * (scale && scale.variable === variable ? scale.value : Number(fallback))}px`,
  );
}
export function backgroundAnchorPosition(
  alignment: number,
  anchor: ImageLength,
  move: ImageLength,
  imageSize: number,
  compensation = 0,
): string {
  const percent = alignment + (move.unit === "%" ? move.value : 0);
  const anchorPixels =
    anchor.unit === "%" ? (imageSize * anchor.value) / 100 : anchor.value;
  const pixels =
    (imageSize * percent) / 100 -
    anchorPixels +
    (move.unit === "px" ? move.value : 0) +
    compensation;
  return `calc(${percent}% + ${Number(pixels.toFixed(6))}px)`;
}
export interface ImagePosition {
  compensation?: [number, number];
  alignment: [number, number];
  anchor: [ImageLength, ImageLength];
  move: [ImageLength, ImageLength];
  flow: boolean;
}

/** Position percentages use the containing block; anchor percentages use the image box. */
export function imagePositionCss(value: ImagePosition): Record<string, string> {
  const length = (v: ImageLength, sign = 1) => `${v.value * sign}${v.unit}`;
  const movement = (axis: number) =>
    value.compensation?.[axis]
      ? `calc(${length(value.move[axis])} + ${value.compensation[axis]}px)`
      : length(value.move[axis]);
  return {
    position: value.flow ? "relative" : "absolute",
    left: value.flow
      ? movement(0)
      : `calc(${value.alignment[0]}% + ${movement(0)})`,
    top: value.flow
      ? movement(1)
      : `calc(${value.alignment[1]}% + ${movement(1)})`,
    transformBox: "border-box",
    transform: `translate(${length(value.anchor[0], -1)}, ${length(value.anchor[1], -1)})`,
  };
}

export interface ImageBackgroundLayer {
  visible?: boolean;
  geometry?: ImagePosition;
  basis?: { variable: string; value: number };
  id: string;
  image: string;
  size: string;
  position: string;
  repeat: string;
  origin: string;
  clip: string;
  attachment: string;
}
export interface ImageBackgroundDraft {
  kind?: "image-background";
  layers: ImageBackgroundLayer[];
  color: string;
}

export function mergeImageBackground(
  original: ImageBackgroundDraft,
  parsed: ImageBackgroundDraft,
): ImageBackgroundDraft {
  const available = original.layers.filter((layer) => layer.visible !== false);
  const used = new Set<string>();
  const layers = parsed.layers.map((layer) => {
    const image = /^url\(/i.test(layer.image);
    const previous =
      available.find(
        (item) => !used.has(item.id) && item.image === layer.image,
      ) ??
      (!image
        ? available.find(
            (item) => !used.has(item.id) && !/^url\(/i.test(item.image),
          )
        : undefined);
    if (!previous) return { ...layer, id: crypto.randomUUID() };
    used.add(previous.id);
    return image ? { ...previous } : { ...layer, id: previous.id };
  });
  original.layers.forEach((layer, index) => {
    if (layer.visible === false)
      layers.splice(Math.min(index, layers.length), 0, layer);
  });
  return { ...parsed, kind: "image-background", layers };
}
type BackgroundStyle = Pick<
  CSSStyleDeclaration,
  | "backgroundImage"
  | "backgroundColor"
  | "backgroundSize"
  | "backgroundPosition"
  | "backgroundRepeat"
  | "backgroundOrigin"
  | "backgroundClip"
  | "backgroundAttachment"
>;
const fields = {
  size: "backgroundSize",
  position: "backgroundPosition",
  repeat: "backgroundRepeat",
  origin: "backgroundOrigin",
  clip: "backgroundClip",
  attachment: "backgroundAttachment",
} as const;
const defaults = {
  size: "auto",
  position: "0% 0%",
  repeat: "repeat",
  origin: "padding-box",
  clip: "border-box",
  attachment: "scroll",
};

export function readImageBackground(
  style: BackgroundStyle,
): ImageBackgroundDraft {
  const images =
    !style.backgroundImage ||
    ["none", "initial", "unset"].includes(style.backgroundImage)
      ? []
      : parseBackground(style.backgroundImage).layers;
  const lists = Object.fromEntries(
    Object.entries(fields).map(([key, prop]) => [
      key,
      parseBackground(
        !style[prop] || style[prop] === "initial"
          ? defaults[key as keyof typeof defaults]
          : style[prop],
      ).layers,
    ]),
  ) as Record<keyof typeof fields, string[]>;
  return {
    color: style.backgroundColor || "transparent",
    layers: images.map(
      (image, index) =>
        ({
          id: `image-${index}`,
          image,
          ...Object.fromEntries(
            Object.keys(fields).map((key) => {
              const values = lists[key as keyof typeof fields];
              return [key, values[index % values.length]];
            }),
          ),
        }) as ImageBackgroundLayer,
    ),
  };
}

export function writeImageBackground(
  draft: ImageBackgroundDraft,
): Record<string, string> {
  return {
    backgroundImage:
      draft.layers.map((layer) => layer.image).join(", ") || "none",
    backgroundColor: draft.color,
    ...Object.fromEntries(
      Object.entries(fields).map(([key, prop]) => [
        prop,
        draft.layers
          .map((layer) => layer[key as keyof typeof fields])
          .join(", ") || defaults[key as keyof typeof defaults],
      ]),
    ),
  };
}

export function moveImageLayer(
  draft: ImageBackgroundDraft,
  from: number,
  to: number,
): ImageBackgroundDraft {
  const layers = [...draft.layers];
  const [layer] = layers.splice(from, 1);
  layers.splice(to, 0, layer);
  return { ...draft, layers };
}

export function serializeImageBackground(draft: ImageBackgroundDraft): string {
  const layers = draft.layers.filter((layer) => layer.visible !== false);
  if (!layers.length) return draft.color;
  return layers
    .map(
      (layer, index) =>
        `${layer.image} ${layer.position} / ${layer.size} ${layer.repeat} ${layer.attachment} ${layer.origin} ${layer.clip}${index === layers.length - 1 ? ` ${draft.color}` : ""}`,
    )
    .join(", ");
}

export function isImageBackgroundDraft(
  value: unknown,
): value is ImageBackgroundDraft {
  return (
    !!value &&
    typeof value === "object" &&
    "layers" in value &&
    Array.isArray(value.layers) &&
    "color" in value
  );
}
export function imageBackgroundCss(value: unknown): string {
  return isImageBackgroundDraft(value)
    ? serializeImageBackground(value)
    : String(value ?? "transparent");
}
