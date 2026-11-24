import type { EventShortcutAction as VoiceShortcutAction } from "../events/eventInteractionPolicy.ts";
import type { DanmakuEvent, InteractKind } from "../protocol/types.ts";
import type { FishReferenceVoice } from "./fishAudioModels.ts";
import type { PersonalBroadcastSettings } from "./personalBroadcastTypes.ts";

export const VOICE_EVENT_CATEGORIES = [
  "danmu",
  "interact",
  "gift",
  "blindBox",
  "redPocket",
  "anchorLottery",
  "superChat",
  "guard",
  "system",
] as const;

export type VoiceEventCategory = (typeof VOICE_EVENT_CATEGORIES)[number];
export const VOICE_INTERACT_TEMPLATE_KINDS = [
  "entry",
  "follow",
  "share",
  "specialFollow",
  "mutualFollow",
  "like",
] as const satisfies readonly InteractKind[];
export type VoiceInteractTemplateKind = (typeof VOICE_INTERACT_TEMPLATE_KINDS)[number];
export type VoiceEngine = "edge-online" | "windows-system" | "fish-audio" | "custom-http";
export type VoiceOutputScope = "host" | "audience" | "both";
export type VoiceQueueMode = "original" | "priority";
export type VoiceOverflowPolicy = "drop-oldest" | "drop-newest" | "drop-normal-first";
export type VoicePriority = "high" | "medium" | "normal";
export type VoiceHttpAuthType = "none" | "bearer" | "api-key";
export type VoiceHttpResponseFormat = "audio" | "json-base64";
export type CustomHttpPreset = "openai-compatible" | "gpt-sovits" | "index-tts" | "custom-json";
export { EVENT_SHORTCUT_ACTIONS as VOICE_SHORTCUT_ACTIONS, MAX_EVENT_SHORTCUT_ACTIONS as MAX_VOICE_SHORTCUT_ACTIONS } from '../events/eventInteractionPolicy.ts';
export type { EventShortcutAction as VoiceShortcutAction } from '../events/eventInteractionPolicy.ts';
export type EngineVoiceValues = {
  "edge-online": string;
  "windows-system": string;
};
export type CustomHttpVoiceValues = Record<CustomHttpPreset, string>;

export interface FishAudioSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
  referenceId: string;
  referenceVoices: FishReferenceVoice[];
  format: "mp3" | "wav";
}

export type VoiceJsonObject = { [key: string]: VoiceJsonValue };
export type VoiceJsonValue = string | number | boolean | null | VoiceJsonValue[] | VoiceJsonObject;

export interface CustomHttpVoiceSettings {
  endpoint: string;
  method: "POST";
  preset: CustomHttpPreset;
  authType: VoiceHttpAuthType;
  apiKey: string;
  apiKeyHeader: string;
  textField: string;
  voiceField: string;
  modelField: string;
  model: string;
  rateField: string;
  pitchField: string;
  volumeField: string;
  audioField: string;
  responseFormat: VoiceHttpResponseFormat;
  fixedBody: Record<string, VoiceJsonValue>;
  extraHeaders: Record<string, string>;
  voiceValues: CustomHttpVoiceValues;
}

export const VOICE_TEMPLATE_FIELDS = [
  "username",
  "content",
  "giftName",
  "blindGiftName",
  "quantity",
  "amount",
  "guardName",
  "duration",
  "companionDays",
  "emoteName",
] as const;

/** `months` 仅用于读取早期持久化模板，当前编辑器和默认模板统一使用 `duration`。 */
export type VoiceTemplateField = (typeof VOICE_TEMPLATE_FIELDS)[number] | "months";

export type TemplateSegment =
  | { kind: "text"; value: string }
  | { kind: "field"; field: VoiceTemplateField };

export type VoiceTemplate = TemplateSegment[];
export type VoiceTemplateMap = Record<VoiceEventCategory, VoiceTemplate>;
export type VoiceInteractTemplateMap = Record<VoiceInteractTemplateKind, VoiceTemplate>;
export type VoiceEventEnabled = Record<VoiceEventCategory, boolean>;
export type VoicePriorityMap = Record<VoiceEventCategory, VoicePriority>;

export interface VoicePronunciationRule {
  id: string;
  source: string;
  replacement: string;
  enabled: boolean;
}

