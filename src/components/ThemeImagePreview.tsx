import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StylePreviewContent } from "./StylePreviewContent.tsx";
import {
  getPreview,
  subscribePreview,
} from "../preview/stylePreviewSession.ts";
import type { StylePreviewSnapshot } from "../preview/stylePreviewState.ts";

export const ThemeImageEditingContext = createContext<{
  scope: string;
  root?: HTMLElement | null;
  selector?: string;
}>({ scope: "" });

export function imageTargetNodes(
  root: HTMLElement | null | undefined,
  selector: string,
): HTMLElement[] {
  if (!root || !selector) return [];
  const nodes: HTMLElement[] = [];
  const visit = (container: HTMLElement | Document | ShadowRoot) => {
    try {
      nodes.push(...container.querySelectorAll<HTMLElement>(selector));
    } catch {
      return;
    }
    for (const node of container.querySelectorAll<HTMLElement>("*")) {
      if (node.shadowRoot) visit(node.shadowRoot);
      if (node.tagName === "IFRAME") {
        try {
          const doc = (node as HTMLIFrameElement).contentDocument;
          if (doc) visit(doc);
        } catch {
          /* Remote documents are not editable. */
        }
      }
    }
  };
  visit(root);
  return nodes.filter((node) => node.getClientRects().length > 0);
}

const EVENT_SELECTOR =
  ".event,yt-live-chat-text-message-renderer,yt-live-chat-paid-message-renderer,yt-live-chat-membership-item-renderer,yt-live-chat-ticker-paid-message-item-renderer";
const ImagePreviewRenderer = memo(StylePreviewContent);
function eventFor(node: HTMLElement): HTMLElement {
  return (
    node.closest<HTMLElement>(EVENT_SELECTOR) ??
    ((node.getRootNode() as ShadowRoot).host
      ? eventFor((node.getRootNode() as ShadowRoot).host as HTMLElement)
      : node)
  );
}
function composedParent(node: Element): Element | null {
  return node.parentElement ?? (node.getRootNode() as ShadowRoot).host ?? null;
}
function belongsTo(node: Element, ancestor: Element): boolean {
  for (
    let current: Element | null = node;
    current;
    current = composedParent(current)
  )
    if (current === ancestor) return true;
  return false;
}

