import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface EventRowSlotProps extends HTMLAttributes<HTMLDivElement> {
  showEventSpacing?: boolean;
  contentScale?: number;
  children: ReactNode;
}

/** 行槽位承载事件间距与菜单定位；独立缩放时将测量位置与缩放内容分开。 */
export const EventRowSlot = forwardRef<HTMLDivElement, EventRowSlotProps>(function EventRowSlot({
  showEventSpacing = true,
  contentScale,
  children,
  className,
  style,
  ...props
}, ref) {
  const content = contentScale !== undefined;
  return (
    <div ref={ref} {...props} className={[className, !content && "event-row-slot-content", !content && showEventSpacing && "event-spacing-enabled"].filter(Boolean).join(" ")}
      data-event-spacing={!content && showEventSpacing ? "" : undefined} style={style}>
      {content ? <div className={`event-row-slot-content${showEventSpacing ? " event-spacing-enabled" : ""}`} data-event-spacing={showEventSpacing ? "" : undefined} style={{ zoom: contentScale }}>{children}</div> : children}
    </div>
  );
});
