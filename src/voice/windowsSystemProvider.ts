import { invoke } from "@tauri-apps/api/core";
import type { VoiceInfo, VoiceSynthesisRequest } from "./voiceTypes.ts";
import { VoiceProviderError, type VoiceProvider } from "./voiceProvider.ts";

interface WindowsVoiceRecord {
  name: string;
  label: string;
  language?: string;
}

export function createWindowsSystemProvider(): VoiceProvider {
  return {
    async listVoices(): Promise<VoiceInfo[]> {
      try {
        const voices = await invoke<WindowsVoiceRecord[]>("list_windows_voices");
        return voices.map((voice) => ({ ...voice, local: true }));
      } catch (error) {
        throw new VoiceProviderError("windows-system", "unavailable", String(error), false);
      }
    },

    async synthesize(request: VoiceSynthesisRequest): Promise<Uint8Array> {
      try {
        const bytes = await invoke<number[]>("synthesize_windows_speech", {
          text: request.text,
          voiceName: request.voice,
          rate: request.rate,
          pitch: request.pitch,
          volume: request.volume,
        });
        return Uint8Array.from(bytes);
      } catch (error) {
        throw new VoiceProviderError("windows-system", "protocol", String(error), true);
      }
    },

    async cancel(_requestId?: string): Promise<void> {
      await invoke("stop_tts_audio");
    },
  };
}
