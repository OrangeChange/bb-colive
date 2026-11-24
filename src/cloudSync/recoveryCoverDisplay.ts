import { invoke } from '@tauri-apps/api/core';
import { recoveryCoverReference } from './recoveryCovers';

export async function readRecoveryCover(reference: string, retry = false): Promise<string> {
  if (retry) {
    const match = /^cloud-cover:\/\/([^/]+)\/([^/.]+)\.(jpg|png|webp)$/.exec(reference);
    if (!match) throw new Error('封面地址无效');
    const mimeType = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }[match[3]];
    await invoke('download_cloud_recovery_cover', { serverId: match[1], resourceId: match[2], mimeType });
  }
  return invoke('read_cloud_recovery_cover', { reference });
}

export async function loadSessionCover(sessionId: string): Promise<string | null> {
  const result = await invoke<{serverId: string; items: Array<{resource_id: string; result: string; mime_type: string | null; discovered_at: string}>}>(
    'list_cloud_recovery_covers', { sessionId });
  const cover = result.items.filter(item => item.result === 'success' && item.mime_type)
    .sort((a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at))[0];
  if (!cover) return null;
  return recoveryCoverReference(result.serverId, cover.resource_id, cover.mime_type!);
}
