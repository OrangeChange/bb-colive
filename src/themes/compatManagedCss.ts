import {imageBackgroundCss} from "../components/themeImageValue.ts";
import {renderThemeImageDecorations,wrapThemeImageDecorations,stripThemeImageDecorations,imageEventParents} from "./themeImageDecorations.ts";
import postcss, { type Declaration } from "postcss";
import type { NativeVisualModel, NativeVisualProperty, NativeVisualSetting } from "./nativeComponentAppearance.ts";
import { compatibleCapabilityForSettings, type CompatiblePartCapability, type CompatibleThemeCapabilityMap } from "./compatThemeCapabilities.ts";
import type { CompatibleVisualAuthored, CompatibleVisualSettings } from "./compatThemeSettings.ts";

const START = "/* danmu-compat-managed:start */";
const END = "/* danmu-compat-managed:end */";

export function compatibleCanonicalTargetKeys(capability: CompatibleThemeCapabilityMap, key: string): string[] {
  const [event, identity, placement, part] = key.split("|");
  if (capability.mode === "laplace" || part !== "paidContent") return [key];
  return (event === "all" ? ["gift", "gift-normal",  "superchat"] : [event]).map(event => `${event}|${identity}|${placement}|contentArea`);
}

export function normalizeCompatibleVisualTargets(capability: CompatibleThemeCapabilityMap, input: Partial<NativeVisualModel>): NativeVisualModel {
  const result: NativeVisualModel = { common: {}, light: {}, dark: {} };
  for (const scheme of ["common", "light", "dark"] as const) {
    const entries = Object.entries(input[scheme] ?? {}).sort(([a], [b]) => compareCompatibleTargets(capability, a, b));
    for (const [key, values] of entries) for (const canonical of compatibleCanonicalTargetKeys(capability, key)) result[scheme][canonical] = { ...result[scheme][canonical], ...values };
  }
  return result;
}

export function normalizeCompatibleVisualAuthored(capability: CompatibleThemeCapabilityMap, input: CompatibleVisualAuthored | undefined): CompatibleVisualAuthored {
  const result: CompatibleVisualAuthored = { common: {}, light: {}, dark: {} };
  for (const scheme of ["common", "light", "dark"] as const) for (const [key, properties] of Object.entries(input?.[scheme] ?? {})) {
    for (const canonical of compatibleCanonicalTargetKeys(capability, key)) result[scheme][canonical] = [...new Set([...(result[scheme][canonical] ?? []), ...properties])];
  }
  return result;
}

export function normalizeCompatibleTargetSource(source: string, capability: CompatibleThemeCapabilityMap): string {
  if (capability.mode === "laplace" || !source.includes("paidContent")) return source;
  const root = postcss.parse(source);
  let marker: postcss.Comment | undefined;
  for (const node of [...root.nodes]) {
    if (node.type === "comment") { marker = markerKey(node.text) ? node : undefined; continue; }
    const key = marker && markerKey(marker.text);
    if (node.type !== "rule" || !key || !isCompatibleManagedRule(capability, key, node)) { marker = undefined; continue; }
    const [scheme, ...parts] = key.split("|");
    const original = parts.join("|");
    const keys = compatibleCanonicalTargetKeys(capability, original);
    if (keys.length !== 1 || keys[0] !== original) {
      for (const canonical of keys) {
        const selector = compatibleSelectorFor(capability, canonical, scheme);
        if (!selector) continue;
        root.insertBefore(node, postcss.comment({ text: `compat-visual:${scheme}|${canonical}` }));
        root.insertBefore(node, node.clone({ selector }));
      }
      marker?.remove(); node.remove();
    }
    marker = undefined;
  }
  return root.toString();
}

const CSS_PROPERTY: Record<NativeVisualProperty, string> = {
  borderImage:"border-image", fontWeight:"font-weight", visible: "display", color: "color", background: "background", fontFamily: "font-family", fontSize: "font-size",
  lineHeight: "line-height", paddingX: "padding-inline", paddingY: "padding-block", marginX: "margin-inline",
  marginY: "margin-block", gap: "gap", width: "width", height: "height", borderWidth: "border-width",
  borderColor: "border-color", borderRadius: "border-radius",
};

export const COMPAT_PROPERTY_BY_CSS = Object.fromEntries(Object.entries(CSS_PROPERTY).map(([key, value]) => [value, key])) as Record<string, NativeVisualProperty>;

