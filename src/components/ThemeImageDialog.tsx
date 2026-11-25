import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useContext, useEffect, useRef, type ReactNode } from "react";
import {
  ThemeImageEditingContext,
  ThemeImagePreview,
} from "./ThemeImagePreview.tsx";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { bindUiDismissableLayer } from "./ui/layer.ts";

export function ThemeImageDialog({
  title,
  onClose,
  children,
  actions,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions: ReactNode;
}) {
  useUiLanguage();
  const surface = useRef<HTMLElement>(null);
  const editing = useContext(ThemeImageEditingContext);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(
    () =>
      surface.current
        ? bindUiDismissableLayer(surface.current, () => close.current(), {
            modal: true,
          })
        : undefined,
    [],
  );
  return createPortal(
    <div className="theme-image-overlay">
      <section
        ref={surface}
        tabIndex={-1}
        className="theme-image-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <h3>{title}</h3>
            {editing.scope && (
              <p className="theme-image-scope">{editing.scope}</p>
            )}
          </div>
          <button
            type="button"
            aria-label={uiText("themeImageDialog.aria_label", { title: title })}
            title={uiText("common.close")}
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="theme-image-dialog-content">
          <ThemeImagePreview />
          <div className="theme-image-dialog-body">{children}</div>
        </div>
        <footer>{actions}</footer>
      </section>
    </div>,
    document.body,
  );
}
