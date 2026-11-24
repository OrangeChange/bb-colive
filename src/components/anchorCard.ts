import type { Anchor } from "../protocol/anchors.ts";

export interface CurrentAnchorCard {
  uname?: string;
  face?: string;
  roomId?: number;
  live?: boolean;
}

/**
 * 计算主播卡当前应展示的身份：连接中有待切换目标时，展示目标预览；
 * 实际连接状态仍由 ConnectBar 另行展示。
 */
export function getAnchorCardView(
  active: boolean,
  current: CurrentAnchorCard | null,
  selected: Anchor | null,
  last: Anchor | null,
): CurrentAnchorCard | null {
  if (active && selected && selected.realRoomId !== current?.roomId) {
    return {
      uname: selected.uname,
      face: selected.face,
      roomId: selected.realRoomId,
      live: selected.liveStatus === undefined ? undefined : selected.liveStatus === 1,
    };
  }
  if (active) return current;
  const fallback = selected ?? last;
  return fallback
    ? {
        uname: fallback.uname,
        face: fallback.face,
        roomId: fallback.realRoomId,
        live: fallback.liveStatus === undefined ? undefined : fallback.liveStatus === 1,
      }
    : null;
}
