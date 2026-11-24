import { useVoiceSettings } from '../voice/voiceSettings.ts';

// 事件交互沿用现有配置存储，与语音输出共用的用户名别名保持一致。
export function useEventUserNicknames() {
  return useVoiceSettings(state => state.userNicknames);
}

export function useEventShortcutActions() {
  return useVoiceSettings(state => state.shortcutActions);
}
