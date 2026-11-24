import { UiSearchInput } from "./ui/SearchInput.tsx";
import { ChevronDown as LucideChevronDown } from "lucide-react";
import { useState, type Dispatch, type FocusEvent, type SetStateAction } from "react";
import {
  GIFT_KIND_OPTIONS,
  INTERACT_KIND_OPTIONS,
  type EventFilterState,
  type EventQuery,
  type LeftFilterKey,
  type RightFilterKey,
} from "../events/eventView";
import type { GiftKind, InteractKind } from "../protocol/types";
import type { GiftThresholdMode } from "../giftThreshold";
import type { SceneLayoutMode } from "./sceneLayout";
import { GiftThresholdInput } from "./GiftThresholdInput";
import { compactFilterActionButtonClass } from "./actionButtonStyles";
import { SettingsChoiceControl } from "./SettingsChoiceControl";
import { SceneLayoutIcon } from "./SceneLayoutIcon";

interface LiveFilterBarProps {
  filters: EventFilterState;
  setFilters: Dispatch<SetStateAction<EventFilterState>>;
  giftThreshold: number;
  giftThresholdMode: GiftThresholdMode;
  setGiftThreshold: Dispatch<SetStateAction<number>>;
  query: EventQuery;
  onSearchTextChange: (text: string) => void;
  layoutMode: SceneLayoutMode;
  onLayoutChange: (mode: SceneLayoutMode) => void;
  onClearQuery: () => void;
}

const rightOptions: { key: RightFilterKey; label: string }[] = [
  { key: "gift", label: "礼物" },
  { key: "superChat", label: "SC" },
  { key: "guard", label: "大航海" },
];

const filterButtonBase = "inline-flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border px-2 ui-type-control transition-colors";

function FilterToggle({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        filterButtonBase,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
        active
          ? "border-accent bg-accent-subtle font-medium text-accent-text"
          : "border-line text-t3 hover:border-accent/50 hover:text-t2",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function IconChevronDown({ open }: { open: boolean }) {
  return (
    <LucideChevronDown className={["size-3 transition-transform", open ? "rotate-180" : ""].join(" ")} aria-hidden="true" />
  );
}

function FilterSubmenu<K extends string>({
  label,
  active,
  onPrimaryToggle,
  options,
  selected,
  onToggle,
}: {
  label: string;
  active: boolean;
  onPrimaryToggle: () => void;
  options: readonly { key: K; label: string }[];
  selected: Record<K, boolean>;
  onToggle: (key: K) => void;
}) {
  const [open, setOpen] = useState(false);
  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div
      className="relative flex h-8 items-center"
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={closeWhenFocusLeaves}
    >
      <button
        type="button"
        aria-pressed={active}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onPrimaryToggle}
        className={[
          `${filterButtonBase} gap-1`,
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring",
          active
            ? "border-accent bg-accent-subtle font-medium text-accent-text"
            : "border-line text-t3 hover:border-accent/50 hover:text-t2",
        ].join(" ")}
      >
        {label}
        <IconChevronDown open={open} />
      </button>
      {open && (
        <div className="ui-motion-enter absolute left-0 top-full z-50 pt-1">
          <div role="menu" aria-label={`${label}类型筛选`} className="min-w-32 overflow-hidden rounded-md border border-line bg-surface p-1 shadow-lg shadow-black/20">
            {options.map((option) => {
              const checked = selected[option.key] !== false;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={checked}
                  onClick={() => onToggle(option.key)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-left ui-type-control text-t2 transition-colors hover:bg-raised hover:text-t1 focus-visible:bg-raised focus-visible:outline-none"
                >
                  <span className={checked ? "size-1.5 rounded-full bg-accent" : "size-1.5 rounded-full border border-line"} aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveFilterBar({
  filters,
  setFilters,
  giftThreshold,
  giftThresholdMode,
  setGiftThreshold,
  query,
  onSearchTextChange,
  layoutMode,
  onLayoutChange,
  onClearQuery,
}: LiveFilterBarProps) {
  const toggleLeft = (key: LeftFilterKey) => {
    setFilters((current) => ({
      ...current,
      left: { ...current.left, [key]: !current.left[key] },
    }));
  };

  const toggleRight = (key: RightFilterKey) => {
    setFilters((current) => ({
      ...current,
      right: { ...current.right, [key]: !current.right[key] },
    }));
  };

  const toggleInteractKind = (key: InteractKind) => {
    setFilters((current) => ({
      ...current,
      left: {
        ...current.left,
        interactKinds: { ...current.left.interactKinds, [key]: !current.left.interactKinds[key] },
      },
    }));
  };

  const toggleGiftKind = (key: GiftKind) => {
    setFilters((current) => ({
      ...current,
      right: {
        ...current.right,
        giftKinds: { ...current.right.giftKinds, [key]: !current.right.giftKinds[key] },
      },
    }));
  };

  const queryActive = Boolean(query.userId || query.userName || query.text?.trim());

  return (
    <div data-scene-toolbar className="flex min-h-10 min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 overflow-visible border-b border-line bg-surface px-3 py-1.5">
      <div className="flex max-w-full flex-wrap items-center gap-1.5">
        <SettingsChoiceControl
          label="现场布局"
          options={[
            { value: "dual", label: "布局：双区" },
            { value: "partition", label: "布局：多区" },
          ]}
          value={layoutMode}
          onChange={onLayoutChange}
          decoration={value => <SceneLayoutIcon mode={value} />}
          iconOnly
          className="shrink-0"
        />
        <div className="flex max-w-full flex-wrap items-center gap-1.5" aria-label="现场筛选">
          <FilterToggle
            label="弹幕"
            active={filters.left.danmu}
            onClick={() => toggleLeft("danmu")}
          />
          <FilterSubmenu
            label="互动"
            active={filters.left.interact}
            onPrimaryToggle={() => toggleLeft("interact")}
            options={INTERACT_KIND_OPTIONS}
            selected={filters.left.interactKinds}
            onToggle={toggleInteractKind}
          />
          <FilterSubmenu
            label="礼物"
            active={filters.right.gift}
            onPrimaryToggle={() => toggleRight("gift")}
            options={GIFT_KIND_OPTIONS}
            selected={filters.right.giftKinds}
            onToggle={toggleGiftKind}
          />
          {rightOptions.filter(({ key }) => key !== "gift").map(({ key, label }) => (
            <FilterToggle key={key} label={label} active={filters.right[key]} onClick={() => toggleRight(key)} />
          ))}
        </div>
      </div>
      <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-1.5">
          <UiSearchInput aria-label="搜索现场事件内容" placeholder="搜索内容" value={query.text ?? ""} onValueChange={onSearchTextChange} className="w-44 max-w-full" />
        </div>
        <GiftThresholdInput value={giftThreshold} mode={giftThresholdMode} onChange={setGiftThreshold} compact />
      </div>
      {queryActive ? (
        <div className="ui-motion-filter-context flex basis-full items-center justify-end gap-2 border-t border-line/60 pt-1">
          {query.userName ? (
            <span className="max-w-52 truncate rounded-md border border-accent/40 bg-accent-subtle px-2 ui-type-control text-accent-text" title={`当前筛选用户：${query.userName}`}>
              用户：{query.userName}
            </span>
          ) : null}
          <button
            type="button"
            aria-label="退出筛选"
            onClick={onClearQuery}
            className={`${compactFilterActionButtonClass} shrink-0`}
          >
            退出筛选
          </button>
        </div>
      ) : null}
    </div>
  );
}
