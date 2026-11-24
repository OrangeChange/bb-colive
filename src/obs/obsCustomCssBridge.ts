import { composeCompatibleCssLayers } from "../themes/compatibleThemeCascade.ts";
import { resolveLaplaceRemoteCssUrls } from "../themes/laplaceThemeSources.ts";

const productPaths = new Set([
  "/laplace/product/index.html",
  "/blivechat/renderer.html",
  "/openlive/renderer.html",
]);
const userStyleSelector = 'style:not([data-vite-dev-id]):not([data-precedence]):not([data-href]):not([data-event-style-config]):not([data-shared-preview-scrollbars]):not(#danmu-active-native-theme)';

/** OBS injects browser-source CSS into the outer head, outside the product frames. */
export function installObsCustomCssBridge(document: Document): () => void {
  type Source = { text: string; css: string; base: string };
  const sources = new Map<HTMLStyleElement, Source>();
  const frames = new Set<HTMLIFrameElement>();
  const frameStates = new Map<HTMLIFrameElement, {
    document: Document;
    styles: Map<HTMLStyleElement, HTMLStyleElement>;
    observer: MutationObserver;
  }>();

  const releaseFrame = (frame: HTMLIFrameElement) => {
    const state = frameStates.get(frame);
    state?.observer.disconnect();
    frameStates.delete(frame);
    frames.delete(frame);
  };
  const pruneFrames = () => {
    for (const frame of frames) if (!frame.isConnected) releaseFrame(frame);
  };
  const containers = new MutationObserver(records => {
    if (!records.some(record => record.removedNodes.length)) return;
    const previousSize = frames.size;
    pruneFrames();
    if (frames.size !== previousSize) watchContainers();
  });
  const watchContainers = () => {
    containers.disconnect();
    const watched = new Set<Element>();
    for (const frame of frames) {
      for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
        if (watched.has(parent)) break;
        watched.add(parent);
        // Observe the frame's ancestors directly, never their message subtrees.
        containers.observe(parent, { childList: true });
      }
    }
  };

  const isProduct = (frame: HTMLIFrameElement) => {
    const url = new URL(frame.src, document.baseURI);
    return url.origin === document.location.origin && productPaths.has(url.pathname);
  };
  const syncFrame = (frame: HTMLIFrameElement) => {
    if (!frame.isConnected || !isProduct(frame)) { releaseFrame(frame); return; }
    const target = frame.contentDocument;
    if (!target?.head) return;
    let state = frameStates.get(frame);
    if (state?.document !== target) {
      state?.observer.disconnect();
      const observer = new MutationObserver(records => {
        const changed = records.some(record =>
          [...record.addedNodes].some(node => node.nodeType === 1 && (node as Element).matches('style:not([data-obs-custom-css]),link[rel="stylesheet"]')) ||
          [...record.removedNodes].some(node => node.nodeType === 1 && (node as Element).hasAttribute("data-obs-custom-css") && !node.isConnected));
        if (changed) syncFrame(frame);
      });
      state = { document: target, styles: new Map(), observer };
      frameStates.set(frame, state);
      observer.observe(target.head, { childList: true });
    }
    const installed = state.styles;
    for (const [source, style] of installed) {
      if (!sources.get(source)?.css) { style.remove(); installed.delete(source); }
    }
    const ordered: HTMLStyleElement[] = [];
    for (const [source, { css }] of sources) {
      if (!css) continue;
      let style = installed.get(source);
      if (!style) {
        style = target.createElement("style");
        style.dataset.obsCustomCss = "";
        installed.set(source, style);
      }
      if (style.textContent !== css) style.textContent = css;
      style.media = source.media;
      style.disabled = source.disabled;
      ordered.push(style);
    }
    // Source hooks can remove and append their styles on every theme edit.
    let tail: Element | null = target.head.lastElementChild;
    const inOrder = [...ordered].reverse().every(style => {
      const matches = tail === style;
      tail = tail?.previousElementSibling ?? null;
      return matches;
    });
    if (!inOrder) target.head.append(...ordered);
  };
  const refreshSources = () => {
    const current = [...document.head.querySelectorAll<HTMLStyleElement>(userStyleSelector)];
    const next = current.map(source => {
      const text = source.textContent ?? "", base = document.baseURI;
      const previous = sources.get(source);
      if (previous?.text === text && previous.base === base) return [source, previous] as const;
      let css = previous?.css ?? "";
      if (!text.trim()) css = "";
      else {
        try { css = composeCompatibleCssLayers([[resolveLaplaceRemoteCssUrls(text, base), "custom"]]); }
        catch { /* Keep the last valid preview while the user edits a draft. */ }
      }
      return [source, { text, base, css }] as const;
    });
    sources.clear();
    for (const [source, value] of next) sources.set(source, value);
    for (const frame of frames) syncFrame(frame);
  };
  // Only head stylesheet mutations are observed; message rows never enter this path.
  const observer = new MutationObserver(records => {
    if (records.some(record => {
      const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
      return target?.closest("style") || record.type === "childList" && [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 && (node as Element).matches("style"));
    })) refreshSources();
  });
  const loaded = (event: Event) => {
    const target = event.target as Element | null;
    if (target?.tagName !== "IFRAME") return;
    const frame = target as HTMLIFrameElement;
    pruneFrames();
    if (!isProduct(frame)) { releaseFrame(frame); watchContainers(); return; }
    frames.add(frame);
    syncFrame(frame);
    watchContainers();
  };
  refreshSources();
  for (const frame of document.querySelectorAll<HTMLIFrameElement>("iframe")) {
    if (isProduct(frame)) { frames.add(frame); syncFrame(frame); }
  }
  watchContainers();
  document.addEventListener("load", loaded, true);
  observer.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["id", "data-vite-dev-id", "data-precedence", "data-href", "media", "disabled"] });
  return () => {
    observer.disconnect();
    containers.disconnect();
    document.removeEventListener("load", loaded, true);
    for (const frame of frames) {
      const state = frameStates.get(frame);
      state?.observer.disconnect();
      if (state) for (const style of state.styles.values()) style.remove();
    }
    frameStates.clear();
    frames.clear();
  };
}
