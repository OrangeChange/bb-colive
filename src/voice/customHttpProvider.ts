import { invoke } from "@tauri-apps/api/core";
import type { CustomHttpVoiceSettings, VoiceInfo, VoiceSynthesisRequest } from "./voiceTypes.ts";
import { VoiceProviderError, type VoiceProvider } from "./voiceProvider.ts";
import { classifyTtsDiagnosticError, ttsDiagnosticsLogger, type TtsDiagnostics } from "./ttsDiagnostics.ts";

const PROVIDER_NAME = "custom-http";

interface CustomHttpProviderDependencies {
  getSettings: () => CustomHttpVoiceSettings;
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  diagnostics?: TtsDiagnostics;
}

export function createCustomHttpProvider(dependencies: CustomHttpProviderDependencies): VoiceProvider {
  const invokeImpl = dependencies.invoke ?? (<T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args));
  const diagnostics = dependencies.diagnostics ?? ttsDiagnosticsLogger;
  let requestSequence = 0;
  const activeRequestIds = new Set<string>();
  const cancelledRequestIds = new Set<string>();

  return {
    async listVoices(): Promise<VoiceInfo[]> {
      // 通用 HTTP 协议没有统一的音色列表接口，使用配置中的手动音色/参考音频值。
      return [];
    },

    async synthesize(request: VoiceSynthesisRequest): Promise<Uint8Array> {
      const requestId = request.requestId?.trim() || `${PROVIDER_NAME}-${++requestSequence}`;
      const startedAt = Date.now();
      let settings: CustomHttpVoiceSettings | null = null;
      try {
        if (!request.text.trim()) throw new VoiceProviderError(PROVIDER_NAME, "invalid", "没有可播报的文字", false);
        settings = dependencies.getSettings();
        if (!settings.endpoint.trim()) throw new VoiceProviderError(PROVIDER_NAME, "invalid", "请先填写自定义 API 地址", false);
        activeRequestIds.add(requestId);
        const bytes = await invokeImpl<number[]>("synthesize_custom_http", {
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
          route: "custom",
          endpoint: settings.endpoint,
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
          route: "custom",
          endpoint: settings?.endpoint,
          model: settings?.model,
          outcome: cancelled ? "cancelled" : "failure",
          stage: cancelled ? "cancelled" : "provider",
          durationMs: Date.now() - startedAt,
          error,
        });
        if (error instanceof VoiceProviderError) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new VoiceProviderError(PROVIDER_NAME, "protocol", `自定义 API 语音合成失败：${detail}`, true);
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
