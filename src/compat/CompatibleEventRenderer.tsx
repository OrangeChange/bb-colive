import { Fragment, useMemo, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import type { DanmakuEvent } from "../protocol/types.ts";
import type { CompatibleLiveAction } from "./compatibleLiveBridge.ts";
import { stableCompatibleEventId } from "./compatibleLiveBridge.ts";

export interface CompatibleEventRenderContext {
  eventId: string;
  enableBilibiliVideoLinks: boolean;
  dispatch(action: CompatibleLiveAction): boolean;
}

export type CompatibleEventRender = (
  event: DanmakuEvent,
  context: CompatibleEventRenderContext,
) => ReactNode;
export interface CompatibleExternalHtmlDescriptor {
  instanceId?: string;
  url: string;
  target: "live" | "windows" | "obs";
  targetId: string;
  css: string;
  config: { showGiftName: boolean; mergeSimilarDanmaku: boolean; mergeGift: boolean; maxNumber: number };
}
export type CompatibleEventRenderWithRoot = CompatibleEventRender & {
  rootProps?: { className?: string; style?: CSSProperties; surfaceStyle?: CSSProperties; scopeId?: string; showTimestamp?: boolean; placement?: "main" | "sticky"; rendererMode?: string };
  eventDecision?: (event: DanmakuEvent) => "render" | "omit" | "fallback";
  externalHtml?: CompatibleExternalHtmlDescriptor;
  listSurface?: CompatibleListSurfaceDescriptor;
};

export interface CompatibleListSurfaceDescriptor {
  maskUsername?: boolean;
  renderer?: "blivechat" | "laplace";
  url: string;
  protocol: string;
  title?: string;
  css: string;
  appearanceCss?: string;
  config: Record<string, unknown>;
  cssSources?: { cloud: string; remote: string; custom: string };
  productElements?: { classicScope: boolean };
  eventDecision?: (event: DanmakuEvent) => "render" | "omit" | "fallback";
  project(event: DanmakuEvent, sequence: number): unknown | null;
}

export function compatibleListSurfaceOf(render?: CompatibleEventRender): CompatibleListSurfaceDescriptor | undefined {
  return (render as CompatibleEventRenderWithRoot | undefined)?.listSurface;
}

export function compatibleEventDecisionOf(render: CompatibleEventRender | undefined, event: DanmakuEvent): "render" | "omit" | "fallback" {
  return (render as CompatibleEventRenderWithRoot | undefined)?.eventDecision?.(event) ?? "render";
}

export function memoizeCompatibleEventDecision(decide: NonNullable<CompatibleEventRenderWithRoot["eventDecision"]>): NonNullable<CompatibleEventRenderWithRoot["eventDecision"]> {
  const decisions = new WeakMap<DanmakuEvent, "render" | "omit" | "fallback">();
  return event => {
    const previous = decisions.get(event);
    if (previous !== undefined) return previous;
    const decision = decide(event);
    decisions.set(event, decision);
    return decision;
  };
}

export function planCompatibleListPresentation(render: CompatibleEventRender | undefined, events: readonly DanmakuEvent[], stickyEnabled: boolean) {
  const surface = compatibleListSurfaceOf(render);
  const decisions = events.map(event => ({ event, decision: compatibleEventDecisionOf(render, event) }));
  const ordered = decisions.flatMap(({ event, decision }) => decision === "omit" ? [] : [{ kind: decision === "fallback" ? "fallback" as const : "source" as const, event }]);
  if (!surface) return { surface: undefined, ordered, sourceEvents: [] as DanmakuEvent[], fallbackEvents: [] as DanmakuEvent[], sourceTickerEnabled: false, renderSoftwareSticky: stickyEnabled };
  return {
    surface,
    ordered,
    sourceEvents: decisions.filter(item => item.decision === "render").map(item => item.event),
    fallbackEvents: decisions.filter(item => item.decision === "fallback").map(item => item.event),
    sourceTickerEnabled: stickyEnabled,
    renderSoftwareSticky: false,
  };
}

export function compatibleExternalHtmlOf(render?: CompatibleEventRender): CompatibleExternalHtmlDescriptor | undefined {
  return (render as CompatibleEventRenderWithRoot | undefined)?.externalHtml;
}

export function compatibleRendererMountIdentity(render?: CompatibleEventRender): string {
  return (render as CompatibleEventRenderWithRoot | undefined)?.rootProps?.rendererMode ?? "native";
}

export function compatibleRendererSurface(render?: CompatibleEventRender): { scopeId?: string; surfaceStyle?: CSSProperties } | undefined {
  return (render as CompatibleEventRenderWithRoot | undefined)?.rootProps;
}

export interface CompatibleEventSurfaceContext {
  target: "live" | "windows" | "obs";
  targetId: string;
  roomId: number | null;
  placement: "main" | "sticky";
}

export type CompatibleEventRenderResolver = (context: CompatibleEventSurfaceContext) => CompatibleEventRender | undefined;

let activeResolver: CompatibleEventRenderResolver | undefined;
const providers = new Set<CompatibleEventRenderResolver>();
const changeListeners = new Set<() => void>();
let renderVersion = 0;

export function notifyCompatibleEventRenderChanged(): void { renderVersion += 1; changeListeners.forEach(listener => listener()); }
export function subscribeCompatibleEventRenderChange(listener: () => void): () => void { changeListeners.add(listener); return () => changeListeners.delete(listener); }

export function installCompatibleEventRenderResolver(resolver: CompatibleEventRenderResolver): () => void {
  activeResolver = resolver;
  notifyCompatibleEventRenderChanged();
  return () => {
    if (activeResolver !== resolver) return;
    activeResolver = undefined;
    notifyCompatibleEventRenderChanged();
  };
}

export function registerCompatibleEventRenderProvider(provider: CompatibleEventRenderResolver): () => void {
  providers.add(provider);
  notifyCompatibleEventRenderChanged();
  return () => { providers.delete(provider); notifyCompatibleEventRenderChanged(); };
}

export function resolveCompatibleEventRender(context: CompatibleEventSurfaceContext): CompatibleEventRender | undefined {
  const resolved = activeResolver?.(context);
  if (resolved) return resolved;
  for (const provider of providers) {
    const candidate = provider(context);
    if (candidate) return candidate;
  }
  return undefined;
}

export function useCompatibleEventRender(context: CompatibleEventSurfaceContext): CompatibleEventRender | undefined {
  const version = useSyncExternalStore(subscribeCompatibleEventRenderChange, () => renderVersion, () => renderVersion);
  return useMemo(() => resolveCompatibleEventRender(context), [version, context.target, context.targetId, context.roomId, context.placement]);
}

export interface CompatibleEventRendererProps {
  event: DanmakuEvent;
  render?: CompatibleEventRender;
  dispatch?: (eventId: string, action: CompatibleLiveAction) => boolean;
  menu?: ReactNode;
  locatedHighlight?: boolean;
  enableBilibiliVideoLinks?: boolean;
  fallback: ReactNode;
}

interface CompatibleActionElement {
  parentElement: CompatibleActionElement | null;
  matches(selector: string): boolean;
  getAttribute(name: string): string | null;
}

export function compatibleActionFromElement(
  start: CompatibleActionElement | null,
  root: CompatibleActionElement,
): CompatibleLiveAction | null {
  for (let element = start; element && element !== root; element = element.parentElement) {
    if (element.matches("a[href]")) {
      const href = element.getAttribute("href");
      if (href) return { type: "open-link", href };
    }
    if (element.matches("[data-compatible-user-action], #author-name, .username, .username-text")) {
      return "filter-user";
    }
  }
  return null;
}

/** 只替换事件槽位内容；虚拟化、测量、动画和滚动锚点仍由 EventList 持有。 */
export function CompatibleEventRenderer({ event, render, dispatch, menu, locatedHighlight = false, enableBilibiliVideoLinks = false, fallback }: CompatibleEventRendererProps) {
  if (!render) return fallback;
  const decision = (render as CompatibleEventRenderWithRoot).eventDecision?.(event) ?? "render";
  if (decision === "omit") return null;
  if (decision === "fallback") return fallback;
  const eventId = stableCompatibleEventId(event);
  const rendered = render(event, {
    eventId,
    enableBilibiliVideoLinks,
    dispatch: (action) => dispatch?.(eventId, action) ?? false,
  });
  if (rendered == null) return fallback;
  const root = (render as CompatibleEventRenderWithRoot).rootProps;
  const rendererMountIdentity = compatibleRendererMountIdentity(render);
  const handleClickCapture = (clickEvent: MouseEvent<HTMLDivElement>) => {
    const target = clickEvent.target;
    if (!(target instanceof Element)) return;
    const action = compatibleActionFromElement(target, clickEvent.currentTarget);
    if (!action || !(dispatch?.(eventId, action) ?? false)) return;
    if (typeof action === "object") clickEvent.preventDefault();
  };
  return <div className={`compatible-event-interaction-host event-row-with-menu relative${root?.className ? ` ${root.className}` : ""}`} data-event-id={eventId} data-blivechat-scope={root?.scopeId} data-show-timestamp={root?.showTimestamp} data-laplace-placement={root?.placement} style={root?.style} onClickCapture={handleClickCapture}>
    <Fragment key={rendererMountIdentity}>{rendered}</Fragment>
    {locatedHighlight && <span className="event-row-located-indicator" aria-hidden="true" />}
    {menu}
  </div>;
}
