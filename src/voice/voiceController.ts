import { uiText } from "../i18n/index.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { MsgType } from "../protocol/types.ts";
import { useVoiceSettings } from "./voiceSettings.ts";
import { renderVoiceEventTemplate } from "./voiceTemplates.ts";
import { isVoiceEventEligible, getVoiceCategory } from "./voiceProjection.ts";
import {
  clearVoiceQueue,
  enqueueVoiceEntry,
  expireVoiceEntries,
  failVoiceQueue,
  takeNextVoiceEntry,
  type VoiceQueueState,
  type VoiceQueuePolicy,
} from "./voiceQueue.ts";
import type { VoiceProvider } from "./voiceProvider.ts";
import type { VoiceQueueEntry, VoiceRuntimeSnapshot, VoiceSettings } from "./voiceTypes.ts";
import type { AudioOutputTarget } from "./audioOutput.ts";
import { PlaybackSession, type PlaybackControl } from "./playbackSession.ts";
import { isPaidEventVisibleAtThreshold } from "../giftThreshold.ts";
import type { VoiceGiftThreshold } from "./giftThresholdRuntime.ts";
import { recordPlaybackStage, recordTtsStage } from "./ttsDiagnostics.ts";

export interface VoiceAudioOutput {
  listDevices(): Promise<unknown[]>;
  play(bytes: Uint8Array, target: AudioOutputTarget, playbackGain: number): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  skip(): Promise<void>;
  stop(): Promise<void>;
}

export interface VoiceControllerDependencies {
  provider: VoiceProvider;
  getProvider?: () => VoiceProvider;
  audioOutput: VoiceAudioOutput;
  getSettings?: () => VoiceSettings;
  getOnlyGuardEntry?: () => boolean;
  getGiftThreshold?: () => VoiceGiftThreshold;
  now?: () => number;
  wait?: (milliseconds: number) => Promise<void>;
  beforePlayback?: (event: DanmakuEvent, session: PlaybackSession) => Promise<void>;
  onPlaybackControl?: (control: PlaybackControl) => void;
  onDiscardedEvent?: (event: DanmakuEvent) => void;
}

// Shared phases: filter, enqueue, evict, synthesis-start, synthesis-success, synthesis-failure, decode, play-start, play-complete, cancel.

export interface VoiceController {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  skip(): void;
  clear(): void;
  reset(): void;
  shutdown(): void;
  test(text?: string): Promise<void>;
  /** 从事件菜单手动播报一条事件；这是显式操作，不受自动播报开关/筛选拦截。 */
  speakEvent(event: DanmakuEvent): boolean;
  acceptCommittedEvent(event: DanmakuEvent & { committed?: boolean }): boolean;
  revalidateGiftThreshold(): void;
  getSnapshot(): VoiceRuntimeSnapshot;
  subscribe(listener: (snapshot: VoiceRuntimeSnapshot) => void): () => void;
}

function getPolicy(settings: VoiceSettings): VoiceQueuePolicy {
  return {
    mode: settings.queueMode,
    queueLimit: settings.queueLimit,
    overflowPolicy: settings.overflowPolicy,
    expiryEnabled: settings.expiryEnabled,
    expirySeconds: settings.expirySeconds,
  };
}

function getOutputTarget(settings: VoiceSettings): AudioOutputTarget {
  return {
    scope: settings.outputScope,
    monitorDeviceId: settings.monitorDeviceId,
    streamDeviceId: settings.streamDeviceId,
  };
}

function getSynthesisVoice(settings: VoiceSettings): string {
  switch (settings.engine) {
    case "windows-system":
      return settings.engineVoices["windows-system"];
    case "fish-audio":
      return settings.fishAudio.referenceId;
    case "custom-http":
      return settings.customHttp.voiceValues[settings.customHttp.preset];
    default:
      return settings.engineVoices["edge-online"];
  }
}

