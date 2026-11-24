import { invoke } from "@tauri-apps/api/core";
import type { FishAudioSettings, VoiceInfo, VoiceSynthesisRequest } from "./voiceTypes.ts";
import { normalizeFishReferenceVoice, type FishReferenceVoice } from "./fishAudioModels.ts";
import { VoiceProviderError, type VoiceProvider } from "./voiceProvider.ts";
import { classifyTtsDiagnosticError, ttsDiagnosticsLogger, type TtsDiagnostics } from "./ttsDiagnostics.ts";

const PROVIDER_NAME = "fish-audio";
const FISH_AUDIO_DIRECT_BASE_URL = "https://api.fish.audio";
const FISH_AUDIO_GATEWAY_TTS_ENDPOINT = "https://danmu-fish-audio-gateway-pages.pages.dev/laplace/tts-fishaudio";

interface FishAudioProviderDependencies {
  getSettings: () => FishAudioSettings;
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  diagnostics?: TtsDiagnostics;
}

export interface FishAudioModelLookupInput {
  baseUrl: string;
  apiKey: string;
  modelId: string;
}

export type FishAudioInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export async function lookupFishAudioModel(input: FishAudioModelLookupInput, invokeImpl: FishAudioInvoke = invoke): Promise<FishReferenceVoice> {
  const modelId = input.modelId.trim();
  if (!modelId) throw new Error("请先填写参考音色 ID");
  if (!input.apiKey.trim()) throw new Error("请先填写 Fish Audio API Key");
  if (!input.baseUrl.trim()) throw new Error("请先填写 Fish Audio API 地址");
  const result = normalizeFishReferenceVoice(await invokeImpl<unknown>("lookup_fish_audio_model", {
    baseUrl: input.baseUrl.trim(),
    apiKey: input.apiKey,
    modelId,
  }));
  if (!result) throw new Error("Fish Audio 返回的模型信息无效");
  return result;
}

export function createFishAudioProvider(dependencies: FishAudioProviderDependencies): VoiceProvider {
  const invokeImpl = dependencies.invoke ?? (<T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args));
  const diagnostics = dependencies.diagnostics ?? ttsDiagnosticsLogger;
  let requestSequence = 0;
  const activeRequestIds = new Set<string>();
  const cancelledRequestIds = new Set<string>();

  const diagnosticRoute = (settings: FishAudioSettings | null): string | undefined => {
    if (!settings?.baseUrl.trim()) return undefined;
    return settings.baseUrl.trim().replace(/\/+$/, "") === FISH_AUDIO_DIRECT_BASE_URL ? "pages-gateway" : "direct";
  };
  const diagnosticEndpoint = (settings: FishAudioSettings | null): string | undefined => {
    if (!settings?.baseUrl.trim()) return undefined;
    if (diagnosticRoute(settings) === "pages-gateway") return FISH_AUDIO_GATEWAY_TTS_ENDPOINT;
    return `${settings.baseUrl.trim().replace(/\/+$/, "")}/v1/tts`;
  };

  return {
    async listVoices(): Promise<VoiceInfo[]> {
      // Fish Audio 的音色是模型/参考音色 ID，不提供与 Edge 等价的公共音色枚举。
      return [];
    },

    async synthesize(request: VoiceSynthesisRequest): Promise<Uint8Array> {
      const requestId = request.requestId?.trim() || `${PROVIDER_NAME}-${++requestSequence}`;
      const startedAt = Date.now();
      let settings: FishAudioSettings | null = null;
      try {
        if (!request.text.trim()) throw new VoiceProviderError(PROVIDER_NAME, "invalid", "没有可播报的文字", false);
        settings = dependencies.getSettings();
        if (!settings.apiKey.trim()) throw new VoiceProviderError(PROVIDER_NAME, "invalid", "请先填写 Fish Audio API Key", false);
        if (!settings.baseUrl.trim() || !settings.model.trim()) {
          throw new VoiceProviderError(PROVIDER_NAME, "invalid", "请先填写 Fish Audio 地址和模型", false);
        }
        activeRequestIds.add(requestId);
        const bytes = await invokeImpl<number[]>("synthesize_fish_audio", {
          text: request.text,
          voiceName: request.voice,
          rate: request.rate,
          pitch: request.pitch,
          volume: request.volume,
          requestId,
          config: settings,
        });
        const audio = Uint8Array.from(bytes);
        const cancelled = cancelledRequestIds.has(requestId);
        diagnostics.record({
          requestId,
          provider: PROVIDER_NAME,
          route: diagnosticRoute(settings),
          endpoint: diagnosticEndpoint(settings),
          model: settings.model,
          outcome: cancelled ? "cancelled" : "success",
          stage: cancelled ? "cancelled" : "complete",
          durationMs: Date.now() - startedAt,
          audioBytes: audio.byteLength,
        });
        return audio;
      } catch (error) {
        const cancelled = cancelledRequestIds.has(requestId) || classifyTtsDiagnosticError(error).errorClass === "cancelled";
        diagnostics.record({
          requestId,
          provider: PROVIDER_NAME,
          route: diagnosticRoute(settings),
          endpoint: diagnosticEndpoint(settings),
          model: settings?.model,
          outcome: cancelled ? "cancelled" : "failure",
          stage: cancelled ? "cancelled" : "provider",
          durationMs: Date.now() - startedAt,
          error,
        });
        if (error instanceof VoiceProviderError) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new VoiceProviderError(PROVIDER_NAME, "protocol", `Fish Audio 语音合成失败：${detail}`, true);
      } finally {
        activeRequestIds.delete(requestId);
        cancelledRequestIds.delete(requestId);
      }
    },

    async cancel(requestId?: string): Promise<void> {
      const requestedId = requestId?.trim();
      const requestIds = requestedId ? [requestedId] : [...activeRequestIds];
      requestIds.forEach((id) => {
        if (activeRequestIds.has(id)) cancelledRequestIds.add(id);
      });
      await Promise.all(requestIds.map((requestId) => invokeImpl("cancel_voice_synthesis", { requestId })));
    },
  };
}