export interface VoiceSettings {
  enabled: boolean;
  engine: VoiceEngine;
  engineVoices: EngineVoiceValues;
  fishAudio: FishAudioSettings;
  customHttp: CustomHttpVoiceSettings;
  /** 播报速度倍数；1 为基准速度。 */
  speechRate: number;
  pitch: number;
  /** 解码后、输出设备播放前的增益倍数；1 为原始音量，允许 1 到 2 倍。 */
  playbackGain: number;
  volume: number;
  /** 两条语音事件之间的等待秒数。 */
  eventIntervalSeconds: number;
  /** 现场事件行右侧可显示的快捷功能，最多三项。 */
  shortcutActions: VoiceShortcutAction[];
  personalBroadcast: PersonalBroadcastSettings;
  /** 按 UID 保存的现场昵称；仅替换展示和语音中的用户名，不修改原始事件。 */
  userNicknames: Record<string, string>;
  /** 是否朗读模板中的用户名字段；开启时优先使用自定义昵称。 */
  speakUsername: boolean;
  pronunciationRules: VoicePronunciationRule[];
  /** 是否跳过独立大表情弹幕。 */
  blockBigEmoteDanmu: boolean;
  /** 是否跳过价格恰为 2 元的醒目留言。 */
  blockLowPriceSuperChat: boolean;
  /** 是否跳过当前可识别的按天大航海（大航海红包奖励）。 */
  blockLowPriceGuard: boolean;
  outputScope: VoiceOutputScope;
  monitorDeviceId: string | null;
  streamDeviceId: string | null;
  queueMode: VoiceQueueMode;
  queueLimit: number;
  overflowPolicy: VoiceOverflowPolicy;
  expiryEnabled: boolean;
  expirySeconds: number;
  eventEnabled: VoiceEventEnabled;
  priorities: VoicePriorityMap;
  templates: VoiceTemplateMap;
  interactTemplates: VoiceInteractTemplateMap;
  redPocketResultTemplate: VoiceTemplate;
  anchorLotteryResultTemplate: VoiceTemplate;
}

export interface VoiceSynthesisRequest {
  text: string;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  requestId?: string;
  eventId?: string;
}

export interface VoiceInfo {
  name: string;
  label: string;
  language?: string;
  local?: boolean;
  group?: string;
  multilingual?: boolean;
}

export interface VoiceQueueEntry {
  id: string;
  event: DanmakuEvent;
  text: string;
  enqueuedAt: number;
  priority: VoicePriority;
  /** 手动点选的事件只播放 TTS，不触发 TTS 前的个性播报提示音。 */
  skipBeforePlayback?: boolean;
}

export type VoiceRuntimeStatus = "idle" | "playing" | "paused" | "error";

export interface VoiceRuntimeSnapshot {
  status: VoiceRuntimeStatus;
  accepting: boolean;
  current: VoiceQueueEntry | null;
  readonly pending: readonly VoiceQueueEntry[];
  pendingCount: number;
  discardedCount: number;
  failedCount: number;
  error: string | null;
}

const text = (value: string): TemplateSegment => ({ kind: "text", value });
const field = (value: VoiceTemplateField): TemplateSegment => ({ kind: "field", field: value });

export const DEFAULT_VOICE_TEMPLATES: VoiceTemplateMap = {
  danmu: [field("username"), text("说："), field("content")],
  interact: [field("username"), field("content")],
  gift: [text("感谢"), field("username"), text("赠送"), field("quantity"), field("giftName"), text("，价值"), field("amount")],
  blindBox: [field("username"), text("赠送的"), field("quantity"), field("blindGiftName"), text("，开出"), field("giftName"), text("，价值"), field("amount")],
  redPocket: [field("username"), text("发送了"), field("amount"), text("的红包")],
  anchorLottery: [text("主播开启了"), text("天选"), text("，"), text("奖品是"), field("giftName")],
  superChat: [field("username"), text("发送"), field("amount"), text("醒目留言："), field("content")],
  guard: [text("感谢"), field("username"), text("开通"), field("duration"), field("guardName"), text("，已陪伴主播"), field("companionDays")],
  system: [field("content")],
};

export const DEFAULT_INTERACT_VOICE_TEXTS: Record<VoiceInteractTemplateKind, string> = {
  entry: "进入直播间",
  follow: "关注了主播",
  share: "分享了直播间",
  specialFollow: "特别关注了主播",
  mutualFollow: "互相关注了",
  like: "为主播点赞了",
};

export const DEFAULT_INTERACT_VOICE_TEMPLATES: VoiceInteractTemplateMap = Object.fromEntries(
  VOICE_INTERACT_TEMPLATE_KINDS.map((kind) => [kind, [field("username"), text(DEFAULT_INTERACT_VOICE_TEXTS[kind])]]),
) as VoiceInteractTemplateMap;

export const DEFAULT_RED_POCKET_RESULT_TEMPLATE: VoiceTemplate = [text("红包开奖了")];
export const DEFAULT_ANCHOR_LOTTERY_RESULT_TEMPLATE: VoiceTemplate = [text("天选开奖了")];

