import type { NativeVisualModel, NativeVisualProperty, NativeVisualScheme, NativeVisualSetting } from "./nativeComponentAppearance.ts";
import type { CompatibleThemeMode } from "./compatThemeSettings.ts";

export type CompatibleVisualModel = NativeVisualModel;
export type CompatibleVisualProperty = NativeVisualProperty;
export type CompatibleVisualScheme = NativeVisualScheme;
export type CompatibleCssUnit = "color" | "font" | "number" | "px" | "raw" | "visible";
export type CompatiblePlacement = "main" | "sticky" | "detail";

export interface CompatiblePartCapability {
  previewTarget?: "live" | "windows";
  label?: string;
  scope?: "global" | "event";
  selector: string;
  eventFilter?: string;
  properties: readonly CompatibleVisualProperty[];
  units?: Partial<Record<CompatibleVisualProperty, CompatibleCssUnit>>;
  cssPropertyByProperty?: Partial<Record<CompatibleVisualProperty, string>>;
  codeDefaults?: Partial<Record<CompatibleVisualProperty, unknown>>;
  codeDefaultsByEvent?: Record<string, Partial<Record<CompatibleVisualProperty, unknown>>>;
  codeDefaultsByContext?: Record<string, Partial<Record<CompatibleVisualProperty, unknown>>>;
  /** 可由来源继承或变量解析的预览 computed 基线；不生成覆盖，但控件可直接据此编辑。 */
  inheritedDefaults?: Partial<Record<CompatibleVisualProperty, unknown>>;
  inheritedDefaultsByContext?: Record<string, Partial<Record<CompatibleVisualProperty, unknown>>>;
  scaleByProperty?: Partial<Record<CompatibleVisualProperty, "global" | "global-font" | "base-font">>;
  settingByProperty?: Partial<Record<CompatibleVisualProperty, string>>;
  selectorsByEvent?: Record<string, string>;
  selectorsByPlacement?: Partial<Record<CompatiblePlacement, string>>;
  selectorsByContext?: Record<string, string>;
  events?: readonly string[];
  placements?: readonly CompatiblePlacement[];
}

export interface CompatibleThemeCapabilityMap {
  mode: CompatibleThemeMode;
  parts: Record<string, CompatiblePartCapability>;
  eventSelectors?: Record<string, string>;
  eventSelectorsByPlacement?: Partial<Record<CompatiblePlacement, Record<string, string>>>;
  identitySelectors?: Record<string, string>;
  eventLabels?: Record<string, string>;
  eventGroups?: Record<string, readonly string[]>;
  sourceEventSelectorsByPlacement?: Partial<Record<CompatiblePlacement, Record<string, string>>>;
  identityLabels?: Record<string, string>;
  identityPriority?: readonly string[];
  schemeSelectors?: Partial<Record<"light" | "dark", string>>;
}

const compatibleThemeCapabilities = new Map<CompatibleThemeMode, CompatibleThemeCapabilityMap>();

export function registerCompatibleThemeCapability(capability: CompatibleThemeCapabilityMap): void {
  compatibleThemeCapabilities.set(capability.mode, capability);
}

export function getCompatibleThemeCapability(mode: CompatibleThemeMode): CompatibleThemeCapabilityMap | undefined {
  return compatibleThemeCapabilities.get(mode);
}

export function installCompatibleEventGroups(capability: CompatibleThemeCapabilityMap): void {
  capability.sourceEventSelectorsByPlacement ??= structuredClone(capability.eventSelectorsByPlacement ?? {});
  for (const [placement, selectors] of Object.entries(capability.eventSelectorsByPlacement ?? {})) {
    const source = capability.sourceEventSelectorsByPlacement[placement as CompatiblePlacement] ?? selectors;
    for (const [group, members] of Object.entries(capability.eventGroups ?? {})) {
      const values = members.flatMap(member => (source[member] ?? "").split(",").map(value => value.trim()).filter(Boolean));
      if (values.length) selectors[group] = [...new Set(values)].join(", ");
    }
  }
}

