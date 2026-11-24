import type { VoicePronunciationRule } from "./voiceTypes.ts";

const ASCII_WORD_CHARACTER = /[A-Za-z0-9_]/;
const PROTECTED_SPAN = /(?:https?:\/\/|www\.)[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu;
const EMOJI_ATOM = String.raw`(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?|[#*0-9]\uFE0F?\u20E3)(?:\p{Emoji_Modifier})?`;
const EMOJI_SEQUENCE = new RegExp(`(?:${EMOJI_ATOM}(?:\\u200D${EMOJI_ATOM})*|\\p{Regional_Indicator}{2})`, "gu");

export const DEFAULT_VOICE_PRONUNCIATION_RULES: VoicePronunciationRule[] = [
  { id: "remove-plus", source: "+", replacement: "", enabled: true },
];

function isAsciiWordCharacter(value: string | undefined): boolean {
  return value != null && ASCII_WORD_CHARACTER.test(value);
}

function hasAsciiWordCharacter(value: string): boolean {
  return ASCII_WORD_CHARACTER.test(value);
}

function matchesAt(text: string, index: number, rule: VoicePronunciationRule): boolean {
  const source = rule.source.trim();
  if (!source || !rule.enabled) return false;
  const candidate = text.slice(index, index + source.length);
  const matches = hasAsciiWordCharacter(source)
    ? candidate.toLowerCase() === source.toLowerCase()
    : candidate === source;
  if (!matches) return false;
  if (!hasAsciiWordCharacter(source)) return true;
  return !isAsciiWordCharacter(text[index - 1]) && !isAsciiWordCharacter(text[index + source.length]);
}

function replaceSegment(text: string, rules: readonly VoicePronunciationRule[]): string {
  const orderedRules = rules
    .map((rule, index) => ({ rule, index }))
    .filter(({ rule }) => rule.enabled && rule.source.trim() && typeof rule.replacement === "string")
    .sort((left, right) => right.rule.source.trim().length - left.rule.source.trim().length || left.index - right.index)
    .map(({ rule }) => ({ ...rule, source: rule.source.trim() }));
  if (orderedRules.length === 0 || text.length === 0) return text;

  let result = "";
  let index = 0;
  while (index < text.length) {
    const rule = orderedRules.find((candidate) => matchesAt(text, index, candidate));
    if (!rule) {
      result += text[index];
      index += 1;
      continue;
    }
    result += rule.replacement;
    index += rule.source.length;
  }
  return result;
}

/**
 * 对单个可播报字段做一次性发音修正。
 * URL 和邮箱保持原样，替换结果不会再次参与匹配，避免规则循环。
 */
export function applyVoicePronunciation(text: string, rules: readonly VoicePronunciationRule[]): string {
  if (!text || rules.length === 0) return text;
  let result = "";
  let cursor = 0;
  for (const match of text.matchAll(PROTECTED_SPAN)) {
    const start = match.index ?? 0;
    result += replaceSegment(text.slice(cursor, start), rules);
    result += match[0];
    cursor = start + match[0].length;
  }
  return result + replaceSegment(text.slice(cursor), rules);
}

/** 删除送入语音引擎前的普通 Unicode Emoji，保留界面和原始日志中的正文。 */
export function stripEmojiForSpeech(text: string): string {
  return text.replace(EMOJI_SEQUENCE, "");
}

export function normalizeVoicePronunciationRules(value: unknown): VoicePronunciationRule[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const input = item as Record<string, unknown>;
    if (typeof input.source !== "string" || typeof input.replacement !== "string") return [];
    const source = input.source.trim();
    const replacement = input.replacement.trim();
    if (!source) return [];
    return [{
      id: typeof input.id === "string" && input.id.trim() ? input.id : `pronunciation-${index + 1}`,
      source,
      replacement,
      enabled: input.enabled !== false,
    }];
  });
}
