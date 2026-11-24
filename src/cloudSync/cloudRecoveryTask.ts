import { uiText } from "../i18n/index.ts";
import type { ArchiveRepositoryContract } from '../archive/archiveTypes.ts';
import type { CloudRecoveryRunProgress } from './cloudRecoveryRunner.ts';
import type { CloudRecoverySelection } from './recoveryContract.ts';

export type CloudRecoveryTaskStatus = 'idle' | 'starting' | 'running' | 'paused' | 'failed' | 'complete';

export interface CloudRecoveryTaskSnapshot {
  status: CloudRecoveryTaskStatus;
  roomId: string | null;
  ownerName: string | null;
  progress: CloudRecoveryRunProgress | null;
  notice: string | null;
  error: string | null;
  canRestartFully: boolean;
  recoveryRunId: string | null;
}

export interface CloudRecoveryTaskRequest {
  roomId: string;
  ownerName: string;
  repository: ArchiveRepositoryContract;
  selection?: CloudRecoverySelection;
  onChanged?: () => void;
}

export type CloudRecoveryTaskStartResult = 'started' | 'binding-required' | 'busy';

interface ReadyBinding {
  status: 'ready';
  binding: { serverId: string };
}

type BindingState = ReadyBinding | { status: 'unbound' | 'credential-required'; binding: unknown };

interface ExecuteResult {
  incremental: boolean;
  pendingAssignments: number;
}

interface CloudRecoveryTaskDependencies {
  loadBinding: () => Promise<BindingState>;
  execute: (input: CloudRecoveryTaskRequest & {
    serverId: string;
    signal: AbortSignal;
    restartFromBeginning: boolean;
    recoveryRunId: string;
    onProgress: (progress: CloudRecoveryRunProgress) => void;
    onCancelReady: (cancel: () => Promise<void>) => void;
  }) => Promise<ExecuteResult>;
  rollback?: (input: CloudRecoveryTaskRequest & { serverId: string; recoveryRunId: string }) => Promise<'cancelled' | 'restart-required'>;
  release?: (recoveryRunId: string) => void;
}

const INITIAL_SNAPSHOT: CloudRecoveryTaskSnapshot = {
  status: 'idle', roomId: null, ownerName: null, progress: null, notice: null, error: null, canRestartFully: false,
  recoveryRunId: null,
};

const recoveryErrorMessage = (error: unknown): string => {
  const code = error instanceof Error ? error.message : String(error);
  if (code.includes('credential') || code.includes('unauthorized')) return uiText("cloudRecoveryTask.recoveryErrorMessage");
  if (code.includes('incompatible')) return uiText("cloudRecoveryTask.recoveryErrorMessage2");
  if (code.includes('recovery_checkpoint_mismatch')) return uiText("cloudRecoveryTask.recoveryErrorMessage3");
  if (code.includes('fetch') || code.includes('network')) return uiText("cloudRecoveryTask.recoveryErrorMessage4");
  return code || uiText("cloudRecoveryTask.recoveryErrorMessage5");
};

