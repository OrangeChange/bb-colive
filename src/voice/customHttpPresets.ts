import type { CustomHttpPreset, CustomHttpVoiceSettings } from "./voiceTypes.ts";

type CustomHttpPresetDefaults = Omit<
  CustomHttpVoiceSettings,
  "endpoint" | "method" | "authType" | "apiKey" | "apiKeyHeader" | "voiceValues"
> & Pick<Partial<CustomHttpVoiceSettings>, "endpoint">;

export const CUSTOM_HTTP_PRESET_LABELS: Record<CustomHttpPreset, string> = {
  "openai-compatible": "OpenAI 兼容",
  "gpt-sovits": "GPT-SoVITS",
  "index-tts": "IndexTTS",
  "custom-json": "自定义 JSON",
};

export const CUSTOM_HTTP_PRESET_DEFAULTS: Record<CustomHttpPreset, CustomHttpPresetDefaults> = {
  "openai-compatible": {
    preset: "openai-compatible",
    textField: "input",
    voiceField: "voice",
    modelField: "model",
    model: "tts-1",
    rateField: "speed",
    pitchField: "",
    volumeField: "",
    audioField: "audio",
    responseFormat: "audio",
    fixedBody: {},
    extraHeaders: {},
  },
  "gpt-sovits": {
    preset: "gpt-sovits",
    endpoint: "http://127.0.0.1:9880/tts",
    textField: "text",
    voiceField: "ref_audio_path",
    modelField: "text_lang",
    model: "zh",
    rateField: "speed_factor",
    pitchField: "",
    volumeField: "",
    audioField: "audio",
    responseFormat: "audio",
    fixedBody: { prompt_lang: "zh", media_type: "wav", streaming_mode: false },
    extraHeaders: {},
  },
  "index-tts": {
    preset: "index-tts",
    endpoint: "http://127.0.0.1:9880",
    textField: "text",
    voiceField: "speaker",
    modelField: "",
    model: "",
    rateField: "speed",
    pitchField: "",
    volumeField: "",
    audioField: "audio",
    responseFormat: "audio",
    fixedBody: {},
    extraHeaders: {},
  },
  "custom-json": {
    preset: "custom-json",
    textField: "text",
    voiceField: "voice",
    modelField: "model",
    model: "",
    rateField: "",
    pitchField: "",
    volumeField: "",
    audioField: "audio",
    responseFormat: "audio",
    fixedBody: {},
    extraHeaders: {},
  },
};

export function getCustomHttpPresetDefaults(preset: CustomHttpPreset): CustomHttpPresetDefaults {
  const defaults = CUSTOM_HTTP_PRESET_DEFAULTS[preset];
  return {
    ...defaults,
    fixedBody: { ...defaults.fixedBody },
    extraHeaders: { ...defaults.extraHeaders },
  };
}
