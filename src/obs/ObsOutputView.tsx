import { scopeThemeCss } from "../themes/themeCssScope.ts";
import { useCompatibleFeedNode, useLocalFeedReading, type LocalFeedReadingState } from "../events/useLocalFeedReading.ts";
import { AnimatePresence } from "motion/react";
import { EventRowSlot } from "../components/EventRowSlot.tsx";
import { useRef, useState } from "react";
import { getFeedStackAlignment, scrollSticky } from "../events/feedScroll.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import type { ObsThemeSnapshot } from "./nativeObsTheme.ts";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type {
  StickyEventCard as StickyCard,
  StickyEventSettings,
} from "../windows/stickyEventModel.ts";
import { EventRow } from "../components/EventRow.tsx";
import { StickyEventCard } from "../components/StickyEventCard.tsx";
import { createEventAreaConfigCss } from "../eventAreaStyleConfig.ts";
import {
  CompatibleEventRenderer,
  compatibleExternalHtmlOf,
  compatibleListSurfaceOf,
  planCompatibleListPresentation,
  type CompatibleEventRender,
  type CompatibleExternalHtmlDescriptor,
} from "../compat/CompatibleEventRenderer.tsx";
import { CompatibleListSurface as BlivechatSourceSurface } from "../compat/CompatibleListSurface.tsx";
import { BlivechatExternalHtmlTarget } from "../compat/blivechat/BlivechatExternalHtmlTarget.tsx";
import { resolveEventDisplayPreferences, getEventAnimationExitDuration } from "../eventDisplaySettings.ts";
const noop = () => {};
export function ObsOutputView({
  roomGuardProfile,
  events,
  removingEventIds = new Set<string>(),
  userNicknames,
  snapshot,
  stickyCards,
  stickyEvents,
  scrollDirection,
  contentAlignment,
  softwareDisplay,
  compatibleMainRender,
  compatibleStickyRender,
  pendingExternalHtml,
  onCandidateReady = noop,
  onCandidateFailure,
  onActiveFailure,
  now = Date.now(),
}: {
  removingEventIds?: ReadonlySet<string>;
  userNicknames?: Record<string, string>;
  roomGuardProfile?: import("../protocol/types.ts").RoomGuardProfile;
  events: DanmakuEvent[];
  snapshot: ObsThemeSnapshot;
  stickyCards: StickyCard[];
  stickyEvents: StickyEventSettings;
  scrollDirection: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
  softwareDisplay: EventDisplayPreferences;
  compatibleMainRender?: CompatibleEventRender;
  compatibleStickyRender?: CompatibleEventRender;
  pendingExternalHtml?: CompatibleExternalHtmlDescriptor;
  onCandidateReady?: () => void;
  onCandidateFailure?: (message: string) => void;
  onActiveFailure?: (message: string) => void;
  now?: number;
}) {
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null);
  const reading = useRef<LocalFeedReadingState | null>(null);
  const native = snapshot.mode === undefined || snapshot.mode === "native";
  const sourceScrollNode = useCompatibleFeedNode(listNode, !native);
  useLocalFeedReading(listNode, scrollDirection, native, undefined, undefined, reading);
  useLocalFeedReading(sourceScrollNode, scrollDirection, !native, undefined, events.map(event => event.reactKey ?? event.id), reading);
  const effectiveDisplay = resolveEventDisplayPreferences(
    "displayPreferences" in snapshot ? snapshot.displayPreferences : snapshot.display,
    softwareDisplay,
  );

  if (
    snapshot.mode === "blivechat" ||
    snapshot.mode === "blivechat-open" ||
    snapshot.mode === "laplace"
  ) {
    const cards = stickyCards;
    const listSurface = compatibleListSurfaceOf(compatibleMainRender);
    const sourcePlan = planCompatibleListPresentation(
      compatibleMainRender,
      events,
      stickyEvents.obsEnabled,
    );
    const sticky = sourcePlan.renderSoftwareSticky && (
      <div
          className="sticky-area"
          onWheel={scrollSticky}
          data-style-api="1"
          data-event-style-scope="obs"
          data-position={stickyEvents.position}
        >
          <AnimatePresence>{cards.map((card) => (
            <StickyEventCard
              key={card.event.reactKey ?? card.event.id}
              card={card}
              now={now}
              display={effectiveDisplay}
              eventStyleSettings={snapshot.settings}
              compatibleEventRender={compatibleStickyRender}
            />
          ))}</AnimatePresence>
      </div>
    );
    const rows = listSurface ? (
      <BlivechatSourceSurface
        roomGuardProfile={roomGuardProfile} userNicknames={userNicknames}
        descriptor={listSurface}
        initialScrollState={reading.current?.direction === scrollDirection ? { followingLatest: reading.current.following, scrollTop: reading.current.scrollTop, anchorId: reading.current.anchorId, anchorOffset: reading.current.offset } : undefined}
        events={scrollDirection === "top" ? [...events].reverse() : events}
        removingEventIds={removingEventIds}
        scale={snapshot.displayScale}
        tickerEnabled={sourcePlan.sourceTickerEnabled}
        stickyItems={cards.map((card) => ({
          event: card.event,
          startedAt: card.startedAt,
          expiresAt: card.expiresAt,
        }))}
        tickerPosition={stickyEvents.position}
        direction={scrollDirection} contentAlignment={contentAlignment}
        animation={{
          preset: softwareDisplay.eventAnimationPreset,
          durationMs: getEventAnimationExitDuration(
            softwareDisplay.eventAnimationPreset,
            softwareDisplay.eventAnimationDurationMs,
          ),
        }}

      />
    ) : (
      events.map((event) => (
        <CompatibleEventRenderer
          key={event.reactKey ?? event.id}
          event={event}
          render={compatibleMainRender}
          fallback={null}
        />
      ))
    );
    const activeExternalHtml = compatibleExternalHtmlOf(compatibleMainRender);
    return (
      <div
        data-style-api="1"
        className="theme-surface theme-target-obs obs-native-root event-area obs"
        data-event-style-scope="obs"
        style={{
          zoom: listSurface ? 1 : snapshot.displayScale,
        }}
      >
        {stickyEvents.position === "top" && sticky}
        <div ref={setListNode} className={`event-list feed-event-list-align-${getFeedStackAlignment(scrollDirection, contentAlignment)}`} data-direction={scrollDirection} data-content-alignment={contentAlignment}>
          {activeExternalHtml || pendingExternalHtml ? (
            <BlivechatExternalHtmlTarget
              active={activeExternalHtml}
              candidate={pendingExternalHtml}
              events={events}
              fallback={activeExternalHtml ? null : rows}
              onCandidateReady={onCandidateReady}
              onCandidateFailure={onCandidateFailure}
              onActiveFailure={onActiveFailure}
            />
          ) : (
            rows
          )}
        </div>
        {stickyEvents.position === "bottom" && sticky}
      </div>
    );
  }
  const areaCss = createEventAreaConfigCss("obs", {
    settings: snapshot.settings,
    layout: "live",
    fontSize: snapshot.eventFontSize,
    padding: effectiveDisplay.eventPadding,
    spacing: effectiveDisplay.eventSpacing,
  });
  const sticky = (
    <div
        className="sticky-area"
        onWheel={scrollSticky}
        data-style-api="1"
        data-event-style-scope="obs"
        data-position={stickyEvents.position}
      >
        <AnimatePresence>{stickyCards.map((card) => (
          <StickyEventCard
            key={card.event.reactKey ?? card.event.id}
            card={card}
            now={now}
            display={effectiveDisplay}
            eventStyleSettings={snapshot.settings}
            compatibleEventRender={compatibleStickyRender}
          />
        ))}</AnimatePresence>
    </div>
  );
  const nativeRows = (
    scrollDirection === "top" ? [...events].reverse() : events
  ).map((event, index) => (
    <EventRowSlot
      key={event.reactKey ?? event.id}
      className={`event-row-slot ${removingEventIds.has(event.reactKey ?? event.id) ? "display-window-event-removing" : ""}`}
      data-event-id={event.reactKey ?? event.id}
      showEventSpacing={index < events.length - 1}
    >
      <CompatibleEventRenderer
        event={event}
        render={compatibleMainRender}
        fallback={
          <EventRow
            userNicknames={userNicknames}
            ev={event}
            liveLayout
            showTime={snapshot.display.showTimestamp}
            maskUsername={snapshot.display.maskUsername}
            eventStyleSettings={snapshot.settings}
            displayPreferences={effectiveDisplay}
            eventFontSize={snapshot.eventFontSize}
          />
        }
      />
    </EventRowSlot>
  ));
  return (
    <div
      data-style-api="1"
        className="theme-surface theme-target-obs obs-native-root event-area obs"
      data-event-style-scope="obs"
      style={{
        zoom: snapshot.displayScale,
      }}
    >
      <style>{areaCss}</style>
      <style>{scopeThemeCss(snapshot.css, ".theme-surface")}</style>
      {stickyEvents.position === "top" && sticky}
      <div ref={setListNode} className={`event-list feed-event-list-align-${getFeedStackAlignment(scrollDirection, contentAlignment)}`} data-direction={scrollDirection} data-content-alignment={contentAlignment}>
        {pendingExternalHtml ? (
          <BlivechatExternalHtmlTarget
            candidate={pendingExternalHtml}
            events={events}
            fallback={<>{nativeRows}</>}
            onCandidateReady={onCandidateReady}
            onCandidateFailure={onCandidateFailure}
            onActiveFailure={onActiveFailure}
          />
        ) : (
          <>{nativeRows}</>
        )}
      </div>
      {stickyEvents.position === "bottom" && sticky}
    </div>
  );
}
