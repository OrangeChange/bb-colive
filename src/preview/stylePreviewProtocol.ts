import type {
  PreviewFrame,
  StylePreviewSnapshot,
} from "./stylePreviewState.ts";
export type StylePreviewMessage =
  | { type: "preview:clear" }
  | { type: "preview:replace"; state: StylePreviewSnapshot }
  | { type: "preview:configure"; state: Omit<StylePreviewSnapshot, "frame"> }
  | {
      type: "preview:frame";
      ownerId: string;
      revision: number;
      frame: PreviewFrame;
      appendRecords: boolean;
      recordCount: number;
      nativeEvents?: unknown[];
    };
function sameConfiguration(
  previous: StylePreviewSnapshot,
  state: StylePreviewSnapshot,
) {
  if (
    previous.kind !== state.kind ||
    previous.displayScale !== state.displayScale ||
    (previous.kind === "obs" && state.kind === "obs" && previous.previewBackground !== state.previewBackground) ||
    previous.width !== state.width ||
    previous.height !== state.height ||
    previous.nativeRowWidth !== state.nativeRowWidth ||
    previous.scrollbarWidth !== state.scrollbarWidth ||
    previous.scrollbarThumb !== state.scrollbarThumb ||
    previous.scrollbarTrack !== state.scrollbarTrack ||
    previous.palette !== state.palette ||
    previous.customColor !== state.customColor ||
    previous.scheme !== state.scheme
  )
    return false;
  const before = previous.content as unknown as Record<string, unknown>,
    after = state.content as unknown as Record<string, unknown>;
  return Object.keys(after).every(
    (key) =>
      (state.kind === "native" && key === "events") ||
      before[key] === after[key] ||
      JSON.stringify(before[key]) === JSON.stringify(after[key]),
  );
}
export function previewMessage(
  previous: StylePreviewSnapshot | null,
  state: StylePreviewSnapshot | null,
): StylePreviewMessage {
  if (!state) return { type: "preview:clear" };
  if (
    !previous ||
    previous.ownerId !== state.ownerId ||
    !sameConfiguration(previous, state)
  ) {
    if (
      previous?.ownerId === state.ownerId &&
      previous.kind === "compatible" &&
      state.kind === "compatible" &&
      JSON.stringify(previous.frame) === JSON.stringify(state.frame)
    ) {
      const { frame: _frame, ...configuration } = state;
      return { type: "preview:configure", state: configuration };
    }
    return { type: "preview:replace", state };
  }
  const records = state.frame.records ?? [],
    last = previous.frame.records ?? [];
  const append = state.frame.epoch === previous.frame.epoch && last.length > 0;
  const sequence =
    (last[last.length - 1] as { sequence?: number } | undefined)?.sequence ?? 0;
  return {
    type: "preview:frame",
    ownerId: state.ownerId,
    revision: state.revision,
    frame: {
      ...state.frame,
      ...(state.frame.records
        ? {
            records: append
              ? records.filter(
                  (record) =>
                    Number((record as { sequence?: number }).sequence) >
                    sequence,
                )
              : records,
          }
        : {}),
    },
    appendRecords: append,
    recordCount: records.length,
    ...(state.kind === "native" ? { nativeEvents: state.content.events } : {}),
  };
}
export function applyPreviewMessage(
  current: StylePreviewSnapshot | null,
  message: StylePreviewMessage,
): StylePreviewSnapshot | null {
  if (message.type === "preview:clear") return null;
  if (message.type === "preview:replace")
    return !current || message.state.ownerId !== current.ownerId || message.state.revision > current.revision
      ? message.state
      : current;
  if (message.type === "preview:configure")
    return current &&
      current.ownerId === message.state.ownerId &&
      message.state.revision > current.revision
      ? ({
          ...message.state,
          frame: { ...current.frame },
        } as StylePreviewSnapshot)
      : current;
  if (
    !current ||
    message.ownerId !== current.ownerId ||
    message.revision <= current.revision
  )
    return current;
  const frame = {
    ...message.frame,
    ...(message.appendRecords
      ? {
          records: message.recordCount
            ? [
                ...(current.frame.records ?? []),
                ...(message.frame.records ?? []),
              ].slice(-message.recordCount)
            : [],
        }
      : {}),
  };
  return {
    ...current,
    revision: message.revision,
    frame,
    ...(current.kind === "native" && message.nativeEvents
      ? {
          content: {
            ...current.content,
            events: message.nativeEvents as typeof current.content.events,
          },
        }
      : {}),
  } as StylePreviewSnapshot;
}