const LEGACY_GIFT_TEMPLATE: VoiceTemplate = [
  text("感谢"), field("username"), text("赠送"), field("giftName"), text("×"), field("quantity"),
];

const LEGACY_GUARD_TEMPLATE: VoiceTemplate = [
  text("感谢"), field("username"), text("开通"), field("guardName"), text("，"), field("months"), text("个月"),
];

const LEGACY_GUARD_TEMPLATE_WITH_DURATION: VoiceTemplate = [
  text("感谢"), field("username"), text("开通"), field("guardName"), text("，"), field("duration"), text("个月"),
];

const LEGACY_LOTTERY_TEMPLATE: VoiceTemplate = [
  text("直播活动："), field("content"),
];

const LEGACY_LOTTERY_CONTENT_TEMPLATE: VoiceTemplate = [field("content")];

const LEGACY_ANCHOR_LOTTERY_TEMPLATE: VoiceTemplate = [
  text("主播开启了天选，奖品是"), field("giftName"),
];

const LEGACY_INTERACT_TEMPLATE: VoiceTemplate = [field("username"), field("content")];

const LEGACY_SUPER_CHAT_TEMPLATE: VoiceTemplate = [
  field("username"), text("发送醒目留言："), field("content"),
];

const LEGACY_GUARD_TEMPLATE_WITHOUT_COMPANION: VoiceTemplate = [
  text("感谢"), field("username"), text("开通"), field("duration"), field("guardName"),
];

const LEGACY_GUARD_TEMPLATE_WITH_SEPARATE_COMPANION_UNIT: VoiceTemplate = [
  text("感谢"), field("username"), text("开通"), field("duration"), field("guardName"),
  text("，已陪伴主播"), field("companionDays"), text("天"),
];

function templateEquals(left: VoiceTemplate, right: VoiceTemplate): boolean {
  if (left.length !== right.length) return false;
  return left.every((segment, index) => {
    const expected = right[index];
    if (segment.kind === "text" && expected.kind === "text") return segment.value === expected.value;
    if (segment.kind === "field" && expected.kind === "field") return segment.field === expected.field;
    return false;
  });
}

function cloneTemplate(template: VoiceTemplate): VoiceTemplate {
  return template.map((segment) => ({ ...segment }));
}

/** 将早期内置模板迁移到当前播报顺序，保留用户自定义的其他模板。 */
export function normalizeLegacyVoiceTemplate(template: VoiceTemplate, category?: VoiceEventCategory): VoiceTemplate {
  if (templateEquals(template, LEGACY_GIFT_TEMPLATE)) return cloneTemplate(DEFAULT_VOICE_TEMPLATES.gift);
  if (
    templateEquals(template, LEGACY_GUARD_TEMPLATE)
    || templateEquals(template, LEGACY_GUARD_TEMPLATE_WITH_DURATION)
    || templateEquals(template, LEGACY_GUARD_TEMPLATE_WITHOUT_COMPANION)
    || templateEquals(template, LEGACY_GUARD_TEMPLATE_WITH_SEPARATE_COMPANION_UNIT)
  ) {
    return cloneTemplate(DEFAULT_VOICE_TEMPLATES.guard);
  }
  if ((category === "redPocket" || category === "anchorLottery")
    && (templateEquals(template, LEGACY_LOTTERY_TEMPLATE) || templateEquals(template, LEGACY_LOTTERY_CONTENT_TEMPLATE))) {
    return cloneTemplate(DEFAULT_VOICE_TEMPLATES[category]);
  }
  if (category === "anchorLottery" && templateEquals(template, LEGACY_ANCHOR_LOTTERY_TEMPLATE)) {
    return cloneTemplate(DEFAULT_VOICE_TEMPLATES.anchorLottery);
  }
  if (category === "superChat" && templateEquals(template, LEGACY_SUPER_CHAT_TEMPLATE)) {
    return cloneTemplate(DEFAULT_VOICE_TEMPLATES.superChat);
  }
  return template;
}

/** 将早期六类互动的“用户名 + 内容字段”迁移为对应的真实互动原文。 */
export function normalizeLegacyInteractVoiceTemplate(template: VoiceTemplate, kind: VoiceInteractTemplateKind): VoiceTemplate {
  if (templateEquals(template, LEGACY_INTERACT_TEMPLATE)) return cloneTemplate(DEFAULT_INTERACT_VOICE_TEMPLATES[kind]);
  return template;
}

export const DEFAULT_VOICE_PRIORITIES: VoicePriorityMap = {
  danmu: "normal",
  interact: "normal",
  gift: "high",
  blindBox: "high",
  redPocket: "medium",
  anchorLottery: "medium",
  superChat: "high",
  guard: "high",
  system: "medium",
};
