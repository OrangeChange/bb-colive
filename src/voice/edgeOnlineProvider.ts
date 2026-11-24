import { invoke } from "@tauri-apps/api/core";
import type { VoiceInfo, VoiceSynthesisRequest } from "./voiceTypes.ts";
import { VoiceProviderError, type VoiceProvider } from "./voiceProvider.ts";

const PROVIDER_NAME = "edge-online";
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const VOICE_LIST_ENDPOINT = "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list";

interface EdgeProviderDependencies {
  fetch?: (input: string, init?: { headers?: Record<string, string> }) => Promise<{ ok: boolean; status?: number; json(): Promise<unknown> }>;
  invoke?: <T>(command: string, args?: Record<string, unknown>) => Promise<T>;
  userAgent?: string;
}

function getDefaultUserAgent(): string {
  if (typeof navigator !== "undefined" && navigator.userAgent) return navigator.userAgent;
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36 Edg/152.0.0.0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getVoiceGroup(locale: string, shortName: string): { group: string; multilingual: boolean } | null {
  const multilingual = shortName.includes("Multilingual");
  if (multilingual && locale === "en-US") return { group: "多语言音色", multilingual: true };
  if (locale === "zh-CN") return { group: "中文（普通话）", multilingual };
  if (locale === "zh-HK") return { group: "中文（粤语）", multilingual };
  if (locale === "zh-TW") return { group: "中文（台湾）", multilingual };
  if (locale.startsWith("zh-CN-")) return { group: "中文（方言）", multilingual };
  if (locale === "en-US") return { group: "English（美国）", multilingual };
  if (locale === "en-GB") return { group: "English（英国）", multilingual };
  if (locale === "ja-JP") return { group: "日本語", multilingual };
  return null;
}

function toVoiceInfo(value: unknown): VoiceInfo | null {
  if (!isRecord(value) || typeof value.ShortName !== "string") return null;
  const language = typeof value.Locale === "string" ? value.Locale : undefined;
  if (!language) return null;
  const voiceGroup = getVoiceGroup(language, value.ShortName);
  if (!voiceGroup) return null;
  return {
    name: value.ShortName,
    label: typeof value.FriendlyName === "string" ? value.FriendlyName : value.ShortName,
    language,
    local: false,
    ...voiceGroup,
  };
}

export function createEdgeOnlineProvider(dependencies: EdgeProviderDependencies = {}): VoiceProvider {
  const fetchImpl = dependencies.fetch ?? (typeof fetch !== "undefined" ? fetch.bind(globalThis) : undefined);
  const invokeImpl = dependencies.invoke ?? (<T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args));
  const userAgent = dependencies.userAgent ?? getDefaultUserAgent();

  return {
    async listVoices(): Promise<VoiceInfo[]> {
      if (!fetchImpl) throw new VoiceProviderError(PROVIDER_NAME, "unavailable", "当前环境没有可用的网络请求能力", false);
      try {
        const response = await fetchImpl(`${VOICE_LIST_ENDPOINT}?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`, {
          headers: { Accept: "application/json", "User-Agent": userAgent },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status ?? "unknown"}`);
        const values = await response.json();
        return Array.isArray(values) ? values.map(toVoiceInfo).filter((item): item is VoiceInfo => item !== null) : [];
      } catch (error) {
        if (error instanceof VoiceProviderError) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new VoiceProviderError(PROVIDER_NAME, "network", `Edge 在线音色列表获取失败：${detail}`, true);
      }
    },

    async synthesize(request: VoiceSynthesisRequest): Promise<Uint8Array> {
      if (!request.text.trim()) throw new VoiceProviderError(PROVIDER_NAME, "invalid", "没有可播报的文字", false);
      try {
        const bytes = await invokeImpl<number[]>("synthesize_edge_speech", {
          text: request.text,
          voiceName: request.voice,
          rate: request.rate,
          pitch: request.pitch,
          volume: request.volume,
        });
        return Uint8Array.from(bytes);
      } catch (error) {
        if (error instanceof VoiceProviderError) throw error;
        const detail = error instanceof Error ? error.message : String(error);
        throw new VoiceProviderError(PROVIDER_NAME, "protocol", `Edge 在线语音合成失败：${detail}`, true);
      }
    },

    async cancel(_requestId?: string): Promise<void> {
      // 桌面端合成在独立线程执行；取消播放由音频输出层负责。
    },
  };
}
