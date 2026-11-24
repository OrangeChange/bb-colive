import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { mergeSameDanmuEvent, type SameDanmuMergeSettings } from "./danmuMerge.ts";
import type { EventWindowEvent } from "./eventWindowDiagnostics.ts";
import { shouldShowAutoDanmaku, shouldShowPhoneNotVerified } from "../eventDisplaySettings.ts";

/** 弹幕窗首版只承载双区左侧的两类事件。 */
export const DISPLAY_EVENT_TYPES = [MsgType.Danmu, MsgType.Interact] as const;

/** 弹幕窗只保留实时视口所需的最近事件，现场会话不受此上限影响。 */
export const DISPLAY_BUFFER_MAX = 50;

export function isDisplayEvent(event: DanmakuEvent): boolean {
  return event.msgType === MsgType.Danmu || event.msgType === MsgType.Interact;
}

export function appendDisplayEvent(
  events: EventWindowEvent[],
  event: EventWindowEvent,
  max = DISPLAY_BUFFER_MAX,
  mergeSettings?: SameDanmuMergeSettings,
): EventWindowEvent[] {
  if (!isDisplayEvent(event)) return events;
  const merged = mergeSettings && mergeSameDanmuEvent(events, event, mergeSettings);
  if (merged) return merged;
  const limit = Math.max(0, max);
  return [...events, event].slice(-limit);
}

/** 从未合并缓冲生成显示行；切换自动弹幕开关不丢失普通消息或污染计数。 */
export function projectDisplayEvents(
  events: EventWindowEvent[],
  settings: SameDanmuMergeSettings & { showAutoDanmaku: boolean; showPhoneNotVerified?: boolean; capacity?: number },
): EventWindowEvent[] {
  return events.filter(event => shouldShowAutoDanmaku(event, settings.showAutoDanmaku)
    && shouldShowPhoneNotVerified(event, settings.showPhoneNotVerified ?? false))
    .reduce<EventWindowEvent[]>((rows, event) => appendDisplayEvent(rows, event, settings.capacity ?? DISPLAY_BUFFER_MAX, settings), []);
}

export interface DisplaySessionState {
  open: boolean;
  ready: boolean;
  pending: EventWindowEvent[];
  /** 当前弹幕窗绑定的真实房间，仅用于切换时清空缓存，不参与界面渲染。 */
  roomId: number | null;
  /** 用于区分快速切房时延迟到达的旧握手。 */
  roomGeneration: number;
}

export function createDisplaySession(): DisplaySessionState {
  return { open: false, ready: false, pending: [], roomId: null, roomGeneration: 0 };
}

export function openDisplaySession(state: DisplaySessionState, roomId: number | null = null): void {
  state.open = true;
  state.ready = false;
  state.pending = [];
  state.roomId = roomId;
  state.roomGeneration += 1;
}

/** 切换弹幕窗绑定的房间；房间没变时保留缓存，房间变化时清空待发事件。 */
export function switchDisplayRoom(state: DisplaySessionState, roomId: number | null): boolean {
  if (state.roomId === roomId) return false;
  state.roomId = roomId;
  state.ready = false;
  state.pending = [];
  state.roomGeneration += 1;
  return true;
}

export function markDisplayReady(state: DisplaySessionState): EventWindowEvent[] {
  if (!state.open) return [];
  state.ready = true;
  const pending = state.pending;
  state.pending = [];
  return pending;
}

export function queueDisplayEvent(state: DisplaySessionState, event: EventWindowEvent): boolean {
  if (!state.open || state.ready || !isDisplayEvent(event)) return false;
  state.pending.push(event);
  return true;
}

export function closeDisplaySession(state: DisplaySessionState): void {
  state.open = false;
  state.ready = false;
  state.pending = [];
  state.roomId = null;
}
