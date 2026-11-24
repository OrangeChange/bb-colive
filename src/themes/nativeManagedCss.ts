import {imageBackgroundCss} from "../components/themeImageValue.ts";
import {renderThemeImageDecorations,wrapThemeImageDecorations} from "./themeImageDecorations.ts";
import { scopeThemeCss as scopeNativePreviewCss } from "./themeCssScope.ts";
import { DEFAULT_EVENT_STYLE_SETTINGS, EVENT_STYLE_ROLES, NATIVE_DEFAULT_FONT_FAMILY_CSS, eventFontFamilyCss, rgbaToCss, resolveInheritedRoleStyle, type EventStyleSettings } from "../eventStyleSettings.ts";
import postcss from "postcss";
import { NATIVE_EVENT_SCOPE_SELECTORS, NATIVE_ROLE_SELECTORS } from "./nativeSemanticSelectors.ts";
import { NATIVE_PART_SELECTORS } from "./nativeSemanticSelectors.ts";
import { nativeEventScopePath, nativeVisualPropertiesForPart, resolveNativePartShape } from "./nativeThemeCapabilities.ts";
import { NATIVE_COMPONENT_PARTS, normalizeNativeComponentAppearance, normalizeNativeEventVisibility, normalizeNativeThemeDisplaySettings, normalizeNativeVisualModel, type NativeThemeSettings, type NativeVisualLength, type NativeVisualProperty, type NativeVisualScheme } from "./nativeComponentAppearance.ts";
import { formatNativeVisualMarker, parseNativeVisualMarker } from "./nativeVisualMarker.ts";
import { renderPriceGradientCss } from './nativePriceGradient.ts';
import { patchPriceGradientCss } from './nativePriceGradientCss.ts';

const START = "/* danmu-managed:start */";
const END = "/* danmu-managed:end */";

/** 已保存的发布 CSS 同样按当前场景规则解释事件开关。 */
export function scopeNativeEventVisibilityCss(source: string): string {
  const start = source.indexOf(START), end = source.indexOf(END, start);
  if (start < 0 || end < start) return source;
  const root = postcss.parse(source.slice(start + START.length, end));
  const scopes = new Map(Object.entries(NATIVE_EVENT_SCOPE_SELECTORS).filter(([, selector]) => selector).map(([id, selector]) => [
    postcss.list.comma(selector).map(branch => `.event${branch.trim()}`).join(','), id,
  ]));
  const categories = normalizeNativeEventVisibility(undefined).categories;
  root.walkRules(rule => {
    if (rule.parent !== root && !(rule.parent?.type === 'atrule' && rule.parent.name === 'layer' && rule.parent.params === 'config' && rule.parent.parent === root)) return;
    const selectors = [...new Set(postcss.list.comma(rule.selector).map(branch => branch.replace(/\.theme-target-(?:obs|windows)\s+/g, '').trim()))];
    const id = scopes.get(selectors.join(','));
    if (!id || !rule.nodes.some(node => node.type === 'decl' && node.prop === 'display' && node.value === 'none')) return;
    rule.selector = (id in categories ? ['obs'] : ['windows', 'obs']).flatMap(target => selectors.map(selector => `.theme-target-${target} ${selector}`)).join(', ');
  });
  return source.slice(0, start + START.length) + root.toString() + source.slice(end);
}

