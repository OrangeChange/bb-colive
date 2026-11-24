const THUMBNAIL_STYLE_ID = "compatible-thumbnail-frame-presentation";
const THUMBNAIL_TRANSPARENT_ROOTS = "html, body, #app, #root, #body-box, #fakebody, .app-wrapper, .main-container, yt-live-chat-renderer, yt-live-chat-item-list-renderer, #content-pages, #content, #contents, #chat-messages, #chat, #chat-items, #item-list, #item-scroller, #items, .scheme-wrap, .scheme-wrap > main, .events-list-wrap, .event-list, .laplace-theme-root, .laplace-renderer-host, .scroll-area";

export function applyCompatibleThumbnailFramePresentation(document: Document | null): void {
  if (!document?.head || !document.documentElement || !document.body) return;
  const parentRoot = document.defaultView?.parent.document.documentElement;
  const syncColorScheme = () => { document.documentElement.style.colorScheme = parentRoot?.classList.contains("dark") ? "dark" : "light"; };
  document.documentElement.style.setProperty("background", "transparent", "important");
  syncColorScheme();
  document.body.style.setProperty("background", "transparent", "important");
  document.documentElement.style.setProperty("--yt-live-chat-background-color", "transparent", "important");
  document.documentElement.style.setProperty("--yt-live-chat-action-panel-background-color", "transparent", "important");
  for (const node of document.querySelectorAll<HTMLElement>(THUMBNAIL_TRANSPARENT_ROOTS)) {
    node.style.setProperty("background", "transparent", "important");
    node.style.setProperty("background-color", "transparent", "important");
  }
  for (const anchor of document.querySelectorAll<HTMLElement>("#item-scroller, #chat-items, .event-list, .scroll-area")) {
    for (let node: HTMLElement | null = anchor; node; node = node.parentElement) {
      node.style.setProperty("background", "transparent", "important");
      node.style.setProperty("background-color", "transparent", "important");
    }
  }
  let style = document.getElementById(THUMBNAIL_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = THUMBNAIL_STYLE_ID;
    document.head.append(style);
  }
  style.textContent = `
html, body, #app, #root, #body-box, #fakebody, .app-wrapper, .main-container,
yt-live-chat-renderer, yt-live-chat-item-list-renderer,
#content-pages, #content, #contents, #chat-messages, #chat, #chat-items, #item-list,
#item-scroller, #items,
.scheme-wrap, .scheme-wrap > main, .events-list-wrap, .event-list,
.laplace-theme-root, .laplace-renderer-host, .scroll-area {
  background: transparent !important;
  background-color: transparent !important;
}
html, body, #app, #root { overflow: hidden !important; }
#item-scroller, .event-list { scrollbar-width: none !important; }
#item-scroller::-webkit-scrollbar, .event-list::-webkit-scrollbar { display: none !important; }
`;
  const reset = () => {
    for (const node of document.querySelectorAll<HTMLElement>("#item-scroller, #items, .event-list, .scroll-area")) {
      node.scrollTop = 0;
      node.scrollLeft = 0;
    }
    document.defaultView?.scrollTo(0, 0);
  };
  reset();
  document.defaultView?.requestAnimationFrame(() => {
    reset();
    document.defaultView?.requestAnimationFrame(reset);
  });
  if (document.documentElement.dataset.thumbnailFrameResetBound !== "true") {
    document.documentElement.dataset.thumbnailFrameResetBound = "true";
    document.addEventListener("load", reset, true);
    if (parentRoot) {
      const observer = new MutationObserver(syncColorScheme);
      observer.observe(parentRoot, { attributes: true, attributeFilter: ["class"] });
      document.defaultView?.addEventListener("pagehide", () => observer.disconnect(), { once: true });
    }
  }
  void document.fonts?.ready.then(reset);
}
