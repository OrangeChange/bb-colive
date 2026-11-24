import { DEFAULT_EVENT_SHORTCUT_ACTIONS, normalizeEventShortcutActions } from "../events/eventInteractionPolicy.ts";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_VOICE_PRIORITIES,
  DEFAULT_ANCHOR_LOTTERY_RESULT_TEMPLATE,
  DEFAULT_INTERACT_VOICE_TEMPLATES,
  DEFAULT_RED_POCKET_RESULT_TEMPLATE,
  DEFAULT_VOICE_TEMPLATES,
  normalizeLegacyInteractVoiceTemplate,
  normalizeLegacyVoiceTemplate,
  VOICE_EVENT_CATEGORIES,
  VOICE_INTERACT_TEMPLATE_KINDS,
  VOICE_TEMPLATE_FIELDS,
  type TemplateSegment,
  type VoiceEventEnabled,
  type VoiceOverflowPolicy,
  type VoicePriorityMap,
  type VoiceQueueMode,
  type VoiceSettings,
  type VoiceTemplateField,
  type VoiceTemplateMap,
  type CustomHttpPreset,
  type CustomHttpVoiceValues,
  type CustomHttpVoiceSettings,
  type VoiceJsonValue,
  type FishAudioSettings,
} from "./voiceTypes.ts";
import { DEFAULT_FISH_REFERENCE_VOICES, normalizeFishReferenceVoices } from "./fishAudioModels.ts";
import { DEFAULT_VOICE_PRONUNCIATION_RULES, normalizeVoicePronunciationRules } from "./voicePronunciation.ts";
import { normalizeUserNicknames } from "../userNicknames.ts";
import {
  DEFAULT_PERSONAL_BROADCAST_SETTINGS,
  PERSONAL_BROADCAST_RULE_KEYS,
  type PersonalBroadcastSettings,
} from "./personalBroadcastTypes.ts";
import { getChangedSettingPaths, recordFeatureSettingChange } from "../diagnostics/featureDiagnostics.ts";

const DEFAULT_EVENT_ENABLED: VoiceEventEnabled = {
  danmu: true,
  interact: false,
  gift: true,
  blindBox: true,
  redPocket: true,
  anchorLottery: true,
  superChat: true,
  guard: true,
  system: false,
};


const CUSTOM_HTTP_PRESETS = ["openai-compatible", "gpt-sovits", "index-tts", "custom-json"] as const satisfies readonly CustomHttpPreset[];

const isCustomHttpPreset = (value: unknown): value is CustomHttpPreset => (
  typeof value === "string" && CUSTOM_HTTP_PRESETS.includes(value as CustomHttpPreset)
);

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  engine: "edge-online",
  engineVoices: {
    "edge-online": "zh-CN-XiaoxiaoNeural",
    "windows-system": "Huihui",
  },
  fishAudio: {
    apiKey: "",
    baseUrl: "https://api.fish.audio",
    model: "s2.1-pro-free",
    referenceId: "",
    referenceVoices: DEFAULT_FISH_REFERENCE_VOICES,
    format: "mp3",
  },
  customHttp: {
    endpoint: "http://127.0.0.1:9880/tts",
    method: "POST",
    preset: "custom-json",
    authType: "none",
    apiKey: "",
    apiKeyHeader: "X-API-Key",
    textField: "text",
    voiceField: "ref_audio_path",
    modelField: "text_lang",
    model: "zh",
    rateField: "speed_factor",
    pitchField: "",
    volumeField: "",
    audioField: "audio",
    responseFormat: "audio",
    fixedBody: {
      prompt_lang: "zh",
      media_type: "wav",
      streaming_mode: false,
    },
    extraHeaders: {},
    voiceValues: {
      "openai-compatible": "",
      "gpt-sovits": "",
      "index-tts": "",
      "custom-json": "",
    },
  },
  speechRate: 1,
  pitch: 0,
  playbackGain: 1,
  volume: 1,
  eventIntervalSeconds: 0,
  shortcutActions: [...DEFAULT_EVENT_SHORTCUT_ACTIONS],
  personalBroadcast: DEFAULT_PERSONAL_BROADCAST_SETTINGS,
  userNicknames: {},
  speakUsername: true,
  pronunciationRules: DEFAULT_VOICE_PRONUNCIATION_RULES.map((rule) => ({ ...rule })),
  blockBigEmoteDanmu: true,
  blockLowPriceSuperChat: false,
  blockLowPriceGuard: false,
  outputScope: "host",
  monitorDeviceId: null,
  streamDeviceId: null,
  queueMode: "original",
  queueLimit: 50,
  overflowPolicy: "drop-oldest",
  expiryEnabled: false,
  expirySeconds: 60,
  eventEnabled: DEFAULT_EVENT_ENABLED,
  priorities: DEFAULT_VOICE_PRIORITIES,
  templates: DEFAULT_VOICE_TEMPLATES,
  interactTemplates: DEFAULT_INTERACT_VOICE_TEMPLATES,
  redPocketResultTemplate: DEFAULT_RED_POCKET_RESULT_TEMPLATE,
  anchorLotteryResultTemplate: DEFAULT_ANCHOR_LOTTERY_RESULT_TEMPLATE,
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === "object" && value !== null
);