/** 读取已发布受控区块中的事件开关，不读取区块外的自定义 CSS。 */
export function readManagedNativeEventVisibility(source: string) {
  const start = source.lastIndexOf(START);
  const end = source.indexOf(END, start);
  if (start < 0 || end < start) return undefined;
  const visibility = normalizeNativeEventVisibility(undefined);
  visibility.categories = Object.fromEntries(Object.keys(visibility.categories).map(key => [key, true]));
  const selectors = new Map(Object.entries(NATIVE_EVENT_SCOPE_SELECTORS).filter(([, value]) => value).map(([id, value]) => [
    postcss.list.comma(value).map(branch => `.event${branch.trim()}`).join(','), id,
  ]));
  const root = postcss.parse(source.slice(start + START.length, end));
  root.walkRules(rule => {
    if (rule.parent !== root && !(rule.parent?.type === "atrule" && rule.parent.name === "layer" && rule.parent.params === "config" && rule.parent.parent === root)) return;
    const id = selectors.get([...new Set(postcss.list.comma(rule.selector).map(branch => branch.replace(/\.theme-target-(?:obs|windows)\s+/g, '').trim()))].join(','));
    if (!id || !rule.nodes.some(node => node.type === 'decl' && node.prop === 'display' && node.value === 'none')) return;
    if (id in visibility.categories) visibility.categories[id] = false;
    else visibility.children[id] = false;
  });
  return visibility;
}

function declaration(name: string, value: { r: number; g: number; b: number; a: number } | null): string | undefined {
  return value ? `  ${name}: ${rgbaToCss(value)};` : undefined;
}

function colorKey(value: { r: number; g: number; b: number; a: number } | null): string {
  return value ? rgbaToCss(value) : "";
}

function scoped(selector: string, scope?: string): string {
  if (!scope) return selector;
  return postcss.list.comma(selector).map(branch => `${scope} ${branch.trim()}`).join(", ");
}

function renderComponentBlocks(settings: EventStyleSettings | NativeThemeSettings, scope?: string): string[] {
  const appearance = normalizeNativeComponentAppearance((settings as Partial<NativeThemeSettings>).componentAppearance);
  return NATIVE_COMPONENT_PARTS.flatMap(part => {
    const style = appearance[part];
    const declarations = [
      style.visible === false ? "  display: none;" : undefined,
      style.color ? `  color: ${style.color};` : undefined,
      style.background ? `  background: ${style.background};` : undefined,
      style.fontFamily ? `  font-family: ${style.fontFamily};` : undefined,
      style.fontSize !== undefined ? `  font-size: ${style.fontSize}px;` : undefined,
      style.lineHeight !== undefined ? `  line-height: ${style.lineHeight};` : undefined,
      style.paddingX !== undefined ? `  padding-left: ${style.paddingX}px;\n  padding-right: ${style.paddingX}px;` : undefined,
      style.paddingY !== undefined ? `  padding-top: ${style.paddingY}px;\n  padding-bottom: ${style.paddingY}px;` : undefined,
      style.marginX !== undefined ? `  margin-left: ${style.marginX}px;\n  margin-right: ${style.marginX}px;` : undefined,
      style.marginY !== undefined ? `  margin-top: ${style.marginY}px;\n  margin-bottom: ${style.marginY}px;` : undefined,
      style.gap !== undefined ? `  gap: ${style.gap}px;` : undefined,
      style.width !== undefined ? `  width: ${style.width}px;` : undefined,
      style.height !== undefined ? `  height: ${style.height}px;` : undefined,
      style.borderWidth !== undefined ? `  border: ${style.borderWidth}px solid ${style.borderColor || "currentColor"};` : undefined,
      style.borderRadius !== undefined ? `  border-radius: ${style.borderRadius}px;` : undefined,
    ].filter((value): value is string => Boolean(value));
    return declarations.length ? [`${scoped(NATIVE_PART_SELECTORS[part], scope)} {\n${declarations.join("\n")}\n}`] : [];
  });
}

