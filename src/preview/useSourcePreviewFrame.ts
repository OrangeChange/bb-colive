import { projectSourceNameFrame } from "../events/displayNameProjection.ts";
import { useEffect, useLayoutEffect, useRef, useMemo } from "react";
import type { RefObject } from "react";
import type { PreviewFrame } from "./stylePreviewState.ts";
export function useSourcePreviewFrame(
  ref: RefObject<HTMLIFrameElement | null>,
  ready: boolean,
  channel: string,
  sourceFrame?: PreviewFrame,
  onFrame?: (frame: PreviewFrame) => void,
  maskUsername = false,
) {
  const frame = useMemo(() => sourceFrame ? projectSourceNameFrame(sourceFrame, maskUsername) : undefined, [sourceFrame, maskUsername]);
  const latest = useRef(onFrame);
  latest.current = onFrame;
  const consumed = useRef<{ epoch: number; sequence: number } | null>(null);
  const windowed = useRef<string | null>(null);
  useEffect(() => {
    if (!onFrame) return;
    const receive = (event: MessageEvent) => {
      if (
        event.source === ref.current?.contentWindow &&
        event.origin === location.origin &&
        event.data?.type === channel &&
        event.data.command === "preview-frame"
      )
        latest.current?.(event.data.data);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [ref, channel, Boolean(onFrame)]);
  useEffect(() => {
    if (!ready || !onFrame) return;
    ref.current?.contentWindow?.postMessage(
      { type: channel, command: "preview-observe", data: Boolean(onFrame) },
      location.origin,
    );
    return () => {
      ref.current?.contentWindow?.postMessage(
        { type: channel, command: "preview-observe", data: false },
        location.origin,
      );
    };
  }, [ready, Boolean(onFrame), channel, ref]);
  useEffect(() => {
    if (!ready) { consumed.current = null; windowed.current = null; }
  }, [ready]);
  useLayoutEffect(() => {
    if (!ready || !frame) return;
    const send = (command: string, data: unknown) =>
      ref.current?.contentWindow?.postMessage(
        { type: channel, command, data },
        location.origin,
      );
    if (frame.windowed) {
      const key = JSON.stringify([frame.restart ?? 0, frame.records]);
      if (windowed.current !== key) { windowed.current = key; send("preview-window", { records: frame.records ?? [] }); }
      return;
    }
    windowed.current = null;
    if (frame.presentation) {
      if (channel === "bb-blivechat") return;
      queueMicrotask(() => send("preview-present", { ...frame.presentation, epoch: frame.epoch, restart: frame.restart }));
      return;
    }
    const records = (frame.records ?? []) as { sequence?: number }[];
    if (!consumed.current || consumed.current.epoch !== frame.epoch) {
      send(
        "simulation",
        channel === "bb-blivechat"
          ? {
              playing: false,
              speed: 1,
              types: {
                text: true,
                emoticon: true,
                gift: true,
                member: true,
                superChat: true,
              },
            }
          : { enabled: false },
      );
      send("hydrate", { records });
    } else
      for (const record of records)
        if ((record.sequence ?? 0) > consumed.current.sequence)
          send("event", record);
    consumed.current = {
      epoch: frame.epoch,
      sequence: records[records.length - 1]?.sequence ?? 0,
    };
  }, [ready, frame, channel, ref]);
}
