import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText } from "../i18n/index.ts";
import { Fragment, useRef, type RefObject } from "react";
import type { DanmakuEvent, DanmakuUser } from "../protocol/types";
import type { GiftEffectNotice } from "../windows/giftEffectBus";
import type { EventDisplayPreferences } from "../eventDisplaySettings";
import type { EventStyleSettings } from "../eventStyleSettings";
import type { EventProjection } from "../events/eventView";
import { buildRowsTemplate, clampBoundary, type SceneRegionId } from "./sceneLayout";
import { EventPane } from "./EventPane";
import { formatGiftSummary, summarizeGiftEvents } from "./eventSummary";
import type { FeedScrollSession, LiveScrollDirection } from "../events/feedScroll";
import type { EventMenuHandlers } from "./EventContextMenu";
import type { GiftEffectResource } from "../protocol/giftEffects";
import type { CompatibleEventRender } from "../compat/CompatibleEventRenderer.tsx";

const REGION_LABEL: Record<SceneRegionId, { title: string; emptyLabel: string }> = localized(() => ({
  danmu: { title: uiText("partitionColumn.REGION_LABEL.danmu.title"), emptyLabel: uiText("partitionColumn.REGION_LABEL.danmu.emptyLabel") },
  interact: { title: uiText("partitionColumn.REGION_LABEL.interact.title"), emptyLabel: uiText("partitionColumn.REGION_LABEL.interact.emptyLabel") },
  gift: { title: uiText("partitionColumn.REGION_LABEL.gift.title"), emptyLabel: uiText("partitionColumn.REGION_LABEL.gift.emptyLabel") },
  superChat: { title: uiText("partitionColumn.REGION_LABEL.superChat.title"), emptyLabel: uiText("partitionColumn.REGION_LABEL.superChat.emptyLabel") },
  guard: { title: uiText("partitionColumn.REGION_LABEL.guard.title"), emptyLabel: uiText("partitionColumn.REGION_LABEL.guard.emptyLabel") },
}));

interface PartitionColumnProps {
  regions: SceneRegionId[];
  roomGuardProfile?: import("../protocol/types.ts").RoomGuardProfile;
  events: DanmakuEvent[];
  projections: Partial<Record<SceneRegionId, EventProjection>>;
  queryActive?: boolean;
  boundaries: number[];
  onBoundaryChange: (index: number, value: number) => void;
  sideLabel: string;
  getFeedSession: (scope: string, visibleCount: number) => {
    feedKey: string;
    feedSession: FeedScrollSession;
  };
  liveLayout?: boolean;
  onUserFilter?: (user: DanmakuUser) => void;
  displayPreferences?: EventDisplayPreferences;
  eventStyleSettings?: EventStyleSettings;
  eventFontSize?: number;
  displayScale?: number;
  enableBilibiliVideoLinks?: boolean;
  eventAreaRef?: RefObject<HTMLElement | null>;
  scrollDirection?: LiveScrollDirection;
  contentAlignment?: "top" | "bottom";
  giftEffectEnabled?: boolean;
  guardEffectEnabled?: boolean;
  giftEffectNotices?: readonly GiftEffectNotice[];
  giftEffectRoomKey?: string | number | null;
  eventMenuHandlers?: Omit<EventMenuHandlers, "regionKey">;
  giftEffectResolver?: (event: DanmakuEvent) => GiftEffectResource | null;
  onPlayGiftEffect?: (event: DanmakuEvent) => void;
  compatibleEventRender?: CompatibleEventRender;
}

function HorizontalSeparator({
  value,
  onChange,
  label,
  columnRef,
  previousBoundary,
  nextBoundary,
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  columnRef: RefObject<HTMLDivElement | null>;
  previousBoundary: number;
  nextBoundary: number;
}) {
  useUiLanguage();
  const updateFromPointer = (clientY: number) => {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    onChange(clampBoundary((clientY - rect.top) / rect.height, 0.18, previousBoundary, nextBoundary));
  };

  return (
    <div
      role="separator"
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemin={18}
      aria-valuemax={82}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        updateFromPointer(event.clientY);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event.clientY);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          event.preventDefault();
          onChange(clampBoundary(value + (event.key === "ArrowUp" ? -0.02 : 0.02), 0.18, previousBoundary, nextBoundary));
        } else if (event.key === "Home") {
          event.preventDefault();
          onChange(clampBoundary(0.18, 0.18, previousBoundary, nextBoundary));
        } else if (event.key === "End") {
          event.preventDefault();
          onChange(clampBoundary(0.82, 0.18, previousBoundary, nextBoundary));
        }
      }}
      className="group relative z-10 h-1 cursor-row-resize bg-line/40 transition-colors hover:bg-accent/60 focus-visible:bg-accent focus-visible:outline-none"
    >
      <span className="pointer-events-none absolute inset-x-1/3 -top-1.5 h-4 rounded-full bg-transparent group-hover:bg-accent/10" />
    </div>
  );
}

