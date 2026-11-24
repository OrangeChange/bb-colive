import { baseRelativeNativeLength, fixedNativeLength, nativeVisualTargetKey, normalizeNativeVisualModel, type NativeThemeSettings, type NativeVisualLayer, type NativeVisualModelInput, type NativeVisualProperty, type NativeVisualScheme, type NativeVisualTarget, type NativeVisualValue } from "./nativeComponentAppearance.ts";

const CODE_DEFAULTS: Partial<Record<NativeVisualProperty, NativeVisualValue>> = {
  visible: true, lineHeight: 1.25, paddingX: 0, paddingY: 0,
  marginX: 0, marginY: 0, gap: 0, borderWidth: 0, borderRadius: 0,
};

const MICRO_TEXT_PARTS = new Set(["medal", "medalName", "medalLevel", "rank", "anchorBadge", "adminBadge"]);
const CONTROL_TEXT_PARTS = new Set([
  "quantityPrefix", "quantityNumber", "quantityUnit", "honorHeading", "honorSummary", "systemTitle", "systemDetail", "timestamp", "price", "priceUnit", "priceValue", "repeatCount", "blindGiftCount", "giftCount", "giftPrice", "giftProfit", "giftProfitPositive", "giftProfitNegative", "blindGiftName", "giftSourcePrice",
  "guardDurationPrefix", "guardDurationNumber", "guardDurationUnit", "guardDaysPrefix", "guardDaysNumber", "guardDaysUnit", "guardDuration", "guardDays",
  "lotteryRequirementPrefix", "lotteryRequirementText", "redpocketAwardsPrefix", "redpocketCount", "winnerListCount", "activityStatus", "lotteryCount", "lotteryWait", "redpocketAwards", "redpocketWait", "winnerCount", "deletedStatus",
]);

