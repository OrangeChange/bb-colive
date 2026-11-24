import { parseThemeColor } from "./components/themeColorValue.ts";
import type { RgbaColor } from "./eventStyleSettings.ts";

export type WindowAppearanceSettings = {
  material: 'glass' | 'solid' | 'transparent';
  scheme: 'follow' | 'light' | 'dark';
  glassTint: number;
  solidOpacity: number;
  surfaceColor: RgbaColor | null;
  radius: number;
};

export const DEFAULT_WINDOW_APPEARANCE: WindowAppearanceSettings = {
  material: 'glass',
  scheme: 'follow',
  glassTint: 0.18,
  solidOpacity: 1,
  surfaceColor: null,
  radius: 12,
};

export const MIN_WINDOW_OPACITY = 0;
export const MAX_WINDOW_OPACITY = 1;
export const MIN_WINDOW_RADIUS = 0;
export const MAX_WINDOW_RADIUS = 32;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function normalizeColor(value: unknown): RgbaColor {
  const input = typeof value === "object" && value !== null ? value as Partial<RgbaColor> : {};
  const fallback = { r:21, g:26, b:32, a:1 };
  return {
    r: Math.round(clamp(typeof input.r === "number" ? input.r : fallback.r, 0, 255)),
    g: Math.round(clamp(typeof input.g === "number" ? input.g : fallback.g, 0, 255)),
    b: Math.round(clamp(typeof input.b === "number" ? input.b : fallback.b, 0, 255)),
    a: clamp(typeof input.a === "number" ? input.a : fallback.a, 0, 1),
  };
}

export function normalizeWindowAppearance(value: unknown): WindowAppearanceSettings {
  const input = typeof value === "object" && value !== null ? value as Partial<WindowAppearanceSettings> & { opacity?: number } : {};
  return {
    material: input.material === 'solid' || input.material === 'transparent' ? input.material : 'glass',
    scheme: input.scheme === 'light' || input.scheme === 'dark' ? input.scheme : 'follow',
    glassTint: typeof input.glassTint === 'number' ? clamp(input.glassTint, 0, 1) : DEFAULT_WINDOW_APPEARANCE.glassTint,
    solidOpacity: typeof input.solidOpacity === 'number' ? clamp(input.solidOpacity, 0, 1)
      : input.material === 'solid' && typeof input.opacity === 'number' ? clamp(input.opacity, 0, 1) : DEFAULT_WINDOW_APPEARANCE.solidOpacity,
    surfaceColor: input.surfaceColor == null ? null : normalizeColor(input.surfaceColor),
    radius: typeof input.radius === "number"
      ? Math.round(clamp(input.radius, MIN_WINDOW_RADIUS, MAX_WINDOW_RADIUS))
      : DEFAULT_WINDOW_APPEARANCE.radius,
  };
}

export function resolveWindowSurfaceColor(appearance: WindowAppearanceSettings, scheme: 'light' | 'dark', automaticSurface?: RgbaColor): RgbaColor {
  const themeSurface = automaticSurface ?? (typeof document === 'undefined' ? null : parseThemeColor(getComputedStyle(document.documentElement).getPropertyValue(`--surface-${scheme}`)));
  return appearance.surfaceColor ?? themeSurface ?? (scheme === 'light' ? {r:255,g:255,b:255,a:1} : {r:20,g:20,b:24,a:1});
}

export function resolveWindowScheme(scheme: WindowAppearanceSettings['scheme'], softwareScheme: 'light' | 'dark'): 'light' | 'dark' {
  return scheme === 'follow' ? softwareScheme : scheme;
}

export function resolveWindowSurfaceOpacity(appearance: WindowAppearanceSettings): number {
  return appearance.material === 'transparent' ? 0 : appearance.material === 'glass' ? appearance.glassTint : appearance.solidOpacity;
}
