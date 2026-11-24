import { useGeneralSettings } from "../generalSettings.ts";
import { useVoiceSettings } from "./voiceSettings.ts";
import { createEdgeOnlineProvider } from "./edgeOnlineProvider.ts";
import { createWindowsSystemProvider } from "./windowsSystemProvider.ts";
import { createFishAudioProvider } from "./fishAudioProvider.ts";
import { createCustomHttpProvider } from "./customHttpProvider.ts";
import * as audioOutput from "./audioOutput.ts";
import { createPersonalBroadcastController } from "./personalBroadcastController.ts";
import { createVoiceController } from "./voiceController.ts";
import type { VoiceProvider } from "./voiceProvider.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import { getVoiceGiftThreshold, subscribeVoiceGiftThreshold } from "./giftThresholdRuntime.ts";

const edgeProvider = createEdgeOnlineProvider();
const windowsProvider = createWindowsSystemProvider();
const fishAudioProvider = createFishAudioProvider({ getSettings: () => useVoiceSettings.getState().fishAudio });
const customHttpProvider = createCustomHttpProvider({ getSettings: () => useVoiceSettings.getState().customHttp });

function selectedProvider(): VoiceProvider {
  const engine = useVoiceSettings.getState().engine;
  if (engine === "windows-system") return windowsProvider;
  if (engine === "fish-audio") return fishAudioProvider;
  if (engine === "custom-http") return customHttpProvider;
  return edgeProvider;
}

/** 根据当前设置选择引擎，但控制器实例只创建一次，保证跨视图保持运行态。 */
const provider: VoiceProvider = {
  listVoices: () => {
    return selectedProvider().listVoices();
  },
  synthesize: (request) => {
    return selectedProvider().synthesize(request);
  },
  cancel: async (requestId?: string) => {
    await selectedProvider().cancel(requestId);
  },
};

export const personalBroadcastController = createPersonalBroadcastController({
  audioOutput,
  getSettings: () => useVoiceSettings.getState(),
  getOnlyGuardEntry: () => useGeneralSettings.getState().eventDisplayPreferences.onlyGuardEntry,
  getGiftThreshold: getVoiceGiftThreshold,
});

export const voiceController = createVoiceController({
  provider,
  getProvider: selectedProvider,
  audioOutput,
  getSettings: () => useVoiceSettings.getState(),
  getOnlyGuardEntry: () => useGeneralSettings.getState().eventDisplayPreferences.onlyGuardEntry,
  getGiftThreshold: getVoiceGiftThreshold,
  beforePlayback: (event, session) => personalBroadcastController.playBeforeTts(event, session),
  onPlaybackControl: (control) => {
    if (useVoiceSettings.getState().personalBroadcast.mode === "before-tts") {
      personalBroadcastController[control]();
    }
  },
  onDiscardedEvent: (event) => {
    if (useVoiceSettings.getState().personalBroadcast.mode === "before-tts") {
      personalBroadcastController.acceptStandaloneEvent(event);
    }
  },
});

const unsubscribeGiftThreshold = subscribeVoiceGiftThreshold(() => {
  voiceController.revalidateGiftThreshold();
  personalBroadcastController.revalidateGiftThreshold();
});

let voiceRoomId: number | null = null;
let previousPersonalBroadcastState = {
  enabled: useVoiceSettings.getState().personalBroadcast.enabled,
  mode: useVoiceSettings.getState().personalBroadcast.mode,
};

const unsubscribePersonalBroadcastSettings = useVoiceSettings.subscribe((settings) => {
  const nextState = {
    enabled: settings.personalBroadcast.enabled,
    mode: settings.personalBroadcast.mode,
  };
  if (
    nextState.enabled !== previousPersonalBroadcastState.enabled
    || nextState.mode !== previousPersonalBroadcastState.mode
  ) {
    previousPersonalBroadcastState = nextState;
    personalBroadcastController.reset();
  }
});

export function publishVoiceEvent(event: DanmakuEvent): void {
  const mode = useVoiceSettings.getState().personalBroadcast.mode;
  if (mode === "independent") {
    personalBroadcastController.acceptCommittedEvent(event);
    voiceController.acceptCommittedEvent(event);
    return;
  }

  const acceptedByTts = voiceController.acceptCommittedEvent(event);
  if (!acceptedByTts) personalBroadcastController.acceptStandaloneEvent(event);
}

export function listVoiceOptions() {
  return provider.listVoices();
}

export function listAudioDevices() {
  return audioOutput.listDevices();
}

/** 换到不同真实房间时清空当前播报，但同房重连不清除已完成的运行态。 */
export function switchVoiceRoom(roomId: number | null): void {
  if (voiceRoomId === roomId) return;
  voiceRoomId = roomId;
  voiceController.reset();
  personalBroadcastController.reset();
}

/** 手动断开时清理会话；全局实例继续可用，重连后可直接接收事件。 */
export function clearVoiceRuntime(): void {
  voiceController.reset();
  personalBroadcastController.reset();
  voiceRoomId = null;
}

/** 实例退出时终止接收。 */
export function shutdownVoiceRuntime(): void {
  voiceController.shutdown();
  personalBroadcastController.shutdown();
  voiceRoomId = null;
}

// 热重载会替换模块实例；先关闭旧实例，避免它持有的异步合成/播放继续向外输出。
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribePersonalBroadcastSettings();
    unsubscribeGiftThreshold();
    shutdownVoiceRuntime();
  });
}