const normalizeJsonValue = (value: unknown): VoiceJsonValue | undefined => {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      const normalized = normalizeJsonValue(item);
      return normalized === undefined ? [] : [normalized];
    });
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, item]) => {
        const normalized = normalizeJsonValue(item);
        return normalized === undefined ? [] : [[key, normalized]];
      }),
    );
  }
  return undefined;
};

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
};

const isVoiceTemplateField = (value: unknown): value is VoiceTemplateField => (
  typeof value === "string" && VOICE_TEMPLATE_FIELDS.includes(value as typeof VOICE_TEMPLATE_FIELDS[number])
);

const normalizeTemplate = (value: unknown, fallback: TemplateSegment[]): TemplateSegment[] => {
  if (!Array.isArray(value)) return fallback.map((segment) => ({ ...segment }));
  const result: TemplateSegment[] = [];
  for (const segment of value) {
    if (!isRecord(segment)) continue;
    if (segment.kind === "text" && typeof segment.value === "string") {
      result.push({ kind: "text", value: segment.value });
    } else if (segment.kind === "field" && (isVoiceTemplateField(segment.field) || segment.field === "months")) {
      result.push({ kind: "field", field: segment.field === "months" ? "duration" : segment.field });
    }
  }
  return result;
};

const normalizeInteractTemplates = (value: unknown) => {
  const input = isRecord(value) ? value : {};
  return Object.fromEntries(
    VOICE_INTERACT_TEMPLATE_KINDS.map((kind) => [
      kind,
      normalizeLegacyInteractVoiceTemplate(normalizeTemplate(input[kind], DEFAULT_INTERACT_VOICE_TEMPLATES[kind]), kind),
    ]),
  ) as VoiceSettings["interactTemplates"];
};

const normalizeTemplates = (value: unknown): VoiceTemplateMap => {
  const input = isRecord(value) ? value : {};
  const legacyLottery = input.lottery;
  return Object.fromEntries(
    VOICE_EVENT_CATEGORIES.map((category) => {
      const legacyTemplate = (category === "redPocket" || category === "anchorLottery") && input[category] == null
        ? legacyLottery
        : input[category];
      return [
        category,
        normalizeLegacyVoiceTemplate(normalizeTemplate(legacyTemplate, DEFAULT_VOICE_SETTINGS.templates[category]), category),
      ];
    }),
  ) as VoiceTemplateMap;
};

const isSupportedPersonalBroadcastAudioPath = (value: string): boolean => (
  /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value) && /\.(?:mp3|wav)$/i.test(value)
);

