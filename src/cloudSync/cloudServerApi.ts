export type CloudServerInvoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

export interface CloudServerHealth {
  status: 'ready' | 'not_ready';
  database: 'ready' | 'unavailable';
}

export interface CloudAuthStatus {
  state: string;
  account: { uid: string; name: string } | null;
  lastVerifiedAt: string | null;
  reason: string | null;
  source: 'client_sync' | 'server_qr' | null;
  refreshCapable: boolean;
  refreshState: 'ready' | 'cookie_only' | 'checking' | 'failed' | null;
  lastRefreshCheckedAt: string | null;
  lastRefreshedAt: string | null;
}

export interface CloudRoom {
  roomId: string;
  enabled: boolean;
  state: string;
  reason: string | null;
  committedThrough: string;
  pendingEvents: number;
  pendingBytes: number;
  writeState: string;
  currentSession?: { title?: string | null } | null;
}

export interface CloudRoomList {
  items: CloudRoom[];
  supportedEnabledRooms: number;
}

export interface CloudRetentionSettings {
  retentionDays: number | null;
  confirmed: boolean;
}

export interface CloudRetentionPreview extends CloudRetentionSettings {
  confirmationId: string;
  expiresAt: string;
  sessionCount: number;
  eventCount: number;
  coverCount: number;
  coverResourceCount: number;
  coverBytes: string;
}

export interface LocalBilibiliSessionSummary {
  uid: string;
  name: string;
  refreshCapable: boolean;
}

const invokeDefault: CloudServerInvoke = async (command, args) => {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke(command, args);
};

export function createCloudServerApi(invoke: CloudServerInvoke = invokeDefault) {
  return {
    loadHealth: () => invoke<CloudServerHealth>('load_cloud_server_health', {}),
    loadAuthStatus: () => invoke<CloudAuthStatus>('load_cloud_auth_status', {}),
    listRooms: () => invoke<CloudRoomList>('list_cloud_rooms', {}),
    enableRoom: (roomId: string) => invoke<CloudRoom>('enable_cloud_room', { roomId }),
    stopRoom: (roomId: string) => invoke<CloudRoom>('stop_cloud_room', { roomId }),
    loadRetention: () => invoke<CloudRetentionSettings>('load_cloud_retention_settings', {}),
    previewRetention: (retentionDays: number | null) =>
      invoke<CloudRetentionPreview>('preview_cloud_retention', { retentionDays }),
    updateRetention: (retentionDays: number | null, confirmationId: string) =>
      invoke<CloudRetentionSettings>('update_cloud_retention', { retentionDays, confirmationId }),
    loadLocalSession: () => invoke<LocalBilibiliSessionSummary>('load_local_bilibili_session_summary', {}),
    syncLocalSession: (expectedUid: string, replaceAccount: boolean) =>
      invoke<CloudAuthStatus>('sync_local_bilibili_session', { expectedUid, replaceAccount }),
    createQrSession: () => invoke<{ url: string; expiresAt: string }>('create_cloud_bilibili_qr_session', {}),
  };
}

export const cloudServerApi = createCloudServerApi();
