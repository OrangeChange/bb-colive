import type { CloudRecoverySelection } from './recoveryContract.ts';

export type CloudRecoveryScope = CloudRecoverySelection['scope'];

export interface CloudRecoverySelectionDraft {
  scope: CloudRecoveryScope;
  sessionIds: string[];
  startedAt: string;
  endedAt: string;
  includeDanmaku: boolean;
  includeInteractions: boolean;
}

export function createCloudRecoverySelectionDraft(): CloudRecoverySelectionDraft {
  return {
    scope: 'all',
    sessionIds: [],
    startedAt: '',
    endedAt: '',
    includeDanmaku: true,
    includeInteractions: true,
  };
}

export function buildCloudRecoverySelection(draft: CloudRecoverySelectionDraft):
  { selection: CloudRecoverySelection | null; error: string | null } {
  const content = {
    include_danmaku: draft.includeDanmaku,
    include_interactions: draft.includeInteractions,
  };
  if (draft.scope === 'all') return { selection: { scope: 'all', ...content }, error: null };
  if (draft.scope === 'sessions') {
    const sessionIds = [...new Set(draft.sessionIds)];
    return sessionIds.length === 0
      ? { selection: null, error: '至少选择一场直播' }
      : { selection: { scope: 'sessions', session_ids: sessionIds, ...content }, error: null };
  }
  if (!draft.startedAt || !draft.endedAt) return { selection: null, error: '请选择完整的开始和结束时间' };
  const startedAt = new Date(draft.startedAt);
  const endedAt = new Date(draft.endedAt);
  if (!Number.isFinite(startedAt.getTime()) || !Number.isFinite(endedAt.getTime()) || startedAt >= endedAt) {
    return { selection: null, error: '结束时间必须晚于开始时间' };
  }
  return {
    selection: { scope: 'time', started_at: startedAt.toISOString(), ended_at: endedAt.toISOString(), ...content },
    error: null,
  };
}
