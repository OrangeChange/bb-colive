import { uiText } from "../i18n/index.ts";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { createContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { positionReviewFilterPopover, type ReviewFilterPopoverPosition } from "../archive/reviewFilterPopover.ts";

export interface ReviewFilterPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRef: RefObject<HTMLElement | null>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}

export const ReviewFilterSubmenuLayerContext = createContext<{
  registerSubmenu: (element: HTMLElement) => () => void;
} | null>(null);

export function ReviewFilterPopover({ open, onOpenChange, anchorRef, triggerRef, children }: ReviewFilterPopoverProps): ReactNode {
  const [position, setPosition] = useState<ReviewFilterPopoverPosition | null>(null);
  const submenusRef = useRef(new Set<HTMLElement>());
  const childPointerEventsRef = useRef(new WeakSet<Event>());
  const childPointerPendingRef = useRef(false);
  const submenuLayer = useMemo(() => ({
    registerSubmenu(element: HTMLElement) {
      submenusRef.current.add(element);
      return () => { submenusRef.current.delete(element); };
    },
  }), []);
  useLayoutEffect(() => {
    if (!open) return;
    const capturePointer = (event: PointerEvent) => {
      childPointerPendingRef.current = submenusRef.current.size > 0;
      if (childPointerPendingRef.current) childPointerEventsRef.current.add(event);
    };
    const finishPointer = () => { childPointerPendingRef.current = false; };
    document.addEventListener("pointerdown", capturePointer, true);
    document.addEventListener("click", finishPointer, true);
    document.addEventListener("pointercancel", finishPointer, true);
    document.addEventListener("keydown", finishPointer, true);
    return () => {
      document.removeEventListener("pointerdown", capturePointer, true);
      document.removeEventListener("click", finishPointer, true);
      document.removeEventListener("pointercancel", finishPointer, true);
      document.removeEventListener("keydown", finishPointer, true);
      childPointerPendingRef.current = false;
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open) { setPosition(null); return; }
    const syncPosition = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const next = positionReviewFilterPopover(anchor.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight });
      setPosition((current) => current && current.top === next.top && current.left === next.left
        && current.width === next.width && current.maxHeight === next.maxHeight ? current : next);
    };
    syncPosition();
    const observer = new ResizeObserver(syncPosition);
    if (anchorRef.current) observer.observe(anchorRef.current);
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [open, anchorRef]);
  const virtualRef = useMemo(() => ({ current: {
    getBoundingClientRect: () => DOMRect.fromRect({ x: position?.left ?? 0, y: position?.top ?? 0, width: position?.width ?? 0, height: 0 }),
  } }), [position]);

  return (
    <ReviewFilterSubmenuLayerContext.Provider value={submenuLayer}>
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Anchor virtualRef={virtualRef} />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={triggerRef.current?.getAttribute("aria-controls") ?? undefined}
          aria-label={uiText("reviewFilterPopover.aria_label")}
          align="start"
          side="bottom"
          avoidCollisions={false}
          data-ui-overlay="true"
          className="ui-motion-enter review-filter-advanced-panel"
          style={{ position: "relative", width: position?.width, maxHeight: position?.maxHeight, visibility: position ? "visible" : "hidden" }}
          onInteractOutside={(event) => {
            const originalEvent = event.detail.originalEvent;
            if (childPointerEventsRef.current.has(originalEvent)
              || (originalEvent.type === "focusin" && childPointerPendingRef.current)
              || submenusRef.current.size > 0) event.preventDefault();
            if (triggerRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
        >{children}</PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
    </ReviewFilterSubmenuLayerContext.Provider>
  );
}