const ROOT_VARIABLES: Partial<Record<string, Partial<Record<string, string>>>> = {
  event: { fontWeight:"--event-font-weight", fontFamily:"--event-font-family", fontSize:"--event-font-size", lineHeight:"--event-line-height", color:"--message-color" },
  card: { fontFamily:"--event-font-family", fontSize:"--event-font-size", lineHeight:"--event-line-height", color:"--message-color" },
  header: { fontFamily:"--event-font-family", fontSize:"--event-font-size", lineHeight:"--event-line-height", color:"--message-color" },
  whole: { fontWeight: "--event-font-weight", fontFamily: "--event-font-family", fontSize: "--event-font-size", lineHeight: "--event-line-height", gap: "--event-gap", color: "--message-color" },
  list: { fontWeight: "--event-font-weight", fontFamily: "--event-font-family", fontSize: "--event-font-size", lineHeight: "--event-line-height", gap: "--event-gap", color: "--message-color" },
  row: { fontWeight: "--event-font-weight", fontFamily: "--event-font-family", fontSize: "--event-font-size", lineHeight: "--event-line-height", gap: "--event-gap", color: "--message-color", background: "--event-background" },
  avatar: { width: "--avatar-size", height: "--avatar-height" },
  price: { color: "--price-color" }, giftPrice: { color: "--price-color" },
  reply: { color: "--reply-color" },
  giftProfitPositive: { color: "--blind-profit-gain-color" },
  giftProfitNegative: { color: "--blind-profit-loss-color" },
  inlineEmote: { height: "--emote-size" }, bigEmote: { width: "--big-emote-size", height: "--big-emote-size" },
  guardBadge: { height: "--guard-badge-size" }, honor: { height: "--wealth-medal-size" },
};

function cssValue(property: string, value: unknown, rootFont = false): string {
  if (property === "background") return imageBackgroundCss(value);
  if (property === "fontFamily") return String(value) === "MiSans" ? NATIVE_DEFAULT_FONT_FAMILY_CSS : eventFontFamilyCss(String(value));
  if (["fontSize", "paddingX", "paddingY", "marginX", "marginY", "gap", "width", "height", "borderWidth", "borderRadius"].includes(property)) {
    if (value && typeof value === "object") {
      const length = value as NativeVisualLength;
      return length.mode === "base-relative" ? `calc(var(${rootFont ? "--native-base-size" : "--event-font-size"}, 16px) * ${length.ratio})` : `${length.value}px`;
    }
    return `${value}px`;
  }
  return String(value);
}

function directDeclaration(property: string, value: unknown): string | undefined {
  const map: Record<string, string> = {
    borderImage: `border-image: ${value}`, fontWeight: `font-weight: ${value}`, visible: value === false ? "display: none" : "display: revert-layer", color: `color: ${value}`, background: `background: ${imageBackgroundCss(value)}`,
    fontFamily: `font-family: ${cssValue(property, value)}`, fontSize: `font-size: ${cssValue(property, value)}`, lineHeight: `line-height: ${value}`,
    paddingX: `padding-inline: ${cssValue(property, value)}`, paddingY: `padding-block: ${cssValue(property, value)}`, marginX: `margin-inline: ${cssValue(property, value)}`, marginY: `margin-block: ${cssValue(property, value)}`,
    gap: `gap: ${cssValue(property, value)}`, width: `width: ${cssValue(property, value)}`, height: `height: ${cssValue(property, value)}`, borderWidth: `border-width: ${cssValue(property, value)}`,
    borderColor: `border-color: ${value}`, borderRadius: `border-radius: ${cssValue(property, value)}`,
  };
  return map[property];
}

function numericVisualValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (!value || typeof value !== "object") return 0;
  const length = value as NativeVisualLength;
  return length.mode === "fixed" ? length.value : length.ratio;
}

