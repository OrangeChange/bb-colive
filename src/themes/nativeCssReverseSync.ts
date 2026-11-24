import { NATIVE_PART_SELECTORS, type NativeSemanticPartId } from "./nativeSemanticSelectors.ts";
import { nativeVisualPropertiesForPart, resolveNativePartShape } from "./nativeThemeCapabilities.ts";
import postcss, { type Declaration, type Rule } from "postcss";
import { normalizeNativeThemeDisplaySettings, normalizeNativeVisualModel, type NativeThemeDisplaySettings, type NativeVisualModel, type NativeVisualModelInput, type NativeVisualProperty, type NativeVisualScheme, type NativeVisualValue } from "./nativeComponentAppearance.ts";
import { parseNativeVisualMarker } from "./nativeVisualMarker.ts";
import { imageBackgroundCss, isImageBackgroundDraft } from "../components/themeImageValue.ts";

const PROPERTY_BY_CSS: Record<string, NativeVisualProperty> = {
  "font-weight":"fontWeight", "--event-font-weight":"fontWeight", display: "visible", color: "color", background: "background", "background-color": "background", "font-family": "fontFamily",
  "font-size": "fontSize", "line-height": "lineHeight", "padding-inline": "paddingX", "padding-block": "paddingY",
  "margin-inline": "marginX", "margin-block": "marginY", gap: "gap", width: "width", height: "height",
  "border-image": "borderImage", "border-width": "borderWidth", "border-color": "borderColor", "border-radius": "borderRadius",
  "--event-font-family": "fontFamily", "--event-font-size": "fontSize", "--event-line-height": "lineHeight",
  "--event-gap": "gap", "--message-color": "color", "--reply-color": "color", "--blind-profit-gain-color": "color", "--blind-profit-loss-color": "color", "--event-background": "background",
  "--avatar-size": "width", "--avatar-height": "height", "--price-color": "color", "--emote-size": "height", "--big-emote-size": "width", "--gift-icon-size": "width", "--blind-gift-icon-size": "width", "--guard-badge-size": "height", "--wealth-medal-size": "height",
};

function valueOf(declaration: Declaration, property: NativeVisualProperty): NativeVisualValue | undefined {
  if (property === "visible") {
    const value = declaration.value.trim().toLowerCase();
    if (value === "none") return false;
    if (value === "revert-layer") return true;
    return undefined;
  }
  if (["fontSize", "paddingX", "paddingY", "marginX", "marginY", "gap", "width", "height", "borderWidth", "borderRadius"].includes(property)) {
    const raw = declaration.value.trim();
    const relative = raw.match(/^calc\(var\(--(?:event-font-size|native-base-size),\s*16px\)\s*\*\s*(-?(?:\d+|\d*\.\d+))\)$/i);
    if (relative) {
      const ratio = Number.parseFloat(relative[1]);
      return Number.isFinite(ratio) ? { mode: "base-relative", ratio } : undefined;
    }
    if (!/^-?(?:\d+|\d*\.\d+)px$/i.test(raw)) return undefined;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? { mode: "fixed", value } : undefined;
  }
  if (property === "lineHeight" || property === "fontWeight") {
    if (!/^-?(?:\d+|\d*\.\d+)$/.test(declaration.value.trim())) return undefined;
    const value = Number.parseFloat(declaration.value);
    return Number.isFinite(value) ? value : undefined;
  }
  return declaration.value.trim();
}

export interface NativeCssControlledField { scheme: NativeVisualScheme; targetKey: string; property: NativeVisualProperty }

