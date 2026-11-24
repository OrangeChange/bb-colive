export interface PreviewElementMark {
  eventId: string | null;
  path: number[];
}
export function previewElementMark(
  element: Element | null,
): PreviewElementMark | undefined {
  if (!element?.isConnected) return;
  const anchor =
    element.closest<HTMLElement>(".event-row-slot[data-event-id]") ??
    element.closest<HTMLElement>("[data-style-api]");
  if (!anchor) return;
  const path: number[] = [];
  let node: Element = element;
  while (node !== anchor) {
    const parent = node.parentElement;
    if (!parent) return;
    path.unshift([...parent.children].indexOf(node));
    node = parent;
  }
  return { eventId: anchor.getAttribute("data-event-id"), path };
}
export function applyPreviewElementMark(
  root: HTMLElement,
  mark: PreviewElementMark | undefined,
  attribute: string,
) {
  root
    .querySelectorAll(`[${attribute}]`)
    .forEach((element) => element.removeAttribute(attribute));
  if (!mark) return;
  let node: Element | null = mark.eventId
    ? ([...root.querySelectorAll(".event-row-slot[data-event-id]")].find(
        (element) => element.getAttribute("data-event-id") === mark.eventId,
      ) ?? null)
    : root.querySelector("[data-style-api]");
  for (const index of mark.path) node = node?.children[index] ?? null;
  node?.setAttribute(attribute, "");
}