export function renderNativeVisualBlocks(settings: EventStyleSettings | NativeThemeSettings, scope?: string): string[] {
  const model = normalizeNativeVisualModel((settings as NativeThemeSettings).visualModel);
  const display = normalizeNativeThemeDisplaySettings((settings as NativeThemeSettings).display);
  const rank = (key: string) => {
    const [event, identity] = key.split("|");
    const role = identity === "ordinary" ? "normal" : identity;
    const index = display.identityPriority.indexOf(role as typeof display.identityPriority[number]);
    return [identity === "all" ? 0 : index < 0 ? 1 : display.identityPriority.length - index + 1, event === "all" ? 0 : nativeEventScopePath(event).length];
  };
  const renderLayer = (scheme: NativeVisualScheme) => Object.entries(model[scheme]).sort(([left], [right]) => {
    const a = rank(left), b = rank(right);
    return a[0] - b[0] || a[1] - b[1];
  }).flatMap(([key, properties]) => {
    const [event, identity, part] = key.split("|");
    const partSelector = NATIVE_PART_SELECTORS[part as keyof typeof NATIVE_PART_SELECTORS];
    if (!partSelector) return [];
    if (event !== "all" && !NATIVE_EVENT_SCOPE_SELECTORS[event]) return [];
    const eventSelector = NATIVE_EVENT_SCOPE_SELECTORS[event] ?? "";
    const role = identity === "ordinary" ? "normal" : identity;
    const identitySelector = NATIVE_ROLE_SELECTORS[role as keyof typeof NATIVE_ROLE_SELECTORS]?.slice(".event".length) ?? "";
    const eventRoots = eventSelector
      ? postcss.list.comma(eventSelector).map(selector => `.event${selector.trim()}${identitySelector}`)
      : [`.event${identitySelector}`];
    const partSelectors = postcss.list.comma(partSelector).map(selector => selector.trim().replace(/^\.event\s+/, ""));
    const selectors = part === "event"
      ? eventRoots
      : part === "card"
        ? eventRoots.map(root => `${root}:not(.event-sticky)`)
      : part === "row"
        ? eventRoots.map(root => `.event-list ${root}`)
      : part === "stickyEvent"
        ? eventRoots.map(root => `.sticky-area ${root}.event-sticky`)
      : part === "whole" || part === "canvas" || part === "list" || part === "sticky"
        ? postcss.list.comma(partSelector)
        : eventRoots.flatMap(root => partSelectors.map(child => `${root} ${child}`));
    const shape = resolveNativePartShape(part as keyof typeof NATIVE_PART_SELECTORS, { event, display });
    const allowed = new Set(nativeVisualPropertiesForPart(part as keyof typeof NATIVE_PART_SELECTORS, shape));
    const directDeclarations: string[] = [];
    const rootDeclarations = new Map<string, string>();
    Object.entries(properties ?? {}).forEach(([property, setting]) => {
      if (!setting || setting.source === "inherit") return [];
      if (!allowed.has(property as NativeVisualProperty)) return [];
      const value = setting.value;
      const variable = ROOT_VARIABLES[part]?.[property];
      if (variable) {
        rootDeclarations.set(variable, `  ${variable}: ${cssValue(property, value, variable === "--event-font-size")};`);
        if (part === "whole" || part === "list" || part === "header" && property === "color"
          || ["avatar", "guardBadge", "honor", "inlineEmote", "bigEmote", "price", "giftPrice"].includes(part)) {
          const declaration = directDeclaration(property, value);
          if (declaration) directDeclarations.push(`  ${declaration};`);
        }
      }
      else {
        const declaration = directDeclaration(property, value);
        if (declaration) directDeclarations.push(`  ${declaration};`);
      }
    });
    if (properties?.width && properties.width.source !== "inherit" && allowed.has("width")
      && ["avatar", "giftImage", "blindGiftImage", "inlineEmote", "bannerEmote", "honorWatermark", "winnerAvatar"].includes(part))
      directDeclarations.push("  max-width: none;");
    if (properties?.height && properties.height.source !== "inherit" && allowed.has("height")
      && ["inlineEmote", "bannerEmote", "giftImage", "blindGiftImage", "honorWatermark", "winnerAvatar"].includes(part))
      directDeclarations.push("  max-height: none;");
    if ((properties?.borderWidth?.source !== "inherit") && numericVisualValue(properties?.borderWidth?.value) > 0 && directDeclarations.length) directDeclarations.push("  border-style: solid;");
    const blocks: string[] = [];
    const variableSelectors = ["row", "stickyEvent", "card", "header", "price", "giftPrice"].includes(part) ? selectors : eventRoots;
    const marker = `/* ${formatNativeVisualMarker(scheme, key)} */`;
    const schemeScope = scheme === "common" ? scope : [`.${scheme}`, scope].filter(Boolean).join(" ");
    if (rootDeclarations.size) blocks.push(`${marker}\n${variableSelectors.map(selector => scoped(selector, schemeScope)).join(",\n")} {\n${[...rootDeclarations.values()].join("\n")}\n}`);
    if (directDeclarations.length) blocks.push(`${marker}\n${selectors.map(selector => scoped(selector, schemeScope)).join(",\n")} {\n${directDeclarations.join("\n")}\n}`);
    return blocks;
  });
  return (["common", "light", "dark"] as const).flatMap(renderLayer);
}

