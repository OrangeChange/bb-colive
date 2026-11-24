import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

export type ImagePreviewOverlayVariant = "avatar" | "cover";

export interface ImagePreviewOverlayProps {
  open: boolean;
  src: string;
  alt: string;
  label: string;
  closeLabel: string;
  variant?: ImagePreviewOverlayVariant;
  boundsRef?: RefObject<HTMLElement | null>;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
}

type PreviewFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
  ready: boolean;
};

const initialFrame: PreviewFrame = { left: 0, top: 0, width: 0, height: 0, ready: false };

function getPreviewFrame(boundsRef?: RefObject<HTMLElement | null>): Omit<PreviewFrame, "ready"> {
  const areaRect = boundsRef?.current?.getBoundingClientRect();
  const area = areaRect && areaRect.width > 0 && areaRect.height > 0
    ? areaRect
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
  const left = Math.max(0, Math.min(window.innerWidth, area.left));
  const top = Math.max(0, Math.min(window.innerHeight, area.top));
  const right = Math.max(left, Math.min(window.innerWidth, area.right));
  const bottom = Math.max(top, Math.min(window.innerHeight, area.bottom));
  return { left, top, width: right - left, height: bottom - top };
}

export function ImagePreviewOverlay({
  open,
  src,
  alt,
  label,
  closeLabel,
  variant = "cover",
  boundsRef,
  restoreFocusRef,
  onClose,
}: ImagePreviewOverlayProps) {
  const [frame, setFrame] = useState<PreviewFrame>(initialFrame);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const updateFrame = () => setFrame({ ...getPreviewFrame(boundsRef), ready: true });
    updateFrame();
    window.addEventListener("resize", updateFrame);
    window.addEventListener("scroll", updateFrame, true);
    const resizeObserver = typeof ResizeObserver === "undefined" || !boundsRef?.current
      ? null
      : new ResizeObserver(updateFrame);
    if (resizeObserver && boundsRef?.current) resizeObserver.observe(boundsRef.current);
    return () => {
      window.removeEventListener("resize", updateFrame);
      window.removeEventListener("scroll", updateFrame, true);
      resizeObserver?.disconnect();
    };
  }, [boundsRef, open]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusId = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const closeOnKeyboard = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key === "Escape") {
        keyboardEvent.preventDefault();
        onCloseRef.current();
        return;
      }
      if (keyboardEvent.key === "Tab") {
        keyboardEvent.preventDefault();
        closeButtonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", closeOnKeyboard);
    return () => {
      window.cancelAnimationFrame(focusId);
      document.removeEventListener("keydown", closeOnKeyboard);
      const focusTarget = restoreFocusRef?.current ?? previousFocusRef.current;
      focusTarget?.focus();
    };
  }, [open, restoreFocusRef]);

  if (!open) return null;

  const surfaceClass = variant === "avatar"
    ? "relative rounded-full border border-line/70 bg-surface p-1 shadow-2xl shadow-black/40"
    : "relative max-w-[min(92vw,900px)] max-h-[min(82vh,620px)] rounded-lg border border-line/70 bg-surface p-1 shadow-2xl shadow-black/40";
  const imageClass = variant === "avatar"
    ? "size-60 rounded-full object-cover"
    : "max-h-[min(80vh,600px)] max-w-[min(90vw,880px)] rounded-md object-contain";

  return createPortal(
    <div
      className="ui-modal-overlay image-preview-overlay fixed z-[80] flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      style={{
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        visibility: frame.ready ? "visible" : "hidden",
      }}
      onPointerDown={(pointerEvent) => {
        if (pointerEvent.target === pointerEvent.currentTarget) onCloseRef.current();
      }}
    >
      <div className={`ui-modal-surface ${surfaceClass}`}>
        <img src={src} alt={alt} className={imageClass} onError={() => onCloseRef.current()} />
        <button
          ref={closeButtonRef}
          type="button"
          aria-label={closeLabel}
          className="absolute -right-2 -top-2 inline-flex size-7 items-center justify-center rounded-full border border-line bg-surface ui-type-control text-t1 shadow-lg transition-colors hover:border-accent hover:bg-raised hover:text-accent-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
          onClick={() => onCloseRef.current()}
        >
          ×
        </button>
      </div>
    </div>,
    document.body,
  );
}