export function createCloudRecoveryTaskController(dependencies: CloudRecoveryTaskDependencies) {
  let snapshot = INITIAL_SNAPSHOT;
  let activeRequest: CloudRecoveryTaskRequest | null = null;
  let controller: AbortController | null = null;
  let cancel: (() => Promise<void>) | null = null;
  let activeServerId: string | null = null;
  let activeRun: Promise<void> | null = null;
  const listeners = new Set<() => void>();

  const publish = (patch: Partial<CloudRecoveryTaskSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach(listener => listener());
  };

  const perform = async (request: CloudRecoveryTaskRequest, serverId: string, signal: AbortSignal,
    restartFromBeginning: boolean, recoveryRunId: string) => {
    try {
      publish({ status: 'running', canRestartFully: false });
      const result = await dependencies.execute({ ...request, serverId, signal,
        restartFromBeginning, recoveryRunId, onProgress: progress => publish({ progress }), onCancelReady: value => { cancel = value; } });
      const notice = result.pendingAssignments > 0
        ? uiText("cloudRecoveryTask.createCloudRecoveryTaskController.perform.notice", { pendingAssignments: result.pendingAssignments })
        : result.incremental ? uiText("cloudRecoveryTask.createCloudRecoveryTaskController.perform.notice2") : uiText("cloudRecoveryTask.createCloudRecoveryTaskController.perform.notice3");
      publish({ status: 'complete', notice, error: null, canRestartFully: false });
      dependencies.release?.(recoveryRunId);
      request.onChanged?.();
    } catch (error) {
      if (signal.aborted || error instanceof DOMException && error.name === 'AbortError') {
        publish({ status: 'paused', notice: uiText("cloudRecoveryTask.createCloudRecoveryTaskController.perform.notice4"), error: null, canRestartFully: false });
      } else {
        const code = error instanceof Error ? error.message : String(error);
        publish({ status: 'failed', error: recoveryErrorMessage(error), notice: null,
          canRestartFully: code.includes('recovery_checkpoint_mismatch') });
      }
    } finally {
      controller = null;
      cancel = null;
    }
  };

  const startRequest = async (request: CloudRecoveryTaskRequest,
    restartFromBeginning: boolean, recoveryRunId: string): Promise<CloudRecoveryTaskStartResult> => {
    if (snapshot.status === 'starting' || snapshot.status === 'running') return 'busy';
    activeRequest = request;
    publish({ status: 'starting', roomId: request.roomId, ownerName: request.ownerName,
      progress: { phase: 'preparing', current: 0, total: 1 }, notice: null, error: null, canRestartFully: false,
      recoveryRunId });
    controller = new AbortController();
    try {
      const binding = await dependencies.loadBinding();
      if (binding.status !== 'ready') {
        controller = null;
        publish(INITIAL_SNAPSHOT);
        return 'binding-required';
      }
      activeServerId = binding.binding.serverId;
      if (controller.signal.aborted) {
        controller = null;
        publish({ status: 'paused', notice: uiText("cloudRecoveryTask.createCloudRecoveryTaskController.startRequest.notice"), error: null });
        return 'started';
      }
      activeRun = perform(request, binding.binding.serverId, controller.signal, restartFromBeginning, recoveryRunId);
      void activeRun.finally(() => { activeRun = null; });
      return 'started';
    } catch (error) {
      publish({ status: 'failed', error: recoveryErrorMessage(error), notice: null, canRestartFully: false });
      return 'started';
    }
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    start: (request: CloudRecoveryTaskRequest) => startRequest(request, false, crypto.randomUUID()),
    pause: () => { controller?.abort(); void cancel?.().catch(() => undefined); },
    retry: () => activeRequest && snapshot.recoveryRunId ? startRequest(activeRequest, false, snapshot.recoveryRunId) : Promise.resolve<CloudRecoveryTaskStartResult>('binding-required'),
    restartFully: () => activeRequest && snapshot.recoveryRunId ? startRequest(activeRequest, true, snapshot.recoveryRunId) : Promise.resolve<CloudRecoveryTaskStartResult>('binding-required'),
    cancelRecovery: async () => {
      if (snapshot.status === 'complete' || snapshot.status === 'idle') return;
      const request = activeRequest, serverId = activeServerId, recoveryRunId = snapshot.recoveryRunId;
      if (!request || !recoveryRunId) return;
      controller?.abort();
      await cancel?.().catch(() => undefined);
      await activeRun?.catch(() => undefined);
      const result = serverId ? await dependencies.rollback?.({ ...request, serverId, recoveryRunId }) : 'cancelled';
      if (result === 'restart-required') {
        publish({ status: 'failed', notice: null,
          error: uiText("cloudRecoveryTask.createCloudRecoveryTaskController.cancelRecovery.error") });
        return;
      }
      dependencies.release?.(recoveryRunId);
      activeRequest = null;
      activeServerId = null;
      publish(INITIAL_SNAPSHOT);
    },
    dismiss: () => {
      if (snapshot.status !== 'starting' && snapshot.status !== 'running') publish(INITIAL_SNAPSHOT);
    },
  };
}

export type CloudRecoveryTaskController = ReturnType<typeof createCloudRecoveryTaskController>;