function renderEventVisibilityBlocks(settings: EventStyleSettings | NativeThemeSettings, scope?: string): string[] {
  const visibility = normalizeNativeEventVisibility((settings as NativeThemeSettings).eventVisibility);
  const blocks: string[] = [];
  for (const [id, enabled] of Object.entries(visibility.categories)) {
    if (enabled) continue;
    const selector = NATIVE_EVENT_SCOPE_SELECTORS[id];
    if (selector) {
      const roots = postcss.list.comma(selector).map(branch => `.event${branch.trim()}`).join(", ");
      const targetRoots = postcss.list.comma(roots).map(branch => `.theme-target-obs ${branch.trim()}`).join(', ');
      blocks.push(`${scoped(targetRoots, scope)} {\n  display: none;\n}`);
    }
  }
  for (const [id, enabled] of Object.entries(visibility.children)) {
    if (enabled) continue;
    const selector = NATIVE_EVENT_SCOPE_SELECTORS[id];
    if (selector) {
      const roots = postcss.list.comma(selector).map(branch => `.event${branch.trim()}`).join(", ");
      const targetRoots = ['windows', 'obs'].flatMap(target => postcss.list.comma(roots).map(branch => `.theme-target-${target} ${branch.trim()}`)).join(', ');
      blocks.push(`${scoped(targetRoots, scope)} {\n  display: none;\n}`);
    }
  }
  return blocks;
}

function renderElementDisplayBlocks(settings: EventStyleSettings | NativeThemeSettings, scope?: string): string[] {
  const display = normalizeNativeThemeDisplaySettings((settings as NativeThemeSettings).display);
  const badgeParts = [
    display.showGuardIdentity && ".guard-badge", display.showAnchorIdentity && ".streamer-badge",
    display.showAdminIdentity && ".mod-badge", display.showHonorLevel && ".wealth-medal",
    display.showFanMedal && ".fan-medal",
  ].filter(Boolean);
  const userParts = [...badgeParts, display.showUsername && ".username", display.showCurrentRank && ".rank-badge"].filter(Boolean);
  const emptyGroup = (group: string, parts: (string | false)[]) => scoped(`.event .${group}${parts.length ? `:not(:has(${parts.join(", ")}))` : ""}`, scope);
  return [
    `${emptyGroup("badges", badgeParts)} { display: none; }`,
    `${emptyGroup("user", userParts)} { display: none; }`,
    !display.showUsername ? `${scoped(".event .username", scope)} { display: none; }` : "",
  ].filter(Boolean);
}

