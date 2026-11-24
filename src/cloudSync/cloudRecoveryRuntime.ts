import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics.ts';
import { createCloudRecoveryBindingClient } from './cloudRecoveryBinding.ts';
import { createCloudRecoveryState, recoveryStartState, runCloudRecovery, type CloudRecoveryRunState } from './cloudRecoveryRunner.ts';
import { createCloudRecoveryTaskController } from './cloudRecoveryTask.ts';

export const cloudRecoveryBindingClient = createCloudRecoveryBindingClient();

const storageKey = (serverId: string, roomId: string) => `bb-colive.cloud-recovery.${serverId}.${roomId}`;
const recoveryRuns = new Map<string, Set<string>>();

const readCheckpoint = (serverId: string, roomId: string): CloudRecoveryRunState => {
  try {
    return JSON.parse(localStorage.getItem(storageKey(serverId, roomId)) ?? 'null')
      ?? createCloudRecoveryState(serverId, roomId);
  } catch {
    return createCloudRecoveryState(serverId, roomId);
  }
};

export const cloudRecoveryTask = createCloudRecoveryTaskController({
  loadBinding: async () => {
    try { return await cloudRecoveryBindingClient.load(); }
    catch (error) {
      recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'failure', action: 'binding-load', outcome: 'failed' });
      throw error;
    }
  },
  execute: async ({ roomId, repository, serverId, signal, restartFromBeginning, recoveryRunId, onProgress, onCancelReady, selection }) => {
    const key = storageKey(serverId, roomId);
    const selective = Boolean(selection && selection.scope !== 'all');
    let previous = selective
      ? createCloudRecoveryState(serverId, roomId)
      : recoveryStartState(readCheckpoint(serverId, roomId), restartFromBeginning, serverId, roomId);
    if (restartFromBeginning && !selective) localStorage.setItem(key, JSON.stringify(previous));
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'request', action: 'restore', outcome: 'started',
      data: { incremental: !selective && Boolean(previous.cutId) } });
    let cancel: (() => Promise<void>) | null = null;
    const createdSessionIds = recoveryRuns.get(recoveryRunId) ?? new Set<string>();
    recoveryRuns.set(recoveryRunId, createdSessionIds);
    const execute = (state: CloudRecoveryRunState) => runCloudRecovery({ roomId, repository, previous: state, signal, selection,
      recoveryRunId, onSessionCreated: sessionId => createdSessionIds.add(sessionId),
      onProgress, onJobStarted: value => { cancel = value; onCancelReady(value); },
      save: value => { if (!selective) localStorage.setItem(key, JSON.stringify(value)); } });
    const executeWithCleanup = async (state: CloudRecoveryRunState) => {
      try { return await execute(state); }
      catch (error) { await cancel?.().catch(() => undefined); throw error; }
    };
    let next: CloudRecoveryRunState;
    try {
      next = await executeWithCleanup(previous);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!selective && previous.cutId && detail.includes('invalid_root')) {
        recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'failure', action: 'restore', outcome: 'failed' });
        throw new Error('recovery_checkpoint_mismatch');
      }
      if (selective || !previous.cutId || !detail.includes('delta_base_expired')) {
        recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'failure', action: 'restore', outcome: 'failed' });
        throw error;
      }
      previous = createCloudRecoveryState(serverId, roomId);
      localStorage.setItem(key, JSON.stringify(previous));
      try { next = await executeWithCleanup(previous); }
      catch (fallbackError) {
        recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'failure', action: 'restore', outcome: 'failed' });
        throw fallbackError;
      }
    }
    if (!selective) localStorage.setItem(key, JSON.stringify(next));
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'success', action: 'restore',
      outcome: !selective && previous.cutId ? 'incremental-complete' : 'baseline-complete' });
    return { incremental: !selective && Boolean(previous.cutId), pendingAssignments: next.pendingAssignments };
  },
  rollback: async ({ roomId, repository, serverId, recoveryRunId }) => {
    if (!recoveryRuns.has(recoveryRunId)) return 'restart-required' as const;
    const sourceId = `cloud-recovery-run:${recoveryRunId}`;
    await repository.rollbackCloudRecoveryRun(sourceId, [...(recoveryRuns.get(recoveryRunId) ?? [])]);
    recoveryRuns.delete(recoveryRunId);
    localStorage.removeItem(storageKey(serverId, roomId));
    return 'cancelled' as const;
  },
  release: recoveryRunId => { recoveryRuns.delete(recoveryRunId); },
});
