import { normalizeCompatibleTargetSource, normalizeCompatibleVisualTargets, normalizeCompatibleVisualAuthored } from "./compatManagedCss.ts";
import postcss, { type Declaration } from "postcss";
import type { NativeVisualModel, NativeVisualProperty, NativeVisualSetting } from "./nativeComponentAppearance.ts";
import type { CompatibleCssUnit, CompatibleThemeCapabilityMap } from "./compatThemeCapabilities.ts";
import { COMPAT_PROPERTY_BY_CSS, compatibleVisualPropertyForCss, isCompatibleManagedRule } from "./compatManagedCss.ts";
import type { CompatibleVisualAuthored } from "./compatThemeSettings.ts";

function cloneModel(input: Partial<NativeVisualModel>): NativeVisualModel {
  return structuredClone({ common: input.common ?? {}, light: input.light ?? {}, dark: input.dark ?? {} });
}

function marker(text: string): { scheme: "common" | "light" | "dark"; key: string } | null {
  const match = text.trim().match(/^compat-visual:(common|light|dark)\|(.+)$/);
  return match ? { scheme: match[1] as "common" | "light" | "dark", key: match[2] } : null;
}

function parseValue(declaration: Declaration, unit: CompatibleCssUnit | undefined): unknown | undefined {
  if (declaration.important) return undefined;
  const value = declaration.value.trim();
  if (declaration.prop === "background" && /(?:linear|radial)-gradient\(/i.test(value)) return value;
  if (/^calc\(var\(--event-base-size, 20px\) \* -?[\d.]+\)$/.test(value) || /^calc\(-?[\d.]+px \* var\(--blc-g, 1\)(?: \* var\(--blc-f, 1\))?\)$/.test(value)) return value;
  if (/(?:var|calc|min|max|clamp)\(/i.test(value)) return undefined;
  if (unit === "visible") return value === "none" ? false : value === "revert-layer" ? true : undefined;
  if (unit === "px") return /^-?(?:\d+|\d*\.\d+)px$/i.test(value) ? Number.parseFloat(value) : undefined;
  if (unit === "number") return /^-?(?:\d+|\d*\.\d+)$/.test(value) ? Number.parseFloat(value) : undefined;
  if (unit === "color" || unit === "font" || unit === "raw") return value;
  return value;
}

function cloneAuthored(input?: CompatibleVisualAuthored): CompatibleVisualAuthored {
  return structuredClone({ common: input?.common ?? {}, light: input?.light ?? {}, dark: input?.dark ?? {} });
}

function setAuthored(authored: CompatibleVisualAuthored, scheme: keyof CompatibleVisualAuthored, key: string, property: NativeVisualProperty, active: boolean): void {
  const properties = new Set(authored[scheme][key] ?? []);
  if (active) properties.add(property); else properties.delete(property);
  if (properties.size) authored[scheme][key] = [...properties];
  else delete authored[scheme][key];
}

export function reverseSyncCompatibleCss(source: string, capability: CompatibleThemeCapabilityMap, previous: Partial<NativeVisualModel>, previousAuthored?: CompatibleVisualAuthored): { model: NativeVisualModel; authored: CompatibleVisualAuthored; unmanagedCss: string; error: string; diagnostics: string[] } {
  const model = normalizeCompatibleVisualTargets(capability, cloneModel(previous));
  const authored = normalizeCompatibleVisualAuthored(capability, cloneAuthored(previousAuthored));
  try {
    source = normalizeCompatibleTargetSource(source, capability);
    const root = postcss.parse(source);
    const diagnostics: string[] = [];
    let active: ReturnType<typeof marker> = null;
    const recognizedScopes = new Set<string>();
    for (const node of root.nodes) {
      if (node.type === "comment") { active = marker(node.text); continue; }
      if (!active || node.type !== "rule") continue;
      const part = active.key.split("|")[3];
      const definition = capability.parts[part];
      if (!definition) { active = null; continue; }
      if (!isCompatibleManagedRule(capability, `${active.scheme}|${active.key}`, node)) { active = null; continue; }
      recognizedScopes.add(`${active.scheme}|${active.key}`);
      const counts = new Map<string, number>();
      for (const child of node.nodes) if (child.type === "decl") counts.set(child.prop, (counts.get(child.prop) ?? 0) + 1);
      const layer = model[active.scheme];
      const settings = { ...(layer[active.key] ?? {}) };
      for (const property of definition.properties) {
        const cssProperty = Object.entries(COMPAT_PROPERTY_BY_CSS).find(([, visualProperty]) => visualProperty === property)?.[0];
        if (cssProperty && ![cssProperty, definition.cssPropertyByProperty?.[property]].some(name => name && counts.has(name))) { delete settings[property]; setAuthored(authored, active.scheme, active.key, property, false); }
      }
      for (const child of node.nodes) {
        if (child.type !== "decl") continue;
        if (child.prop === "border-style" && child.value === "solid" && !child.important
          && definition.properties.includes("borderWidth") && counts.has("border-width")) continue;
        const property = compatibleVisualPropertyForCss(definition, child.prop);
        if (!property || !definition.properties.includes(property)) { diagnostics.push(`${child.prop} 未受可视化编辑管理，已保留`); continue; }
        if (node.nodes.filter(candidate => candidate.type === "decl" && compatibleVisualPropertyForCss(definition, candidate.prop) === property).length !== 1) { delete settings[property]; setAuthored(authored, active.scheme, active.key, property, true); diagnostics.push(`${child.prop} 存在多个声明，已保留`); continue; }
        const unit = definition.units?.[property] ?? (property === "visible" ? "visible" : property === "lineHeight" ? "number" : ["fontSize", "paddingX", "paddingY", "marginX", "marginY", "gap", "width", "height", "borderWidth", "borderRadius"].includes(property) ? "px" : "raw");
        const value = parseValue(child, unit);
        if (value === undefined) { delete settings[property]; setAuthored(authored, active.scheme, active.key, property, true); diagnostics.push(`${child.prop} 无法明确回填，已保留`); continue; }
        settings[property as NativeVisualProperty] = { source: "custom", value } as NativeVisualSetting;
        setAuthored(authored, active.scheme, active.key, property, false);
      }
      if (Object.keys(settings).length) layer[active.key] = settings;
      else delete layer[active.key];
      active = null;
    }
    for (const scheme of ["common", "light", "dark"] as const) {
      for (const key of new Set([...Object.keys(model[scheme]), ...Object.keys(authored[scheme])])) {
        const currentSettings = model[scheme][key] ?? {};
        if (recognizedScopes.has(`${scheme}|${key}`)) continue;
        const definition = capability.parts[key.split("|")[3]];
        if (!definition) continue;
        const settings = { ...currentSettings };
        for (const property of definition.properties) delete settings[property];
        delete authored[scheme][key];
        if (Object.keys(settings).length) model[scheme][key] = settings;
        else delete model[scheme][key];
      }
    }
    return { model, authored, unmanagedCss: source, error: "", diagnostics };
  } catch (error) {
    return { model: cloneModel(previous), authored: cloneAuthored(previousAuthored), unmanagedCss: source, error: error instanceof Error ? error.message : "CSS 语法有误", diagnostics: [] };
  }
}
