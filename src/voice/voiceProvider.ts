import type { VoiceInfo, VoiceSynthesisRequest } from "./voiceTypes.ts";

export type VoiceProviderErrorKind = "network" | "protocol" | "unavailable" | "invalid" | "cancelled";

export class VoiceProviderError extends Error {
  readonly provider: string;
  readonly kind: VoiceProviderErrorKind;
  readonly retryable: boolean;

  constructor(provider: string, kind: VoiceProviderErrorKind, message: string, retryable: boolean) {
    super(message);
    this.name = "VoiceProviderError";
    this.provider = provider;
    this.kind = kind;
    this.retryable = retryable;
  }
}

export interface VoiceProvider {
  listVoices(): Promise<VoiceInfo[]>;
  synthesize(request: VoiceSynthesisRequest): Promise<Uint8Array>;
  /**
   * 取消指定的合成请求。引擎无法中断底层渲染时，也必须尽快返回；控制器会丢弃该请求的迟到结果。
   * 不传 requestId 仅用于兼容旧调用，新的引擎和控制路径必须按请求 ID 精确取消。
   */
  cancel(requestId?: string): Promise<void>;
}