export function compatibleVisualEventScopes(capability: CompatibleThemeCapabilityMap, placement: CompatiblePlacement) {
  const allowed = capability.eventSelectorsByPlacement?.[placement] ?? capability.eventSelectors ?? {};
  const children = capability.mode === "laplace"
    ? [{ id: "gift-regular", label: "普通礼物" }, { id: "redpocket", label: "红包" }, { id: "lottery", label: "天选" }]
    : undefined;
  return [
    { id: "danmaku", label: "弹幕", children: undefined },
    { id: "interaction", label: "互动", children: capability.mode === "laplace" ? [
      { id: "entry", label: "进入直播间" }, { id: "follow", label: "关注" }, { id: "share", label: "分享" },
      { id: "special-follow", label: "特别关注" }, { id: "mutual-follow", label: "互相关注" }, { id: "like", label: "点赞" },
    ] : [{ id: "like", label: "点赞" }] },
    { id: "gift", label: "礼物", children },
    { id: "superchat", label: "醒目留言", children: undefined },
    { id: "guard", label: "大航海", children: undefined },
    { id: "system", label: "系统", children: capability.mode === "laplace" ? [
      { id: "live-status", label: "开播与下播" }, { id: "user-block", label: "用户禁言" }, { id: "room-mute", label: "全员禁言" },
      { id: "room-change", label: "房间信息变更" }, { id: "warning", label: "直播警告与切断" },
    ] : undefined },
  ].filter(scope => allowed[scope.id]).map(scope => ({ ...scope, children: scope.children?.filter(child => allowed[child.id]) }));
}

/** Selectors sent to the isolated editor document. They remain mode-specific;
 * the bridge never invents a shared preview DOM. */
export function compatibleEditorSelectors(capability: CompatibleThemeCapabilityMap): Record<string, string[]> {
  return Object.fromEntries(Object.entries(capability.parts).map(([part, definition]) => [part, [...new Set([
    definition.selector,
    ...Object.values(definition.selectorsByEvent ?? {}),
    ...Object.values(definition.selectorsByPlacement ?? {}),
    ...Object.values(definition.selectorsByContext ?? {}),
  ].flatMap(value => value.split(",").map(branch => branch.trim()).filter(Boolean)))]]));
}

export function compatibleEditorEventScopes(capability: CompatibleThemeCapabilityMap) {
  const placements = capability.eventSelectorsByPlacement ?? {main:capability.eventSelectors ?? {}};
  return Object.fromEntries(Object.entries(placements).map(([placement,events]) => {
    const entries = Object.entries(events)
      .filter(([event]) => capability.mode === "laplace" || event !== "gift-normal")
      .sort(([left],[right]) => Number(Boolean(capability.eventGroups?.[left])) - Number(Boolean(capability.eventGroups?.[right])));
    return [placement,Object.fromEntries(entries.map(([event,selector])=>[event,selector.split(",").map(branch=>branch.trim()).join(",")]))];
  }));
}

export interface CompatibleVisualSelection { eventId?: string; event: string; identity: string; part: string; placement?: CompatiblePlacement }
export interface CompatibleEditorScope { part: string; eventType: string; identity: string; placement: CompatiblePlacement }
export interface CompatibleComputedValue { value: string; unit: string; inherited: boolean; mixed?: boolean; controlled?: boolean; applicable?: boolean }
export interface CompatibleEditorInspection { eventId?: string; layoutSupported?: boolean; scope: CompatibleEditorScope; computed: Partial<Record<CompatibleVisualProperty, CompatibleComputedValue>>; refresh?: boolean; inspectionRevision?: number }
export interface CompatibleEditorSelectionState {
  accentColor?: string;
  eventId?: string;
  identityPriority?: readonly string[];
  readOnly?: boolean;
  pickEnabled?: boolean;
  partPlacements?: Record<string, readonly CompatiblePlacement[]>;
  part: string; reveal: boolean; selectors: Record<string, string[]>; focusSelectors: string[];
  inspectionRevision: number;
  scope: CompatibleEditorScope;
  strictScope: boolean; scheme: "light" | "dark";
  properties: Partial<Record<string, readonly CompatibleVisualProperty[]>>;
  scopeSelectors: {
    eventsByPlacement: Partial<Record<CompatiblePlacement, Record<string, string>>>;
    identities: Record<string, string>;
    placements: Partial<Record<CompatiblePlacement, string>>;
  };
}
export interface CompatibleResolvedSelection { event: string; identities: readonly string[]; placement?: CompatiblePlacement; part: string }
export interface CompatibleResolvedVisualSetting {
  source: "inherit" | "code" | "theme" | "custom";
  value?: unknown;
  inheritedFrom?: string;
}
export interface CompatibleVisualControlValue {
  direct?: NativeVisualSetting;
  resolved: CompatibleResolvedVisualSetting;
}

function normalized(model: Partial<CompatibleVisualModel>): CompatibleVisualModel {
  return {
    common: { ...(model.common ?? {}) },
    light: { ...(model.light ?? {}) },
    dark: { ...(model.dark ?? {}) },
  };
}

function keyOf(target: CompatibleVisualSelection): string {
  return `${target.event}|${target.identity}|${target.placement ?? "main"}|${target.part}`;
}

