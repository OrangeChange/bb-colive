import valueParser from "postcss-value-parser";
import { parseThemeColor, serializeThemeColor } from "./themeColorValue.ts";

export type GradientStop = {
  color: string;
  position: number;
  unit: "%" | "px";
};
export type BackgroundGradient = {
  kind: "linear" | "radial";
  angle: number;
  shape: "circle" | "ellipse";
  extent: string;
  center: [number, number];
  stops: GradientStop[];
};
export type BackgroundLayers = { layers: string[] };

function split(value: string, separator: "," | " ") {
  const nodes = valueParser(value).nodes;
  const groups: string[] = [];
  let group = "";
  for (const node of nodes) {
    if (
      (separator === "," && node.type === "div" && node.value === ",") ||
      (separator === " " && node.type === "space")
    ) {
      if (group.trim()) groups.push(group.trim());
      group = "";
    } else group += valueParser.stringify(node);
  }
  if (group.trim()) groups.push(group.trim());
  return groups;
}
export function parseBackground(value: string): BackgroundLayers {
  return { layers: split(value, ",") };
}
export function hasBackgroundImage(value: string): boolean {
  let found = false;
  valueParser(value).walk((node) => {
    if (
      node.type === "function" &&
      /^(url|(?:-webkit-)?image-set|image|cross-fade)$/i.test(node.value)
    )
      found = true;
  });
  return found;
}
function gradientNode(layer: string) {
  return valueParser(layer).nodes.find(
    (node) =>
      node.type === "function" &&
      /^(linear|radial)-gradient$/i.test(node.value),
  );
}
export function parseGradient(layer: string): BackgroundGradient | null {
  const node = gradientNode(layer);
  if (!node || node.type !== "function") return null;
  const args = split(valueParser.stringify(node.nodes), ",");
  const model: BackgroundGradient = {
    kind: node.value.toLowerCase() === "linear-gradient" ? "linear" : "radial",
    angle: 180,
    shape: "ellipse",
    extent: "",
    center: [50, 50],
    stops: [],
  };
  const directions: Record<string, number> = {
    "to top": 0,
    "to top right": 45,
    "to right top": 45,
    "to right": 90,
    "to bottom right": 135,
    "to right bottom": 135,
    "to bottom": 180,
    "to bottom left": 225,
    "to left bottom": 225,
    "to left": 270,
    "to top left": 315,
    "to left top": 315,
  };
  if (model.kind === "linear") {
    const direction = args[0]?.match(/^(-?[\d.]+)(deg|turn|rad|grad)$/);
    if (direction) {
      model.angle =
        Number(direction[1]) *
        { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 }[direction[2]]!;
      args.shift();
    } else if (args[0] in directions) {
      if (args[0].split(" ").length > 2) return null;
      model.angle = directions[args.shift()!];
    }
  } else if (/^(circle|ellipse|closest-|farthest-|at\b)/.test(args[0] ?? "")) {
    const header = args.shift()!;
    const match = header.match(
      /^(?:(circle|ellipse)\s*)?((?:closest|farthest)-(?:side|corner))?(?:\s*at\s+(-?[\d.]+)%\s+(-?[\d.]+)%)?$/,
    );
    if (!match) return null;
    model.shape = (match[1] as "circle" | "ellipse") || "ellipse";
    model.extent = match[2] || "";
    if (match[3]) model.center = [Number(match[3]), Number(match[4])];
  }
  const stops: { color: string; position?: number; unit: "%" | "px" }[] = [];
  for (const arg of args) {
    const parts = split(arg, " ");
    const last = parts[parts.length - 1]?.match(/^(-?[\d.]+)(%|px)$/);
    if (last) parts.pop();
    if (
      parts.length !== 1 ||
      !/^(#[\da-f]{3,8}|[a-z]+|(?:rgba?|hsla?|color|oklch|oklab|lab|lch|var|color-mix)\(.+\))$/i.test(
        parts[0],
      )
    )
      return null;
    stops.push({
      color: parts[0],
      position: last ? Number(last[1]) : undefined,
      unit: last ? (last[2] as "%" | "px") : "%",
    });
  }
  if (stops.length < 2) return null;
  if (
    stops.some(
      (stop, index) =>
        index > 0 && index < stops.length - 1 && stop.position === undefined,
    ) &&
    new Set(
      stops
        .filter((stop) => stop.position !== undefined)
        .map((stop) => stop.unit),
    ).size > 1
  )
    return null;
  stops[0].position ??= 0;
  stops[stops.length - 1].position ??= 100;
  for (let i = 1; i < stops.length - 1; i++)
    if (stops[i].position === undefined) {
      let end = i + 1;
      while (stops[end].position === undefined) end++;
      const start = stops[i - 1].position!;
      for (let j = i; j < end; j++) {
        stops[j].position =
          start +
          ((stops[end].position! - start) * (j - i + 1)) / (end - i + 1);
        stops[j].unit = stops[end].unit;
      }
      i = end - 1;
    }
  model.stops = stops as GradientStop[];
  return model;
}
const number = (value: number) => Number(value.toFixed(2));
export function serializeGradient(gradient: BackgroundGradient) {
  const header =
    gradient.kind === "linear"
      ? `${number(gradient.angle)}deg`
      : `${gradient.shape}${gradient.extent ? " " + gradient.extent : ""} at ${number(gradient.center[0])}% ${number(gradient.center[1])}%`;
  return `${gradient.kind}-gradient(${header}, ${gradient.stops.map((stop) => `${stop.color} ${number(stop.position)}${stop.unit}`).join(", ")})`;
}
export function replaceGradient(
  background: BackgroundLayers,
  index: number,
  gradient: BackgroundGradient,
) {
  const layers = [...background.layers],
    node = gradientNode(layers[index]);
  if (!node) return layers.join(", ");
  layers[index] =
    layers[index].slice(0, node.sourceIndex) +
    serializeGradient(gradient) +
    layers[index].slice(node.sourceEndIndex);
  return layers.join(", ");
}
export function readBackground(
  style: Pick<CSSStyleDeclaration, "backgroundImage" | "backgroundColor"> & {
    background?: string;
  },
) {
  return style.backgroundImage && style.backgroundImage !== "none"
    ? style.background || `${style.backgroundImage}, ${style.backgroundColor}`
    : style.backgroundColor;
}

