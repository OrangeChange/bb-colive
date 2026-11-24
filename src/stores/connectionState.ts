import type { ConnState } from "../protocol/types";

/** 同一房间重连时可暂时复用旧档位，切换主播时必须清空。 */
export function keepSameRoomGuardProfile(
  previous: Pick<ConnState, "roomId" | "roomGuardProfile">,
  nextRoomId: number | undefined,
): Pick<ConnState, "roomGuardProfile"> {
  if (nextRoomId != null && previous.roomId === nextRoomId && previous.roomGuardProfile) {
    return { roomGuardProfile: previous.roomGuardProfile };
  }
  return {};
}

/** 手动断开只结束连接，不结束当前主播上下文。 */
export function toClosedState(state: ConnState): ConnState {
  return { ...state, status: "closed", message: "已断开" };
}
