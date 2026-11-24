import type { RoomGuardProfile } from '../../protocol/types.ts';

export function laplaceRoomGuardContext(profile?: RoomGuardProfile, roomId?: number | null): Record<string, {roomId: number; guardCount: number}> {
  if (!profile || !profile.roomId || (roomId != null && profile.roomId !== roomId)
    || typeof profile.guardCount !== 'number' || !Number.isFinite(profile.guardCount) || profile.guardCount < 0) return {};
  return { [profile.anchorUid || String(profile.roomId)]: {roomId: profile.roomId, guardCount: profile.guardCount} };
}
