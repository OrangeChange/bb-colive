import { applyCustomPalette } from "../customPalette.ts";
import { createPortal } from "react-dom";
import { useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { resolvePreviewBackground } from "./previewBackground.ts";

const DOCUMENT_CSS = `html,body,#root{height:100%;margin:0;overflow:hidden;background:transparent!important}body{display:flex;min-width:0}`;

export function IsolatedPreviewFrame({ children, previewCss, title, previewScheme = "system", previewPalette, customColor, previewBackground = "transparent", onContentClick, onContentPointerDown, onContentPointerMove, onContentPointerLeave }: {
  children: ReactNode;
  previewCss: string;
  title: string;
  previewScheme?: "system" | "light" | "dark";
  previewPalette?: import("../theme.ts").Palette;
  customColor?: string;
  previewBackground?: string;
  onContentClick?: (target: EventTarget | null, boundary: Element, point: {x:number;y:number}) => void;
  onContentPointerDown?: (target: EventTarget | null, boundary: Element, point: {x:number;y:number}) => void;
  onContentPointerMove?: (target: EventTarget | null, boundary: Element, point: {x:number;y:number}) => void;
  onContentPointerLeave?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameDocument, setFrameDocument] = useState<Document | null>(null);
  const connect = () => setFrameDocument(frameRef.current?.contentDocument ?? null);

  useLayoutEffect(connect, []);
  useLayoutEffect(() => {
    if (!frameDocument) return;
    const source = frameRef.current?.ownerDocument;
    if (!source) return;
    const base = frameDocument.createElement("base");
    const environment = frameDocument.createElement("style");
    const sourceStyleCopies = new Map<Element, HTMLElement>();
    base.href = source.baseURI;
    environment.dataset.previewEnvironment = "";
    frameDocument.head.append(base, environment);
    const syncPreviewStyles = () => {
      const sourceStyles = new Set(source.head.querySelectorAll<HTMLStyleElement | HTMLLinkElement>('style:not(#danmu-active-native-theme),link[rel~="stylesheet"]'));
      for (const [node, copy] of sourceStyleCopies) {
        if (sourceStyles.has(node as HTMLStyleElement | HTMLLinkElement)) continue;
        copy.remove();
        sourceStyleCopies.delete(node);
      }
      for (const node of sourceStyles) {
        const previous = sourceStyleCopies.get(node);
        if (previous && previous.dataset.previewSourceHtml === node.outerHTML) continue;
        const copy = node.cloneNode(true) as HTMLElement;
        copy.dataset.previewBaseStyle = "";
        copy.dataset.previewSourceHtml = node.outerHTML;
        if (previous) previous.replaceWith(copy);
        else frameDocument.head.insertBefore(copy, environment);
        sourceStyleCopies.set(node, copy);
      }
    };
    syncPreviewStyles();
    const observer = new MutationObserver(syncPreviewStyles);
    observer.observe(source.head, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => { observer.disconnect(); sourceStyleCopies.forEach(copy => copy.remove()); base.remove(); environment.remove(); };
  }, [frameDocument]);

  useLayoutEffect(() => {
    if (!frameDocument) return;
    const source = frameRef.current?.ownerDocument;
    const environment = frameDocument.head.querySelector<HTMLStyleElement>("[data-preview-environment]");
    if (!source || !environment) return;
    const background = resolvePreviewBackground(previewBackground);
    environment.textContent = `${DOCUMENT_CSS}\nhtml,body{background:${background}!important}`;
    frameDocument.documentElement.className = source.documentElement.className;
    frameDocument.documentElement.dataset.theme = previewPalette ?? source.documentElement.dataset.theme ?? "sakura";
    applyCustomPalette(frameDocument, customColor ?? source.documentElement.dataset.customColor ?? "#e04e7e");
    frameDocument.documentElement.classList.toggle("dark", previewScheme === "dark" || (previewScheme === "system" && source.documentElement.classList.contains("dark")));
    frameDocument.documentElement.classList.toggle("light", previewScheme === "light" || (previewScheme === "system" && source.documentElement.classList.contains("light")));
    frameDocument.documentElement.style.colorScheme = previewScheme === "system" ? "" : previewScheme;
  }, [frameDocument, previewBackground, previewScheme, previewPalette, customColor]);

  return <div className="isolated-preview-surface">
    <iframe ref={frameRef} title={title} className="isolated-preview-frame" sandbox="allow-same-origin" onLoad={connect} />
    {frameDocument && createPortal(<div className="isolated-preview-root" onClick={(event: ReactMouseEvent<HTMLDivElement>) => onContentClick?.(event.target, event.currentTarget, {x:event.clientX,y:event.clientY})} onPointerDown={(event: ReactPointerEvent<HTMLDivElement>) => onContentPointerDown?.(event.target, event.currentTarget, {x:event.clientX,y:event.clientY})} onPointerMove={event => onContentPointerMove?.(event.target, event.currentTarget, {x:event.clientX,y:event.clientY})} onPointerLeave={onContentPointerLeave}><style data-preview-draft-css="">{previewCss}</style>{children}</div>, frameDocument.body)}
  </div>;
}
