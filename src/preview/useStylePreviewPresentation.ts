import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocalFeedReading } from "../events/useLocalFeedReading.ts";
import type { StylePreviewSnapshot } from "./stylePreviewState.ts";
import { applyPreviewElementMark } from "./stylePreviewSelection.ts";
export function useStylePreviewPresentation(state: StylePreviewSnapshot) {
  const [compatibleScroll, setCompatibleScroll] = useState<HTMLElement | null>(null);
  useLocalFeedReading(compatibleScroll, state.kind === "compatible" ? state.content.scrollDirection ?? "bottom" : "bottom", state.kind === "compatible" && state.content.previewMode === "simulation", state.frame.restart);
  const root = useRef<HTMLDivElement>(null),
    latest = useRef(state),
    refresh = useRef<() => void>(() => {});
  latest.current = state;
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const documents = new Map<Document, () => void>();
    const watched = new Map<Document, Set<Element>>();
    const resize = new ResizeObserver(() => restore());
    const restore = () => {
      const value = latest.current;
      const current = new Set([
        element.ownerDocument,
        ...[...element.querySelectorAll("iframe")].flatMap((frame) =>
          frame.contentDocument ? [frame.contentDocument] : [],
        ),
      ]);
      if (value.kind === "compatible" && value.content.document.mode !== "laplace") {
        const frameDocuments = [...current].filter(doc => doc !== element.ownerDocument);
        const scroller = frameDocuments.map(doc => doc.querySelector<HTMLElement>("#item-scroller,.scroll-area")).find(Boolean) ?? null;
        setCompatibleScroll(scroller);
      } else setCompatibleScroll(null);
      for (const [doc, stop] of documents)
        if (!current.has(doc)) {
          stop();
          documents.delete(doc);
        }
      for (const doc of current) {
        if (!doc.head || !doc.body) continue;
        const scope = doc === element.ownerDocument ? element : doc.body;
        if (!documents.has(doc)) {
          const scrollbarStyle = doc.createElement("style");
          scrollbarStyle.dataset.sharedPreviewScrollbars = "";
          scrollbarStyle.textContent =
            doc === element.ownerDocument
              ? ".shared-style-preview-content,.shared-style-preview-content *{scrollbar-width:none!important;scrollbar-gutter:auto!important}.shared-style-preview-content::-webkit-scrollbar,.shared-style-preview-content *::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}"
              : ":root:root :is(#item-scroller,#items,.scroll-area,.native-preview-message-scroll,.el-scrollbar__wrap),*{scrollbar-width:none!important;scrollbar-gutter:auto!important}:root:root :is(#item-scroller,#items,.scroll-area,.native-preview-message-scroll,.el-scrollbar__wrap)::-webkit-scrollbar,*::-webkit-scrollbar{display:none!important;width:0!important;height:0!important}.el-scrollbar__bar,[data-radix-scroll-area-scrollbar]{display:none!important}";
          doc.head.append(scrollbarStyle);
          const nodes = new Set<Element>();
          watched.set(doc, nodes);
          const mutation = new MutationObserver(() => restore());
          mutation.observe(scope, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          doc.addEventListener("load", restore, true);
          doc.fonts?.addEventListener("loadingdone", restore);
          documents.set(doc, () => {
            mutation.disconnect();
            scrollbarStyle.remove();
            nodes.forEach((node) => resize.unobserve(node));
            watched.delete(doc);
            doc.removeEventListener("load", restore, true);
            doc.fonts?.removeEventListener("loadingdone", restore);
          });
        }
        for (const node of watched.get(doc)!)
          if (!scope.contains(node)) {
            resize.unobserve(node);
            watched.get(doc)!.delete(node);
          }
        for (const node of scope.querySelectorAll(
          ".event-list,#items,.scroll-area",
        ))
          if (!watched.get(doc)!.has(node)) {
            watched.get(doc)!.add(node);
            resize.observe(node);
          }
        if (value.kind === "native")
          applyPreviewElementMark(
            doc === element.ownerDocument ? element : doc.body,
            value.frame.selection,
            "data-preview-part-selected",
          );

      }
    };
    refresh.current = restore;
    element.addEventListener("load", restore, true);
    resize.observe(element);
    restore();
    return () => {
      refresh.current = () => {};
      resize.disconnect();
      documents.forEach((stop) => stop());
      element.removeEventListener("load", restore, true);
    };
  }, []);
  useEffect(() => refresh.current(), [state]);
  return root;
}
