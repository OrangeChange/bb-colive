import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export interface ThemeVisualNavigationNode {
  id: string;
  label: string;
  part?: string;
  active?: boolean;
  children?: readonly ThemeVisualNavigationNode[];
  onSelect?: () => void;
}
export interface ThemeVisualNavigationGroup {
  id: string;
  label: string;
  defaultExpanded?: boolean;
  items: readonly ThemeVisualNavigationNode[];
}
export function ThemeVisualNavigation({
  navigationRef,
  groups,
}: {
  navigationRef?: RefObject<HTMLElement | null>;
  groups: readonly ThemeVisualNavigationGroup[];
}) {
  const localRef = useRef<HTMLElement>(null);
  const ref = navigationRef ?? localRef;
  const activePaths: string[] = [];
  const selectedPaths: string[] = [];
  const find = (
    items: readonly ThemeVisualNavigationNode[],
    path: string[],
  ) => {
    for (const item of items) {
      const next = [...path, item.id];
      if (item.active) {
        selectedPaths.push(next.join("/"));
        activePaths.push(
          ...next.slice(0, -1).map((_, index) => next.slice(0, index + 1).join("/")),
        );
      }
      if (item.children) find(item.children, next);
    }
  };
  groups?.forEach((group) => find(group.items, [group.id]));
  const activeKey = activePaths.join("|");
  const selectedKey = selectedPaths.join("|");
  const [opened, setOpened] = useState<Set<string>>(
    () =>
      new Set([
        ...groups.filter((g) => g.defaultExpanded).map((g) => g.id),
        ...activePaths,
      ]),
  );
  useEffect(() => {
    if (!activeKey) return;
    setOpened((current) => new Set([...current, ...activeKey.split("|")]));
    const request = requestAnimationFrame(() =>
      ref.current
        ?.querySelector<HTMLElement>("button.is-active")
        ?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(request);
  }, [activeKey, selectedKey, ref]);
  const toggle = (key: string, open: boolean) =>
    setOpened((current) => {
      if (current.has(key) === open) return current;
      const next = new Set(current);
      open ? next.add(key) : next.delete(key);
      return next;
    });
  const render = (
    item: ThemeVisualNavigationNode,
    path: string[],
    level: number,
  ): ReactNode => {
    const key = [...path, item.id].join("/");
    const button = (
      <button
        type="button"
        data-native-part-id={item.part}
        data-navigation-id={item.id}
        title={item.label}
        className={item.active ? "is-active" : ""}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          item.onSelect?.();
        }}
      >
        {item.label}
      </button>
    );
    if (item.children?.length)
      return (
        <details
          key={key}
          className="native-part-tree"
          data-native-nav-level={level}
          open={opened.has(key)}
          onToggle={(event) => {
            if (event.target === event.currentTarget)
              toggle(key, event.currentTarget.open);
          }}
        >
          <summary
            className={`native-part-summary ${item.onSelect ? "is-editable" : "is-category"}`}
          >
            {item.onSelect ? button : item.label}
          </summary>
          <div className="native-part-children">
            {item.children.map((child) =>
              render(child, [...path, item.id], level + 1),
            )}
          </div>
        </details>
      );
    return (
      <div
        key={key}
        className={level > 2 ? "native-part-child" : "native-part-item"}
        data-native-nav-level={level}
      >
        {button}
      </div>
    );
  };
  return (
    <nav ref={ref} aria-label="语义部件">
      {groups.map((group) => (
        <details
          key={group.id}
          data-native-nav-level="1"
          open={opened.has(group.id)}
          onToggle={(event) => {
            if (event.target === event.currentTarget)
              toggle(group.id, event.currentTarget.open);
          }}
        >
          <summary>{group.label}</summary>
          <div className="native-part-children">
            {group.items.map((item) => render(item, [group.id], 2))}
          </div>
        </details>
      ))}
    </nav>
  );
}