export function solidLayerColor(layer: string) {
  const node = valueParser(layer).nodes[0];
  if (!node) return "transparent";
  return valueParser.stringify(node);
}
export function replaceSolidLayerColor(layer: string, color: string) {
  const node = valueParser(layer).nodes[0];
  return node ? color + layer.slice(node.sourceEndIndex) : color;
}

export function insertGradientStop(
  gradient: BackgroundGradient,
  selected: number,
  length: number,
  at?: number,
): { gradient: BackgroundGradient; index: number } {
  const unit = gradient.stops.every(
    (stop) => stop.unit === "px" || stop.position === 0,
  )
    ? "px"
    : "%";
  const positionOf = (stop: GradientStop) =>
    stop.unit === unit
      ? stop.position
      : unit === "%"
        ? (stop.position / length) * 100
        : (stop.position / 100) * length;
  const positions = gradient.stops.map(positionOf);
  let position =
    at === undefined ? undefined : unit === "%" ? at : (at / 100) * length;
  if (position === undefined) {
    let left = Math.min(selected, positions.length - 2),
      right = left + 1;
    if (positions[right] <= positions[left]) {
      left = 0;
      for (let i = 1; i < positions.length - 1; i++)
        if (
          positions[i + 1] - positions[i] >
          positions[left + 1] - positions[left]
        )
          left = i;
      right = left + 1;
    }
    position = (positions[left] + positions[right]) / 2;
  }
  position = Number(position.toFixed(2));
  let index = positions.findIndex((value) => value > position!);
  if (index < 0) index = positions.length;
  const left = gradient.stops[Math.max(0, index - 1)],
    right = gradient.stops[Math.min(gradient.stops.length - 1, index)];
  const span = positionOf(right) - positionOf(left),
    ratio =
      span > 0
        ? Math.max(0, Math.min(1, (position - positionOf(left)) / span))
        : 0;
  const a = parseThemeColor(left.color),
    b = parseThemeColor(right.color);
  let color = left.color;
  if (a && b) {
    const alpha = a.a * (1 - ratio) + b.a * ratio;
    const mix = (key: "r" | "g" | "b") =>
      alpha ? (a[key] * a.a * (1 - ratio) + b[key] * b.a * ratio) / alpha : 0;
    color = serializeThemeColor(
      { r: mix("r"), g: mix("g"), b: mix("b"), a: alpha },
      "rgba",
    );
  } else if (ratio > 0 && ratio < 1)
    color = `color-mix(in srgb, ${left.color} ${Number(((1 - ratio) * 100).toFixed(2))}%, ${right.color})`;
  const stops = [...gradient.stops];
  stops.splice(index, 0, { color, position, unit });
  return { gradient: { ...gradient, stops }, index };
}
