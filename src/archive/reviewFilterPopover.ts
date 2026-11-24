export interface ReviewFilterShellRect {
  top: number;
  bottom: number;
  left: number;
  width: number;
}

export interface ReviewFilterViewport {
  width: number;
  height: number;
}

export interface ReviewFilterPopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

export function positionReviewFilterPopover(
  shell: ReviewFilterShellRect,
  viewport: ReviewFilterViewport,
  margin = 8,
): ReviewFilterPopoverPosition {
  const width = Math.min(Math.max(shell.width, 320), Math.max(0, viewport.width - margin * 2));
  const left = Math.max(margin, Math.min(shell.left, viewport.width - width - margin));
  const desiredHeight = Math.min(viewport.height * 0.7, 520);
  const minVisibleHeight = Math.min(desiredHeight, 160, Math.max(0, viewport.height - margin * 2));
  const top = Math.max(margin, Math.min(shell.bottom + margin, viewport.height - margin - minVisibleHeight));
  const maxHeight = Math.max(1, Math.min(desiredHeight, viewport.height - top - margin));
  return { top, left, width, maxHeight };
}
