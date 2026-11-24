import type {
  VoiceOverflowPolicy,
  VoicePriority,
  VoiceQueueEntry,
  VoiceQueueMode,
} from "./voiceTypes.ts";

export interface VoiceQueuePolicy {
  mode: VoiceQueueMode;
  queueLimit: number;
  overflowPolicy: VoiceOverflowPolicy;
  expiryEnabled: boolean;
  expirySeconds: number;
}

export interface VoiceQueueState {
  pending: VoiceQueueEntry[];
  current: VoiceQueueEntry | null;
  paused: boolean;
  accepting: boolean;
  discardedCount: number;
  failedCount: number;
  error: string | null;
}

export interface QueueMutation {
  state: VoiceQueueState;
  accepted?: boolean;
  entry?: VoiceQueueEntry;
  removedCount?: number;
  discardedEntries?: VoiceQueueEntry[];
}

const PRIORITY_RANK: Record<VoicePriority, number> = {
  high: 0,
  medium: 1,
  normal: 2,
};

export function createInitialVoiceQueue(): VoiceQueueState {
  return {
    pending: [],
    current: null,
    paused: false,
    accepting: true,
    discardedCount: 0,
    failedCount: 0,
    error: null,
  };
}

function getQueueLimit(policy: VoiceQueuePolicy): number {
  return Math.max(1, Math.min(500, Math.floor(policy.queueLimit)));
}

function insertByPriority(pending: VoiceQueueEntry[], entry: VoiceQueueEntry): VoiceQueueEntry[] {
  const rank = PRIORITY_RANK[entry.priority];
  const insertAt = pending.findIndex((item) => PRIORITY_RANK[item.priority] > rank);
  if (insertAt < 0) return [...pending, entry];
  return [...pending.slice(0, insertAt), entry, ...pending.slice(insertAt)];
}

export function enqueueVoiceEntry(
  state: VoiceQueueState,
  entry: VoiceQueueEntry,
  policy: VoiceQueuePolicy,
  _now: number,
): QueueMutation {
  if (!state.accepting) return { state, accepted: false };

  const pending = policy.mode === "priority"
    ? insertByPriority(state.pending, entry)
    : [...state.pending, entry];
  const limit = getQueueLimit(policy);
  if (pending.length <= limit) {
    return { state: { ...state, pending, error: null }, accepted: true };
  }

  if (policy.overflowPolicy === "drop-newest") {
    return {
      state: { ...state, discardedCount: state.discardedCount + 1 },
      accepted: false,
    };
  }

  const removeIndex = policy.overflowPolicy === "drop-normal-first"
    ? pending.findIndex((item) => item.priority === "normal")
    : 0;
  const effectiveRemoveIndex = removeIndex < 0 ? 0 : removeIndex;
  const nextPending = pending.filter((_, index) => index !== effectiveRemoveIndex);
  return {
    state: {
      ...state,
      pending: nextPending,
      discardedCount: state.discardedCount + 1,
      error: null,
    },
    accepted: true,
    discardedEntries: [pending[effectiveRemoveIndex]],
  };
}

export function takeNextVoiceEntry(state: VoiceQueueState, now: number): QueueMutation {
  void now;
  if (state.paused || state.current || state.pending.length === 0) return { state };
  const [entry, ...pending] = state.pending;
  return { state: { ...state, current: entry, pending, error: null }, entry };
}

export function expireVoiceEntries(
  state: VoiceQueueState,
  policy: VoiceQueuePolicy,
  now: number,
): QueueMutation {
  if (!policy.expiryEnabled || state.pending.length === 0) return { state, removedCount: 0 };
  const expiryMs = Math.max(0, policy.expirySeconds * 1000);
  const pending = state.pending.filter((entry) => now - entry.enqueuedAt < expiryMs);
  const removedCount = state.pending.length - pending.length;
  return removedCount === 0
    ? { state, removedCount: 0 }
    : {
      state: { ...state, pending, discardedCount: state.discardedCount + removedCount },
      removedCount,
      discardedEntries: state.pending.filter((entry) => now - entry.enqueuedAt >= expiryMs),
    };
}

export function clearVoiceQueue(state: VoiceQueueState): VoiceQueueState {
  return { ...state, pending: [], current: null, error: null };
}

export function failVoiceQueue(state: VoiceQueueState, error: unknown): VoiceQueueState {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ...state,
    pending: [],
    current: null,
    paused: false,
    accepting: false,
    failedCount: state.failedCount + 1,
    error: message,
  };
}
