import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useState, type ReactNode, type RefObject } from "react";
import type { ThemeDocument } from "../themes/themeTypes.ts";

export function useThemeThumbnailDocument({ root, themeId, revision, load }: {
  root: RefObject<HTMLDivElement | null>;
  themeId: string;
  revision: number;
  load: (themeId: string) => Promise<ThemeDocument>;
}): { document: ThemeDocument | null; failed: boolean } {
  const [document, setDocument] = useState<ThemeDocument | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let disposed = false;
    let pending = false;
    let visible = false;
    let loaded: ThemeDocument | null = null;
    setDocument(null);
    setFailed(false);
    const start = () => {
      if (loaded) { setDocument(loaded); return; }
      if (pending) return;
      pending = true;
      void load(themeId).then(value => { loaded = value; if (!disposed && visible) setDocument(value); }).catch(() => { if (!disposed) setFailed(true); }).finally(() => { pending = false; });
    };
    if (typeof IntersectionObserver === "undefined") {
      visible = true;
      start();
      return () => { disposed = true; };
    }
    const observer = new IntersectionObserver(entries => {
      visible = entries.some(entry => entry.isIntersecting);
      if (visible) start(); else setDocument(null);
    }, { rootMargin: "120px" });
    observer.observe(node);
    return () => { disposed = true; observer.disconnect(); };
  }, [load, revision, root, themeId]);
  return { document, failed };
}

export function ThemeThumbnailShell({ root, failed, ready, full = false, children }: {
  root: RefObject<HTMLDivElement | null>;
  failed: boolean;
  ready: boolean;
  full?: boolean;
  children?: ReactNode;
}) {
  useUiLanguage();
  const className = "theme-library-thumbnail" + (ready ? " is-rendered" : failed ? " is-error" : " is-loading") + (full ? " is-full" : "");
  if (failed) return <div ref={root} className={className} role="status"><span>{uiText("themeThumbnailShell.ThemeThumbnailShell")}</span></div>;
  if (!ready) return <div ref={root} className={className} aria-label={uiText("themeThumbnailShell.aria_label")}><span /><span /><span /></div>;
  return <div ref={root} className={className} aria-label={full ? uiText("themeThumbnailShell.aria_label2") : uiText("themeThumbnailShell.aria_label3")}><div className="theme-library-thumbnail-frame">{children}</div></div>;
}
