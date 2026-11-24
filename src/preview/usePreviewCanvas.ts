import { useLayoutEffect, useState } from "react";
import { useTheme } from "../theme.ts";
import { useCompatibleOutputScheme } from "../themes/compatPreviewScheme.ts";
export function usePreviewCanvas(
  width: number,
  requested: "system" | "light" | "dark",
) {
  const [element, ref] = useState<HTMLDivElement | null>(null);
  const [size, setSize] = useState({
    width,
    height: 500,
    nativeRowWidth: 0,
    scrollbarWidth: 0,
    scrollbarThumb: "transparent",
    scrollbarTrack: "transparent",
  });
  const [scroll, setScroll] = useState<{
    top: number;
    left: number;
    targets?: Record<
      string,
      { top: number; left: number; anchorId?: string; anchorOffset?: number }
    >;
  }>({ top: 0, left: 0 });
  const customColor = useTheme(state => state.customColor);
  const palette = useTheme((state) => state.palette),
    softwareScheme = useCompatibleOutputScheme();
  useLayoutEffect(() => {
    if (!element) return;
    const canvas =
      element.querySelector(
        ".native-preview-canvas,.compatible-theme-preview-viewport,.obs-preview-canvas",
      ) ?? element;
    const measure = () => {
      const box = canvas.getBoundingClientRect();
      const frame = element.querySelector("iframe");
      const scroll = frame?.contentDocument?.querySelector<HTMLElement>(
        ".native-preview-message-scroll",
      );
      const scrollStyle = scroll ? getComputedStyle(scroll) : undefined;
      const color = scrollStyle?.scrollbarColor ?? "auto";
      const colors =
        color?.match(/^(.*\))\s+(.+)$/) ?? color?.match(/^(\S+)\s+(.+)$/);
      const thumb = scroll
        ? (colors?.[1] ??
          getComputedStyle(scroll, "::-webkit-scrollbar-thumb").backgroundColor)
        : "transparent";
      const track = scroll
        ? (colors?.[2] ??
          getComputedStyle(scroll, "::-webkit-scrollbar-track").backgroundColor)
        : "transparent";
      const next = {
        width: Math.max(1, box.width),
        height: Math.max(1, box.height),
        nativeRowWidth:
          scroll?.querySelector(".event-row-slot")?.getBoundingClientRect()
            .width ?? 0,
        scrollbarThumb: thumb || "transparent",
        scrollbarTrack: track || "transparent",
        scrollbarWidth: scroll
          ? Math.max(
              0,
              scroll.getBoundingClientRect().width -
                scroll.clientWidth -
                (parseFloat(scrollStyle?.borderLeftWidth ?? "0") || 0) -
                (parseFloat(scrollStyle?.borderRightWidth ?? "0") || 0),
            )
          : 0,
      };
      setSize((previous) =>
        previous.width === next.width &&
        previous.height === next.height &&
        previous.nativeRowWidth === next.nativeRowWidth &&
        previous.scrollbarWidth === next.scrollbarWidth &&
        previous.scrollbarThumb === next.scrollbarThumb &&
        previous.scrollbarTrack === next.scrollbarTrack
          ? previous
          : next,
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(canvas);
    measure();
    const documents = new Set<Document>();
    const mutations: MutationObserver[] = [];
    const scrollSelectors = [
      ".native-preview-message-scroll",
      ".native-preview-sticky-scroll",
      "#item-scroller",
      "yt-live-chat-ticker-renderer .el-scrollbar__wrap",
      ".scroll-area",
      ".obs-native-root > .event-list",
    ];
    const settleTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
    const recordScroll = (target: HTMLElement | null) => {
      if (!target || target.nodeType !== 1) return;
      const selector = scrollSelectors.find((value) => target.matches(value));
      if (!selector) return;
      const viewportTop = target.getBoundingClientRect().top;
      const anchor = [
        ...target.querySelectorAll<HTMLElement>(
          "[data-compatible-event-id],.event[data-event-id],.event-row-slot[data-event-id]",
        ),
      ].find((node) => node.getBoundingClientRect().bottom > viewportTop);
      const position = {
        top: target.scrollTop,
        left: target.scrollLeft,
        ...(anchor
          ? {
              anchorId:
                anchor.dataset.compatibleEventId ?? anchor.dataset.eventId,
              anchorOffset: anchor.getBoundingClientRect().top - viewportTop,
            }
          : {}),
      };
      setScroll((previous) =>
        previous.targets?.[selector]?.top === position.top &&
        previous.targets?.[selector]?.left === position.left
          ? previous
          : {
              ...position,
              targets: { ...previous.targets, [selector]: position },
            },
      );
    };
    const onScrollEnd = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      clearTimeout(settleTimers.get(target));
      settleTimers.delete(target);
      recordScroll(target);
    };
    const onScroll = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.nodeType !== 1 || "onscrollend" in target) return;
      clearTimeout(settleTimers.get(target));
      settleTimers.set(target, setTimeout(() => { settleTimers.delete(target); recordScroll(target); }, 120));
    };
    const attach = () => {
      element.querySelectorAll("iframe").forEach((frame) => {
        try {
          const doc = frame.contentDocument;
          if (doc && !documents.has(doc)) {
            documents.add(doc);
            doc.addEventListener("scroll", onScroll, true);
            doc.addEventListener("scrollend", onScrollEnd, true);
            const mutation = new MutationObserver(measure);
            mutation.observe(doc, {
              childList: true,
              subtree: true,
              characterData: true,
            });
            doc.fonts?.addEventListener("loadingdone", measure);
            mutations.push(mutation);
            measure();
          }
        } catch {
          /* 跨域来源没有可共享的滚动区域。 */
        }
      });
    };
    element.addEventListener("scroll", onScroll, true);
    element.addEventListener("scrollend", onScrollEnd, true);
    element.addEventListener("load", attach, true);
    attach();
    return () => {
      observer.disconnect();
      mutations.forEach((value) => value.disconnect());
      settleTimers.forEach(timer => clearTimeout(timer));
      element.removeEventListener("scroll", onScroll, true);
      element.removeEventListener("scrollend", onScrollEnd, true);
      element.removeEventListener("load", attach, true);
      documents.forEach((doc) => {
        doc.removeEventListener("scroll", onScroll, true);
        doc.removeEventListener("scrollend", onScrollEnd, true);
        doc.fonts?.removeEventListener("loadingdone", measure);
      });
    };
  }, [element]);
  return {
    ref,
    geometry: {
      ...size,
      palette,
      customColor,
      scheme: requested === "system" ? softwareScheme : requested,
    },
    scroll,
  } as const;
}
