import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCloudRecoveryCompatibility,
  createCloudRecoveryBindingClient,
} from '../src/cloudSync/cloudRecoveryBinding.ts';

const compatibleInfo = {
  serverId: '12345678-1234-1234-1234-123456789abc',
  serviceVersion: '0.6.1',
  apiVersion: 2,
  protocolVersion: '0.1.3',
  recoveryContractVersion: '0.3',
  serializationVersion: 'bb-json-utf8-v1',
};

test('云端恢复按协议能力判断兼容，不锁定服务端程序版本', () => {
  assert.deepEqual(assertCloudRecoveryCompatibility(compatibleInfo), compatibleInfo);
  assert.equal(
    assertCloudRecoveryCompatibility({ ...compatibleInfo, serviceVersion: '0.7.0' }).serviceVersion,
    '0.7.0',
  );
});

test('云端恢复分别拒绝不兼容的 API、直播协议、恢复契约和序列化格式', () => {
  for (const [field, value] of [
    ['apiVersion', 1],
    ['protocolVersion', '0.1.2'],
    ['recoveryContractVersion', '0.1'],
    ['serializationVersion', 'other'],
  ]) {
    assert.throws(
      () => assertCloudRecoveryCompatibility({ ...compatibleInfo, [field]: value }),
      error => error instanceof Error && error.message === `incompatible_${field}`,
    );
  }
});

test('绑定客户端只把令牌发送给原生命令，读取结果不包含令牌', async () => {
  const calls = [];
  const client = createCloudRecoveryBindingClient(async (command, args) => {
    calls.push({ command, args });
    if (command === 'save_cloud_recovery_binding') {
      return {
        status: 'ready',
        binding: {
          bindingId: compatibleInfo.serverId,
          baseUrl: 'https://fetcher.example',
          ...compatibleInfo,
          verifiedAt: 1,
        },
      };
    }
    if (command === 'load_cloud_recovery_binding') return { status: 'unbound', binding: null };
    return undefined;
  });

  const saved = await client.save('https://fetcher.example/', 'secret-token');
  assert.equal(saved.status, 'ready');
  assert.equal('token' in saved.binding, false);
  assert.deepEqual(calls[0], {
    command: 'save_cloud_recovery_binding',
    args: { baseUrl: 'https://fetcher.example/', token: 'secret-token' },
  });

  assert.deepEqual(await client.load(), { status: 'unbound', binding: null });
  await client.remove();
  assert.deepEqual(calls.at(-1), { command: 'remove_cloud_recovery_binding', args: {} });
});

