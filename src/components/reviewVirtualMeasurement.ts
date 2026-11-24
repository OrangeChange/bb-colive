export function getReviewVirtualMeasurementProps(
  index: number,
  measureElement: (element: HTMLDivElement | null) => void,
) {
  return {
    "data-index": index,
    ref: measureElement,
  };
}

export function measureLoadedReviewRow(
  contentElement: Pick<Element, "closest">,
  measureElement: (element: HTMLDivElement | null) => void,
): boolean {
  const slot = contentElement.closest(".event-row-slot") as HTMLDivElement | null;
  if (!slot) return false;
  measureElement(slot);
  return true;
}