const normalizePersonalBroadcastSettings = (value: unknown): PersonalBroadcastSettings => {
  const input = isRecord(value) ? value : {};
  const ruleInput = isRecord(input.rules) ? input.rules : {};
  return {
    enabled: input.enabled === true,
    mode: input.mode === "before-tts" ? "before-tts" : "independent",
    promptIntervalSeconds: Math.round(clamp(
      input.promptIntervalSeconds,
      0,
      30,
      DEFAULT_PERSONAL_BROADCAST_SETTINGS.promptIntervalSeconds,
    ) * 2) / 2,
    promptToTtsIntervalSeconds: Math.round(clamp(
      input.promptToTtsIntervalSeconds,
      0,
      30,
      DEFAULT_PERSONAL_BROADCAST_SETTINGS.promptToTtsIntervalSeconds,
    ) * 2) / 2,
    rules: Object.fromEntries(
      PERSONAL_BROADCAST_RULE_KEYS.map((key) => {
        const rule = isRecord(ruleInput[key]) ? ruleInput[key] : {};
        return [key, {
          enabled: rule.enabled === true,
          audioPath: typeof rule.audioPath === "string" && isSupportedPersonalBroadcastAudioPath(rule.audioPath)
            ? rule.audioPath
            : "",
        }];
      }),
    ) as PersonalBroadcastSettings["rules"],
  };
};

