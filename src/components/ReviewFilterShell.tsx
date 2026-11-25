import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
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
  useUiLanguage();
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
          <span className="ui-type-control text-t1">{uiText("reviewFilterShell.ReviewFilterShell")}</span>
          <span className="ml-2 ui-type-meta text-t3">{conditionCount > 0 ? uiText("reviewFilterShell.ReviewFilterShell2", { conditionCount: conditionCount }) : uiText("reviewFilterShell.ReviewFilterShell3")}</span>
        </div>
        {headerActions}
        {conditionCount > 0 && onClear && (
          <Button variant="outline" type="button" className={compactFilterActionButtonClass} onClick={onClear}>{uiText("reviewFilterShell.ReviewFilterShell4")}</Button>
        )}
        <Button variant="outline"
          type="button"
          aria-expanded={!collapsed}
          aria-controls={contentId}
          className={`rounded-md border px-2.5 py-1 ui-type-control transition-colors hover:border-accent/50 hover:bg-raised hover:text-t1 ${collapsed ? "border-accent/50 bg-accent-subtle text-accent-text" : "border-line bg-bg text-t2"}`}
          onClick={() => onCollapsedChange(!collapsed)}
        >{collapsed ? uiText("reviewFilterShell.ReviewFilterShell5") : uiText("reviewFilterShell.ReviewFilterShell6")}</Button>
      </header>

      <div id={contentId} ref={contentRef} aria-hidden={collapsed} className={`review-filter-content ${collapsed ? "is-collapsed" : ""}`}>
        <div className="review-filter-content-inner flex flex-col gap-2">
          {children}
        </div>
      </div>
    </section>
  );
}