export function compatibleCssProperty(definition: CompatiblePartCapability, property: NativeVisualProperty): string {
  return definition.cssPropertyByProperty?.[property] ?? CSS_PROPERTY[property];
}

export function compatibleVisualPropertyForCss(definition: CompatiblePartCapability, cssProperty: string): NativeVisualProperty | undefined {
  return Object.entries(definition.cssPropertyByProperty ?? {}).find(([, name]) => name === cssProperty)?.[0] as NativeVisualProperty | undefined
    ?? COMPAT_PROPERTY_BY_CSS[cssProperty];
}

function cssValue(definition: CompatiblePartCapability, property: NativeVisualProperty, setting: NativeVisualSetting): string | null {
  if (setting.source === "inherit" || setting.value === undefined) return null;
  const settingValue = setting.value;
  if(property==="background")return imageBackgroundCss(settingValue);
  if (property === "visible") return settingValue ? "revert-layer" : "none";
  if (typeof settingValue === "number") return definition.units?.[property] === "number" ? String(settingValue) : `${settingValue}px`;
  if (typeof settingValue === "object") {
    const length = settingValue as { mode?: string; value?: number; ratio?: number };
    if (length.mode === "fixed") return `${length.value}px`;
    if (length.mode === "base-relative") return `calc(var(--event-base-size, 16px) * ${length.ratio})`;
  }
  return String(settingValue);
}

export function compatibleSelectorFor(capability: CompatibleThemeCapabilityMap, key: string, scheme: string, uniformEventSpecificity = true): string | null {
  const [event, identity, placement, part] = key.split("|");
  const definition = capability.parts[part];
  if (!definition) return null;
  if (placement !== "main" && placement !== "sticky" && placement !== "detail") return null;
  if (definition.placements && !definition.placements.includes(placement)) return null;
  if (definition.scope === "global") {
    const selector = definition.selectorsByPlacement?.[placement] ?? definition.selector;
    const schemeRoot = scheme === "common" ? "" : capability.schemeSelectors?.[scheme as "light" | "dark"] ?? `[data-theme="${scheme}"]`;
    return postcss.list.comma(selector).map(branch => schemeRoot ? `${schemeRoot} ${branch}` : branch).join(",\n");
  }
  const members = capability.eventGroups?.[event] ?? (event === "winners" ? ["redResult", "lotteryResult"] : [event]);
  if (event !== "all" && definition.events && !members.some(member => definition.events!.includes(member))) return null;
  const sharedEvents = capability.mode === "laplace" && part === "allEvents"
    ? Object.fromEntries(Object.entries(capability.sourceEventSelectorsByPlacement?.main ?? capability.eventSelectorsByPlacement?.main ?? {}).map(([name, selector]) => [name, [selector, (capability.sourceEventSelectorsByPlacement?.sticky ?? capability.eventSelectorsByPlacement?.sticky)?.[name]].filter(Boolean).join(",")]))
    : undefined;
  const placementEvents = sharedEvents ?? capability.eventSelectorsByPlacement?.[placement];
  const memberEvents = sharedEvents ?? capability.sourceEventSelectorsByPlacement?.[placement] ?? placementEvents;
  const eventSource = members.filter(member => !definition.events || definition.events.includes(member)).map(member => memberEvents?.[member] ?? capability.eventSelectors?.[member] ?? "").filter(Boolean).join(",");
  const events = event === "all"
    ? placementEvents
      ? Object.entries(placementEvents)
        .filter(([name]) => !definition.events || definition.events.includes(name))
        .flatMap(([, selector]) => postcss.list.comma(selector))
      : [""]
    : postcss.list.comma(eventSource);
  const identities = identity === "all" ? [""] : postcss.list.comma(capability.identitySelectors?.[identity] ?? "");
  const partSource = definition.selectorsByContext?.[`${event}|${placement}`]
    ?? definition.selectorsByPlacement?.[placement]
    ?? definition.selectorsByEvent?.[event]
    ?? definition.selector;
  const parts = postcss.list.comma(partSource);
  if (!events.length || !identities.length || !parts.length) return null;
  const selectors = events.flatMap(eventSelector => identities.flatMap(identitySelector => parts.map(partSelector => {
    const eventRoot = eventSelector.trim() + (definition.eventFilter ?? "");
    const root = `${eventRoot && uniformEventSpecificity ? `:root:root:root:root :where(${eventRoot})` : eventRoot}${identitySelector.trim() ? `:where(${identitySelector.trim()})` : ""}`;
    const selector = (part === "event" || definition.scope === "event") ? (root || partSelector.trim()) : [root, partSelector.trim()].filter(Boolean).join(" ");
    const schemeRoot = scheme === "common" ? "" : capability.schemeSelectors?.[scheme as "light" | "dark"] ?? `[data-theme="${scheme}"]`;
    return schemeRoot ? selector.startsWith(":root") ? selector.replace(":root", `:root${schemeRoot}`) : `${schemeRoot} ${selector}` : selector;
  })));
  return [...new Set(selectors)].join(",\n");
}

