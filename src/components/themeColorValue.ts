import type { RgbaColor } from "react-colorful";

export type ThemeColorFormat = "hex" | "rgba" | "hsla";

export function applyThemeColorPickerChange(current: RgbaColor, next: RgbaColor, selectsVisibleColor: boolean): RgbaColor {
  return selectsVisibleColor && current.a === 0 ? { ...next, a: 1 } : next;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function hslToRgb(hue: number, saturation: number, lightness: number): Pick<RgbaColor, "r" | "g" | "b"> {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation / 100, 0, 1);
  const l = clamp(lightness / 100, 0, 1);
  if (s === 0) {
    const value = Math.round(l * 255);
    return { r: value, g: value, b: value };
  }
  const q = l < .5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset: number) => {
    let t = h + offset;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return { r: Math.round(channel(1 / 3) * 255), g: Math.round(channel(0) * 255), b: Math.round(channel(-1 / 3) * 255) };
}

function rgbToHsl(color: RgbaColor): { h: number; s: number; l: number } {
  const r = clamp(color.r, 0, 255) / 255;
  const g = clamp(color.g, 0, 255) / 255;
  const b = clamp(color.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l: l * 100 };
  const s = delta / (1 - Math.abs(2 * l - 1));
  const h = max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  return { h: h < 0 ? h + 360 : h, s: s * 100, l: l * 100 };
}

export function parseThemeColor(value: string): RgbaColor | null {
  const input = value.trim();
  if (input.toLowerCase() === "transparent") return { r: 255, g: 255, b: 255, a: 0 };
  const hex = input.match(/^#([0-9a-f]{3,8})$/iu)?.[1];
  if (hex) {
    const expanded = hex.length <= 4 ? [...hex].map(part => part + part).join("") : hex;
    if (expanded.length === 6 || expanded.length === 8) return {
      r: Number.parseInt(expanded.slice(0, 2), 16),
      g: Number.parseInt(expanded.slice(2, 4), 16),
      b: Number.parseInt(expanded.slice(4, 6), 16),
      a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
    };
  }
  const rgba = input.match(/^rgba?\(\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/iu);
  if (rgba) {
    const alpha = rgba[4]?.endsWith("%") ? Number.parseFloat(rgba[4]) / 100 : Number.parseFloat(rgba[4] ?? "1");
    return { r: Math.round(clamp(Number(rgba[1]), 0, 255)), g: Math.round(clamp(Number(rgba[2]), 0, 255)), b: Math.round(clamp(Number(rgba[3]), 0, 255)), a: clamp(alpha, 0, 1) };
  }
  const hsla = input.match(/^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?\s*[, ]\s*(\d+(?:\.\d+)?)%\s*[, ]\s*(\d+(?:\.\d+)?)%(?:\s*[,/]\s*(\d+(?:\.\d+)?%?))?\s*\)$/iu);
  if (!hsla) return null;
  const alpha = hsla[4]?.endsWith("%") ? Number.parseFloat(hsla[4]) / 100 : Number.parseFloat(hsla[4] ?? "1");
  return { ...hslToRgb(Number(hsla[1]), Number(hsla[2]), Number(hsla[3])), a: clamp(alpha, 0, 1) };
}

export function inferThemeColorFormat(value: string): ThemeColorFormat | undefined {
  const input = value.trim().toLowerCase();
  if (input.startsWith("#")) return "hex";
  if (input.startsWith("rgb")) return "rgba";
  if (input.startsWith("hsl")) return "hsla";
  return undefined;
}

export function serializeThemeColor(color: RgbaColor, format: ThemeColorFormat, opaque = false): string {
  const normalized = { r: Math.round(clamp(color.r, 0, 255)), g: Math.round(clamp(color.g, 0, 255)), b: Math.round(clamp(color.b, 0, 255)), a: opaque ? 1 : clamp(color.a, 0, 1) };
  if (format === "hex") {
    const rgb = [normalized.r, normalized.g, normalized.b].map(part => part.toString(16).padStart(2, "0")).join("");
    const alpha = Math.round(normalized.a * 255).toString(16).padStart(2, "0");
    return `#${rgb}${normalized.a < 1 ? alpha : ""}`;
  }
  if (format === "rgba") return opaque ? `rgb(${normalized.r}, ${normalized.g}, ${normalized.b})` : `rgba(${normalized.r}, ${normalized.g}, ${normalized.b}, ${round(normalized.a)})`;
  const hsl = rgbToHsl(normalized);
  return opaque ? `hsl(${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%)` : `hsla(${round(hsl.h)}, ${round(hsl.s)}%, ${round(hsl.l)}%, ${round(normalized.a)})`;
}