export function nativeVisualCodeDefault(target: NativeVisualTarget, property: NativeVisualProperty, settings: NativeThemeSettings, baseCss = ""): NativeVisualValue | undefined {
  const { part } = target;
  const card = baseCss.includes("--card-surface");
  const bubble = baseCss.includes("--bubble-surface");
  const lifecycleEvent = ["liveStatus", "liveStart", "liveEnd"].includes(target.event);
  if ((!baseCss.trim() || baseCss.includes("--size-main")) && !card && !bubble) {
    const compact = ["system", "liveStatus", "liveStart", "liveEnd", "warning", "userMute", "roomMute", "admin", "roomChange", "interaction", "enter", "follow", "share", "like", "specialFollow", "mutualFollow"].includes(target.event);
    if (property === "fontSize") {
      if (MICRO_TEXT_PARTS.has(part) || ["repeatCount", "deletedStatus"].includes(part)) return baseRelativeNativeLength(.75);
      const secondary = ["systemTitle", "systemDetail", "timestamp", "activityStatus", "winnerListCount", "lotteryWait", "redpocketWait", "lotteryCommand", "lotteryCommandPrefix", "lotteryCommandText", "lotteryRequirement", "lotteryRequirementPrefix", "lotteryRequirementText", "lotteryGiftPrefix", "lotteryGiftName", "redpocketCommand", "redpocketCommandPrefix", "redpocketCommandText", "guardDays", "guardDaysPrefix", "guardDaysNumber", "guardDaysUnit", "blindGiftName", "blindGiftCount", "giftSourcePrice", "giftProfit", "giftProfitPositive", "giftProfitNegative", "translation"];
      return baseRelativeNativeLength(secondary.includes(part) || (compact && ["username", "message", "action"].includes(part)) ? .875 : 1);
    }
    if (property === "fontWeight") {
      if (part === "action" && ["lottery", "lotteryStart", "lotteryResult", "redpocketResult"].includes(target.event)) return 700;
      if (part === "systemTitle") return ["liveStatus", "liveStart", "liveEnd", "warning"].includes(target.event) ? 700 : settings.fontWeight;
      if (part === "timestamp") return lifecycleEvent ? 700 : settings.fontWeight;
      const strong = ["username", "giftName", "guardName", "lotteryName", "redpocketName", "price", "priceUnit", "priceValue", "giftPrice", "quantityPrefix", "quantityNumber", "quantityUnit", "giftCount", "lotteryCount", "winnerCount", "redpocketAwards", "redpocketAwardsPrefix", "redpocketCount", "honorMilestone", "guardHighlight", "giftProfit", "giftProfitPositive", "giftProfitNegative"];
      return strong.includes(part) || part.startsWith("guardDuration") ? 700 : settings.fontWeight;
    }
  }
  if (property === "fontWeight" && (card || bubble)) {
    if (["quantityPrefix", "quantityNumber", "quantityUnit", "priceUnit", "priceValue", "price", "giftPrice", "giftProfit", "giftProfitPositive", "giftProfitNegative"].includes(part)) {
      return 700;
    }
    if (bubble && ["username", "giftName", "guardName"].includes(part)) return 700;
    if (bubble && target.event === "warning" && ["systemTitle", "systemDetail"].includes(part)) return 700;
    if (["timestamp", "systemTitle"].includes(part) && lifecycleEvent) return 700;
    if (card && part === "action" && ["lottery", "lotteryStart", "lotteryResult", "redpocketResult"].includes(target.event)) return 700;
  }
  if (bubble && property === "fontSize") {
    if (part === "translation") return baseRelativeNativeLength(.875);
    if (part === "timestamp" && !lifecycleEvent) return baseRelativeNativeLength(.75);
  }
  if (card && property === "lineHeight") {
    if (["message", "translation", "systemTitle", "systemDetail"].includes(part)) return 1.4;
    if (part === "timestamp" && lifecycleEvent) return 1.4;
    if (part === "honorMilestone") return 1;
    if (["row", "card", "header", "username", "giftName", "guardName", "price", "priceValue", "priceUnit", "activityStatus", "quantityNumber", "quantityUnit", "quantityPrefix", "giftCount", "guardDuration"].includes(part)) return 1.5;
  }
  if (card && property === "fontSize") {
    if (part === "translation") return baseRelativeNativeLength(.875);
    if (part === "timestamp" && lifecycleEvent) return baseRelativeNativeLength(.75);
    if (part === "honorMilestone") return baseRelativeNativeLength(2);
    if (["activityStatus", "winnerListCount"].includes(part)) return baseRelativeNativeLength(.75);
    if (["lotteryRequirement", "lotteryRequirementPrefix", "lotteryRequirementText", "lotteryGiftName", "lotteryCommand", "lotteryCommandPrefix", "lotteryCommandText", "redpocketCommand", "redpocketCommandPrefix", "redpocketCommandText", "guardDays", "guardDaysPrefix", "guardDaysNumber", "guardDaysUnit", "giftCount"].includes(part)) return baseRelativeNativeLength(1);
    if (["giftProfit", "giftProfitPositive", "giftProfitNegative"].includes(part)) return baseRelativeNativeLength(1);
    if (["price", "priceUnit", "priceValue", "giftPrice"].includes(part)) return baseRelativeNativeLength(1.25);
    if (["quantityPrefix", "quantityNumber", "quantityUnit"].includes(part) || part.startsWith("guardDuration")) return baseRelativeNativeLength(1);
  }
  if (property === "fontWeight" && (part.startsWith("guardDuration") || (["guard", "guardBuy"].includes(target.event) && ["quantityPrefix", "quantityNumber", "quantityUnit"].includes(part)))) return 700;
  if(property === "fontWeight") return ["username","giftName","guardName","priceValue","quantityNumber","honorMilestone","guardHighlight"].includes(part) ? 700 : 500;
  if (property === "fontFamily") return settings.fontFamily;
  if (property === "lineHeight" && part === "activityStatus") return bubble ? 1.25 : 10 / 7;
  if (property === "fontSize" && part === "priceUnit") return baseRelativeNativeLength(.875);
  if (property === "fontSize" && part === "priceValue") return baseRelativeNativeLength(.875);
  if (property === "fontSize" && ["giftCount", "lotteryCount"].includes(part)) return baseRelativeNativeLength(.875);
  if (property === "fontSize" && part === "activityStatus") return baseRelativeNativeLength(.875);
  if (property === "fontSize") return baseRelativeNativeLength(MICRO_TEXT_PARTS.has(part) ? .75 : CONTROL_TEXT_PARTS.has(part) ? .875 : 1);
  if (property === "width" || property === "height") {
    if(part === "winnerAvatar") return baseRelativeNativeLength(1.25);
    if (part === "bigEmote") return baseRelativeNativeLength(2.5);
    if (part === "bannerEmote") return baseRelativeNativeLength(property === "width" ? 15 : 1.25);
    if (part === "avatar" || part === "avatarWrap") return baseRelativeNativeLength(settings.avatarSize / 16);
    if (part === "avatarFrame") return baseRelativeNativeLength(settings.avatarSize / 16 * 1.2);
    if (part === "giftImage") return baseRelativeNativeLength(card ? 2 : 1.5);
    if (part === "eventIcon" && ["redpocketResult", "lotteryResult"].includes(target.event)) return baseRelativeNativeLength(card ? 1.5 : 1);
    if (part === "eventIcon" && ["guard", "guardBuy"].includes(target.event)) return baseRelativeNativeLength(card ? 2 : bubble ? 1 : 1.5);
    if (part === "eventIcon") return baseRelativeNativeLength(1);
    if (part === "blindGiftImage" || part === "inlineEmote") return baseRelativeNativeLength(1.25);
    if (part === "guardBadge" || part === "honor") return baseRelativeNativeLength(property === "width" ? 2.25 : 1);
  }
  if (property === "borderWidth" && part === "card") return fixedNativeLength(0);
  if (property === "borderRadius" && part === "card") return baseRelativeNativeLength(.5);
  if (property === "gap" && part === "card") return baseRelativeNativeLength(.5);
  if (property === "paddingX" || property === "paddingY") {
    if (part === "card") return baseRelativeNativeLength(property === "paddingX" ? .75 : .5);
    if (part === "event" || part === "row") return baseRelativeNativeLength(property === "paddingX" ? .75 : .5);
    if (part === "medal" && property === "paddingX") return baseRelativeNativeLength(.25);
  }
  if (property === "gap") {
    if (part === "event" || part === "row") return baseRelativeNativeLength(.5);
    if (part === "medal") return baseRelativeNativeLength(.25);
  }
  if (property === "borderRadius" && part === "rank") return baseRelativeNativeLength(.25);
  return CODE_DEFAULTS[property];
}