function normalizeCompatibleSelector(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isCompatibleManagedRule(
  capability: CompatibleThemeCapabilityMap,
  managedKey: string,
  rule: postcss.Rule,
): boolean {
  const separator = managedKey.indexOf("|");
  if (separator < 0) return false;
  const scheme = managedKey.slice(0, separator);
  const key = managedKey.slice(separator + 1);
  const expected = compatibleSelectorFor(capability, key, scheme);
  if (expected === null) return false;
  const historicalCapability = capability.mode === "blivechat" || capability.mode === "blivechat-open"
    ? { ...capability, eventGroups: { ...capability.eventGroups, gift: ["gift"] } }
    : capability;
  const historical = compatibleSelectorFor(historicalCapability, key, scheme, false);
  const previousUniform = expected.replace(/(?::root){3}(?= )/g, "");
  const unscoped = compatibleSelectorFor(capability, key, scheme, false) ?? expected;
  const legacy = Object.values(capability.identitySelectors ?? {}).flatMap(value => postcss.list.comma(value)).reduce((selector, identity) => selector.split(`:where(${identity.trim()})`).join(identity.trim()), unscoped);
  const ownerLegacy = capability.mode === "blivechat-open" ? legacy.split("[is-owner='true']").join("[author-type='owner']") : legacy;
  const previousParts: Record<string, string> = capability.mode === "laplace"
    ? { body: ".message", message: ".message, .message-text", giftResultPrice: ".price > .price-currency, .price > .price-figure", giftPaidPrice: ".price-actual", giftTrend: ".price-blind-result svg" }
    : capability.mode === "blivechat" ? { modBadge: "yt-live-chat-author-badge-renderer[type='moderator'], yt-live-chat-author-badge-renderer[is-admin='true']", guardBadge: "yt-live-chat-author-badge-renderer[type='member']" } : {};
  const part = key.split("|")[3];
  const previousCapability = previousParts[part] ? { ...capability, parts: { ...capability.parts, [part]: { ...capability.parts[part], selector: previousParts[part], eventFilter: undefined, events: part === "body" ? undefined : capability.parts[part].events } } } : null;
  const previousPart = previousCapability && compatibleSelectorFor(previousCapability, key, scheme);
  const previousUnscoped = previousCapability && compatibleSelectorFor(previousCapability, key, scheme, false);
  const previousLegacy = previousUnscoped && Object.values(capability.identitySelectors ?? {}).flatMap(value => postcss.list.comma(value)).reduce((selector, identity) => selector.split(`:where(${identity.trim()})`).join(identity.trim()), previousUnscoped);
  return [expected, previousUniform, unscoped, legacy, ownerLegacy, historical, previousPart, previousPart && previousPart.replace(/(?::root){3}(?= )/g, ""), previousUnscoped, previousLegacy].some(selector => typeof selector === "string" && normalizeCompatibleSelector(rule.selector) === normalizeCompatibleSelector(selector));
}

function declarations(definition: CompatiblePartCapability, properties: Record<string, NativeVisualSetting>): string[] {
  const allowed = new Set(definition.properties);
  return Object.entries(properties).flatMap(([property, setting]) => {
    if (!allowed.has(property as NativeVisualProperty) || setting.source === "inherit") return [];
    const value = cssValue(definition, property as NativeVisualProperty, setting);
    return value === null ? [] : [
      `  ${compatibleCssProperty(definition, property as NativeVisualProperty)}: ${value};`,
      ...(property === "borderWidth" ? ["  border-style: solid;"] : []),
    ];
  });
}

function compareCompatibleTargets(capability: CompatibleThemeCapabilityMap, left: string, right: string): number {
  const rank = (key: string) => {
    const [event, identity] = key.split("|");
    const priority = capability.identityPriority ?? [];
    const index = priority.indexOf(identity);
    return [identity === "all" ? 0 : index < 0 ? 1 : priority.length - index + 1,event === "all" ? 0 : event === "winners" || (capability.eventGroups?.[event]?.length ?? 0) > 1 ? 1 : 2];
  };
  const a=rank(left),b=rank(right);
  return a[0]-b[0] || a[1]-b[1] || left.localeCompare(right);
}

export function renderCompatibleManagedCss(capability: CompatibleThemeCapabilityMap, model: Partial<NativeVisualModel>): string {
  model = normalizeCompatibleVisualTargets(capability, model);
  const blocks: string[] = [];
  for (const scheme of ["common", "light", "dark"] as const) {
    const entries = Object.entries(model[scheme] ?? {}).sort(([left],[right])=>compareCompatibleTargets(capability,left,right));
    for (const [key, properties] of entries) {
      const definition = capability.parts[key.split("|")[3]];
      const selector = compatibleSelectorFor(capability, key, scheme);
      if (!definition || !selector) continue;
      const lines = declarations(definition, properties);
      if (lines.length) blocks.push(`/* compat-visual:${scheme}|${key} */\n${selector} {\n${lines.join("\n")}\n}`);
    }
  }
  return blocks.length ? `${START}\n${blocks.join("\n\n")}\n${END}` : "";
}

export function withoutGeneratedManagedCss(source: string, generated: string, capability: CompatibleThemeCapabilityMap): string {
  const root = postcss.parse(source);
  const generatedRules = indexedRules(postcss.parse(generated), capability);
  let marker: string | null = null;
  for (const node of [...root.nodes]) {
    if (node.type === "comment" && (node.text.trim() === "danmu-compat-managed:start" || node.text.trim() === "danmu-compat-managed:end")) { node.remove(); continue; }
    if (node.type === "comment") { marker = markerKey(node.text); continue; }
    if (!marker || node.type !== "rule") continue;
    if (!isCompatibleManagedRule(capability, marker, node)) { marker = null; continue; }
    const generatedRule = generatedRules.get(marker);
    for (const child of [...node.nodes]) {
      if (child.type !== "decl") continue;
      const generatedDeclaration = generatedRule?.nodes.find(candidate => candidate.type === "decl" && candidate.prop === child.prop && candidate.value === child.value && candidate.important === child.important);
      if (generatedDeclaration) child.remove();
    }
    const markerComment = node.prev();
    if (!node.nodes.length) { node.remove(); if (markerComment?.type === "comment" && markerKey(markerComment.text)) markerComment.remove(); }
    marker = null;
  }
  return root.toString().trim();
}

export function materializeCompatibleVisualCss(
  document: { styles: { visualCss: string }; settings: CompatibleVisualSettings },
  capability: CompatibleThemeCapabilityMap,
): string {
  capability = compatibleCapabilityForSettings(capability, document.settings);
  const source = normalizeCompatibleTargetSource(stripThemeImageDecorations(document.styles.visualCss).trim(), capability);
  const decorationCss=wrapThemeImageDecorations(renderThemeImageDecorations(document.settings.imageDecorations,key=>{const [scheme,...parts]=key.split("|");if(parts[3]==="avatarFrame")parts[3]="avatarWrap";return compatibleSelectorFor(capability,parts.join("|"),scheme);},event=>imageEventParents(event,capability.eventGroups),(left,right)=>compareCompatibleTargets(capability,left,right)));
  const model = normalizeCompatibleVisualTargets(capability, document.settings.visualModel ?? {});
  const authored = normalizeCompatibleVisualAuthored(capability, document.settings.visualAuthored);
  const managed = renderCompatibleManagedCss(capability, withoutAuthoredProperties(model, authored));
  if (source.includes("compat-visual:")) {
    const result = reconcileCompatibleManagedCss(source, managed, capability);
    const root=postcss.parse(result), rules=indexedRules(root,capability);
    const order=[...rules.keys()].sort((left,right)=>{
      const a=left.indexOf("|"),b=right.indexOf("|");
      const schemes=["common","light","dark"];
      return schemes.indexOf(left.slice(0,a))-schemes.indexOf(right.slice(0,b)) || compareCompatibleTargets(capability,left.slice(a+1),right.slice(b+1));
    });
    const slots=[...rules.entries()].filter(([key])=>order.includes(key));
    const sorted=[...slots].sort(([a],[b])=>order.indexOf(a)-order.indexOf(b));
    const replacements=sorted.map(([key,rule])=>({key,rule:rule.clone()}));
    slots.forEach(([,slot],index)=>{const next=replacements[index],marker=slot.prev();if(marker?.type==="comment")marker.text=`compat-visual:${next.key}`;slot.replaceWith(next.rule);});
    return [root.toString(),decorationCss].filter(Boolean).join("\n\n");
  }
  return [managed, source,decorationCss].filter(Boolean).join("\n\n");
}

function withoutAuthoredProperties(model: Partial<NativeVisualModel>, authored?: CompatibleVisualAuthored): NativeVisualModel {
  const result = structuredClone({ common: model.common ?? {}, light: model.light ?? {}, dark: model.dark ?? {} }) as NativeVisualModel;
  if (!authored) return result;
  for (const scheme of ["common", "light", "dark"] as const) {
    for (const [key, properties] of Object.entries(authored[scheme] ?? {})) {
      const settings = { ...(result[scheme][key] ?? {}) };
      for (const property of properties) delete settings[property];
      if (Object.keys(settings).length) result[scheme][key] = settings;
      else delete result[scheme][key];
    }
  }
  return result;
}

export function clearCompatibleAuthoredProperty(
  input: CompatibleVisualAuthored | undefined,
  scheme: keyof CompatibleVisualAuthored,
  key: string,
  property: NativeVisualProperty,
): CompatibleVisualAuthored {
  const result = structuredClone(input ?? { common: {}, light: {}, dark: {} });
  const properties = (result[scheme][key] ?? []).filter(value => value !== property);
  if (properties.length) result[scheme][key] = properties;
  else delete result[scheme][key];
  return result;
}

export function clearCompatibleAuthoredTarget(
  input: CompatibleVisualAuthored | undefined,
  scheme: keyof CompatibleVisualAuthored,
  key: string,
): CompatibleVisualAuthored {
  const result = structuredClone(input ?? { common: {}, light: {}, dark: {} });
  delete result[scheme][key];
  return result;
}

export function clearCompatibleManagedTargetCss(
  source: string,
  capability: CompatibleThemeCapabilityMap,
  scheme: keyof CompatibleVisualAuthored,
  key: string,
  property?: NativeVisualProperty,
): string {
  const root = postcss.parse(normalizeCompatibleTargetSource(source, capability));
  const managedKey = `${scheme}|${key}`;
  const rules = root.nodes.filter((node): node is postcss.Rule => node.type === "rule" && node.prev()?.type === "comment" && markerKey((node.prev() as postcss.Comment).text) === managedKey && isCompatibleManagedRule(capability, managedKey, node));
  if (!rules.length) return root.toString();
  const definition = capability.parts[key.split("|")[3]];
  const removable = property
    ? new Set([CSS_PROPERTY[property], ...(definition?.cssPropertyByProperty?.[property] ? [definition.cssPropertyByProperty[property]] : [])])
    : new Set((definition?.properties ?? []).flatMap(candidate => [CSS_PROPERTY[candidate], compatibleCssProperty(definition!, candidate)]));
  for (const rule of rules) {
    const hasManagedBorder = definition?.properties.includes("borderWidth")
      && rule.nodes.some(node => node.type === "decl" && node.prop === "border-width");
    for (const node of [...rule.nodes]) {
      if (node.type === "decl" && (removable.has(node.prop)
        || (hasManagedBorder && (!property || property === "borderWidth") && node.prop === "border-style" && node.value === "solid" && !node.important))) node.remove();
    }
    if (!rule.nodes.some(node => node.type === "decl")) {
      const marker = rule.prev();
      rule.remove();
      if (marker?.type === "comment" && markerKey(marker.text) === managedKey) marker.remove();
    }
  }
  return root.toString();
}

function reconcileCompatibleManagedCss(source: string, generated: string, capability: CompatibleThemeCapabilityMap): string {
  const root = postcss.parse(source);
  const desiredRoot = postcss.parse(generated);
  const sourceRules = indexedRules(root, capability);
  const desiredRules = indexedRules(desiredRoot, capability);
  const declarationList = (rule: postcss.Rule | undefined) => rule?.nodes.filter((node): node is Declaration => node.type === "decl") ?? [];

  for (const [key, target] of sourceRules) {
    const desired = desiredRules.get(key);
    const separator = key.indexOf("|");
    const selector = compatibleSelectorFor(capability, key.slice(separator + 1), key.slice(0, separator));
    if (selector) target.selector = selector;
    const desiredValues = new Map(declarationList(desired).map(node => [node.prop, node.value]));
    for (const property of desiredValues.keys()) {
      const existing = target.nodes.filter((node): node is Declaration => node.type === "decl" && node.prop === property);
      const value = desiredValues.get(property);
      if (property === "border-style" && existing.length) continue;
      if (existing.length) existing[existing.length - 1].value = value!;
      else target.append({ prop: property, value: value! });
    }
    desiredRules.delete(key);
  }

  const end = root.nodes.find(node => node.type === "comment" && node.text.trim() === "danmu-compat-managed:end");
  for (const [key, rule] of desiredRules) {
    const marker = postcss.comment({ text: `compat-visual:${key}` });
    if (end) { root.insertBefore(end, marker); root.insertBefore(end, rule.clone()); }
    else { root.append(marker); root.append(rule.clone()); }
  }
  return root.toString();
}

function markerKey(text: string): string | null {
  const match = text.trim().match(/^compat-visual:(common|light|dark)\|(.+)$/);
  return match ? `${match[1]}|${match[2]}` : null;
}

function indexedRules(root: postcss.Root, capability: CompatibleThemeCapabilityMap): Map<string, postcss.Rule> {
  const result = new Map<string, postcss.Rule>();
  let marker: string | null = null;
  for (const node of root.nodes) {
    if (node.type === "comment") { marker = markerKey(node.text); continue; }
    if (marker && node.type === "rule") {
      if (isCompatibleManagedRule(capability, marker, node)) result.set(marker, node);
      marker = null;
    }
  }
  return result;
}

export function patchCompatibleManagedCss(source: string, capability: CompatibleThemeCapabilityMap, previous: Partial<NativeVisualModel>, next: Partial<NativeVisualModel>): string {
  source = normalizeCompatibleTargetSource(source, capability);
  const root = postcss.parse(source);
  const before = postcss.parse(renderCompatibleManagedCss(capability, previous));
  const after = postcss.parse(renderCompatibleManagedCss(capability, next));
  const sourceRules = indexedRules(root, capability);
  const beforeRules = indexedRules(before, capability);
  const afterRules = indexedRules(after, capability);
  for (const key of new Set([...beforeRules.keys(), ...afterRules.keys()])) {
    const declarationsOf = (rule: postcss.Rule | undefined) => rule?.nodes.filter((node): node is Declaration => node.type === "decl") ?? [];
    const oldValues = new Map(declarationsOf(beforeRules.get(key)).map(node => [node.prop, node.value]));
    const newValues = new Map(declarationsOf(afterRules.get(key)).map(node => [node.prop, node.value]));
    const changed = [...new Set([...oldValues.keys(), ...newValues.keys()])].filter(property => oldValues.get(property) !== newValues.get(property));
    if (!changed.length) continue;
    let target = sourceRules.get(key);
    for (const duplicate of root.nodes) {
      if (duplicate.type !== "rule" || duplicate === target || duplicate.prev()?.type !== "comment" || markerKey((duplicate.prev() as postcss.Comment).text) !== key || !isCompatibleManagedRule(capability, key, duplicate)) continue;
      for (const child of [...duplicate.nodes]) if (child.type === "decl" && changed.includes(child.prop)) child.remove();
    }
    if (!target && afterRules.get(key)) {
      const end = root.nodes.find(node => node.type === "comment" && node.text.trim() === "danmu-compat-managed:end");
      const marker = postcss.comment({ text: `compat-visual:${key}` });
      target = afterRules.get(key)!.clone();
      if (end) { root.insertBefore(end, marker); root.insertBefore(end, target); }
      else { root.append(marker); root.append(target); }
      sourceRules.set(key, target);
      continue;
    }
    if (!target) continue;
    for (const property of changed) {
      const existing = target.nodes.filter((node): node is Declaration => node.type === "decl" && node.prop === property);
      const value = newValues.get(property);
      if (property === "border-style") {
        if (value === undefined) existing.filter(node => node.value === "solid" && !node.important).forEach(node => node.remove());
        else if (!existing.length) target.append({ prop: property, value });
        continue;
      }
      if (value === undefined) existing.forEach(node => node.remove());
      else if (existing.length) existing[existing.length - 1].value = value;
      else target.append({ prop: property, value });
    }
  }
  return root.toString();
}
