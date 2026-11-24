import { NATIVE_PART_SELECTORS, NATIVE_EVENT_SCOPE_SELECTORS, NATIVE_ROLE_SELECTORS, type NativeSemanticPartId } from "./nativeSemanticSelectors.ts";
import type { NativeVisualProperty } from "./nativeComponentAppearance.ts";
import { readBackground } from "../components/themeBackgroundValue.ts";

export type NativeInspectedValue = { value: string | number | boolean; mixed: boolean; applicable?:boolean };
export function inspectNativeVisualPart(root: HTMLElement, target: { event: string; identity: string; part: NativeSemanticPartId }): Partial<Record<NativeVisualProperty, NativeInspectedValue>> {
  const document = root.querySelector("iframe")?.contentDocument;
  if (!document) return {};
  const view = document.defaultView;
  if (!view) return {};
  const scope = NATIVE_EVENT_SCOPE_SELECTORS[target.event];
  const identity = NATIVE_ROLE_SELECTORS[(target.identity === "ordinary" ? "normal" : target.identity) as keyof typeof NATIVE_ROLE_SELECTORS];
  const nodes = [...document.querySelectorAll<HTMLElement>(NATIVE_PART_SELECTORS[target.part])].filter(node => {
    const event = node.closest(".event");
    return (!scope || !event || event.matches(scope)) && (!identity || !event || event.matches(identity));
  });
  if (!nodes.length) return {};
  const values = nodes.map(node => {
    const style = view.getComputedStyle(node), fontSize = parseFloat(style.fontSize);
    return {
      visible: style.display !== "none", fontFamily: style.fontFamily, fontSize, fontWeight:parseFloat(style.fontWeight),
      lineHeight: style.lineHeight === "normal" ? 1.5 : parseFloat(style.lineHeight) / fontSize,
      borderImage: style.borderImage, color: style.color, background: readBackground(style), borderColor: style.borderTopColor,
      paddingX: parseFloat(style.paddingLeft), paddingY: parseFloat(style.paddingTop),
      marginX: parseFloat(style.marginLeft), marginY: parseFloat(style.marginTop),
      gap: parseFloat(style.columnGap) || 0, borderWidth: parseFloat(style.borderTopWidth),
      borderRadius: parseFloat(style.borderTopLeftRadius), width: parseFloat(style.width), height: parseFloat(style.height),
    };
  });
  return Object.fromEntries(Object.entries(values[0]).filter(([, value]) => typeof value !== "number" || Number.isFinite(value)).map(([property, value]) => [property, {
    applicable: ["background","borderImage"].includes(property)?nodes.every(node=>!["contents","none"].includes(view.getComputedStyle(node).display)):true,
    value: typeof value === "number" ? Math.round(value * (property === "lineHeight" ? 10000 : 100)) / (property === "lineHeight" ? 10000 : 100) : value, mixed: values.some(other => {
      const next = other[property as keyof typeof other];
      return typeof value === "number" && typeof next === "number" ? Math.abs(value - next) > .02 : value !== next;
    }),
  }]));
}