export function createVoiceController(dependencies: VoiceControllerDependencies): VoiceController {
  const getSettings = dependencies.getSettings ?? (() => useVoiceSettings.getState());
  const getOnlyGuardEntry = dependencies.getOnlyGuardEntry ?? (() => false);
  const getGiftThreshold = dependencies.getGiftThreshold ?? (() => ({ threshold: 0, mode: "unit" as const }));
  const now = dependencies.now ?? (() => Date.now());
  const listeners = new Set<(snapshot: VoiceRuntimeSnapshot) => void>();
  let queue: VoiceQueueState = {
    pending: [],
    current: null,
    paused: false,
    accepting: true,
    discardedCount: 0,
    failedCount: 0,
    error: null,
  };
  let pumping = false;
  let cancellationPromise: Promise<void> | null = null;
  let playbackToken = 0;
  let session: PlaybackSession | null = null;
  let playbackStarted = false;
  let synthesisRequestSequence = 0;
  let activeSynthesisRequestId: string | null = null;
  let activeSynthesisProvider: VoiceProvider | null = null;

  const nextSynthesisRequestId = () => `voice-${Date.now().toString(36)}-${++synthesisRequestSequence}`;

  const buildSnapshot = (): VoiceRuntimeSnapshot => ({
    status: queue.error ? "error" : queue.paused ? "paused" : queue.current ? "playing" : "idle",
    accepting: queue.accepting,
    current: queue.current,
    pending: [...queue.pending],
    pendingCount: queue.pending.length,
    discardedCount: queue.discardedCount,
    failedCount: queue.failedCount,
    error: queue.error,
  });
  let snapshot = buildSnapshot();

  const getSnapshot = (): VoiceRuntimeSnapshot => snapshot;

  const recordFilter = (event: DanmakuEvent, result: "accepted" | "filtered", reason?: string) =>
    recordPlaybackStage({ channel: "tts", eventId: event.reactKey ?? event.id, action: "filter", outcome: result === "accepted" ? "success" : "failure", data: { result, ...(reason ? { reason } : {}) } });

  const notify = () => {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  };

  const requestProviderCancellation = (
    requestId?: string | null,
    provider: VoiceProvider | null = activeSynthesisProvider,
  ) => {
    const previous = cancellationPromise ?? Promise.resolve();
    const targetProvider = provider ?? dependencies.provider;
    const next = previous.then(() => targetProvider.cancel(requestId ?? undefined)).catch(() => {});
    cancellationPromise = next;
    void next.then(() => {
      if (cancellationPromise !== next) return;
      cancellationPromise = null;
      void pump();
    });
  };

  const stopAudio = (
    requestId?: string | null,
    provider: VoiceProvider | null = activeSynthesisProvider,
  ) => {
    requestProviderCancellation(requestId ?? activeSynthesisRequestId, provider);
    void dependencies.audioOutput.stop().catch(() => {});
  };

  const resetRuntime = (accepting: boolean) => {
    session?.control("stop");
    session = null;
    playbackToken += 1;
    pumping = false;
    playbackStarted = false;
    const requestId = activeSynthesisRequestId;
    const provider = activeSynthesisProvider;
    activeSynthesisRequestId = null;
    activeSynthesisProvider = null;
    stopAudio(requestId, provider);
    queue = { ...clearVoiceQueue(queue), accepting, paused: false };
    notify();
  };

  const pump = async (): Promise<void> => {
    if (pumping || cancellationPromise || queue.paused || !queue.accepting) return;
    const expired = expireVoiceEntries(queue, getPolicy(getSettings()), now());
    queue = expired.state;
    for (const entry of expired.discardedEntries ?? []) {
      recordTtsStage({ provider: "controller", stage: "cancelled", phase: "evict", outcome: "cancelled", eventId: entry.event.reactKey ?? entry.event.id, queueDepth: queue.pending.length });
      dependencies.onDiscardedEvent?.(entry.event);
    }
    if (expired.removedCount) notify();
    const next = takeNextVoiceEntry(queue, now());
    if (!next.entry) {
      queue = next.state;
      notify();
      return;
    }
    const selectedEntry = next.entry;
    queue = next.state;
    recordTtsStage({ provider: "controller", stage: "validate", phase: "dequeue", outcome: "success", eventId: selectedEntry.event.reactKey ?? selectedEntry.event.id, queueDepth: queue.pending.length });
    notify();
    pumping = true;
    playbackStarted = false;
    const token = ++playbackToken;
    const currentSession = new PlaybackSession(now, dependencies.wait);
    session = currentSession;
    const fail = (error: unknown) => {
      if (token !== playbackToken || currentSession.cancelled) return;
      recordTtsStage({ provider: "controller", stage: "provider", phase: "synthesis-failure", outcome: "failure", requestId: activeSynthesisRequestId ?? undefined, eventId: selectedEntry.event.reactKey ?? selectedEntry.event.id, queueDepth: queue.pending.length, error });
      currentSession.control("stop");
      pumping = false;
      queue = failVoiceQueue(queue, error);
      stopAudio();
      notify();
    };
    try {
      const settings = getSettings();
      const provider = dependencies.getProvider?.() ?? dependencies.provider;
      const requestId = nextSynthesisRequestId();
      activeSynthesisRequestId = requestId;
      activeSynthesisProvider = provider;
      const synthesis = provider.synthesize({
        text: next.entry.text,
        voice: getSynthesisVoice(settings),
        rate: settings.speechRate,
        pitch: settings.pitch,
        volume: settings.volume,
        requestId,
        eventId: next.entry.event.reactKey ?? next.entry.event.id,
      }).then((audio) => audio, (error) => {
        // 立即观察拒绝；前置提示音仍在等待时也要更新失败状态。
        fail(error);
        return null;
      }).finally(() => {
        if (activeSynthesisRequestId === requestId) {
          activeSynthesisRequestId = null;
          activeSynthesisProvider = null;
        }
      });
      recordTtsStage({ provider: settings.engine, stage: "request", phase: "synthesis-start", outcome: "success", requestId, eventId: next.entry.event.reactKey ?? next.entry.event.id, queueDepth: queue.pending.length });
      if (dependencies.beforePlayback && !next.entry.skipBeforePlayback) {
        try {
          await currentSession.run(dependencies.beforePlayback(next.entry.event, currentSession));
        } catch {
          // 提示音失败不应取消已开始的 TTS 合成。
        }
      }
      const audio = await synthesis;
      if (!audio || token !== playbackToken || !await currentSession.ready()) return;
      playbackStarted = true;
      recordTtsStage({ provider: settings.engine, stage: "response", phase: "synthesis-success", outcome: "success", requestId, eventId: next.entry.event.reactKey ?? next.entry.event.id, queueDepth: queue.pending.length, audioBytes: audio.byteLength });
      recordTtsStage({ provider: settings.engine, stage: "decode", phase: "decode", outcome: "success", requestId, eventId: next.entry.event.reactKey ?? next.entry.event.id, audioBytes: audio.byteLength });
      recordPlaybackStage({ channel: "tts", eventId: next.entry.event.reactKey ?? next.entry.event.id, requestId, action: "play-start", outcome: "success" });
      await currentSession.run(dependencies.audioOutput.play(audio, getOutputTarget(settings), settings.playbackGain));
      if (token !== playbackToken || currentSession.cancelled) return;
      queue = { ...queue, current: null };
      playbackStarted = false;
      currentSession.complete();
      recordPlaybackStage({ channel: "tts", eventId: next.entry.event.reactKey ?? next.entry.event.id, requestId, action: "play-complete", outcome: "success" });
      notify();
      const intervalMs = Math.max(0, getSettings().eventIntervalSeconds * 1000);
      if (intervalMs > 0 && queue.pending.length > 0) {
        if (!await currentSession.wait(intervalMs) || token !== playbackToken) return;
      }
      pumping = false;
      void pump();
    } catch (error) {
      playbackStarted = false;
      fail(error);
    }
  };

  const updatePendingOrCurrent = (entry: VoiceQueueEntry): boolean => {
    const sameId = (candidate: VoiceQueueEntry) => candidate.id === entry.id;
    const pendingIndex = queue.pending.findIndex(sameId);
    if (pendingIndex >= 0) {
      const pending = [...queue.pending];
      pending[pendingIndex] = entry;
      queue = { ...queue, pending, error: null };
      notify();
      return true;
    }
    if (queue.current && sameId(queue.current)) {
      queue = { ...queue, current: entry, error: null };
      notify();
      return true;
    }
    return false;
  };

  return {
    start: () => {
      session?.control("resume");
      queue = { ...queue, accepting: true, paused: false, error: null };
      notify();
      void pump();
    },
    stop: () => {
      dependencies.onPlaybackControl?.("stop");
      resetRuntime(false);
    },
    pause: () => {
      if (queue.paused) return;
      queue = { ...queue, paused: true };
      dependencies.onPlaybackControl?.("pause");
      session?.control("pause");
      void dependencies.audioOutput.pause().then(() => recordPlaybackStage({ channel: "tts", action: "pause", outcome: "success" })).catch(() => recordPlaybackStage({ channel: "tts", action: "pause", outcome: "failure" }));
      notify();
    },
    resume: () => {
      if (!queue.paused) return;
      queue = { ...queue, paused: false };
      dependencies.onPlaybackControl?.("resume");
      session?.control("resume");
      void dependencies.audioOutput.resume().then(() => recordPlaybackStage({ channel: "tts", action: "resume", outcome: "success" })).catch(() => recordPlaybackStage({ channel: "tts", action: "resume", outcome: "failure" }));
      notify();
      void pump();
    },
    skip: () => {
      const skippedEntry = queue.current;
      if (!skippedEntry) {
        dependencies.onPlaybackControl?.("skip");
        recordPlaybackStage({ channel: "tts", action: "skip", outcome: "cancelled" });
        return;
      }
      dependencies.onPlaybackControl?.("skip");
      recordPlaybackStage({ channel: "tts", eventId: skippedEntry?.event.reactKey ?? skippedEntry?.event.id, requestId: activeSynthesisRequestId ?? undefined, action: "cancel", outcome: "cancelled" });
      session?.control("skip");
      session = null;
      const requestId = activeSynthesisRequestId;
      const provider = activeSynthesisProvider;
      activeSynthesisRequestId = null;
      activeSynthesisProvider = null;
      requestProviderCancellation(requestId, provider);
      playbackToken += 1;
      pumping = false;
      playbackStarted = false;
      queue = { ...queue, current: null, discardedCount: queue.discardedCount + 1 };
      void dependencies.audioOutput.skip().catch(() => {});
      notify();
      void pump();
    },
    clear: () => {
      queue = { ...queue, pending: [], error: null };
      notify();
    },
    reset: () => resetRuntime(true),
    shutdown: () => resetRuntime(false),
    test: async (text = uiText("voiceController.createVoiceController.test")) => {
      const settings = getSettings();
      const provider = dependencies.getProvider?.() ?? dependencies.provider;
      const audio = await provider.synthesize({
        text,
        voice: getSynthesisVoice(settings),
        rate: settings.speechRate,
        pitch: settings.pitch,
        volume: settings.volume,
        requestId: nextSynthesisRequestId(),
      });
      await dependencies.audioOutput.play(audio, getOutputTarget(settings), settings.playbackGain);
    },
    acceptCommittedEvent: (event) => {
      if (event.committed === false || !queue.accepting) { recordFilter(event, "filtered", "not-committed-or-not-accepting"); return false; }
      const settings = getSettings();
      if (!settings.enabled) { recordFilter(event, "filtered", "disabled"); return false; }
      const category = getVoiceCategory(event);
      if (!category || !isVoiceEventEligible(event, settings, getOnlyGuardEntry())) { recordFilter(event, "filtered", "ineligible"); return false; }
      const threshold = getGiftThreshold();
      if (!isPaidEventVisibleAtThreshold(event, threshold.threshold, threshold.mode)) { recordFilter(event, "filtered", "threshold"); return false; }
      const rendered = renderVoiceEventTemplate(event, settings);
      if (!rendered.text) { recordFilter(event, "filtered", "empty-text"); return false; }
      const entry: VoiceQueueEntry = {
        id: event.reactKey ?? event.id,
        event,
        text: rendered.text,
        enqueuedAt: now(),
        priority: settings.priorities[category],
      };
      if (event.msgType === MsgType.Gift && updatePendingOrCurrent(entry)) return true;
      const mutation = enqueueVoiceEntry(queue, entry, getPolicy(settings), now());
      queue = mutation.state;
      for (const discarded of mutation.discardedEntries ?? []) dependencies.onDiscardedEvent?.(discarded.event);
      notify();
      void pump();
      const accepted = mutation.accepted === true;
      recordFilter(event, accepted ? "accepted" : "filtered", accepted ? undefined : "queue-rejected");
      if (accepted) recordTtsStage({ provider: "controller", stage: "validate", phase: "enqueue", outcome: "success", eventId: entry.id, queueDepth: queue.pending.length });
      return accepted;
    },
    speakEvent: (event) => {
      const settings = getSettings();
      const rendered = renderVoiceEventTemplate(event, settings);
      if (!rendered.text) return false;
      const category = getVoiceCategory(event) ?? "system";
      const entry: VoiceQueueEntry = {
        id: `manual-${nextSynthesisRequestId()}`,
        event,
        text: rendered.text,
        enqueuedAt: now(),
        priority: settings.priorities[category] ?? "normal",
        skipBeforePlayback: true,
      };
      // 手动点选代表明确的播放意图，即使自动播报当前暂停/关闭，也允许这条进入同一正式队列。
      queue = { ...queue, accepting: true, error: null };
      const mutation = enqueueVoiceEntry(queue, entry, getPolicy(settings), now());
      queue = mutation.state;
      for (const discarded of mutation.discardedEntries ?? []) dependencies.onDiscardedEvent?.(discarded.event);
      notify();
      void pump();
      return mutation.accepted === true;
    },
    revalidateGiftThreshold: () => {
      const threshold = getGiftThreshold();
      const isRejectedGift = (entry: VoiceQueueEntry) => !isPaidEventVisibleAtThreshold(entry.event, threshold.threshold, threshold.mode);
      const removedPending = queue.pending.filter(isRejectedGift);
      const pending = queue.pending.filter((entry) => !isRejectedGift(entry));
      let removedCurrent = 0;

      if (queue.current && !playbackStarted && isRejectedGift(queue.current)) {
        session?.control("skip");
        session = null;
        playbackToken += 1;
        pumping = false;
        playbackStarted = false;
        removedCurrent = 1;
        requestProviderCancellation();
      }

      if (removedPending.length === 0 && removedCurrent === 0) return;
      queue = {
        ...queue,
        pending,
        current: removedCurrent ? null : queue.current,
        discardedCount: queue.discardedCount + removedPending.length + removedCurrent,
      };
      notify();
      void pump();
    },
    getSnapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(getSnapshot());
      return () => listeners.delete(listener);
    },
  };
}
