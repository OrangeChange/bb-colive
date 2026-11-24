import type { ArchiveCloudCover } from '../archive/archiveCloudMetadata.ts';

export function recoveryCoverReference(serverId: string, resourceId: string, mime: string): string {
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[mime];
  if (!extension) throw new Error('封面格式不受支持');
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
      result.push({ ...cover, localUrl: null, downloadError: '封面未能下载，恢复连接后可重试封面' });
    }
  }
  return result;
}
