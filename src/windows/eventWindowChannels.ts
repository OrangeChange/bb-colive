/**
 * 主窗口与两个事件副窗口共用的纯通道定义。
 *
 * 此文件不能引入窗口控制、事件监听或 HMR 生命周期。副窗口会直接加载它；
 * 将这些常量放在桥接模块里会让副窗口误执行只应属于主窗口的清理逻辑。
 */
import type { RoomGuardProfile } from '../protocol/types';

export const REVENUE_WINDOW_LABELS = ['gift', 'gift-only', 'superchat', 'guard'] as const;
export type RevenueWindowLabel = typeof REVENUE_WINDOW_LABELS[number];
export const EVENT_WINDOW_LABELS = ['display', ...REVENUE_WINDOW_LABELS] as const;
export type EventWindowKind = typeof EVENT_WINDOW_LABELS[number];
export function isEventWindowKind(value: string): value is EventWindowKind {
  return (EVENT_WINDOW_LABELS as readonly string[]).includes(value);
}
export function revenueWindowChannels(label: RevenueWindowLabel) {
  return {
    eventName: `${label}:events`, readyEvent: `${label}:ready`,
    readyRequestEvent: `${label}:ready-request`, readyAckEvent: `${label}:ready-ack`,
    lockEvent: `${label}:lock`, lockStateEvent: `${label}:lock-state`,
    roomChangedEvent: `${label}:room-changed`, resetGeometryEvent: `${label}:reset-geometry`,
    effectEvent: `${label}:effect`, geometryStoreFile: `${label}-window.local.json`,
  };
}

export const DISPLAY_WINDOW_LABEL = "display";
export const MAIN_EVENT_REGION = "main";
export const DISPLAY_EVENT_REGION = DISPLAY_WINDOW_LABEL;
export const DISPLAY_EVENT_NAME = "display:danmu";
export const DISPLAY_READY_EVENT = "display:ready";
export const DISPLAY_READY_REQUEST_EVENT = "display:ready-request";
export const DISPLAY_READY_ACK_EVENT = "display:ready-ack";
export const DISPLAY_LOCK_EVENT = "display:lock";
export const DISPLAY_LOCK_STATE_EVENT = "display:lock-state";
export const DISPLAY_ROOM_CHANGED_EVENT = "display:room-changed";
export const DISPLAY_RESET_GEOMETRY_EVENT = "display:reset-geometry";

export const GIFT_WINDOW_LABEL = "gift";
export const GIFT_EVENT_REGION = GIFT_WINDOW_LABEL;
export const GIFT_EVENT_NAME = "gift:events";
export const GIFT_EFFECT_EVENT = "gift:effect";
/** 礼物副窗点击特效图标后，请求主窗口同步播放；与自动到达通道分离。 */
export const GIFT_EFFECT_MANUAL_EVENT = "gift:effect-manual";
export const GIFT_READY_EVENT = "gift:ready";
export const GIFT_READY_REQUEST_EVENT = "gift:ready-request";
export const GIFT_READY_ACK_EVENT = "gift:ready-ack";
export const GIFT_LOCK_EVENT = "gift:lock";
export const GIFT_LOCK_STATE_EVENT = "gift:lock-state";
export const GIFT_ROOM_CHANGED_EVENT = "gift:room-changed";
export const GIFT_RESET_GEOMETRY_EVENT = "gift:reset-geometry";
export const EVENT_WINDOW_DELIVERY_FAILURE_REASON = "window-delivery-failed";

/** 副窗口与主窗口之间用于确认当前房间的握手状态。 */
export interface EventWindowRoomStatePayload {
  roomId: number | null;
  generation: number;
  roomGuardProfile?: RoomGuardProfile;
}

export function acceptsEventWindowRoomState(current: EventWindowRoomStatePayload, next: EventWindowRoomStatePayload): boolean {
  return next.generation > current.generation || (next.generation === current.generation && next.roomId === current.roomId);
}

export function isEventWindowRoomStatePayload(value: unknown): value is EventWindowRoomStatePayload {
  if (typeof value !== "object" || value === null) return false;
  const payload = value as Partial<EventWindowRoomStatePayload>;
  return (
    (payload.roomId === null || (typeof payload.roomId === "number" && Number.isInteger(payload.roomId)))
    && typeof payload.generation === "number"
    && Number.isInteger(payload.generation)
    && payload.generation >= 0
  );
}

/** 副窗口只渲染它已确认的房间，避免旧连接事件越过切房清理。 */
export function isEventWindowEventForRoom(event: { roomId?: unknown; __roomGeneration?: number }, roomId: number | null, generation?: number): boolean {
  return roomId !== null && event.roomId === roomId &&
    (generation === undefined || event.__roomGeneration === undefined || event.__roomGeneration === generation);
}

/** 主窗口向副窗口提交事件后的同步桥接状态；未打开的窗口不参与投递。 */
export type EventWindowPublishResult = "delivered" | "window-not-ready" | "not-applicable";

export function getEventWindowPublishResult(open: boolean, ready: boolean): EventWindowPublishResult {
  if (!open) return "not-applicable";
  return ready ? "delivered" : "window-not-ready";
}
