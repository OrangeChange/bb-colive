import { formatSystemReminderText } from '../components/systemReminder.ts';
import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import {
  DEFAULT_VOICE_TEMPLATES,
  normalizeLegacyInteractVoiceTemplate,
  normalizeLegacyVoiceTemplate,
  type TemplateSegment,
  type VoiceTemplate,
  type VoiceTemplateField,
  type VoiceSettings,
} from "./voiceTypes.ts";
import { formatChineseSpeechNumber } from "./chineseNumber.ts";
import { applyVoicePronunciation, stripEmojiForSpeech } from "./voicePronunciation.ts";
import { resolveUserDisplayName, type UserNicknames } from "../userNicknames.ts";

const GUARD_NAMES: Record<number, string> = {
  1: "舰长",
  2: "提督",
  3: "总督",
};

function formatAmount(value: number | undefined): string | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  return `${value}元`;
}

function getGiftTotalRmb(event: DanmakuEvent): number | undefined {
  const gift = event.gift;
  if (!gift) return undefined;
  const count = typeof gift.count === "number" && Number.isFinite(gift.count) ? gift.count : 1;
  if (gift.blindGiftName) {
    if (gift.blindHitPriceRmb != null) return gift.blindHitPriceRmb * count;
    return undefined;
  }
  if (gift.totalRmb != null) return gift.totalRmb;
  if (gift.priceRmb != null) return gift.priceRmb * count;
  return undefined;
}

function getCompanionDays(event: DanmakuEvent): string | undefined {
  const match = event.text?.match(/陪伴主播(?:的第)?\s*(\d+)\s*天/u);
  return match?.[1] == null ? undefined : `${formatChineseSpeechNumber(match[1])}天`;
}

function getGuardDuration(event: DanmakuEvent): string | undefined {
  const guard = event.guard;
  if (!guard || !Number.isFinite(guard.count) || guard.count <= 0) return undefined;
  const isDayBased = guard.unit?.includes("天") === true;
  if (!isDayBased && guard.count <= 1) return undefined;
  return `${formatChineseSpeechNumber(guard.count)}${isDayBased ? "天" : "个月"}`;
}

function normalizeGiftName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/\s*×(?:\s*\d+)?\s*$/u, "").trim();
  return normalized || undefined;
}

function isGiftQuantitySeparator(template: VoiceTemplate, index: number): boolean {
  const segment = template[index];
  const previous = template[index - 1];
  const next = template[index + 1];
  return segment?.kind === "text"
    && segment.value.trim() === "×"
    && previous?.kind === "field"
    && previous.field === "giftName"
    && next?.kind === "field"
    && next.field === "quantity";
}

function getFieldValue(field: VoiceTemplateField, event: DanmakuEvent, nicknames: UserNicknames = {}, speakUsername = true): string | undefined {
  switch (field) {
    case "username":
      if (!speakUsername) return undefined;
      return resolveUserDisplayName(event.user, nicknames) || event.lottery?.winners?.[0]?.uname;
    case "content":
      if (event.msgType === MsgType.RoomLock) return formatSystemReminderText(event);
      return event.text || event.sc?.message || event.lottery?.danmu || event.pocket?.danmu;
    case "giftName":
      return normalizeGiftName(
        (event.msgType === MsgType.AnchorLotStart || event.msgType === MsgType.AnchorLotAward)
          ? event.lottery?.awardName
          : event.gift?.name || event.lottery?.giftName,
      );
    case "blindGiftName":
      return normalizeGiftName(event.gift?.blindGiftName);
    case "quantity":
      if (event.gift?.count != null) return event.gift.count > 1 ? `${formatChineseSpeechNumber(event.gift.count)}个` : undefined;
      if (event.guard?.count != null) return formatChineseSpeechNumber(event.guard.count);
      if (event.lottery?.awardNum != null) return formatChineseSpeechNumber(event.lottery.awardNum);
      return undefined;
    case "amount":
      if (event.msgType === MsgType.RedPocketStart) return formatAmount(event.lottery?.totalPrice == null ? undefined : event.lottery.totalPrice / 1000);
      if (event.msgType === MsgType.Gift) return formatAmount(getGiftTotalRmb(event));
      return formatAmount(event.sc?.price ?? event.guard?.priceRmb);
    case "guardName":
      return event.guard?.level == null ? undefined : GUARD_NAMES[event.guard.level];
    case "months":
    case "duration":
      return getGuardDuration(event);
    case "companionDays":
      return getCompanionDays(event);
    case "emoteName":
      if (event.emoticon && event.text && event.text !== "1") return event.text;
      return event.emoticon ? "大表情" : undefined;
  }
}