export interface ResolvedNativeVisualProperty {
  source: "theme" | "custom" | "code";
  value?: NativeVisualValue;
  inheritedFrom?: string;
}

export function projectNativeVisualModel(model: NativeVisualModelInput | undefined, scheme: NativeVisualScheme): NativeVisualLayer {
  const normalized = normalizeNativeVisualModel(model);
  if (scheme === "common") return structuredClone(normalized.common);
  const projected = structuredClone(normalized.common);
  for (const [key, properties] of Object.entries(normalized[scheme])) projected[key] = { ...(projected[key] ?? {}), ...properties };
  return projected;
}

export function resolveNativeVisualProperty(model: NativeVisualModelInput, target: NativeVisualTarget, property: NativeVisualProperty, scheme: NativeVisualScheme = "common", codeDefault?: NativeVisualValue): ResolvedNativeVisualProperty {
  const projected = projectNativeVisualModel(model, scheme);
  const candidates = [
    nativeVisualTargetKey(target),
    nativeVisualTargetKey({ ...target, identity: "all" }),
    nativeVisualTargetKey({ ...target, event: "all" }),
    nativeVisualTargetKey({ ...target, event: "all", identity: "all" }),
  ].filter((key, index, values) => values.indexOf(key) === index);
  for (const key of candidates) {
    const setting = projected[key]?.[property];
    if (setting && setting.source !== "inherit") return { source: setting.source, value: setting.value, ...(key === candidates[0] ? {} : { inheritedFrom: key }) };
  }
  return { source: "code", value: codeDefault ?? CODE_DEFAULTS[property] };
}
