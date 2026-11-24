import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecoveryTransport } from '../src/cloudSync/recoveryTransport.ts';
import { fixtureBytes, goldenRoot, goldenRootBytes, sha } from './recoveryFixtureUtils.mjs';

test('恢复客户端通过原生命令启动任务并解析已验证 root', async () => {
  const calls = [];
  const bytes = goldenRootBytes('baseline');
  const transport = createRecoveryTransport(async (command, args) => {
    calls.push({ command, args });
    if (command === 'start_cloud_recovery_job') {
      return { localJobId: 'local', roomId: '9007199254740993', created: {} };
    }
    return {
      state: 'ready', jobId: goldenRoot('baseline').job_id, failureCode: null,
      rootBytes: [...bytes], rootSha256: sha(bytes), cacheHandle: 'root-cache',
    };
  });
  const selection = { scope: 'all', include_danmaku: true, include_interactions: true };
  await transport.start('9007199254740993', 'baseline', undefined, selection);
  assert.deepEqual(calls[0], {
    command: 'start_cloud_recovery_job',
    args: { roomId: '9007199254740993', mode: 'baseline', fromCutId: undefined, selection },
  });
  assert.equal((await transport.status('local')).root.mode, 'baseline');
});

test('恢复客户端通过原生命令分页读取云端场次', async () => {
  const calls = [];
  const page = { items: [{ sessionId: '00000000-0000-4000-8000-000000000001', title: '测试场次' }], nextCursor: 'next', hasMore: true, metadataRevision: '7' };
  const transport = createRecoveryTransport(async (command, args) => { calls.push({ command, args }); return page; });
  assert.deepEqual(await transport.listSessions('9007199254740993', 'cursor'), page);
  assert.deepEqual(calls, [{ command: 'list_cloud_recovery_sessions', args: { roomId: '9007199254740993', cursor: 'cursor' } }]);
});

test('catalog 下载复用对象缓存并按 64KiB 有界读取', async () => {
  const reference = goldenRoot('baseline').catalog_root;
  const bytes = fixtureBytes('baseline', 'objects/00000000-0000-4000-8000-000000000105.data');
  const reads = [];
  const transport = createRecoveryTransport(async (command, args) => {
    if (command === 'download_cloud_recovery_object') {
      return { cacheHandle: 'catalog-cache' };
    }
    reads.push(args);
    return [...bytes.slice(Number(args.offset), Number(args.offset) + args.maximum)];
  });
  assert.deepEqual(await transport.downloadCatalog('local', reference), bytes);
  assert.ok(reads.every(read => read.maximum <= 65_536));
});

test('成功恢复后通过原生命令释放当前任务缓存', async () => {
  const calls = [];
  const transport = createRecoveryTransport(async (command, args) => {
    calls.push({ command, args });
  });

  await transport.release('00000000-0000-4000-8000-000000000001');

  assert.deepEqual(calls, [{
    command: 'release_cloud_recovery_job',
    args: {
      localJobId: '00000000-0000-4000-8000-000000000001',
    },
  }]);
});