export function getDefaultVoiceTemplate(category: keyof typeof DEFAULT_VOICE_TEMPLATES): VoiceTemplate {
  return DEFAULT_VOICE_TEMPLATES[category].map((segment) => ({ ...segment })) as TemplateSegment[];
}

type VoiceTemplateSettings = Pick<VoiceSettings, "templates" | "interactTemplates" | "redPocketResultTemplate" | "anchorLotteryResultTemplate" | "pronunciationRules"> & {
  userNicknames?: UserNicknames;
  speakUsername?: boolean;
};

export function getVoiceTemplateForEvent(event: DanmakuEvent, settings: VoiceTemplateSettings): VoiceTemplate {
  if (event.msgType === MsgType.Interact && event.interactKind) {
    return normalizeLegacyInteractVoiceTemplate(settings.interactTemplates[event.interactKind] ?? settings.templates.interact, event.interactKind);
  }
  if (event.msgType === MsgType.RedPocketWinner) return settings.redPocketResultTemplate;
  if (event.msgType === MsgType.AnchorLotAward) return settings.anchorLotteryResultTemplate;
  if (event.msgType === MsgType.Gift && event.gift?.blindGiftName) return settings.templates.blindBox;
  if (event.msgType === MsgType.Gift) return settings.templates.gift;
  if (event.msgType === MsgType.RedPocketStart) return normalizeLegacyVoiceTemplate(settings.templates.redPocket, "redPocket");
  if (event.msgType === MsgType.AnchorLotStart) return normalizeLegacyVoiceTemplate(settings.templates.anchorLottery, "anchorLottery");
  if (event.msgType === MsgType.SuperChat) return normalizeLegacyVoiceTemplate(settings.templates.superChat, "superChat");
  if (event.msgType === MsgType.GuardBuy) return settings.templates.guard;
  if (event.msgType === MsgType.Danmu) return settings.templates.danmu;
  return settings.templates.system;
}

export function renderVoiceEventTemplate(event: DanmakuEvent, settings: VoiceTemplateSettings): { text: string; omittedFields: VoiceTemplateField[] } {
  return renderVoiceTemplate(getVoiceTemplateForEvent(event, settings), event, settings.pronunciationRules, settings.userNicknames, settings.speakUsername);
}

export function renderVoiceTemplate(
  template: VoiceTemplate,
  event: DanmakuEvent,
  pronunciationRules: VoiceSettings["pronunciationRules"] = [],
  userNicknames: UserNicknames = {},
  speakUsername = true,
): { text: string; omittedFields: VoiceTemplateField[] } {
  const omittedFields: VoiceTemplateField[] = [];
  const parts: string[] = [];
  const normalizedTemplate = normalizeLegacyVoiceTemplate(template);
  const amount = getFieldValue("amount", event, userNicknames, speakUsername);
  const companionDays = getFieldValue("companionDays", event, userNicknames, speakUsername);
  for (let index = 0; index < normalizedTemplate.length; index += 1) {
    const segment = normalizedTemplate[index];
    if (isGiftQuantitySeparator(normalizedTemplate, index)) continue;
    if (segment.kind === "text") {
      if (segment.value === "，价值" && !amount) continue;
      if (event.msgType === MsgType.GuardBuy && segment.value === "，已陪伴主播" && !companionDays) continue;
      parts.push(event.msgType === MsgType.Interact ? applyVoicePronunciation(segment.value, pronunciationRules) : segment.value);
      continue;
    }
    const value = getFieldValue(segment.field, event, userNicknames, speakUsername);
    if (value) {
      const shouldCorrect = segment.field === "username" || segment.field === "content";
      parts.push(shouldCorrect ? applyVoicePronunciation(value, pronunciationRules) : value);
    }
    else if (!omittedFields.includes(segment.field)) omittedFields.push(segment.field);
  }
  const text = parts.join("").trim();
  const speechText = event.msgType === MsgType.Gift || event.msgType === MsgType.GuardBuy
    ? text.replace(/×/gu, "")
    : text;
  return { text: stripEmojiForSpeech(speechText).trim(), omittedFields };
}
