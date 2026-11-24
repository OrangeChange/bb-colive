import { useEffect, useRef, type ReactNode, type Ref } from "react";
import { compactFilterActionButtonClass } from "./actionButtonStyles";

interface ReviewFilterShellProps {
  ariaLabel: string;
  contentId: string;
  conditionCount: number;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  children: ReactNode;
  onClear?: () => void;
  headerActions?: ReactNode;
  className?: string;
  shellRef?: Ref<HTMLElement>;
  dataAttributes?: Record<`data-${string}`, string>;
}

export function ReviewFilterShell({
  ariaLabel,
  contentId,
  conditionCount,
  collapsed,
  onCollapsedChange,
  children,
  onClear,
  headerActions,
  className,
  shellRef,
  dataAttributes,
}: ReviewFilterShellProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    content.inert = collapsed;
    if (collapsed && content.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }, [collapsed]);

  return (
    <section
      ref={shellRef}
      aria-label={ariaLabel}
      data-review-filter-shell
      data-filters-collapsed={collapsed ? "true" : "false"}
      {...dataAttributes}
      className={`review-filter-shell flex flex-col gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 ${collapsed ? "review-filter-collapsed" : ""} ${className ?? ""}`}
    >
      <header className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="ui-type-control text-t1">筛选</span>
          <span className="ml-2 ui-type-meta text-t3">{conditionCount > 0 ? `已设置 ${conditionCount} 项` : "未设置条件"}</span>
        </div>
        {headerActions}
        {conditionCount > 0 && onClear && (
          <button type="button" className={compactFilterActionButtonClass} onClick={onClear}>清除条件</button>
        )}
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className={`rounded-md border px-2.5 py-1 ui-type-control transition-colors hover:border-accent/50 hover:bg-raised hover:text-t1 ${collapsed ? "border-accent/50 bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2"}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >{collapsed ? "展开筛选" : "收起筛选"}</button>
      </header>

      <div id={contentId} ref={contentRef} aria-hidden={collapsed} className={`review-filter-content ${collapsed ? "is-collapsed" : ""}`}>
        <div className="review-filter-content-inner flex flex-col gap-2">
          {children}
        </div>
      </div>
    </section>
  );
}
