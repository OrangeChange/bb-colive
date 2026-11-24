import { Children, Fragment, isValidElement, type ReactNode } from "react";

/** 行内间距随内容自然折行，续行不保留起始空白。 */
export function ReviewInlineItems({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  const items: ReactNode[] = [];
  const collect = (nodes: ReactNode) =>
    Children.forEach(nodes, (node) => {
      if (node == null || typeof node === "boolean") return;
      if (
        isValidElement<{ children?: ReactNode }>(node) &&
        node.type === Fragment
      ) {
        collect(node.props.children);
        return;
      }
      if (typeof node === "string" || typeof node === "number") {
        if (String(node).trim())
          items.push(<span className="review-inline-text">{node}</span>);
      } else items.push(node);
    });
  collect(children);
  return (
    <>
      {items.map((item, index) => (
        <Fragment key={isValidElement(item) ? (item.key ?? index) : index}>
          {index > 0 && (
            <span
              className={
                wide
                  ? "review-inline-gap review-inline-gap-wide"
                  : "review-inline-gap"
              }
              aria-hidden="true"
            >
              {" "}
            </span>
          )}
          {item}
        </Fragment>
      ))}
    </>
  );
}