export function normalizeVoiceSettings(value: unknown): VoiceSettings {
  const input = isRecord(value) ? value : {};
  const eventInput = isRecord(input.eventEnabled) ? input.eventEnabled : {};
  const priorityInput = isRecord(input.priorities) ? input.priorities : {};
  const legacyLotteryEnabled = typeof eventInput.lottery === "boolean" ? eventInput.lottery : undefined;
  const legacyLotteryPriority = priorityInput.lottery;
  const eventEnabled = Object.fromEntries(
    VOICE_EVENT_CATEGORIES.map((category) => [
      category,
      typeof eventInput[category] === "boolean"
        ? eventInput[category]
        : (category === "redPocket" || category === "anchorLottery") && legacyLotteryEnabled !== undefined
          ? legacyLotteryEnabled
          : DEFAULT_EVENT_ENABLED[category],
    ]),
  ) as VoiceEventEnabled;
  const priorities = Object.fromEntries(
    VOICE_EVENT_CATEGORIES.map((category) => {
      const priority = priorityInput[category]
        ?? ((category === "redPocket" || category === "anchorLottery") ? legacyLotteryPriority : undefined);
      return [category, priority === "high" || priority === "medium" || priority === "normal"
        ? priority
        : DEFAULT_VOICE_PRIORITIES[category]];
    }),
  ) as VoicePriorityMap;
  const engine = input.engine === "windows-system" || input.engine === "fish-audio" || input.engine === "custom-http"
    ? input.engine
    : "edge-online";
  const fishInput = isRecord(input.fishAudio) ? input.fishAudio : {};
  const customInput = isRecord(input.customHttp) ? input.customHttp : {};
  const legacyVoiceName = typeof input.voiceName === "string" ? input.voiceName : undefined;
  const engineVoiceInput = isRecord(input.engineVoices) ? input.engineVoices : {};
  const customPreset = isCustomHttpPreset(customInput.preset) ? customInput.preset : "custom-json";
  const customVoiceInput = isRecord(customInput.voiceValues) ? customInput.voiceValues : null;
  const engineVoices = {
    "edge-online": typeof engineVoiceInput["edge-online"] === "string"
      ? engineVoiceInput["edge-online"]
      : engine === "edge-online" && legacyVoiceName !== undefined
        ? legacyVoiceName
        : DEFAULT_VOICE_SETTINGS.engineVoices["edge-online"],
    "windows-system": typeof engineVoiceInput["windows-system"] === "string"
      ? engineVoiceInput["windows-system"]
      : engine === "windows-system" && legacyVoiceName !== undefined
        ? legacyVoiceName
        : DEFAULT_VOICE_SETTINGS.engineVoices["windows-system"],
  };
  const voiceValues = Object.fromEntries(
    CUSTOM_HTTP_PRESETS.map((preset) => [
      preset,
      typeof customVoiceInput?.[preset] === "string"
        ? customVoiceInput[preset]
        : !customVoiceInput && engine === "custom-http" && preset === customPreset && legacyVoiceName !== undefined
          ? legacyVoiceName
          : DEFAULT_VOICE_SETTINGS.customHttp.voiceValues[preset],
    ]),
  ) as CustomHttpVoiceValues;
  const fishAudio: FishAudioSettings = {
    apiKey: typeof fishInput.apiKey === "string" ? fishInput.apiKey : DEFAULT_VOICE_SETTINGS.fishAudio.apiKey,
    baseUrl: typeof fishInput.baseUrl === "string" ? fishInput.baseUrl : DEFAULT_VOICE_SETTINGS.fishAudio.baseUrl,
    model: typeof fishInput.model === "string" ? fishInput.model : DEFAULT_VOICE_SETTINGS.fishAudio.model,
    referenceId: typeof fishInput.referenceId === "string" ? fishInput.referenceId : DEFAULT_VOICE_SETTINGS.fishAudio.referenceId,
    referenceVoices: Array.isArray(fishInput.referenceVoices)
      ? normalizeFishReferenceVoices(fishInput.referenceVoices)
      : DEFAULT_FISH_REFERENCE_VOICES.map((voice) => ({ ...voice })),
    format: fishInput.format === "wav" ? "wav" : "mp3",
  };
  const customHttp: CustomHttpVoiceSettings = {
    endpoint: typeof customInput.endpoint === "string" ? customInput.endpoint : DEFAULT_VOICE_SETTINGS.customHttp.endpoint,
    method: "POST",
    preset: customPreset,
    authType: customInput.authType === "bearer" || customInput.authType === "api-key" ? customInput.authType : "none",
    apiKey: typeof customInput.apiKey === "string" ? customInput.apiKey : DEFAULT_VOICE_SETTINGS.customHttp.apiKey,
    apiKeyHeader: typeof customInput.apiKeyHeader === "string" ? customInput.apiKeyHeader : DEFAULT_VOICE_SETTINGS.customHttp.apiKeyHeader,
    textField: typeof customInput.textField === "string" ? customInput.textField : DEFAULT_VOICE_SETTINGS.customHttp.textField,
    voiceField: typeof customInput.voiceField === "string" ? customInput.voiceField : DEFAULT_VOICE_SETTINGS.customHttp.voiceField,
    modelField: typeof customInput.modelField === "string" ? customInput.modelField : DEFAULT_VOICE_SETTINGS.customHttp.modelField,
    model: typeof customInput.model === "string" ? customInput.model : DEFAULT_VOICE_SETTINGS.customHttp.model,
    rateField: typeof customInput.rateField === "string" ? customInput.rateField : DEFAULT_VOICE_SETTINGS.customHttp.rateField,
    pitchField: typeof customInput.pitchField === "string" ? customInput.pitchField : DEFAULT_VOICE_SETTINGS.customHttp.pitchField,
    volumeField: typeof customInput.volumeField === "string" ? customInput.volumeField : DEFAULT_VOICE_SETTINGS.customHttp.volumeField,
    audioField: typeof customInput.audioField === "string" ? customInput.audioField : DEFAULT_VOICE_SETTINGS.customHttp.audioField,
    responseFormat: customInput.responseFormat === "json-base64" ? "json-base64" : "audio",
    fixedBody: isRecord(customInput.fixedBody) && !Array.isArray(customInput.fixedBody)
      ? normalizeJsonValue(customInput.fixedBody) as CustomHttpVoiceSettings["fixedBody"]
      : DEFAULT_VOICE_SETTINGS.customHttp.fixedBody,
    extraHeaders: isRecord(customInput.extraHeaders)
      ? Object.fromEntries(Object.entries(customInput.extraHeaders).filter(([, value]) => typeof value === "string")) as Record<string, string>
      : DEFAULT_VOICE_SETTINGS.customHttp.extraHeaders,
    voiceValues,
  };
  const outputScope = input.outputScope === "audience" || input.outputScope === "both" ? input.outputScope : "host";
  const queueMode: VoiceQueueMode = input.queueMode === "priority" ? "priority" : "original";
  const overflowPolicy: VoiceOverflowPolicy = input.overflowPolicy === "drop-newest" || input.overflowPolicy === "drop-normal-first"
    ? input.overflowPolicy
    : "drop-oldest";
  return {
    enabled: input.enabled === true,
    engine,
    engineVoices,
    fishAudio,
    customHttp,
    speechRate: Math.round(clamp(
      typeof input.speechRate === "number"
        ? input.speechRate
        : typeof input.rate === "number" ? 1 + input.rate / 100 : DEFAULT_VOICE_SETTINGS.speechRate,
      0.5,
      2,
      DEFAULT_VOICE_SETTINGS.speechRate,
    ) * 10) / 10,
    pitch: clamp(input.pitch, -50, 50, DEFAULT_VOICE_SETTINGS.pitch),
    playbackGain: Math.round(clamp(input.playbackGain, 1, 2, DEFAULT_VOICE_SETTINGS.playbackGain) * 100) / 100,
    volume: clamp(input.volume, 0, 1, DEFAULT_VOICE_SETTINGS.volume),
    eventIntervalSeconds: Math.round(clamp(input.eventIntervalSeconds, 0, 30, DEFAULT_VOICE_SETTINGS.eventIntervalSeconds) * 2) / 2,
    shortcutActions: normalizeEventShortcutActions(input.shortcutActions),
    personalBroadcast: normalizePersonalBroadcastSettings(input.personalBroadcast),
    userNicknames: normalizeUserNicknames(input.userNicknames),
    speakUsername: input.speakUsername !== false,
    pronunciationRules: normalizeVoicePronunciationRules(
      input.pronunciationRules === undefined ? DEFAULT_VOICE_PRONUNCIATION_RULES : input.pronunciationRules,
    ),
    blockBigEmoteDanmu: typeof input.blockBigEmoteDanmu === "boolean"
      ? input.blockBigEmoteDanmu
      : DEFAULT_VOICE_SETTINGS.blockBigEmoteDanmu,
    blockLowPriceSuperChat: input.blockLowPriceSuperChat === true,
    blockLowPriceGuard: input.blockLowPriceGuard === true,
    outputScope,
    monitorDeviceId: typeof input.monitorDeviceId === "string" ? input.monitorDeviceId : null,
    streamDeviceId: typeof input.streamDeviceId === "string" ? input.streamDeviceId : null,
    queueMode,
    queueLimit: Math.round(clamp(input.queueLimit, 10, 500, DEFAULT_VOICE_SETTINGS.queueLimit)),
    overflowPolicy,
    expiryEnabled: input.expiryEnabled === true,
    expirySeconds: Math.round(clamp(input.expirySeconds, 5, 600, DEFAULT_VOICE_SETTINGS.expirySeconds)),
    eventEnabled,
    priorities,
    templates: normalizeTemplates(input.templates),
    interactTemplates: normalizeInteractTemplates(input.interactTemplates),
    redPocketResultTemplate: normalizeTemplate(input.redPocketResultTemplate, DEFAULT_RED_POCKET_RESULT_TEMPLATE),
    anchorLotteryResultTemplate: normalizeTemplate(input.anchorLotteryResultTemplate, DEFAULT_ANCHOR_LOTTERY_RESULT_TEMPLATE),
  };
}

