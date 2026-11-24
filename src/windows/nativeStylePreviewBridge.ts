import { createAppWindow } from "../appData.ts";
import {
  createPreviewResourceSender,
  type StylePreviewWireMessage,
} from "../preview/stylePreviewResources.ts";
import { emit, emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export const NATIVE_STYLE_PREVIEW_LABEL = "native-style-preview";
export const NATIVE_STYLE_PREVIEW_READY = "native-style-preview:ready";
export const NATIVE_STYLE_PREVIEW_UPDATE = "native-style-preview:update";

export type { NativeStylePreviewPayload } from "../preview/stylePreviewState.ts";
import { previewMessage } from "../preview/stylePreviewProtocol.ts";
import type { StylePreviewSnapshot } from "../preview/stylePreviewState.ts";
import {
  getPreview,
  subscribePreview,
} from "../preview/stylePreviewSession.ts";
let syncStarted = false;
export function ensureNativeStylePreviewSync() {
  if (syncStarted) return;
  syncStarted = true;
  let previous: StylePreviewSnapshot | null = null;
  let tail = Promise.resolve();
  const encode = createPreviewResourceSender();
  const sync = createNativeStylePreviewSync<StylePreviewSnapshot | null>(
    async (state) => {
      const message = previewMessage(previous, state);
      previous = state;
      tail = tail
        .then(() =>
          emitTo(
            NATIVE_STYLE_PREVIEW_LABEL,
            NATIVE_STYLE_PREVIEW_UPDATE,
            encode(message),
          ),
        )
        .catch(() => {});
      await tail;
    },
  );
  subscribePreview((state) => sync.schedule(state));
  void onNativeStylePreviewReady(() => {
    const message = previewMessage(null, getPreview());
    tail = tail
      .then(() =>
        emitTo(
          NATIVE_STYLE_PREVIEW_LABEL,
          NATIVE_STYLE_PREVIEW_UPDATE,
          encode(message, true),
        ),
      )
      .catch(() => {});
    return tail;
  });
}

export async function openNativeStylePreviewWindow(): Promise<void> {
  ensureNativeStylePreviewSync();
  const existing = await WebviewWindow.getByLabel(NATIVE_STYLE_PREVIEW_LABEL);
  if (existing) {
    await existing.show();
    await existing.setFocus();
    return;
  }
  await createAppWindow(NATIVE_STYLE_PREVIEW_LABEL, {
    url: "?window=native-style-preview",
    title: "样式预览 · BB CoLive",
    width: 480,
    height: 720,
    minWidth: 240,
    minHeight: 320,
    resizable: true,
    decorations: true,
    transparent: false,
    visible: true,
  });
}

export function createNativeStylePreviewSync<T>(
  publish: (payload: T) => Promise<void>,
  delay = 0,
  setTimer?: (
    callback: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>,
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void = clearTimeout,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let scheduled = false;
  let generation = 0;
  let pending: T | undefined;
  const cancel = () => {
    if (timer !== undefined) clearTimer(timer);
    timer = undefined;
    scheduled = false;
    generation++;
  };
  const flush = async () => {
    cancel();
    if (pending === undefined) return;
    const payload = pending;
    pending = undefined;
    await publish(payload);
  };
  return {
    schedule(payload: T) {
      pending = payload;
      if (scheduled) return;
      scheduled = true;
      const current = generation;
      const send = () => { if (current === generation) void flush(); };
      if (delay === 0 && !setTimer) queueMicrotask(send);
      else timer = (setTimer ?? setTimeout)(send, delay) as ReturnType<typeof setTimeout>;
    },
    flush,
    dispose() {
      cancel();
      pending = undefined;
    },
  };
}

export async function closeNativeStylePreviewWindow(): Promise<void> {
  const target = await WebviewWindow.getByLabel(NATIVE_STYLE_PREVIEW_LABEL);
  await target?.close().catch(() => {});
}

export function onNativeStylePreviewReady(
  callback: () => void | Promise<void>,
): Promise<UnlistenFn> {
  return listen(NATIVE_STYLE_PREVIEW_READY, () => {
    void callback();
  });
}

export function announceNativeStylePreviewReady(): Promise<void> {
  return emit(NATIVE_STYLE_PREVIEW_READY);
}

export function listenNativeStylePreviewUpdates(
  callback: (payload: StylePreviewWireMessage) => void,
): Promise<UnlistenFn> {
  return listen<StylePreviewWireMessage>(NATIVE_STYLE_PREVIEW_UPDATE, (event) =>
    callback(event.payload),
  );
}
