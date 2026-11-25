/**
 * 统一的按钮语义样式：
 * - 普通操作保持中性；
 * - 清除筛选使用强调色，显著但不暗示删除数据；
 * - 删除/取消收藏等数据变更使用危险色。
 */
export const actionButtonClass = "inline-flex h-8 items-center rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors enabled:hover:border-accent/60 enabled:hover:bg-raised enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45";

export const filterActionButtonClass = "inline-flex h-8 items-center rounded-md border border-accent/60 bg-accent-subtle px-2.5 ui-type-control text-accent-text transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45";

export const dangerActionButtonClass = "inline-flex h-8 items-center rounded-md border border-danger/50 bg-bg px-2.5 ui-type-control text-danger transition-colors enabled:hover:border-danger/70 enabled:hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-45";

export const compactFilterActionButtonClass = "inline-flex h-7 items-center rounded-md border border-accent/60 bg-accent-subtle px-2.5 ui-type-control text-accent-text transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-45";

export const compactDangerActionButtonClass = "inline-flex h-7 items-center rounded-md border border-danger/50 bg-bg px-2.5 ui-type-control text-danger transition-colors enabled:hover:border-danger/70 enabled:hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-45";

export const dangerSolidButtonClass = "inline-flex h-8 items-center rounded-md bg-danger-solid px-3 ui-type-control text-danger-fg transition-colors enabled:hover:bg-danger-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger disabled:cursor-not-allowed disabled:opacity-50";

export const accentSolidButtonClass = "inline-flex h-8 items-center rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg transition-colors enabled:hover:bg-accent-solid-hover active:bg-accent-solid-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-50";
