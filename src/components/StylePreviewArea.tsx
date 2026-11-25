import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { resolveThemeEventVisibility } from "../themes/themeEventVisibility.ts";
import { projectNativePreviewActivities } from "../preview/nativePreviewActivities";
import { createNativeEventVisibilityPredicate } from "../events/outputEventPolicy.ts";
import type { NativeThemeSettings } from "../themes/nativeComponentAppearance.ts";
import { DEFAULT_STYLE_PREVIEW_POLICY, selectStylePreviewEvents } from "../preview/stylePreviewPolicy.ts";
import { getFeedStackAlignment } from "../events/feedScroll.ts";
import { useLocalFeedReading } from "../events/useLocalFeedReading.ts";
import { useRef, useState, type RefObject, type WheelEvent } from "react";
import { EventRow } from "./EventRow";
import { EventRowSlot } from "./EventRowSlot";
import { useEventAreaStyle } from "./EventAreaStyle";
import { resolveStylePreviewContext, type StylePreviewContext, type StylePreviewMode, type StylePreviewSettings } from "./stylePreviewContext";
import type { EventStyleSettings } from "../eventStyleSettings";
import type { DanmakuEvent } from "../protocol/types";
import { StickyEventCard } from "./StickyEventCard";
import { type StickyEventSettings } from "../windows/stickyEventModel";

export function StylePreviewArea({ context, mode, events, eventStyleSettings, areaRef, showStickyPreview = false, stickySettings, followLatest: _followLatest = false, readingResetKey, maskUsername = false, ...input }: StylePreviewSettings & {
  context: StylePreviewContext;
  mode: StylePreviewMode;
  events: DanmakuEvent[];
  eventStyleSettings: EventStyleSettings;
  areaRef?: RefObject<HTMLDivElement | null>;
  showStickyPreview?: boolean;
  stickySettings?: StickyEventSettings;
  followLatest?: boolean;
  readingResetKey?: string | number;
  maskUsername?: boolean;
}) {
  useUiLanguage();
  const resolved = resolveStylePreviewContext(context, mode, input);
  const area = useEventAreaStyle({ settings: eventStyleSettings, layout: resolved.layout, fontSize: resolved.fontSize,
    padding: resolved.displayPreferences.eventPadding, spacing: resolved.displayPreferences.eventSpacing });
  const direction = context === "review" ? "bottom" : input.scrollDirection ?? "bottom";
  const alignment = context === "review" ? "top" : input.contentAlignment;
  const previewNow = input.previewNow ?? Math.max(0, ...events.map(event => event.ts)) + 1;
  const policy = { ...(input.previewPolicy ?? DEFAULT_STYLE_PREVIEW_POLICY), ...(stickySettings ? { stickySettings } : {}), displayPreferences: { ...(input.previewPolicy?.displayPreferences ?? input.displayPreferences), onlyGuardEntry: resolved.displayPreferences.onlyGuardEntry } };
  const themeAllows = createNativeEventVisibilityPredicate(resolveThemeEventVisibility((eventStyleSettings as NativeThemeSettings).eventVisibility, context === 'obs' ? 'obs' : context === 'live' || context === 'review' ? 'live' : 'windows'));
  const retired = useRef({ epoch: "", ids: new Set<string>() });
  const epoch = `${input.previewMotion}:${readingResetKey}`;
  if (retired.current.epoch !== epoch) retired.current = { epoch, ids: new Set() };
  const activityEvents = projectNativePreviewActivities(events, previewNow, input.previewMotion !== "simulation");
  const selected = selectStylePreviewEvents(activityEvents.filter(event => resolved.accepts(event) && (mode === "all" || themeAllows(event))), policy, { target: context === "obs" ? "obs" : context === "live" || context === "review" ? "live" : "windows", displayAll: mode === "all", mode: input.previewMotion ?? "static", now: previewNow }, retired.current.ids);
  retired.current.ids = selected.retiredMainIds;
  const mainIds = input.previewMainEventIds ? new Set(input.previewMainEventIds) : undefined;
  const filtered = selected.events.filter(event => !mainIds || mainIds.has(event.id));
  const visible = direction === "top" ? filtered.slice().reverse() : filtered;
  const now = previewNow;
  const stickyCards = showStickyPreview ? selected.sticky : [];
  const stickyPosition = stickySettings?.position === "bottom" ? "bottom" : "top";
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null);
  const readingDirection = input.previewMotion === "simulation" ? direction : alignment ?? "top";
  useLocalFeedReading(scrollNode, readingDirection, true, readingResetKey);
  const handleStickyWheel = (event: WheelEvent<HTMLDivElement>) => {
    const target = event.currentTarget;
    if (target.scrollWidth <= target.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
    event.preventDefault();
    target.scrollLeft += event.deltaY;
  };
  const sticky = showStickyPreview && <div className="sticky-area native-preview-sticky-scroll" onWheel={handleStickyWheel} data-style-api="1" data-event-style-scope={area.scope} data-position={stickyPosition} aria-label={uiText("stylePreviewArea.aria_label")}>{stickyCards.map(card => <StickyEventCard key={card.event.reactKey ?? card.event.id} card={card} now={now} display={resolved.displayPreferences} eventStyleSettings={eventStyleSettings} />)}</div>;
  return <div ref={areaRef} data-style-api="1" data-native-theme-surface data-native-canvas data-preview-context={context} data-preview-mode={mode}
    data-event-style-scope={area.scope} className={`native-theme-preview preview ${context === "review" ? "" : "theme-surface"} ${resolved.areaClass} style-editor-preview-list native-preview-regions`}>
    {area.style}
    {stickyPosition === "top" && sticky}
    <div ref={setScrollNode} data-native-list className={`event-list native-preview-message-scroll feed-virtual-viewport feed-virtual-viewport-${getFeedStackAlignment(direction, alignment)}`}>
      {visible.length === 0 && <p role="status" className="ui-type-control text-t3">{uiText("stylePreviewArea.StylePreviewArea")}</p>}
      {visible.map((event, index) => <EventRowSlot key={event.reactKey ?? event.id} className="event-row-slot"
        data-event-id={event.reactKey ?? event.id} showEventSpacing={index < visible.length - 1}>
        <EventRow maskUsername={maskUsername} ev={event} activityNow={input.previewMotion === "simulation" ? undefined : previewNow} liveLayout={resolved.layout !== "review"} reviewLayout={resolved.layout === "review"}
          allowWinnerExpansion showTime={resolved.layout === "review" || (eventStyleSettings as NativeThemeSettings).display?.showTimestamp === true} displayPreferences={resolved.displayPreferences} eventStyleSettings={eventStyleSettings}
          eventFontSize={resolved.fontSize} />
      </EventRowSlot>)}
    </div>
    {stickyPosition === "bottom" && sticky}
  </div>;
}
