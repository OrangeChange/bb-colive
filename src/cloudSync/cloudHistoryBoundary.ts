import { compareCloudCursor, validateCloudCursor, validateCloudRoomId } from './cloudSyncCursor.ts';

export interface CloudPageBoundary {
  serverId: string;
  roomId: string;
  expectedCursor: string;
  nextCursor: string;
  metadataRevision: string;
  scanAfter: string;
  scanThrough: string;
  rangesComplete: boolean;
}

export function validateCloudPageBoundary(boundary: CloudPageBoundary): void {
  validateCloudRoomId(boundary.roomId);
  for (const value of [
    boundary.expectedCursor,
    boundary.nextCursor,
    boundary.metadataRevision,
    boundary.scanAfter,
    boundary.scanThrough,
  ]) validateCloudCursor(value);
  if (!boundary.serverId || !boundary.rangesComplete
    || boundary.scanAfter !== boundary.expectedCursor
    || boundary.scanThrough !== boundary.nextCursor
    || compareCloudCursor(boundary.nextCursor, boundary.expectedCursor) < 0) {
    throw new Error('历史恢复范围不完整，请重新开始本次恢复');
  }
}

