import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import { applyScDeletion } from './stickyEventModel.ts';
import { isPaidEventVisibleAtThreshold, type GiftThresholdMode } from "../giftThreshold.ts";
import { isAllowedByOnlyGuardEntry, isHiddenEvent } from "../events/eventView.ts";
import type { EventWindowEvent } from "./eventWindowDiagnostics.ts";

/** 礼物窗承载双栏布局右侧的礼物、醒目留言和大航海事件。 */
export const GIFT_WINDOW_EVENT_TYPES = [
  MsgType.Gift,
  MsgType.AnchorLotStart,
  MsgType.AnchorLotAward,
  MsgType.RedPocketStart,
  MsgType.RedPocketWinner,
  MsgType.SuperChat,
  MsgType.GuardBuy,
  MsgType.GuardHonor,
] as const;

/** 礼物窗只保留实时视口所需的最近事件，现场会话不受此上限影响。 */
export const GIFT_BUFFER_MAX = 50;

const GIFT_WINDOW_EVENT_SET = new Set<MsgType>(GIFT_WINDOW_EVENT_TYPES);

export const REVENUE_WINDOW_KINDS = ['gift', 'superchat', 'guard'] as const;
export type RevenueWindowKind = typeof REVENUE_WINDOW_KINDS[number];
export type RevenueWindowMode = 'combined' | 'split';
export interface RevenueWindowSelection {
  mode: RevenueWindowMode;
  open: boolean;
  selected: RevenueWindowKind[];
  remembered: RevenueWindowKind[];
}

export function createRevenueWindowSelection(): RevenueWindowSelection {
  return { mode: 'combined', open: false, selected: [], remembered: [...REVENUE_WINDOW_KINDS] };
}

export function changeRevenueWindowSelection(state: RevenueWindowSelection, action:
  | { type: 'toggle' }
  | { type: 'mode'; mode: RevenueWindowMode }
  | { type: 'child'; kind: RevenueWindowKind },
): RevenueWindowSelection {
  if (action.type === 'mode') return { ...state, mode: action.mode };
  if (action.type === 'toggle') {
    return state.open ? { ...state, open: false, selected: [] }
      : { ...state, open: true, selected: [...state.remembered] };
  }
  const selected = REVENUE_WINDOW_KINDS.filter(kind => kind === action.kind
    ? !state.selected.includes(kind) : state.selected.includes(kind));
  return { ...state, selected, open: selected.length > 0,
    remembered: selected.length ? [...selected] : state.remembered };
}

export function revenueEventKind(event: Pick<DanmakuEvent, 'msgType'>): RevenueWindowKind | null {
  if (event.msgType === MsgType.SuperChat || event.msgType === MsgType.ScDeleted) return 'superchat';
  if (event.msgType === MsgType.GuardBuy || event.msgType === MsgType.GuardHonor) return 'guard';
  return GIFT_WINDOW_EVENT_SET.has(event.msgType) ? 'gift' : null;
}

/** 收益窗与现场收益区共用最低显示金额；红包、天选和大航海进房不受影响。 */
export function isGiftWindowEventVisible(
  event: DanmakuEvent,
  giftThreshold: number,
  giftThresholdMode: GiftThresholdMode = "unit",
  onlyGuardEntry = false,
): boolean {
  return !isHiddenEvent(event) && isAllowedByOnlyGuardEntry(event, onlyGuardEntry)
    && isPaidEventVisibleAtThreshold(event, giftThreshold, giftThresholdMode);
}

export function isGiftWindowEvent(event: DanmakuEvent): boolean {
  return GIFT_WINDOW_EVENT_SET.has(event.msgType);
}

function getGiftWindowEventKey(event: DanmakuEvent): string {
  // reactKey 只负责 React 列表协调；store 为重复 key 添加后缀后，不能再把它当业务身份。
  return event.dedupe ?? event.comboId ?? event.id;
}

export interface GiftWindowControlState {
  deletedScIds: Set<string>;
  endedActivities: Set<string>;
  clear(): void;
}