export function resolveCompatibleCodeDefault(
  definition: CompatiblePartCapability | undefined,
  event: string,
  placement: CompatiblePlacement,
  property: CompatibleVisualProperty,
  settings: Record<string, unknown> = {},
): unknown {
  if (!definition) return undefined;
  const settingKey = definition.settingByProperty?.[property];
  if (settingKey && settings[settingKey] !== undefined) return settings[settingKey];
  const value = definition.codeDefaultsByContext?.[`${event}|${placement}`]?.[property]
    ?? definition.codeDefaultsByContext?.[`${event}|all`]?.[property]
    ?? definition.codeDefaultsByContext?.[`all|${placement}`]?.[property]
    ?? definition.codeDefaultsByEvent?.[event]?.[property]
    ?? definition.inheritedDefaultsByContext?.[`${event}|${placement}`]?.[property]
    ?? definition.inheritedDefaultsByContext?.[`${event}|all`]?.[property]
    ?? definition.inheritedDefaultsByContext?.[`all|${placement}`]?.[property]
    ?? definition.codeDefaults?.[property]
    ?? definition.inheritedDefaults?.[property];
  if (typeof value !== "number") return value;
  const chain = definition.scaleByProperty?.[property];
  const global = typeof settings.globalScale === "number" && settings.globalScale > 0 ? settings.globalScale : 1;
  const font = typeof settings.fontScale === "number" && settings.fontScale > 0 ? settings.fontScale : 1;
  const baseFont = typeof settings.baseFontSize === "number" && settings.baseFontSize > 0 ? settings.baseFontSize / 20 : 1;
  return Number((value * (chain === "global" ? global : chain === "global-font" ? global * font : chain === "base-font" ? baseFont : 1)).toFixed(3));
}

export function setCompatibleVisualProperty(
  input: Partial<CompatibleVisualModel>,
  target: CompatibleVisualSelection,
  property: CompatibleVisualProperty,
  setting: NativeVisualSetting,
  scheme: CompatibleVisualScheme = "common",
  context?: { definition?: CompatiblePartCapability; settings?: Record<string, unknown> },
): CompatibleVisualModel {
  const model = normalized(input);
  const key = keyOf(target);
  const layer = { ...model[scheme] };
  const properties = { ...(layer[key] ?? {}) };
  if (setting.source === "inherit") delete properties[property];
  else {
    let value = setting.value;
    const chain = context?.definition?.scaleByProperty?.[property];
    if (typeof value === "number" && chain) {
      const settings = context?.settings ?? {};
      const g = Number(settings.globalScale) || 1, f = Number(settings.fontScale) || 1, b = Number(settings.baseFontSize) || 20;
      const amount = Number((value / (chain === "base-font" ? b : chain === "global-font" ? g * f : g)).toFixed(6));
      value = chain === "base-font" ? `calc(var(--event-base-size, 20px) * ${amount})`
        : `calc(${amount}px * var(--blc-g, 1)${chain === "global-font" ? " * var(--blc-f, 1)" : ""})`;
    }
    properties[property] = { ...setting, value };
  }
  if (Object.keys(properties).length) layer[key] = properties;
  else delete layer[key];
  return { ...model, [scheme]: layer };
}

export function clearCompatibleVisualTarget(
  input: Partial<CompatibleVisualModel>,
  target: CompatibleVisualSelection,
  scheme: CompatibleVisualScheme = "common",
): CompatibleVisualModel {
  const model = normalized(input);
  const layer = { ...model[scheme] };
  delete layer[keyOf(target)];
  return { ...model, [scheme]: layer };
}

function identityOrder(target: CompatibleResolvedSelection, configured?: readonly string[]): string[] {
  const active = new Set(target.identities);
  const ordered = configured?.filter(identity => active.has(identity)) ?? [];
  for (const identity of target.identities) if (!ordered.includes(identity)) ordered.push(identity);
  return [...ordered, "all"];
}

export function resolveCompatibleVisualProperty(
  input: Partial<CompatibleVisualModel>,
  target: CompatibleResolvedSelection,
  property: CompatibleVisualProperty,
  options: { scheme?: CompatibleVisualScheme; identityPriority?: readonly string[]; eventGroups?: Record<string, readonly string[]>; codeDefault?: unknown } = {},
): CompatibleResolvedVisualSetting {
  const model = normalized(input);
  const schemes = options.scheme && options.scheme !== "common" ? [options.scheme, "common"] as const : ["common"] as const;
  const parents = Object.entries(options.eventGroups ?? {}).filter(([name, members]) => name !== target.event && members.includes(target.event)).sort((a,b) => a[1].length - b[1].length).map(([name]) => name);
  const events = target.event === "all" ? ["all"] : [target.event, ...(target.event === "redResult" || target.event === "lotteryResult" ? ["winners"] : []), ...parents, "all"];
  for (const scheme of schemes) {
    for (const identity of identityOrder(target, options.identityPriority)) {
      for (const event of events) {
        const key = `${event}|${identity}|${target.placement ?? "main"}|${target.part}`;
        const setting = model[scheme][key]?.[property];
        if (setting && setting.source !== "inherit") return { ...setting, inheritedFrom: key };
      }
    }
    if (target.part === "event") {
      const shared = model[scheme]["all|all|main|allEvents"]?.[property];
      if (shared && shared.source !== "inherit") return {...shared,inheritedFrom:"all|all|main|allEvents"};
    }
  }
  return options.codeDefault === undefined ? { source: "inherit" } : { source: "code", value: options.codeDefault };
}