export function ThemeImagePreview() {
  useUiLanguage();
  const { root: sourceRoot, selector } = useContext(ThemeImageEditingContext);
  const [source, setSource] = useState(getPreview);
  useEffect(() => {
    const stop = subscribePreview(setSource);
    setSource(getPreview());
    return () => { stop(); };
  }, []);
  const [mode, setMode] = useState<"part" | "event">("part");
  const [size, setSize] = useState({ width: 320, height: 280 });
  const canvas = useRef<HTMLDivElement>(null),
    rendered = useRef<HTMLDivElement>(null),
    pane = useRef<HTMLElement>(null);
  const position = useRef<() => void>(() => {});
  const drag = useRef<{
    axis: "width" | "height";
    point: number;
    value: number;
  } | null>(null);
  const [eventId] = useState(() => {
    const nodes = imageTargetNodes(sourceRoot, selector ?? "");
    const node =
      nodes.find((item) => !item.closest(".event-sticky,.sticky")) ?? nodes[0];
    const event = node && eventFor(node);
    return (
      event?.closest<HTMLElement>(".event-row-slot")?.dataset.eventId ??
      event?.dataset.eventId ??
      node?.closest<HTMLElement>("[data-compatible-event-id]")?.dataset.compatibleEventId
    );
  });
  const state = useMemo<StylePreviewSnapshot | null>(() => {
    if (!source) return null;
    const frame = { ...source.frame, selection: undefined, scroll: undefined };
    if (source.kind === "native") {
      const matching = eventId
        ? source.content.events.filter(
            (event) => (event.reactKey ?? event.id) === eventId,
          )
        : [];
      return {
        ...source,
        displayScale: 1,
        frame,
        content: {
          ...source.content,
          events: matching.length ? matching : source.content.events,
          scrollDirection: "top",
          contentAlignment: "top",
        },
      };
    }
    if (source.kind === "compatible") {
      const index = eventId ? frame.records?.findIndex(record => {
        const item = record as { payload?: { id?: string }; data?: { id?: string } };
        return (item.payload ?? item.data)?.id === eventId;
      }) ?? -1 : -1;
      if (frame.windowed && index >= 0) {
        const start = Math.max(0, index - 20);
        frame.records = frame.records?.slice(start, start + 40);
      }
      return {
        ...source,
        displayScale: 1,
        frame,
        content: {
          ...source.content,
          selection: undefined,
          revealPart: null,
        },
      };
    }
    return { ...source, displayScale: 1, frame };
  }, [source, eventId]);

  useEffect(() => {
    const element = rendered.current;
    if (!element || !selector) return;
    let target: HTMLElement | null = null,
      scheduled = 0;
    const saved = new Map<HTMLElement, { value: string; priority: string }>();
    const docs = new Map<Document, MutationObserver>();
    const resize = new ResizeObserver(() => schedulePosition());
    const restore = () => {
      for (const [node, style] of saved) {
        if (style.value)
          node.style.setProperty("visibility", style.value, style.priority);
        else node.style.removeProperty("visibility");
      }
      saved.clear();
    };
    const center = () => {
      const box = canvas.current,
        content = rendered.current;
      if (!box || !content || !target?.isConnected) return;
      const rect = target.getBoundingClientRect();
      let x = rect.x + rect.width / 2,
        y = rect.y + rect.height / 2,
        doc = target.ownerDocument;
      while (doc !== element.ownerDocument) {
        const frame = doc.defaultView?.frameElement as HTMLElement | null;
        if (!frame) break;
        const bounds = frame.getBoundingClientRect();
        x = bounds.x + x * (bounds.width / (frame.clientWidth || bounds.width));
        y =
          bounds.y +
          y * (bounds.height / (frame.clientHeight || bounds.height));
        doc = frame.ownerDocument;
      }
      const bounds = content.getBoundingClientRect();
      content.style.transform = `translate(${box.clientWidth / 2 - (x - bounds.x)}px,${box.clientHeight / 2 - (y - bounds.y)}px)`;
    };
    const schedulePosition = () => {
      if (!scheduled)
        scheduled = requestAnimationFrame(() => {
          scheduled = 0;
          center();
        });
    };
    const focus = () => {
      for (const frame of element.querySelectorAll("iframe")) {
        const doc = frame.contentDocument;
        if (!doc?.body) continue;
        if (docs.has(doc)) continue;
        const observer = new MutationObserver(focus);
        observer.observe(doc.body, { subtree: true, childList: true, characterData: true });
        docs.set(doc, observer);
        doc.addEventListener("load", schedulePosition, true);
        doc.fonts?.addEventListener("loadingdone", schedulePosition);
      }
      const nodes = imageTargetNodes(element, selector);
      const selected =
        nodes.find((node) => !node.closest(".event-sticky,.sticky")) ??
        nodes[0];
      if (!selected) return;
      const next = mode === "event" ? eventFor(selected) : selected;
      if (target !== next) {
        restore();
        if (target) {
          resize.unobserve(target);
          target.removeAttribute("data-image-preview-focus");
        }
        target = next;
        target.setAttribute("data-image-preview-focus", "");
        resize.observe(next);
        if (next.ownerDocument !== element.ownerDocument) {
          for (let parent = next.parentElement; parent; parent = parent.parentElement) {
            const style = next.ownerDocument.defaultView!.getComputedStyle(parent);
            if (/(auto|scroll)/.test(style.overflowY) && parent.scrollHeight > parent.clientHeight) {
              const rect = next.getBoundingClientRect(), bounds = parent.getBoundingClientRect();
              parent.scrollTop += rect.top - bounds.top - Math.max(0, (parent.clientHeight - rect.height) / 2);
            }
          }
        }
      }
      const doc = next.ownerDocument;
      if (!docs.has(doc)) {
        const observer = new MutationObserver(focus);
        observer.observe(doc === element.ownerDocument ? element : doc.body, {
          subtree: true,
          childList: true,
          characterData: true,
        });
        docs.set(doc, observer);
        doc.addEventListener("load", schedulePosition, true);
        doc.fonts?.addEventListener("loadingdone", schedulePosition);
      }
      for (const node of [doc === element.ownerDocument ? element : doc.body, next]) {
        if (node !== next && belongsTo(node, next)) continue;
        if (saved.has(node)) continue;
        saved.set(node, {
          value: node.style.getPropertyValue("visibility"),
          priority: node.style.getPropertyPriority("visibility"),
        });
        node.style.setProperty(
          "visibility",
          node === next ? "visible" : "hidden",
          "important",
        );
      }
      schedulePosition();
    };
    const observer = new MutationObserver(focus);
    observer.observe(element, { subtree: true, childList: true });
    element.addEventListener("load", focus, true);
    if (canvas.current) resize.observe(canvas.current);
    position.current = focus;
    focus();
    return () => {
      restore();
      target?.removeAttribute("data-image-preview-focus");
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(scheduled);
      element.removeEventListener("load", focus, true);
      for (const [doc, watch] of docs) {
        watch.disconnect();
        doc.removeEventListener("load", schedulePosition, true);
        doc.fonts?.removeEventListener("loadingdone", schedulePosition);
      }
      position.current = () => {};
    };
  }, [selector, mode]);
  useEffect(() => position.current(), [state]);

  const changeSize = (axis: "width" | "height", value: number) => {
    const parent = pane.current?.parentElement;
    const maximum =
      axis === "width"
        ? Math.max(240, (parent?.clientWidth ?? 960) - 360)
        : Math.max(120, (pane.current?.clientHeight ?? 400) - 72);
    setSize((current) => ({
      ...current,
      [axis]: Math.max(axis === "width" ? 240 : 120, Math.min(maximum, value)),
    }));
  };
  const separator = (axis: "width" | "height") => (
    <div
      role="separator"
      tabIndex={0}
      className={`theme-image-resize-${axis}`}
      aria-orientation={axis === "width" ? "vertical" : "horizontal"}
      aria-label={axis === "width" ? uiText("themeImagePreview.aria_label") : uiText("themeImagePreview.aria_label2")}
      title={axis === "width" ? uiText("themeImagePreview.title") : uiText("themeImagePreview.title2")}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          axis,
          point: axis === "width" ? event.clientX : event.clientY,
          value:
            axis === "width"
              ? (pane.current?.clientWidth ?? size.width)
              : (canvas.current?.clientHeight ?? size.height),
        };
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (start?.axis === axis)
          changeSize(
            axis,
            start.value +
              (axis === "width" ? event.clientX : event.clientY) -
              start.point,
          );
      }}
      onPointerUp={(event) => {
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        const decrease = axis === "width" ? "ArrowLeft" : "ArrowUp",
          increase = axis === "width" ? "ArrowRight" : "ArrowDown";
        if (event.key !== decrease && event.key !== increase) return;
        event.preventDefault();
        changeSize(axis, size[axis] + (event.key === increase ? 16 : -16));
      }}
    />
  );
  const background = source?.kind === "native" || source?.kind === "compatible"
    ? source.content.previewBackground
    : source?.previewBackground;
  return (
    <aside
      ref={pane}
      className="theme-image-effect"
      aria-label={uiText("themeImagePreview.aria_label3")}
      style={{ width: size.width }}
    >
      <div className="theme-image-preview-heading">
        <strong>{uiText("themeImagePreview.ThemeImagePreview")}</strong>
        <div className="theme-image-preview-modes" aria-label={uiText("themeImagePreview.aria_label4")}>
          <button
            type="button"
            aria-pressed={mode === "part"}
            onClick={() => setMode("part")}
          >
            {uiText("themeImagePreview.ThemeImagePreview2")}</button>
          <button
            type="button"
            aria-pressed={mode === "event"}
            onClick={() => setMode("event")}
          >
            {uiText("themeImagePreview.ThemeImagePreview3")}</button>
        </div>
      </div>
      <div
        ref={canvas}
        className="theme-image-effect-canvas"
        style={{ height: size.height, ...(background && background !== "transparent" ? { backgroundColor: background, backgroundImage: "none" } : {}) }}
      >
        <div ref={rendered} className="theme-image-renderer">
          {state && <ImagePreviewRenderer state={state} transparent />}
        </div>
        {!state && (
          <p className="theme-image-hint">{uiText("themeImagePreview.ThemeImagePreview4")}</p>
        )}
      </div>
      {separator("height")}
      {separator("width")}
    </aside>
  );
}
