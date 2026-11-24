import { normalizeGiftThreshold, normalizeGiftThresholdMode, type GiftThresholdMode } from "../giftThreshold.ts";

export interface VoiceGiftThreshold {
  threshold: number;
  mode: GiftThresholdMode;
}

export interface VoiceGiftThresholdRuntime {
  set(threshold: number, mode: GiftThresholdMode): void;
  get(): VoiceGiftThreshold;
  subscribe(listener: (value: VoiceGiftThreshold) => void): () => void;
}

export function createVoiceGiftThresholdRuntime(
  initial: VoiceGiftThreshold = { threshold: 0, mode: "unit" },
): VoiceGiftThresholdRuntime {
  const listeners = new Set<(value: VoiceGiftThreshold) => void>();
  let current: VoiceGiftThreshold = {
    threshold: normalizeGiftThreshold(initial.threshold),
    mode: normalizeGiftThresholdMode(initial.mode),
  };

  return {
    set: (threshold, mode) => {
      const next = {
        threshold: normalizeGiftThreshold(threshold),
        mode: normalizeGiftThresholdMode(mode),
      };
      if (next.threshold === current.threshold && next.mode === current.mode) return;
      current = next;
      for (const listener of listeners) listener(current);
    },
    get: () => current,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function reuseVoiceGiftThresholdRuntime(
  existing?: VoiceGiftThresholdRuntime,
): VoiceGiftThresholdRuntime {
  return existing ?? createVoiceGiftThresholdRuntime();
}

type VoiceGiftThresholdHotData = { voiceGiftThresholdRuntime?: VoiceGiftThresholdRuntime };
const hotData = import.meta.hot?.data as VoiceGiftThresholdHotData | undefined;
const runtime = reuseVoiceGiftThresholdRuntime(hotData?.voiceGiftThresholdRuntime);

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    // 保留完整对象，使仍存活的控制器闭包、界面 setter 和订阅者继续指向同一运行时。
    (data as VoiceGiftThresholdHotData).voiceGiftThresholdRuntime = runtime;
  });
}

export function setVoiceGiftThreshold(threshold: number, mode: GiftThresholdMode): void {
  runtime.set(threshold, mode);
}

export function getVoiceGiftThreshold(): VoiceGiftThreshold {
  return runtime.get();
}

export function subscribeVoiceGiftThreshold(listener: (value: VoiceGiftThreshold) => void): () => void {
  return runtime.subscribe(listener);
}