/** 隐藏最后一个可见成员时，同时收起其用户信息组合。 */
export function renderNativeGroupCss(settings: EventStyleSettings | NativeThemeSettings, scope?: string): string {
  const model = normalizeNativeVisualModel((settings as NativeThemeSettings).visualModel);
  const display = normalizeNativeThemeDisplaySettings((settings as NativeThemeSettings).display);
  const members = {
    username: [".username", display.showUsername], rank: [".rank-badge", display.showCurrentRank],
    guardBadge: [".guard-badge", display.showGuardIdentity], anchorBadge: [".streamer-badge", display.showAnchorIdentity],
    adminBadge: [".mod-badge", display.showAdminIdentity], honor: [".wealth-medal", display.showHonorLevel], medal: [".fan-medal", display.showFanMedal],
  } as const;
  const relevant = (key: string) => key.split("|")[2] in members || ["user", "identity", "badges", "message"].includes(key.split("|")[2]);
  const keys = (["common", "light", "dark"] as const).flatMap(scheme => Object.entries(model[scheme]).filter(([key, value]) => relevant(key) && value.visible && value.visible.source !== "inherit").map(([key]) => key));
  if (!keys.length) return "";
  const events = [...new Set(["all", ...keys.map(key => key.split("|")[0])])];
  const identities = [...new Set(["all", ...keys.map(key => key.split("|")[1])])];
  const compareScope = (left: string, right: string) => {
    const rank = (key: string) => {
      const [event, identity] = key.split("|"), role = identity === "ordinary" ? "normal" : identity;
      const index = display.identityPriority.indexOf(role as typeof display.identityPriority[number]);
      return [identity === "all" ? 0 : display.identityPriority.length - index + 1, nativeEventScopePath(event).length];
    };
    const a = rank(left), b = rank(right);
    return a[0] - b[0] || a[1] - b[1];
  };
  const blocks: string[] = [];
  for (const scheme of ["common", "light", "dark"] as const) {
    if (scheme !== "common" && !Object.entries(model[scheme]).some(([key, value]) => relevant(key) && value.visible && value.visible.source !== "inherit")) continue;
    const layers = scheme === "common" ? [model.common] : [model.common, model[scheme]];
    for (const event of events) for (const identity of identities.sort((a,b) => compareScope(`all|${a}`, `all|${b}`))) {
      const ancestors = new Set(["all", ...nativeEventScopePath(event).map(item => item.id)]);
      const hidden = new Map<string, boolean>();
      for (const layer of layers) for (const [key, properties] of Object.entries(layer).sort(([a],[b]) => compareScope(a,b))) {
        const [parent, role, part] = key.split("|"), visible = properties.visible;
        if (ancestors.has(parent) && (role === "all" || role === identity) && visible && visible.source !== "inherit") hidden.set(part === "identity" ? "user" : part, visible.value === false);
      }
      const role = identity === "ordinary" ? "normal" : identity;
      const identitySelector = identity === "all" ? "" : NATIVE_ROLE_SELECTORS[role as keyof typeof NATIVE_ROLE_SELECTORS]?.slice(".event".length) ?? "";
      const roots = event === "all" ? [`.event${identitySelector}`] : postcss.list.comma(NATIVE_EVENT_SCOPE_SELECTORS[event] ?? "").map(type => `.event${type.trim()}${identitySelector}`);
      const badgeParts = Object.entries(members).filter(([part, [,enabled]]) => !["username", "rank"].includes(part) && enabled && !hidden.get(part)).map(([, [selector]]) => selector);
      const userParts = Object.entries(members).filter(([part, [,enabled]]) => enabled && !hidden.get(part) && (!hidden.get("badges") || ["username", "rank"].includes(part))).map(([, [selector]]) => selector);
      const schemeScope = [scheme === "common" ? undefined : `.${scheme}`, scope].filter(Boolean).join(" ");
      if (hidden.has("message")) blocks.push(`${roots.map(root => scoped(`${root} .repeat-count`, schemeScope)).join(",\n")} { margin-inline-start: ${hidden.get("message") ? "0" : "var(--event-gap, var(--native-space))"}; }`);
      for (const [group, parts, disabled] of [["badges", badgeParts, hidden.get("badges")], ["user", userParts, hidden.get("user") || hidden.get("identity")]] as const) {
        const selectors = (suffix: string) => roots.map(root => scoped(`${root} .${group}${suffix}`, schemeScope)).join(",\n");
        if (!disabled && parts.length) blocks.push(`${selectors(":has(*)")} { display: revert-layer; }`);
        blocks.push(`${selectors(disabled || !parts.length ? "" : `:not(:has(${parts.join(", ")}))`)} { display: none; }`);
      }
    }
  }
  return blocks.join("\n");
}

