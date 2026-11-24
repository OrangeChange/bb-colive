import { nativeEventScopePath, nativePartSupportsEvent, NATIVE_IDENTITY_SCOPES, NATIVE_SEMANTIC_PARTS, NATIVE_VISUAL_NAVIGATION, nativeVisualPartUsesGlobalScope, type NativeVisualNavigationItem } from "./nativeThemeCapabilities.ts";
import { NATIVE_EVENT_SCOPE_SELECTORS, NATIVE_PART_ALIASES, type NativeSemanticPartId } from "./nativeSemanticSelectors.ts";

export interface NativeNavigationSelection { event: string; identity: string; part: NativeSemanticPartId }

export function nativeNavigationPart(item: NativeVisualNavigationItem): NativeSemanticPartId | undefined {
  return item.part ?? NATIVE_SEMANTIC_PARTS.find(part => part.id === item.id)?.id;
}

function eventMatches(event: string, expected: string) {
  if (expected === "all") return event === "all" || nativeEventScopePath(event).some(scope => scope.id === "gift");
  return event === expected || nativeEventScopePath(event).some(scope => scope.id === expected);
}

export function findNativeNavigation(selection: NativeNavigationSelection) {
  if (!nativePartSupportsEvent(selection.part, selection.event)) return undefined;
  const entries = NATIVE_VISUAL_NAVIGATION.flatMap(group => {
    const collect = (items: readonly NativeVisualNavigationItem[], inheritedEvent?: string, path: string[] = []): { group: typeof group; item: NativeVisualNavigationItem; event?: string; path: string[] }[] =>
      items.flatMap(item => {
        const event = item.event ?? inheritedEvent;
        const label = item.label ?? NATIVE_SEMANTIC_PARTS.find(part => part.id === nativeNavigationPart(item))?.label ?? item.id;
        const nextPath = [...path, label];
        return [{ group, item, event, path: nextPath }, ...collect(item.children ?? [], event, nextPath)];
      });
    return collect(group.items, group.event, [group.label]);
  });
  const candidates = entries.filter(entry => nativeNavigationPart(entry.item) === selection.part && (!entry.event || eventMatches(selection.event, entry.event)));
  const specific = candidates.filter(entry => entry.event);
  // Editable branches can repeat their part in a more precise leaf.
  return (specific.length ? specific : candidates).reduce<typeof candidates[number] | undefined>((best, entry) => !best || entry.path.length > best.path.length ? entry : best, undefined);
}

export function normalizeNativeNavigationSelection(current: NativeNavigationSelection): NativeNavigationSelection {
  const event = current.event in NATIVE_EVENT_SCOPE_SELECTORS ? current.event : "all";
  const identity = NATIVE_IDENTITY_SCOPES.some(scope => scope.id === current.identity) ? current.identity : "all";
  const part = current.part in NATIVE_PART_ALIASES ? NATIVE_PART_ALIASES[current.part as keyof typeof NATIVE_PART_ALIASES] : current.part;
  let next = { ...current, part, event, identity };
  if (nativeVisualPartUsesGlobalScope(next.part)) next = { ...next, event: "all", identity: "all" };
  if (!findNativeNavigation(next)) next = { ...next, part: "row" };
  return next.event === current.event && next.identity === current.identity && next.part === current.part ? current : next;
}