export function resolveCompatibleVisualControl(
  input: Partial<CompatibleVisualModel>,
  target: CompatibleVisualSelection,
  property: CompatibleVisualProperty,
  options: { scheme?: CompatibleVisualScheme; identityPriority?: readonly string[]; eventGroups?: Record<string, readonly string[]>; codeDefault?: unknown } = {},
): CompatibleVisualControlValue {
  const scheme = options.scheme ?? "common";
  const direct = normalized(input)[scheme][keyOf(target)]?.[property];
  return {
    direct: direct?.source === "inherit" ? undefined : direct,
    resolved: resolveCompatibleVisualProperty(input, {
      event: target.event,
      identities: target.identity === "all" ? [] : [target.identity],
      placement: target.placement ?? "main",
      part: target.part,
    }, property, options),
  };
}

export function temporaryRevealCompatiblePart(
  input: Partial<CompatibleVisualModel>,
  target: CompatibleVisualSelection,
  scheme: CompatibleVisualScheme = "common",
): CompatibleVisualModel {
  return setCompatibleVisualProperty(input, target, "visible", { source: "custom", value: true }, scheme);
}

export function compatiblePartFromElement(target: EventTarget | null, boundary: Element, capability: CompatibleThemeCapabilityMap): string | null {
  const element = target as Element | null;
  if (!element || element.nodeType !== 1 || typeof element.closest !== "function" || !boundary.contains(element)) return null;
  for (const [part, definition] of Object.entries(capability.parts)) {
    const selectors = new Set([
      definition.selector,
      ...Object.values(definition.selectorsByEvent ?? {}),
      ...Object.values(definition.selectorsByPlacement ?? {}),
      ...Object.values(definition.selectorsByContext ?? {}),
    ].flatMap(value => value.split(",").map(branch => branch.trim()).filter(Boolean)));
    for (const selector of selectors) {
      const match = element.closest(selector);
      if (match && boundary.contains(match)) return part;
    }
  }
  return null;
}

export function compatibleCapabilityForSettings(capability: CompatibleThemeCapabilityMap, settings: Record<string, unknown>): CompatibleThemeCapabilityMap {
  if (!Array.isArray(settings.identityPriority)) return capability;
  const available = new Set(Object.keys(capability.identitySelectors ?? {}));
  const priority = [...new Set([...settings.identityPriority.filter((value): value is string => typeof value === "string" && available.has(value)), ...(capability.identityPriority ?? [])])];
  return {...capability, identityPriority:priority};
}


export function installCompatiblePropertyCapabilities(capability: CompatibleThemeCapabilityMap): void {
  const typography: CompatibleVisualProperty[] = ["fontFamily", "fontSize", "lineHeight", "color"];
  const textSurface: CompatibleVisualProperty[] = ["background", "paddingX", "paddingY", "borderWidth", "borderColor", "borderRadius"];
  const imageSurface: CompatibleVisualProperty[] = ["paddingX", "paddingY", "borderWidth", "borderColor", "borderRadius"];
  for (const [id, definition] of Object.entries(capability.parts)) {
    const eventContainer = ["eventArea", "eventList", "event", "allEvents"].includes(id);
    const properties = [...definition.properties];
    if (eventContainer) properties.push(...typography);
    if (properties.includes("fontFamily")) properties.push(...textSurface);
    else if (properties.includes("width") && properties.includes("height")) properties.push(...imageSurface);
    if (properties.includes("borderWidth")) properties.push("borderImage");
    definition.properties = [...new Set(properties)];
    if (eventContainer) {
      definition.units = { ...definition.units, lineHeight: capability.mode === "laplace" ? "number" : "px" };
      if (capability.mode === "blivechat") definition.scaleByProperty = { ...definition.scaleByProperty, fontSize: "global-font" };
      if (capability.mode === "laplace") {
        definition.cssPropertyByProperty = { fontFamily: "--event-font-family", fontSize: "--event-font-size", lineHeight: "--event-line-height-base" };
      }
    }
  }
}