export function resetVoicePanelSettings(current: VoiceSettings): VoiceSettings {
  const defaults = normalizeVoiceSettings(DEFAULT_VOICE_SETTINGS);
  const existing = normalizeVoiceSettings(current);
  return normalizeVoiceSettings({
    ...defaults,
    personalBroadcast: existing.personalBroadcast,
    outputScope: existing.outputScope,
    monitorDeviceId: existing.monitorDeviceId,
    streamDeviceId: existing.streamDeviceId,
  });
}

export function resetPersonalBroadcastSettings(current: VoiceSettings): VoiceSettings {
  const existing = normalizeVoiceSettings(current);
  return normalizeVoiceSettings({
    ...existing,
    personalBroadcast: DEFAULT_PERSONAL_BROADCAST_SETTINGS,
  });
}

export function resetVoiceOutputSettings(current: VoiceSettings): VoiceSettings {
  const existing = normalizeVoiceSettings(current);
  const defaults = normalizeVoiceSettings(DEFAULT_VOICE_SETTINGS);
  return normalizeVoiceSettings({
    ...existing,
    outputScope: defaults.outputScope,
    monitorDeviceId: defaults.monitorDeviceId,
    streamDeviceId: defaults.streamDeviceId,
  });
}

export function resetEventInteractionSettings(current: VoiceSettings): VoiceSettings {
  const existing = normalizeVoiceSettings(current);
  const defaults = normalizeVoiceSettings(DEFAULT_VOICE_SETTINGS);
  return normalizeVoiceSettings({
    ...existing,
    userNicknames: defaults.userNicknames,
    speakUsername: defaults.speakUsername,
    shortcutActions: defaults.shortcutActions,
  });
}