export function renderManagedNativeCss(settings: EventStyleSettings | NativeThemeSettings, scope?: string): string {
  const blocks = EVENT_STYLE_ROLES.map(role => {
    const style = resolveInheritedRoleStyle(settings, role);
    const baseline = resolveInheritedRoleStyle(DEFAULT_EVENT_STYLE_SETTINGS, role);
    const declarations = [
      colorKey(style.username) !== colorKey(baseline.username) ? declaration("--username-color", style.username) : undefined,
      colorKey(style.content) !== colorKey(baseline.content) ? declaration("--message-color", style.content) : undefined,
      colorKey(style.background) !== colorKey(baseline.background) ? declaration("--event-background-color", style.background) : undefined,
      colorKey(style.stroke) !== colorKey(baseline.stroke) ? declaration("--event-stroke-color", style.stroke) : undefined,
    ].filter((value): value is string => Boolean(value));
    return declarations.length ? `${scoped(NATIVE_ROLE_SELECTORS[role], scope)} {\n${declarations.join("\n")}\n}` : "";
  }).filter(Boolean);
  blocks.push(...renderComponentBlocks(settings, scope));
  blocks.push(...renderEventVisibilityBlocks(settings, scope));
  blocks.push(...renderElementDisplayBlocks(settings, scope));
  blocks.push(...renderNativeVisualBlocks(settings, scope));
  const decorations=(settings as NativeThemeSettings).imageDecorations;
  if(decorations)blocks.push(wrapThemeImageDecorations(renderThemeImageDecorations(decorations,key=>{
    const [scheme,...parts]=key.split('|');if(parts[2]==='avatarFrame')parts[2]='avatarWrap';const target=parts.join('|');
    const rules=renderNativeVisualBlocks({...settings,visualModel:{common:{},light:{},dark:{},[scheme]:{[target]:{visible:{source:'custom',value:false}}}}} as NativeThemeSettings,scope);
    const rule=postcss.parse(rules.join('\n')).nodes.find(node=>node.type==='rule');return rule?.type==='rule'?rule.selector:null;
  },event=>nativeEventScopePath(event).slice(0,-1).reverse().map(scope=>scope.id),(left,right)=>{
    const priority=normalizeNativeThemeDisplaySettings((settings as NativeThemeSettings).display).identityPriority;
    const rank=(key:string)=>{const [event,identity]=key.split('|'),role=identity==='ordinary'?'normal':identity,index=priority.indexOf(role as typeof priority[number]);return [identity==='all'?0:index<0?1:priority.length-index+1,event==='all'?0:nativeEventScopePath(event).length];};
    const a=rank(left),b=rank(right);return a[0]-b[0]||a[1]-b[1];
  })));
  const gradient = renderPriceGradientCss((settings as NativeThemeSettings).priceGradient, (settings as NativeThemeSettings).display?.usePriceGradient === true);
  if (gradient) blocks.push(scope ? scopeNativePreviewCss(gradient, scope) : gradient);
  return blocks.length ? `${START}\n${blocks.join("\n\n")}\n${END}` : "";
}

export function replaceManagedNativeCss(source: string, settings: EventStyleSettings): string {
  const managed = renderManagedNativeCss(settings);
  const start = source.indexOf(START);
  const end = source.indexOf(END);
  if (start >= 0 && end >= start) {
    return `${source.slice(0, start)}${managed}${source.slice(end + END.length)}`;
  }
  if (!managed) return source;
  return source.trim() ? `${managed}\n\n${source.trim()}\n` : `${managed}\n`;
}

interface ManagedVisualBlock {
  marker: string;
  occurrence: number;
  rule: postcss.Rule;
}

function managedVisualBlocks(root: postcss.Root): ManagedVisualBlock[] {
  const occurrences = new Map<string, number>();
  const blocks: ManagedVisualBlock[] = [];
  let marker = "";
  root.nodes.forEach(node => {
    if (node.type === "comment") {
      marker = parseNativeVisualMarker(node.text) ? node.text.trim() : "";
      return;
    }
    if (!marker || node.type !== "rule") return;
    const occurrence = occurrences.get(marker) ?? 0;
    occurrences.set(marker, occurrence + 1);
    blocks.push({ marker, occurrence, rule: node });
    marker = "";
  });
  return blocks;
}

