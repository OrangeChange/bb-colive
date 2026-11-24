import type {
  CustomHttpVoiceSettings,
  FishAudioSettings,
  VoiceHttpResponseFormat,
  VoiceJsonObject,
  VoiceJsonValue,
  VoiceSynthesisRequest,
} from "./voiceTypes.ts";

export interface ExternalHttpRequest {
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: VoiceJsonObject;
  responseFormat: VoiceHttpResponseFormat;
  audioField?: string;
}

function trimUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function fishTtsUrl(baseUrl: string): string {
  const normalized = trimUrl(baseUrl);
  return normalized.endsWith("/v1/tts") ? normalized : `${normalized}/v1/tts`;
}

function fishVolume(volume: number): number {
  if (volume <= 0) return -96;
  return Math.round((20 * Math.log10(Math.min(1, volume))) * 10) / 10;
}

function cloneJsonValue(value: VoiceJsonValue): VoiceJsonValue {
  if (Array.isArray(value)) return value.map((item) => cloneJsonValue(item));
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJsonValue(item)]));
  }
  return value;
}

function setMappedField(
  body: VoiceJsonObject,
  field: string,
  value: VoiceJsonValue,
): void {
  const path = field.trim().split(".").map((part) => part.trim()).filter(Boolean);
  if (path.length === 0) return;
  let target = body;
  path.forEach((key, index) => {
    if (index === path.length - 1) {
      target[key] = value;
      return;
    }
    const current = target[key];
    if (typeof current !== "object" || current === null || Array.isArray(current)) target[key] = {};
    target = target[key] as VoiceJsonObject;
  });
}

export function buildFishAudioRequest(request: VoiceSynthesisRequest, settings: FishAudioSettings): ExternalHttpRequest {
  const referenceId = settings.referenceId.trim() || request.voice.trim();
  const body: VoiceJsonObject = {
    text: request.text,
    prosody: {
      speed: request.rate,
      volume: fishVolume(request.volume),
      normalize_loudness: true,
    },
    format: settings.format,
  };
  if (referenceId) body.reference_id = referenceId;
  return {
    url: fishTtsUrl(settings.baseUrl),
    method: "POST",
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      "Content-Type": "application/json",
      model: settings.model,
    },
    body,
    responseFormat: "audio",
  };
}

export function buildCustomHttpRequest(request: VoiceSynthesisRequest, settings: CustomHttpVoiceSettings): ExternalHttpRequest {
  const body = cloneJsonValue(settings.fixedBody) as VoiceJsonObject;
  setMappedField(body, settings.textField, request.text);
  setMappedField(body, settings.voiceField, request.voice);
  setMappedField(body, settings.modelField, settings.model);
  setMappedField(body, settings.rateField, request.rate);
  setMappedField(body, settings.pitchField, request.pitch);
  setMappedField(body, settings.volumeField, request.volume);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...settings.extraHeaders,
  };
  if (settings.authType === "bearer" && settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey}`;
  if (settings.authType === "api-key" && settings.apiKey.trim()) {
    headers[settings.apiKeyHeader.trim() || "X-API-Key"] = settings.apiKey;
  }
  return {
    url: settings.endpoint.trim(),
    method: "POST",
    headers,
    body,
    responseFormat: settings.responseFormat,
    audioField: settings.audioField.trim() || "audio",
  };
}
