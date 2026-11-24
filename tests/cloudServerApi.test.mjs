import assert from 'node:assert/strict';
import test from 'node:test';
import { createCloudServerApi } from '../src/cloudSync/cloudServerApi.ts';

test('云端管理调用仅传递安全操作参数', async () => {
  const calls = [];
  const api = createCloudServerApi(async (command, args) => {
    calls.push({ command, args });
    return {};
  });
  await api.loadHealth();
  await api.loadAuthStatus();
  await api.listRooms();
  await api.enableRoom('123');
  await api.stopRoom('123');
  await api.loadRetention();
  await api.previewRetention(30);
  await api.updateRetention(30, 'preview-id');
  await api.loadLocalSession();
  await api.syncLocalSession('42', false);
  await api.createQrSession();
  assert.deepEqual(calls, [
    { command: 'load_cloud_server_health', args: {} },
    { command: 'load_cloud_auth_status', args: {} },
    { command: 'list_cloud_rooms', args: {} },
    { command: 'enable_cloud_room', args: { roomId: '123' } },
    { command: 'stop_cloud_room', args: { roomId: '123' } },
    { command: 'load_cloud_retention_settings', args: {} },
    { command: 'preview_cloud_retention', args: { retentionDays: 30 } },
    { command: 'update_cloud_retention', args: { retentionDays: 30, confirmationId: 'preview-id' } },
    { command: 'load_local_bilibili_session_summary', args: {} },
    { command: 'sync_local_bilibili_session', args: { expectedUid: '42', replaceAccount: false } },
    { command: 'create_cloud_bilibili_qr_session', args: {} },
  ]);
  assert.equal(JSON.stringify(calls).includes('cookie'), false);
  assert.equal(JSON.stringify(calls).includes('refreshToken'), false);
});