export function PartitionColumn({
  regions,
  events,
  projections,
  queryActive,
  boundaries,
  onBoundaryChange,
  sideLabel,
  getFeedSession,
  liveLayout = false,
  onUserFilter,
  displayPreferences,
  eventStyleSettings,
  eventFontSize,
  displayScale,
  enableBilibiliVideoLinks = false,
  eventAreaRef,
  scrollDirection = "bottom",
  contentAlignment,
  giftEffectEnabled = false,
  guardEffectEnabled = false,
  giftEffectNotices = [],
  giftEffectRoomKey = null,
  eventMenuHandlers,
  giftEffectResolver,
  onPlayGiftEffect,
  roomGuardProfile,
  compatibleEventRender,
}: PartitionColumnProps) {
  useUiLanguage();
  const columnRef = useRef<HTMLDivElement>(null);
  if (regions.length === 0) return null;

  return (
    <div
      ref={columnRef}
      className="grid min-h-0 min-w-0 overflow-hidden"
      style={{ gridTemplateRows: buildRowsTemplate(regions.length, boundaries) }}
      aria-label={sideLabel}
    >
      {regions.map((region, index) => {
        const label = REGION_LABEL[region];
        const projection = projections[region];
        const summary = ["gift", "superChat", "guard"].includes(region) && projection ? formatGiftSummary(summarizeGiftEvents(events, projection.indices)) : undefined;
        const feed = projection ? getFeedSession(`partition|${region}`, projection.indices.length) : null;
        return (
          <Fragment key={region}>
            {projection && (
              <EventPane
                key={feed?.feedKey}
                title={label.title}
                count={projection.indices.length}
                summary={summary}
                events={events}
                visibleIndices={projection.indices}
                viewKey={projection.scopeKey}
                queryActive={queryActive}
                feedKey={feed!.feedKey}
                feedSession={feed!.feedSession}
                emptyLabel={label.emptyLabel}
                liveLayout={liveLayout}
                onUserFilter={onUserFilter}
                displayPreferences={displayPreferences}
                eventStyleSettings={eventStyleSettings}
                eventFontSize={eventFontSize}
                displayScale={displayScale}
                enableBilibiliVideoLinks={enableBilibiliVideoLinks}
                eventAreaRef={eventAreaRef}
                scrollDirection={scrollDirection}
                contentAlignment={contentAlignment}
                giftEffectEnabled={region === "gift" && giftEffectEnabled}
                guardEffectEnabled={region === "guard" && guardEffectEnabled}
                giftEffectNotices={region === "gift" ? giftEffectNotices.filter(notice => !notice.event.guard) : region === "guard" ? giftEffectNotices.filter(notice => !!notice.event.guard) : undefined}
                giftEffectRoomKey={region === "gift" || region === "guard" ? giftEffectRoomKey : null}
                eventMenuHandlers={eventMenuHandlers}
                giftEffectResolver={region === "gift" || region === "guard" ? giftEffectResolver : undefined}
                onPlayGiftEffect={region === "gift" || region === "guard" ? onPlayGiftEffect : undefined}
                roomGuardProfile={roomGuardProfile}
                compatibleEventRender={compatibleEventRender}
              />
            )}
            {index < regions.length - 1 && (
              <HorizontalSeparator
                value={boundaries[index] ?? (index + 1) / regions.length}
                onChange={(value) => onBoundaryChange(index, value)}
                label={uiText("partitionColumn.label", { title: label.title, title2: REGION_LABEL[regions[index + 1]].title })}
                columnRef={columnRef}
                previousBoundary={boundaries[index - 1] ?? 0}
                nextBoundary={boundaries[index + 1] ?? 1}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
