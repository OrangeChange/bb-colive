import { resolveThemeEventVisibility } from "../themes/themeEventVisibility.ts";
import { appendNativePreviewEvent } from "./nativePreviewStream.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import type { NativeThemeSettings } from "../themes/nativeComponentAppearance.ts";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import type { StylePreviewContext, StylePreviewMode } from "../components/stylePreviewContext.ts";
import type { PreviewEventKind } from "../components/stylePreviewEvents.ts";
import type { StylePreviewMotion } from "../components/StylePreviewToolbar.tsx";
import { resolveStylePreviewContext } from "../components/stylePreviewContext.ts";
import { eligibleNativePreviewCandidates, nativePreviewCandidates, nextNativePreviewEvent, type NativePreviewRepetition } from "./stylePreviewGenerator.ts";
import { admitsStylePreviewEvent, scopeStylePreviewSample, selectStylePreviewEvents, type StylePreviewPolicySettings } from "./stylePreviewPolicy.ts";
import { createNativeEventVisibilityPredicate } from "../events/outputEventPolicy.ts";
import { useStylePreviewPlayback } from "./useStylePreviewPlayback.ts";

export function useNativePreviewEvents({document,settings,baseFontSize,events,previewContext,previewDisplayMode,previewKind,previewMotion,previewActive,previewPlaying,previewSpeed,previewPreferences,previewPolicy,restart}: {
 document: ThemeDocument; settings: NativeThemeSettings; baseFontSize: number; events: DanmakuEvent[];
 previewContext: StylePreviewContext; previewDisplayMode: StylePreviewMode; previewKind: PreviewEventKind; previewMotion: StylePreviewMotion;
 previewActive: boolean; previewPlaying: boolean; previewSpeed: number; previewPreferences: EventDisplayPreferences;
 previewPolicy: StylePreviewPolicySettings; restart: number;
}) {
  const repetitions = useRef<NativePreviewRepetition[]>([]);
  const [dynamicEvents, setDynamicEvents] = useState<DanmakuEvent[]>([]);
  const previewEvents = useMemo(() => (previewMotion === "dynamic" ? dynamicEvents : events)
    .map(event => scopeStylePreviewSample(event, previewPolicy.targetRoomId)),
    [events, dynamicEvents, previewMotion, previewPolicy.targetRoomId]);
  const generationTarget = previewContext === "obs" ? "obs" : previewContext === "live" || previewContext === "review" ? "live" : "windows";
  const retiredMain = useRef({ epoch: "", ids: new Set<string>() });
  const generationScope = JSON.stringify([document.themeId, previewKind, previewContext, previewDisplayMode, settings.eventVisibility,
    previewPolicy.previewEventKinds, previewPolicy.filters, previewPolicy.windowFilters, previewPolicy.audienceFilters, previewPolicy.giftThreshold,
    previewPolicy.giftThresholdMode, previewPolicy.targetRoomId, previewPolicy.mergeSameDanmu, previewPolicy.sameDanmuWindowSeconds, previewPreferences.onlyGuardEntry,
    previewPreferences.showAutoDanmaku, previewPreferences.showPhoneNotVerified, restart]);
  const candidateMaterials = useMemo(() => nativePreviewCandidates(previewKind), [previewKind]);
  const nativeCandidates = candidateMaterials.map(event => scopeStylePreviewSample(event, previewPolicy.targetRoomId)).filter(event => {
    const resolved = resolveStylePreviewContext(previewContext, previewDisplayMode, { displayPreferences: previewPreferences, eventFontSize: baseFontSize, windowEventFontSize: baseFontSize });
    return resolved.accepts(event) && (previewDisplayMode === "all" || createNativeEventVisibilityPredicate(resolveThemeEventVisibility(settings.eventVisibility, generationTarget))(event))
      && admitsStylePreviewEvent(event, previewPolicy, { target: generationTarget, displayAll: previewDisplayMode === "all", mode: "simulation", now: Date.now() }, !(event.gift && !event.gift.blindGiftName && previewPolicy.giftThresholdMode === "cumulative"));
  });
  useStylePreviewPlayback({
    enabled: previewActive && previewMotion === "dynamic", playing: previewPlaying && eligibleNativePreviewCandidates(nativeCandidates, dynamicEvents).length > 0,
    speed: previewSpeed, scope: generationScope,
    reset: () => { repetitions.current = []; setDynamicEvents([]); },
    next: (sequence, session) => {
      const event = nextNativePreviewEvent({ candidates: nativeCandidates, events: dynamicEvents, repetitions: repetitions.current, random: Math.random, now: Date.now, sequence, session });
      if (event) setDynamicEvents(previous => appendNativePreviewEvent(previous, event, { target: generationTarget, mergeSameDanmu: previewPolicy.mergeSameDanmu, sameDanmuWindowSeconds: previewPolicy.sameDanmuWindowSeconds, expiry: previewPolicy.expiry }, retiredMain.current.ids));
    },
  });
  const [expiryNow, setExpiryNow] = useState(0);
  const previewEpoch = `${previewMotion}:${generationScope}`;
  if (retiredMain.current.epoch !== previewEpoch) retiredMain.current = { epoch: previewEpoch, ids: new Set() };
  const previewNow = previewMotion === "dynamic"
    ? Math.max(Date.now(), expiryNow)
    : Math.max(0, ...previewEvents.map(event => event.ts)) + 1;
  const previewResolved = resolveStylePreviewContext(previewContext, previewDisplayMode, { displayPreferences: previewPreferences, eventFontSize: baseFontSize, windowEventFontSize: baseFontSize });
  const themeAllows = createNativeEventVisibilityPredicate(resolveThemeEventVisibility(settings.eventVisibility, generationTarget));
  const selectionResult = selectStylePreviewEvents(previewEvents.filter(event => previewResolved.accepts(event) && (previewDisplayMode === "all" || themeAllows(event))), {
    ...previewPolicy, displayPreferences: { ...previewPolicy.displayPreferences, onlyGuardEntry: previewResolved.displayPreferences.onlyGuardEntry },
  }, { target: previewContext === "obs" ? "obs" : previewContext === "live" || previewContext === "review" ? "live" : "windows", displayAll: previewDisplayMode === "all", mode: previewMotion === "dynamic" ? "simulation" : previewMotion, now: previewNow }, retiredMain.current.ids);
  retiredMain.current.ids = selectionResult.retiredMainIds;
  const previewDeadlines = JSON.stringify([
    ...selectionResult.sticky.map(card => card.expiresAt),
    ...(previewContext !== "live" && previewPolicy.expiry.enabled
      ? selectionResult.events.map(event => (event.firstOccurredAt ?? event.ts) + previewPolicy.expiry.seconds * 1000)
      : []),
  ]);
  useEffect(() => {
    if (previewMotion !== "dynamic") return;
    const deadlines = (JSON.parse(previewDeadlines) as number[]).filter(time => time > previewNow);
    if (!deadlines.length) return;
    const timer = window.setTimeout(() => setExpiryNow(Date.now()), Math.max(1, Math.min(...deadlines) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [previewMotion, previewNow, previewDeadlines]);
  const previewMainKey = JSON.stringify(selectionResult.events.map(event => event.id));
  const previewMainEventIds = useMemo<string[]>(() => JSON.parse(previewMainKey), [previewMainKey]);
  return { previewEvents, previewNow, previewMainEventIds };
}
