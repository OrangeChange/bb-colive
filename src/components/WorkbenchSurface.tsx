import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
  type WheelEvent,
} from "react";

type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

export type WorkbenchScrollProps = {
  children: ReactNode;
  className?: string;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onWheelCapture?: (event: WheelEvent<HTMLDivElement>) => void;
};

/** 右侧工作台统一的正文滚动层与独立滚动条。 */
export const WorkbenchScroll = forwardRef<HTMLDivElement, WorkbenchScrollProps>(function WorkbenchScroll(
  { children, className = "", onScroll, onPointerDown, onWheelCapture },
  forwardedRef,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const scrollbarDragRef = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({ clientHeight: 0, scrollHeight: 0, scrollTop: 0 });

  useImperativeHandle(forwardedRef, () => scrollRef.current as HTMLDivElement, []);

  const syncScrollMetrics = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const next = {
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
    };
    setScrollMetrics((current) => (
      current.clientHeight === next.clientHeight
      && current.scrollHeight === next.scrollHeight
      && current.scrollTop === next.scrollTop
        ? current
        : next
    ));
  };

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const resizeObserver = new ResizeObserver(syncScrollMetrics);
    resizeObserver.observe(scroller);
    syncScrollMetrics();
    return () => resizeObserver.disconnect();
  }, []);

  const getScrollbarLayout = () => {
    const trackHeight = scrollbarRef.current?.clientHeight ?? Math.max(0, scrollMetrics.clientHeight - 56);
    const maxScroll = Math.max(0, scrollMetrics.scrollHeight - scrollMetrics.clientHeight);
    const thumbHeight = maxScroll === 0
      ? trackHeight
      : Math.min(trackHeight, Math.max(24, trackHeight * scrollMetrics.clientHeight / scrollMetrics.scrollHeight));
    const thumbTravel = Math.max(0, trackHeight - thumbHeight);
    return { maxScroll, thumbHeight, thumbTravel };
  };

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    syncScrollMetrics();
    onScroll?.(event);
  };

  const handleScrollbarPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const { maxScroll, thumbTravel } = getScrollbarLayout();
    if (maxScroll <= 0 || thumbTravel <= 0 || !scrollRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollbarDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startScrollTop: scrollRef.current.scrollTop,
    };
  };

  const handleScrollbarPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = scrollbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !scrollRef.current) return;
    const { maxScroll, thumbTravel } = getScrollbarLayout();
    scrollRef.current.scrollTop = drag.startScrollTop + (event.clientY - drag.startY) * maxScroll / thumbTravel;
  };

  const handleScrollbarPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (scrollbarDragRef.current?.pointerId !== event.pointerId) return;
    scrollbarDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const scrollbarLayout = getScrollbarLayout();
  const thumbOffset = scrollbarLayout.maxScroll > 0
    ? scrollMetrics.scrollTop / scrollbarLayout.maxScroll * scrollbarLayout.thumbTravel
    : 0;

  return (
    <>
      <div
        ref={scrollRef}
        className={`settings-panel-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-14 ${className}`}
        onScroll={handleScroll}
        onPointerDown={onPointerDown}
        onWheelCapture={onWheelCapture}
      >
        {children}
      </div>
      <div ref={scrollbarRef} className="settings-panel-scrollbar">
        <div
          className="settings-panel-scrollbar-thumb"
          style={{ height: `${scrollbarLayout.thumbHeight}px`, transform: `translateY(${thumbOffset}px)` }}
          onPointerDown={handleScrollbarPointerDown}
          onPointerMove={handleScrollbarPointerMove}
          onPointerUp={handleScrollbarPointerUp}
          onPointerCancel={handleScrollbarPointerUp}
        />
      </div>
    </>
  );
});
