import type { DanmakuEvent } from "../protocol/types.ts";
import type { AudioOutputTarget } from "./audioOutput.ts";
import { getPersonalBroadcastRuleKey } from "./personalBroadcastProjection.ts";
import type { PersonalBroadcastRuleKey } from "./personalBroadcastTypes.ts";
import type { VoiceSettings } from "./voiceTypes.ts";
import { PlaybackSession, type PlaybackControl, type PlaybackWait } from "./playbackSession.ts";
import { isPaidEventVisibleAtThreshold } from "../giftThreshold.ts";
import type { VoiceGiftThreshold } from "./giftThresholdRuntime.ts";
import { recordPlaybackStage } from "./ttsDiagnostics.ts";

const PERSONAL_QUEUE_LIMIT = 16;

export interface PersonalBroadcastAudioOutput {
  prepareLocalFile(path: string): Promise<Uint8Array>;
  playLocalFile(path: string, target: AudioOutputTarget, playbackGain: number, preparedAudio?: Uint8Array): Promise<void>;
  playPreviewLocalFile?(path: string, target: AudioOutputTarget, playbackGain: number, preparedAudio?: Uint8Array): Promise<void>;
  pausePersonal(): Promise<void>;
  resumePersonal(): Promise<void>;
  skipPersonal(): Promise<void>;
  skipPersonalPreview?(): Promise<void>;
  stopPersonal(): Promise<void>;
}

export interface PersonalBroadcastControllerDependencies {
  audioOutput: PersonalBroadcastAudioOutput;
  getSettings: () => Pick<VoiceSettings, "personalBroadcast" | "outputScope" | "monitorDeviceId" | "streamDeviceId" | "playbackGain">;
  getOnlyGuardEntry?: () => boolean;
  getGiftThreshold?: () => VoiceGiftThreshold;
  now?: () => number;
  wait?: PlaybackWait;
}

interface PersonalBroadcastEntry {
  id: string;
  key: PersonalBroadcastRuleKey;
  event?: DanmakuEvent;
  path: string;
}

interface PersonalTask {
  entry: PersonalBroadcastEntry | null;
  session: PlaybackSession;
  ttsSession?: PlaybackSession;
  beforeTts: boolean;
  preview: boolean;
  playbackStarted: boolean;
  ready: (error?: unknown) => void;
  unlink: () => void;
}

export interface PersonalBroadcastRuntimeSnapshot {
  status: "idle" | "playing" | "paused" | "error";
  accepting: boolean;
  current: PersonalBroadcastEntry | null;
  pendingCount: number;
  discardedCount: number;
  failedCount: number;
  failedRuleKey: PersonalBroadcastRuleKey | null;
  error: string | null;
}

export interface PersonalBroadcastController {
  acceptCommittedEvent(event: DanmakuEvent & { committed?: boolean }): boolean;
  acceptStandaloneEvent(event: DanmakuEvent & { committed?: boolean }): boolean;
  playBeforeTts(event: DanmakuEvent, session?: PlaybackSession): Promise<void>;
  testRule(key: PersonalBroadcastRuleKey): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  skip(): void;
  clear(): void;
  clearError(): void;
  revalidateGiftThreshold(): void;
  reset(): void;
  shutdown(): void;
  getSnapshot(): PersonalBroadcastRuntimeSnapshot;
  subscribe(listener: (snapshot: PersonalBroadcastRuntimeSnapshot) => void): () => void;
}

function getOutputTarget(settings: ReturnType<PersonalBroadcastControllerDependencies["getSettings"]>): AudioOutputTarget {
  return { scope: settings.outputScope, monitorDeviceId: settings.monitorDeviceId, streamDeviceId: settings.streamDeviceId };
}

