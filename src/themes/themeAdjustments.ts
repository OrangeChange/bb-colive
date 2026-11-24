import type { ThemeDocument } from "./themeTypes.ts";

export interface ThemeAdjustments {
  settings: Record<string, unknown>;
  visualCss?: string;
  customCss?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const isVisualModel = (key: string) => key === "visualModel" || key === "visualAuthored" || key === "priceGradient";

function settingDifference(defaults: unknown, edited: unknown): unknown {
  if (JSON.stringify(defaults) === JSON.stringify(edited)) return undefined;
  if (defaults === undefined && isRecord(edited) && Object.keys(edited).length === 0) return undefined;
  if (isRecord(defaults) && isRecord(edited)) {
    const changes = Object.fromEntries(Object.entries(edited).flatMap(([key,value]) => {
      const change=settingDifference(defaults[key],value);
      return change === undefined ? [] : [[key,change]];
    }));
    return Object.keys(changes).length ? changes : undefined;
  }
  return structuredClone(edited);
}

function mergeSetting(defaults: unknown, edited: unknown): unknown {
  if (!isRecord(defaults) || !isRecord(edited)) return structuredClone(edited);
  const merged=structuredClone(defaults);
  for (const [key,value] of Object.entries(edited)) merged[key]=mergeSetting(defaults[key],value);
  return merged;
}

export function themeAdjustments(defaults: ThemeDocument, edited: ThemeDocument): ThemeAdjustments {
  const settings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edited.settings)) {
    const change=isVisualModel(key)
      ? JSON.stringify(value) === JSON.stringify(defaults.settings[key]) ? undefined : structuredClone(value)
      : settingDifference(defaults.settings[key],value);
    if (change !== undefined) settings[key]=change;
  }
  return {
    settings,
    ...(edited.styles.visualCss !== defaults.styles.visualCss ? { visualCss: edited.styles.visualCss } : {}),
    ...(edited.styles.customCss !== defaults.styles.customCss ? { customCss: edited.styles.customCss } : {}),
  };
}

export function applyThemeAdjustments(defaults: ThemeDocument, edits: ThemeAdjustments): ThemeDocument {
  const document = structuredClone(defaults);
  for (const [key,value] of Object.entries(edits.settings)) {
    document.settings[key]=isVisualModel(key) ? structuredClone(value) : mergeSetting(defaults.settings[key],value);
  }
  if (edits.visualCss !== undefined) document.styles.visualCss = edits.visualCss;
  if (edits.customCss !== undefined) document.styles.customCss = edits.customCss;
  return document;
}

export function restoreThemeAdjustments(defaults: ThemeDocument, edited: ThemeDocument, scope: string): ThemeDocument {
  const changes = themeAdjustments(defaults, edited);
  if (scope === "all" || scope === "basic") {
    changes.settings = scope === "basic"
      ? Object.fromEntries(Object.entries(changes.settings).filter(([key]) => key === "visualModel" || key === "visualAuthored" || key === "priceGradient"))
      : {};
  }
  if (scope === "all" || scope === "visual") delete changes.visualCss;
  if (scope === "all" || scope === "visual") {
    for (const key of ["visualModel", "visualAuthored", "priceGradient"]) {
      if (key in defaults.settings) changes.settings[key] = structuredClone(defaults.settings[key]);
      else delete changes.settings[key];
    }
  }
  if (scope === "all" || scope === "custom") delete changes.customCss;
  const restored = applyThemeAdjustments(defaults, changes);
  return {...edited,settings:restored.settings,styles:restored.styles,...(scope === "all" ? {assets:structuredClone(defaults.assets),assetOverrides:[]} : {})};
}