export function createGiftWindowControlState(): GiftWindowControlState {
  const state: GiftWindowControlState = {
    deletedScIds: new Set(),
    endedActivities: new Set(),
    clear() {
      state.deletedScIds.clear();
      state.endedActivities.clear();
    },
  };
  return state;
}

function activityKey(event: DanmakuEvent, start: boolean): string | null {
  const id = event.lottery?.id;
  if (id === undefined) return null;
  if (event.msgType === (start ? MsgType.AnchorLotStart : MsgType.AnchorLotAward)) return `anchor:${id}`;
  if (event.msgType === (start ? MsgType.RedPocketStart : MsgType.RedPocketWinner)) return `red-pocket:${id}`;
  return null;
}

/** 在当前房间会话内保留控制事实，防止服务端重放让已删除或已结束内容复活。 */
export function applyGiftWindowControl(state: GiftWindowControlState, event: DanmakuEvent, retainActivityStarts = false): DanmakuEvent | null {
  if (event.msgType === MsgType.ScDeleted) {
    for (const id of event.scDeleteIds ?? []) state.deletedScIds.add(id);
    return event;
  }
  if (event.msgType === MsgType.SuperChat && state.deletedScIds.has(event.id)) return null;
  const endedKey = activityKey(event, false);
  if (endedKey) {
    state.endedActivities.add(endedKey);
    return event;
  }
  const startedKey = activityKey(event, true);
  return !retainActivityStarts && startedKey && state.endedActivities.has(startedKey) ? null : event;
}

export function appendGiftWindowEvent(
  events: EventWindowEvent[],
  event: EventWindowEvent,
  max = GIFT_BUFFER_MAX,
  retainActivityStarts = false,
): EventWindowEvent[] {
  if (event.msgType === MsgType.ScDeleted) return applyScDeletion(events, event);
  if (!isGiftWindowEvent(event)) return events;
  const endedKey = activityKey(event, false);
  if (endedKey && !retainActivityStarts) events = events.filter(row => activityKey(row, true) !== endedKey);
  const eventKey = getGiftWindowEventKey(event);
  const existingIndex = events.findIndex((current) => getGiftWindowEventKey(current) === eventKey);
  if (existingIndex >= 0) {
    const next = [...events];
    next[existingIndex] = event;
    return next;
  }
  const limit = Math.max(0, max);
  return [...events, event].slice(-limit);
}

export interface GiftWindowSessionState {
  open: boolean;
  ready: boolean;
  pending: EventWindowEvent[];
  /** 当前礼物窗绑定的真实房间，仅用于切换时清空缓存，不参与界面渲染。 */
  roomId: number | null;
  /** 用于区分快速切房时延迟到达的旧握手。 */
  roomGeneration: number;
}

export function createGiftWindowSession(): GiftWindowSessionState {
  return { open: false, ready: false, pending: [], roomId: null, roomGeneration: 0 };
}

export function openGiftWindowSession(state: GiftWindowSessionState, roomId: number | null = null): void {
  state.open = true;
  state.ready = false;
  state.pending = [];
  state.roomId = roomId;
  state.roomGeneration += 1;
}

export function switchGiftWindowRoom(state: GiftWindowSessionState, roomId: number | null): boolean {
  if (state.roomId === roomId) return false;
  state.roomId = roomId;
  state.ready = false;
  state.pending = [];
  state.roomGeneration += 1;
  return true;
}

export function markGiftWindowReady(state: GiftWindowSessionState): EventWindowEvent[] {
  if (!state.open) return [];
  state.ready = true;
  const pending = state.pending;
  state.pending = [];
  return pending;
}

export function queueGiftWindowEvent(state: GiftWindowSessionState, event: EventWindowEvent): boolean {
  if (!state.open || state.ready || (!isGiftWindowEvent(event) && event.msgType !== MsgType.ScDeleted)) return false;
  state.pending.push(event);
  return true;
}

export function closeGiftWindowSession(state: GiftWindowSessionState): void {
  state.open = false;
  state.ready = false;
  state.pending = [];
  state.roomId = null;
}