function blockKey(block: ManagedVisualBlock): string {
  return `${block.marker}\u0000${block.occurrence}`;
}

function declarationValues(rule: postcss.Rule): Map<string, string> {
  const values = new Map<string, string>();
  rule.nodes.forEach(node => { if (node.type === "decl") values.set(node.prop, node.value); });
  return values;
}

export function patchManagedNativeCss(
  source: string,
  previous: EventStyleSettings | NativeThemeSettings,
  next: EventStyleSettings | NativeThemeSettings,
): string {
  const root = postcss.parse(source);
  const previousRoot = postcss.parse(renderManagedNativeCss(previous));
  const nextRoot = postcss.parse(renderManagedNativeCss(next));
  const sourceBlocks = new Map(managedVisualBlocks(root).map(block => [blockKey(block), block]));
  const previousBlocks = new Map(managedVisualBlocks(previousRoot).map(block => [blockKey(block), block]));
  const nextBlocks = new Map(managedVisualBlocks(nextRoot).map(block => [blockKey(block), block]));

  new Set([...previousBlocks.keys(), ...nextBlocks.keys()]).forEach(key => {
    const before = previousBlocks.get(key);
    const after = nextBlocks.get(key);
    const target = sourceBlocks.get(key);
    const beforeValues = before ? declarationValues(before.rule) : new Map<string, string>();
    const afterValues = after ? declarationValues(after.rule) : new Map<string, string>();
    const changed = [...new Set([...beforeValues.keys(), ...afterValues.keys()])]
      .filter(property => beforeValues.get(property) !== afterValues.get(property));
    if (!changed.length) return;

    if (!target && after) {
      const marker = postcss.comment({ text: after.marker });
      const end = root.nodes.find(node => node.type === "comment" && node.text.trim() === "danmu-managed:end");
      if (end) {
        root.insertBefore(end, marker);
        root.insertBefore(end, after.rule.clone());
      } else {
        root.append(marker);
        root.append(after.rule.clone());
      }
      return;
    }
    if (!target) return;

    changed.forEach(property => {
      const declarations = target.rule.nodes.filter(
        (node): node is postcss.Declaration => node.type === "decl" && node.prop === property,
      );
      const value = afterValues.get(property);
      if (value === undefined) {
        declarations.forEach(declaration => declaration.remove());
      } else if (declarations.length) {
        declarations[declarations.length - 1].value = value;
      } else {
        target.rule.append({ prop: property, value });
      }
    });
  });
  const previousSettings=previous as NativeThemeSettings,nextSettings=next as NativeThemeSettings;
  const changed=JSON.stringify(previousSettings.priceGradient)!==JSON.stringify(nextSettings.priceGradient)||previousSettings.display?.usePriceGradient!==nextSettings.display?.usePriceGradient;
  return changed ? patchPriceGradientCss(root.toString(),nextSettings.priceGradient,nextSettings.display?.usePriceGradient===true,previousSettings.priceGradient) : root.toString();
}

export { scopeThemeCss as scopeNativePreviewCss } from "./themeCssScope.ts";

export function tryScopeNativePreviewCss(source: string, scope: string): { css: string; error: string | null } {
  try {
    return { css: scopeNativePreviewCss(source, scope), error: null };
  } catch (error) {
    return { css: "", error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
  }
}

export function nativeImageTargetSelector(settings:NativeThemeSettings,key:string,scheme:NativeVisualScheme):string{
  const rules=renderNativeVisualBlocks({...settings,visualModel:{common:{},light:{},dark:{},[scheme]:{[key]:{visible:{source:'custom',value:false}}}}});
  const rule=postcss.parse(rules.join('\n')).nodes.find(node=>node.type==='rule');return rule?.type==='rule'?rule.selector:'';
}
