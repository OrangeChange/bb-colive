import test from 'node:test';
import assert from 'node:assert/strict';

const { createCloudRecoveryTaskController } = await import('../src/cloudSync/cloudRecoveryTask.ts');

const repository = {};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('未连接服务器时不启动恢复任务', async () => {
  let runs = 0;
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'unbound', binding: null }),
    execute: async () => { runs += 1; },
  });

  assert.equal(await task.start({ roomId: '24125', ownerName: '测试主播', repository }), 'binding-required');
  assert.equal(runs, 0);
  assert.equal(task.getSnapshot().status, 'idle');
});

test('同一时间只运行一个恢复任务并保留完成结果', async () => {
  let finish;
  const changed = [];
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'ready', binding: { serverId: 'server-1' } }),
    execute: async ({ onProgress }) => {
      onProgress({ phase: 'downloading', current: 2, total: 4 });
      await new Promise(resolve => { finish = resolve; });
      onProgress({ phase: 'finalizing', current: 4, total: 4 });
      return { incremental: false, pendingAssignments: 0 };
    },
  });

  assert.equal(await task.start({ roomId: '24125', ownerName: '测试主播', repository, onChanged: () => changed.push('done') }), 'started');
  await tick();
  assert.equal(task.getSnapshot().progress?.phase, 'downloading');
  assert.equal(await task.start({ roomId: '2', ownerName: '另一个主播', repository }), 'busy');
  finish();
  await tick();
  await tick();
  assert.equal(task.getSnapshot().status, 'complete');
  assert.equal(task.getSnapshot().notice, '云端记录已恢复到回看档案');
  assert.deepEqual(changed, ['done']);
});

test('暂停后的任务可以从原主播重试', async () => {
  let attempts = 0;
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'ready', binding: { serverId: 'server-1' } }),
    execute: async ({ signal }) => {
      attempts += 1;
      await new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('恢复已暂停', 'AbortError')), { once: true });
        if (attempts > 1) resolve();
      });
      return { incremental: true, pendingAssignments: 0 };
    },
  });

  assert.equal(await task.start({ roomId: '24125', ownerName: '测试主播', repository }), 'started');
  task.pause();
  await tick();
  assert.equal(task.getSnapshot().status, 'paused');
  assert.equal(await task.retry(), 'started');
  await tick();
  assert.equal(task.getSnapshot().status, 'complete');
  assert.equal(attempts, 2);
});

test('服务器连接检查期间暂停不会继续启动恢复', async () => {
  let finishBinding;
  let runs = 0;
  const task = createCloudRecoveryTaskController({
    loadBinding: () => new Promise(resolve => { finishBinding = resolve; }),
    execute: async () => { runs += 1; return { incremental: false, pendingAssignments: 0 }; },
  });

  const start = task.start({ roomId: '24125', ownerName: '测试主播', repository });
  task.pause();
  finishBinding({ status: 'ready', binding: { serverId: 'server-1' } });
  assert.equal(await start, 'started');
  await tick();
  assert.equal(runs, 0);
  assert.equal(task.getSnapshot().status, 'paused');
});

test('恢复范围不一致时可明确重新完整恢复且普通重试保留断点', async () => {
  const attempts = [];
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'ready', binding: { serverId: 'server-1' } }),
    execute: async ({ restartFromBeginning }) => {
      attempts.push(restartFromBeginning);
      if (attempts.length < 3) throw new Error('recovery_checkpoint_mismatch');
      return { incremental: false, pendingAssignments: 0 };
    },
  });
  const request = { roomId: '24125', ownerName: '测试主播', repository };

  assert.equal(await task.start(request), 'started');
  await tick();
  assert.equal(task.getSnapshot().status, 'failed');
  assert.equal(task.getSnapshot().error, '服务器返回的恢复范围与本地进度不一致');
  assert.equal(task.getSnapshot().canRestartFully, true);
  assert.equal(await task.retry(), 'started');
  await tick();
  assert.equal(await task.restartFully(), 'started');
  await tick();

  assert.deepEqual(attempts, [false, false, true]);
  assert.equal(task.getSnapshot().status, 'complete');
});

test('取消恢复会等待当前任务停止并撤销本次写入', async () => {
  const calls = [];
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'ready', binding: { serverId: 'server-1' } }),
    execute: async ({ signal, onCancelReady }) => {
      onCancelReady(async () => { calls.push('transport-cancel'); });
      await new Promise((resolve, reject) => signal.addEventListener('abort',
        () => reject(new DOMException('恢复已暂停', 'AbortError')), { once: true }));
      return { incremental: false, pendingAssignments: 0 };
    },
    rollback: async ({ serverId, roomId, recoveryRunId }) => {
      calls.push(['rollback', serverId, roomId, recoveryRunId]);
    },
  });
  const request = { roomId: '24125', ownerName: '测试主播', repository };

  assert.equal(await task.start(request), 'started');
  await tick();
  const runId = task.getSnapshot().recoveryRunId;
  await task.cancelRecovery();

  assert.deepEqual(calls, ['transport-cancel', ['rollback', 'server-1', request.roomId, runId]]);
  assert.equal(task.getSnapshot().status, 'idle');
});

test('已经完成的恢复不能被之前打开的确认框撤销', async () => {
  let rollbacks = 0;
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'ready', binding: { serverId: 'server-1' } }),
    execute: async () => ({ incremental: false, pendingAssignments: 0 }),
    rollback: async () => { rollbacks += 1; },
  });
  await task.start({ roomId: '24125', ownerName: '测试主播', repository });
  await tick();
  await task.cancelRecovery();
  assert.equal(task.getSnapshot().status, 'complete');
  assert.equal(rollbacks, 0);
});

test('更新前启动的恢复取消时给出明确提示并保留档案', async () => {
  const task = createCloudRecoveryTaskController({
    loadBinding: async () => ({ status: 'ready', binding: { serverId: 'server-1' } }),
    execute: async ({ signal }) => {
      await new Promise((resolve, reject) => signal.addEventListener('abort',
        () => reject(new DOMException('恢复已暂停', 'AbortError')), { once: true }));
      return { incremental: false, pendingAssignments: 0 };
    },
    rollback: async () => 'restart-required',
  });
  await task.start({ roomId: '24125', ownerName: '测试主播', repository });
  await tick();
  await task.cancelRecovery();
  assert.equal(task.getSnapshot().status, 'failed');
  assert.equal(task.getSnapshot().error, '这项恢复在软件更新前开始，无法自动撤销。请重新启动软件后再恢复');
});
