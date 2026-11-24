import type { DanmakuEvent } from "../protocol/types.ts";

const ARCHIVE_EVENT_MARKER = ":archive-event:";

export function getEventMarkKey(event: Pick<DanmakuEvent, "roomId" | "id" | "reactKey" | "dedupe" | "comboId" | "annotationIdentity">): string {
  if (event.annotationIdentity) return event.annotationIdentity.markKey;
  return event.comboId ? `${event.roomId}:combo:${event.comboId}` : `${event.roomId}:event:${event.reactKey ?? event.dedupe ?? event.id}`;
}

export function getEventBookmarkKey(event: Pick<DanmakuEvent, "roomId" | "id" | "comboId" | "dedupe" | "reactKey" | "annotationIdentity">): string {
  if (event.annotationIdentity) return event.annotationIdentity.bookmarkKey;
  return event.comboId ? `${event.roomId}:combo:${event.comboId}` : `${event.roomId}:event:${event.dedupe ?? event.reactKey ?? event.id}`;
}

export function getArchiveEventKey(event: Pick<DanmakuEvent, "id" | "dedupe">, sessionId: string): string {
  return `${sessionId}${ARCHIVE_EVENT_MARKER}${event.dedupe ?? event.id}`;
}

export function stableArchiveEventKey(roomId: number, eventId: string): string {
  return `${roomId}${ARCHIVE_EVENT_MARKER}${eventId}`;
}

export function toStoredArchiveEventKey(sessionId: string, eventKey: string): string {
  const markerIndex = eventKey.indexOf(ARCHIVE_EVENT_MARKER);
  const identity = markerIndex >= 0 ? eventKey.slice(markerIndex + ARCHIVE_EVENT_MARKER.length) : eventKey;
  return `${sessionId}${ARCHIVE_EVENT_MARKER}${identity}`;
}

/** 在当前列表内分配稳定的显示标识，不改变协议和业务身份。 */
export function assignEventRenderKey<T extends Pick<DanmakuEvent, "id" | "reactKey">>(event: T, keys: Set<string>, nextSequence?: () => number): T {
  const base = event.reactKey ?? event.id;
  let key = base;
  let sequence = 0;
  while (keys.has(key)) key = `${base}~${nextSequence ? nextSequence() : ++sequence}`;
  keys.add(key);
  return key === base ? event : { ...event, reactKey: key };
}