export function createPersonalBroadcastController(dependencies: PersonalBroadcastControllerDependencies): PersonalBroadcastController {
  const getOnlyGuardEntry = dependencies.getOnlyGuardEntry ?? (() => false);
  const getGiftThreshold = dependencies.getGiftThreshold ?? (() => ({ threshold: 0, mode: "unit" as const }));
  const now = dependencies.now ?? Date.now;
  const listeners = new Set<(snapshot: PersonalBroadcastRuntimeSnapshot) => void>();
  let pending: PersonalTask[] = [];
  let current: PersonalTask | null = null;
  let previewCurrent: PersonalTask | null = null;
  let paused = false;
  let accepting = true;
  let discardedCount = 0;
  let failedCount = 0;
  let failedRuleKey: PersonalBroadcastRuleKey | null = null;
  let error: string | null = null;
  let lastPromptEndedAt: number | null = null;
  let operationToken = 0;
  let previewToken = 0;
  let previewStopPromise: Promise<void> = Promise.resolve();

  const buildSnapshot = (): PersonalBroadcastRuntimeSnapshot => ({
    status: error ? "error" : paused ? "paused" : current || previewCurrent ? "playing" : "idle",
    accepting, current: current?.entry ?? previewCurrent?.entry ?? null, pendingCount: pending.length,
    discardedCount, failedCount, failedRuleKey, error,
  });
  let snapshot = buildSnapshot();
  const notify = () => {
    snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  };
  const clearFailure = () => { failedRuleKey = null; error = null; };

  const matchedRule = (event: DanmakuEvent): PersonalBroadcastEntry | null => {
    const eventId = event.reactKey ?? event.id;
    const threshold = getGiftThreshold();
    if (!isPaidEventVisibleAtThreshold(event, threshold.threshold, threshold.mode)) { recordPlaybackStage({ channel: "personal", eventId, action: "filter", outcome: "failure", data: { reason: "threshold" } }); return null; }
    const settings = dependencies.getSettings().personalBroadcast;
    if (!settings.enabled) { recordPlaybackStage({ channel: "personal", eventId, action: "filter", outcome: "failure", data: { reason: "disabled" } }); return null; }
    const key = getPersonalBroadcastRuleKey(event, getOnlyGuardEntry());
    if (!key) { recordPlaybackStage({ channel: "personal", eventId, action: "filter", outcome: "failure", data: { reason: "unmatched" } }); return null; }
    const rule = settings.rules[key];
    if (!rule.enabled) { recordPlaybackStage({ channel: "personal", eventId, action: "filter", outcome: "failure", data: { reason: "rule-disabled" } }); return null; }
    if (!rule.audioPath) { recordPlaybackStage({ channel: "personal", eventId, action: "filter", outcome: "failure", data: { reason: "no-audio" } }); return null; }
    return { id: event.reactKey ?? event.id, key, event, path: rule.audioPath };
  };

  const audioControl = (control: PlaybackControl) => {
    const output = dependencies.audioOutput;
    const work = control === "pause" ? output.pausePersonal()
      : control === "resume" ? output.resumePersonal()
        : control === "skip" ? output.skipPersonal() : output.stopPersonal();
    void work.catch(() => {});
  };

  const recordPauseResume = (control: "pause" | "resume", work: Promise<void>) => {
    void work.then(
      () => recordPlaybackStage({ channel: "personal", action: control, outcome: "success" }),
      (error) => recordPlaybackStage({ channel: "personal", action: control, outcome: "failure", data: { error: error instanceof Error ? error.name : "unknown" } }),
    ).catch(() => {});
  };

  const skipPreviewAudio = () => dependencies.audioOutput.skipPersonalPreview?.() ?? dependencies.audioOutput.skipPersonal();

  const cancelTask = (task: PersonalTask, control: "skip" | "stop") => {
    task.session.control(control);
    task.ready();
    task.unlink();
  };

  const resetRuntime = (nextAccepting: boolean) => {
    operationToken += 1;
    previewToken += 1;
    if (current) cancelTask(current, "stop");
    for (const task of pending) cancelTask(task, "stop");
    if (previewCurrent) cancelTask(previewCurrent, "stop");
    current = null;
    previewCurrent = null;
    pending = [];
    paused = false;
    accepting = nextAccepting;
    clearFailure();
    lastPromptEndedAt = null;
    audioControl("stop");
    notify();
  };

  const setPaused = (value: boolean) => {
    if (paused === value) return;
    paused = value;
    const control = value ? "pause" : "resume";
    current?.session.control(control);
    previewCurrent?.session.control(control);
    for (const task of pending) task.session.control(control);
    const audioWork = value ? dependencies.audioOutput.pausePersonal() : dependencies.audioOutput.resumePersonal();
    recordPauseResume(control, audioWork);
    notify();
    if (!value) void pump();
  };

  const runTask = async (task: PersonalTask, token: number, channel: "formal" | "preview"): Promise<void> => {
    const isPreview = channel === "preview";
    const { entry, session } = task;
    const settings = dependencies.getSettings();
    clearFailure();
    notify();
    try {
      if (entry) {
        // 先读取并准备可播放数据，失效文件不进入任一种间隔等待。
        const prepared = await session.run(dependencies.audioOutput.prepareLocalFile(entry.path));
        recordPlaybackStage({ channel: "personal", eventId: entry.event?.reactKey ?? entry.event?.id, action: "prepare", outcome: prepared ? "success" : "failure" });
        if (!prepared) return;
        if (!await session.ready()) return;
        const remaining = lastPromptEndedAt === null || task.preview ? 0
          : Math.max(0, settings.personalBroadcast.promptIntervalSeconds * 1000 - (now() - lastPromptEndedAt));
        if (!await session.wait(remaining)) return;
        task.playbackStarted = true;
        recordPlaybackStage({ channel: "personal", eventId: entry.event?.reactKey ?? entry.event?.id, action: "play-start", outcome: "success" });
        const playLocalFile = isPreview
          ? dependencies.audioOutput.playPreviewLocalFile ?? dependencies.audioOutput.playLocalFile
          : dependencies.audioOutput.playLocalFile;
        if (!await session.run(playLocalFile(
          entry.path,
          getOutputTarget(settings),
          settings.playbackGain,
          prepared.value,
        ))) return;
        if (session.cancelled) return;
        if (!isPreview) lastPromptEndedAt = now();
        if (task.beforeTts && !await session.wait(settings.personalBroadcast.promptToTtsIntervalSeconds * 1000)) return;
      }
    } catch (cause) {
      recordPlaybackStage({ channel: "personal", eventId: entry?.event?.reactKey ?? entry?.event?.id, action: task.playbackStarted ? "play-complete" : "prepare", outcome: "failure" });
      if (!session.cancelled) {
        failedCount += 1;
        failedRuleKey = entry?.key ?? null;
        error = cause instanceof Error ? cause.message : String(cause);
        notify();
        task.ready(task.preview ? cause : undefined);
      }
    } finally {
      if (session.cancelled) recordPlaybackStage({ channel: "personal", eventId: entry?.event?.reactKey ?? entry?.event?.id, action: "cancel", outcome: "cancelled" });
      task.ready();
      // 提示音准备完成仅放行 TTS；通道占用到整个事件播放完毕。
      if (!session.cancelled && task.ttsSession) await session.run(task.ttsSession.finished);
      task.unlink();
      session.complete();
      if (!isPreview && token === operationToken && current === task) {
        current = null;
        notify();
        void pump();
      }
      if (isPreview && token === previewToken && previewCurrent === task) {
        previewCurrent = null;
        notify();
      }
    }
  };

  const pump = async (): Promise<void> => {
    if (current || paused || !accepting) return;
    const task = pending.shift();
    if (!task) return;
    current = task;
    await runTask(task, operationToken, "formal");
  };

  const addTask = (entry: PersonalBroadcastEntry | null, beforeTts = false, ttsSession?: PlaybackSession, preview = false): Promise<void> => {
    let ready!: PersonalTask["ready"];
    const result = new Promise<void>((resolve, reject) => {
      ready = (cause) => cause === undefined ? resolve() : reject(cause);
    });
    const task: PersonalTask = {
      entry, beforeTts, ttsSession, preview, ready,
      session: new PlaybackSession(now, dependencies.wait),
      playbackStarted: false,
      unlink: () => {},
    };
    if (paused || ttsSession?.paused) task.session.control("pause");
    if (ttsSession) {
      task.unlink = ttsSession.onControl((control) => {
        if (control === "pause" || control === "resume") setPaused(control === "pause");
        else {
          const active = current === task;
          cancelTask(task, control);
          pending = pending.filter((item) => item !== task);
          if (active) {
            current = null;
            audioControl(control);
          }
          notify();
          void pump();
        }
      });
    }
    pending.push(task);
    notify();
    void pump();
    return result;
  };

  const playPreview = async (entry: PersonalBroadcastEntry): Promise<void> => {
    const token = ++previewToken;
    const previous = previewCurrent;
    if (previous) {
      const shouldWaitForStop = previous.playbackStarted;
      cancelTask(previous, "skip");
      previewCurrent = null;
      if (shouldWaitForStop) {
        previewStopPromise = previewStopPromise
          .then(() => skipPreviewAudio())
          .catch(() => {});
      }
      notify();
    }

    await previewStopPromise;
    if (token !== previewToken || !accepting) return;

    let ready!: PersonalTask["ready"];
    const result = new Promise<void>((resolve, reject) => {
      ready = (cause) => cause === undefined ? resolve() : reject(cause);
    });
    const task: PersonalTask = {
      entry, beforeTts: false, preview: true, ready,
      session: new PlaybackSession(now, dependencies.wait),
      playbackStarted: false,
      unlink: () => {},
    };
    if (paused) task.session.control("pause");
    previewCurrent = task;
    notify();
    void runTask(task, token, "preview");
    await result;
  };

  const enqueue = (event: DanmakuEvent & { committed?: boolean }, independentOnly = false): boolean => {
    if (!accepting || event.committed === false) { recordPlaybackStage({ channel: "personal", eventId: event.reactKey ?? event.id, action: "skip", outcome: "cancelled" }); return false; }
    if (independentOnly && dependencies.getSettings().personalBroadcast.mode !== "independent") { recordPlaybackStage({ channel: "personal", eventId: event.reactKey ?? event.id, action: "filter", outcome: "failure", data: { reason: "not-independent" } }); return false; }
    const entry = matchedRule(event);
    if (!entry) return false;
    recordPlaybackStage({ channel: "personal", eventId: entry.id, action: "matched", outcome: "success", data: { ruleKey: entry.key } });
    // TTS 项已由 TTS 队列限流；personal 上限只淘汰本通道等待的提示音。
    const standalone = pending.filter((task) => !task.ttsSession);
    if (standalone.length >= PERSONAL_QUEUE_LIMIT) {
      const oldest = standalone[0];
      cancelTask(oldest, "skip");
      recordPlaybackStage({ channel: "personal", eventId: oldest.entry?.event?.reactKey ?? oldest.entry?.event?.id, action: "cancel", outcome: "cancelled" });
      pending = pending.filter((task) => task !== oldest);
      discardedCount += 1;
    }
    void addTask(entry);
    return true;
  };

  return {
    acceptCommittedEvent: (event) => enqueue(event, true),
    acceptStandaloneEvent: (event) => enqueue(event),
    playBeforeTts: async (event, ttsSession) => {
      const settings = dependencies.getSettings().personalBroadcast;
      if (!accepting || !settings.enabled || settings.mode !== "before-tts" || ttsSession?.cancelled) return;
      await addTask(matchedRule(event), true, ttsSession);
    },
    testRule: async (key) => {
      const path = dependencies.getSettings().personalBroadcast.rules[key].audioPath;
      if (path && accepting) await playPreview({ id: key, key, path });
    },
    stop: () => resetRuntime(true),
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    skip: () => {
      if (current) {
        cancelTask(current, "skip");
        current = null;
      } else if (previewCurrent) {
        previewToken += 1;
        cancelTask(previewCurrent, "skip");
        previewCurrent = null;
        void skipPreviewAudio().catch(() => {});
        notify();
        void pump();
        return;
      }
      audioControl("skip");
      notify();
      void pump();
    },
    clear: () => {
      // 清空提示音等待项不淘汰已由 TTS 接受的当前事件。
      for (const task of pending.filter((item) => !item.ttsSession)) cancelTask(task, "skip");
      pending = pending.filter((task) => task.ttsSession);
      clearFailure();
      notify();
    },
    clearError: () => { clearFailure(); notify(); },
    revalidateGiftThreshold: () => {
      const threshold = getGiftThreshold();
      const isRejectedGift = (task: PersonalTask) => {
        const event = task.entry?.event;
        return event != null && !isPaidEventVisibleAtThreshold(event, threshold.threshold, threshold.mode);
      };
      const removedPending = pending.filter(isRejectedGift);
      for (const task of removedPending) cancelTask(task, "skip");
      pending = pending.filter((task) => !isRejectedGift(task));

      let removedCurrent = 0;
      if (current && !current.playbackStarted && isRejectedGift(current)) {
        operationToken += 1;
        cancelTask(current, "skip");
        current = null;
        removedCurrent = 1;
      }

      if (removedPending.length === 0 && removedCurrent === 0) return;
      discardedCount += removedPending.length + removedCurrent;
      notify();
      void pump();
    },
    reset: () => resetRuntime(true),
    shutdown: () => resetRuntime(false),
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      listener(snapshot);
      return () => listeners.delete(listener);
    },
  };
}
