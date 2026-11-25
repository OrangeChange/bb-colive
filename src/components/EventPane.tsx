import { DanmakuComposerTrigger } from "./DanmakuComposer";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import type { DanmakuEvent, DanmakuUser } from "../protocol/types";
import type { RefObject } from "react";
import type { GiftEffectNotice } from "../windows/giftEffectBus";
import type { EventDisplayPreferences } from "../eventDisplaySettings";
import type { EventStyleSettings } from "../eventStyleSettings";
import { EventList } from "./EventList";
import { GiftEffectOverlay } from "./GiftEffectOverlay";
import type { FeedScrollSession, LiveScrollDirection } from "../events/feedScroll";
import type { EventMenuHandlers } from "./EventContextMenu";
import type { GiftEffectResource } from "../protocol/giftEffects";
import type { CompatibleEventRender } from "../compat/CompatibleEventRenderer.tsx";

interface EventPaneProps {
  title: string;
  canSendDanmaku?: boolean;
  count: number;
  summary?: string;
  roomGuardProfile?: import("../protocol/types.ts").RoomGuardProfile;
  events: DanmakuEvent[];
  visibleIndices: number[];
  viewKey: string;
  queryActive?: boolean;
  feedKey: string;
  feedSession: FeedScrollSession;
  emptyLabel: string;
  className?: string;
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
  giftEffectProcessedNotices?: WeakSet<GiftEffectNotice>;
  giftEffectRoomKey?: string | number | null;
  eventMenuHandlers?: Omit<EventMenuHandlers, "regionKey">;
  giftEffectResolver?: (event: DanmakuEvent) => GiftEffectResource | null;
  onPlayGiftEffect?: (event: DanmakuEvent) => void;
  compatibleEventRender?: CompatibleEventRender;
}

export function EventPane({
  title,
  canSendDanmaku = false,
  count,
  summary,
  events,
  visibleIndices,
  viewKey,
  queryActive,
  feedKey,
  feedSession,
  emptyLabel,
  className = "",
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
  giftEffectNotices,
  giftEffectProcessedNotices,
  giftEffectRoomKey = null,
  eventMenuHandlers,
  giftEffectResolver,
  onPlayGiftEffect,
  roomGuardProfile,
  compatibleEventRender,
}: EventPaneProps) {
  useUiLanguage();
  return (
    <section className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-bg ${className}`} aria-label={title}>
      <header className="flex h-9 shrink-0 items-center justify-between border-b border-line px-3">
        <div className="flex min-w-0 items-center gap-1"><h2 className="truncate ui-type-section-title font-semibold tracking-wide text-t2">{title}</h2>{canSendDanmaku && <DanmakuComposerTrigger />}</div>
        <span className="flex min-w-0 items-center gap-1.5 ui-type-meta text-t3">
          <span className="shrink-0">{uiText("eventPane.EventPane")}<span className="font-mono tabular-nums">{count}</span></span>
          {summary && (
            <>
              <span className="shrink-0 text-t3" aria-hidden="true">·</span>
              <span className="truncate text-t3" title={summary}>{summary}</span>
            </>
          )}
        </span>
      </header>
      <div className="relative min-h-0 flex-1">
        <EventList
          roomGuardProfile={roomGuardProfile}
          events={events}
          visibleIndices={visibleIndices}
          viewKey={viewKey}
          queryActive={queryActive}
          feedKey={feedKey}
          feedSession={feedSession}
          emptyLabel={emptyLabel}
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
          eventMenuHandlers={eventMenuHandlers}
          giftEffectResolver={giftEffectResolver}
          onPlayGiftEffect={onPlayGiftEffect}
          compatibleEventRender={compatibleEventRender}
        />
        {giftEffectNotices !== undefined && (
          <GiftEffectOverlay enabled={giftEffectEnabled} guardEnabled={guardEffectEnabled} notices={giftEffectNotices} processedNotices={giftEffectProcessedNotices} roomKey={giftEffectRoomKey} />
        )}
      </div>
    </section>
  );
}