export function reverseSyncNativeVisualCss(source: string, previous: NativeVisualModelInput, context?: { display?: NativeThemeDisplaySettings }): { model: NativeVisualModel; unmanagedCss: string; error: string; diagnostics: string[]; cssControlled: NativeCssControlledField[] } {
  try {
    const root = postcss.parse(source);
    const model = normalizeNativeVisualModel(previous);
    const display = normalizeNativeThemeDisplaySettings(context?.display);
    const managedTargetKeys = new Set<string>();
    root.walkComments(comment => {
      const marker = parseNativeVisualMarker(comment.text);
      if (marker) managedTargetKeys.add(`${marker.scheme}:${marker.targetKey}`);
    });
    managedTargetKeys.forEach(entry => {
      const split = entry.indexOf(":");
      const scheme = entry.slice(0, split) as NativeVisualScheme;
      const key = entry.slice(split + 1);
      const [event, , part] = key.split("|");
      const partId = part as NativeSemanticPartId;
      const shape = partId in NATIVE_PART_SELECTORS ? resolveNativePartShape(partId, { event, display }) : undefined;
      const allowed = new Set(partId in NATIVE_PART_SELECTORS ? nativeVisualPropertiesForPart(partId, shape) : []);
      const retained = Object.fromEntries(Object.entries(model[scheme][key] ?? {}).filter(([property]) => !allowed.has(property as NativeVisualProperty)));
      if (Object.keys(retained).length) model[scheme][key] = retained;
      else delete model[scheme][key];
    });
    let targetKey = "";
    let targetScheme: NativeVisualScheme = "common";
    const diagnostics: string[] = [];
    const consumedDeclarations: Declaration[] = [];
    const cssControlled = new Map<string, NativeCssControlledField>();
    root.nodes.forEach(node => {
      if (node.type === "comment") {
        const marker = parseNativeVisualMarker(node.text);
        if (marker) { targetScheme = marker.scheme; targetKey = marker.targetKey; }
        else targetKey = "";
        return;
      }
      if (!targetKey || node.type !== "rule") return;
      const rule = node as Rule;
      const partId = targetKey.split("|")[2] as NativeSemanticPartId;
      const event = targetKey.split("|")[0] ?? "all";
      const shape = partId in NATIVE_PART_SELECTORS ? resolveNativePartShape(partId, { event, display }) : undefined;
      const allowed = new Set(partId in NATIVE_PART_SELECTORS ? nativeVisualPropertiesForPart(partId, shape) : []);
      const seen = new Set<string>();
      for (const child of rule.nodes) {
        if (child.type !== "decl") continue;
        const dimension = child.prop === "max-width" ? "width" : child.prop === "max-height" ? "height" : undefined;
        if (dimension && allowed.has(dimension) && child.value === "none" && rule.nodes.some(node => node.type === "decl"
          && node.prop === dimension && valueOf(node, dimension) !== undefined)) {
          consumedDeclarations.push(child);
          continue;
        }
        if (child.prop === "border-style" && allowed.has("borderWidth") && child.value === "solid" && rule.nodes.some(node => node.type === "decl"
          && node.prop === "border-width" && valueOf(node, "borderWidth") !== undefined)) {
          consumedDeclarations.push(child);
          continue;
        }
        const property = PROPERTY_BY_CSS[child.prop];
        if (!property) { diagnostics.push(`无法同步 ${child.prop}，已保留在 CSS 中`); continue; }
        if (!allowed.has(property)) {
          diagnostics.push(`${child.prop} 不适用于当前部件，已保留在 CSS 中`);
          continue;
        }
        if (seen.has(child.prop)) diagnostics.push(`存在多个 ${child.prop}，已使用最后一个有效值`);
        seen.add(child.prop);
        let value = valueOf(child, property);
        if (value === undefined) {
          cssControlled.set(`${targetScheme}|${targetKey}|${property}`, { scheme: targetScheme, targetKey, property });
          const current = model[targetScheme][targetKey];
          if (current) {
            delete current[property];
            if (!Object.keys(current).length) delete model[targetScheme][targetKey];
          }
          const expected = property === "visible" ? "none 或 revert-layer" : property === "lineHeight" ? "无单位数值" : "px 数值或基准比例表达式";
          diagnostics.push(`${child.prop} 需要使用${expected}，已保留在 CSS 中`);
          continue;
        }
        const old = normalizeNativeVisualModel(previous)[targetScheme][targetKey]?.[property];
        if (property === "background" && old?.source !== "inherit" && old && isImageBackgroundDraft(old.value)
          && imageBackgroundCss(old.value) === value) value = structuredClone(old.value);
        model[targetScheme][targetKey] = { ...(model[targetScheme][targetKey] ?? {}), [property]: { source: old?.source === "theme" ? "theme" : "custom", value } };
        consumedDeclarations.push(child);
      }
      targetKey = "";
    });
    consumedDeclarations.forEach(declaration => declaration.remove());
    root.walkComments(comment => {
      if (comment.text.trim() === "danmu-managed:start" || comment.text.trim() === "danmu-managed:end" || parseNativeVisualMarker(comment.text)) comment.remove();
    });
    for (const node of [...root.nodes].reverse()) {
      if (node.type === "rule" && !node.nodes.length) node.remove();
    }
    const unmanagedCss = root.toString().trim();
    return { model, unmanagedCss, error: "", diagnostics, cssControlled: [...cssControlled.values()] };
  } catch (error) {
    return { model: normalizeNativeVisualModel(previous), unmanagedCss: "", error: error instanceof Error ? error.message : "CSS 语法有误", diagnostics: [], cssControlled: [] };
  }
}
