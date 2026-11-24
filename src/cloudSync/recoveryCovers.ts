import { uiText } from "../i18n/index.ts";
import type { ArchiveCloudCover } from '../archive/archiveCloudMetadata.ts';

export function recoveryCoverReference(serverId: string, resourceId: string, mime: string): string {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!extension) throw new Error(uiText("recoveryCovers.recoveryCoverReference"));
  return `cloud-cover://${serverId}/${resourceId}.${extension}`;
}

export async function restoreRecoveryCovers(serverId: string, covers: readonly ArchiveCloudCover[],
  download: (serverId: string, resourceId: string, mimeType: string) => Promise<string>): Promise<ArchiveCloudCover[]> {
  const result: ArchiveCloudCover[] = [];
  for (const cover of covers) {
    if (cover.localUrl || cover.availability !== 'available' || cover.result !== 'success' || !cover.mime_type) {
      result.push({ ...cover });
      continue;
    }
    try {
      result.push({ ...cover, localUrl: await download(serverId, cover.resource_id, cover.mime_type), downloadError: null });
    } catch {
      result.push({ ...cover, localUrl: null, downloadError: uiText("recoveryCovers.restoreRecoveryCovers.downloadError") });
    }
  }
  return result;
}