export function resetVoiceSettingsSection(current: VoiceSettings): VoiceSettings {
  const existing = normalizeVoiceSettings(current);
  const defaults = normalizeVoiceSettings(DEFAULT_VOICE_SETTINGS);
  return normalizeVoiceSettings({
    ...existing,
    outputScope: defaults.outputScope,
    monitorDeviceId: defaults.monitorDeviceId,
    streamDeviceId: defaults.streamDeviceId,
    userNicknames: defaults.userNicknames,
    speakUsername: defaults.speakUsername,
    shortcutActions: defaults.shortcutActions,
  });
}

function applyVoiceSettingsChange(current: VoiceSettings, nextValue: unknown): VoiceSettings {
  const previous = normalizeVoiceSettings(current);
  const next = normalizeVoiceSettings(nextValue);
  const changedKeys = getChangedSettingPaths(previous, next);
  recordFeatureSettingChange({ featureId: "voice", changedKeys });
  const personalBroadcastKeys = changedKeys.filter((key) => key.startsWith("personalBroadcast."));
  recordFeatureSettingChange({ featureId: "personal-broadcast", changedKeys: personalBroadcastKeys });
  return next;
}

type VoiceSettingsStore = VoiceSettings & {
  setVoiceSettings: (value: Partial<VoiceSettings>) => void;
  resetVoiceSettings: () => void;
  resetVoicePanelSettings: () => void;
  resetPersonalBroadcastSettings: () => void;
  resetVoiceOutputSettings: () => void;
  resetEventInteractionSettings: () => void;
  resetVoiceSettingsSection: () => void;
};

export const useVoiceSettings = create<VoiceSettingsStore>()(
  persist(
    (set) => ({
      ...normalizeVoiceSettings(DEFAULT_VOICE_SETTINGS),
      setVoiceSettings: (value) => set((current) => applyVoiceSettingsChange(current, { ...current, ...value })),
      resetVoiceSettings: () => set((current) => applyVoiceSettingsChange(current, DEFAULT_VOICE_SETTINGS)),
      resetVoicePanelSettings: () => set((current) => applyVoiceSettingsChange(current, resetVoicePanelSettings(current))),
      resetPersonalBroadcastSettings: () => set((current) => applyVoiceSettingsChange(current, resetPersonalBroadcastSettings(current))),
      resetVoiceOutputSettings: () => set((current) => applyVoiceSettingsChange(current, resetVoiceOutputSettings(current))),
      resetEventInteractionSettings: () => set((current) => applyVoiceSettingsChange(current, resetEventInteractionSettings(current))),
      resetVoiceSettingsSection: () => set((current) => applyVoiceSettingsChange(current, resetVoiceSettingsSection(current))),
    }),
    {
      name: "danmu-voice-settings",
      partialize: (state) => {
        const { enabled: _enabled, ...persisted } = normalizeVoiceSettings(state);
        return persisted;
      },
      merge: (persisted, current) => ({
        ...current,
        ...normalizeVoiceSettings(persisted),
      }),
    },
  ),
);
