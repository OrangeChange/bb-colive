import { resolveOutputEventNeeds } from "../events/outputEventPolicy.ts";
import { createActivityLifecycle, type ActivityFacts } from '../events/activityLifecycle.ts';
import { assignEventRenderKey } from "../events/eventIdentity.ts";
import { isStatisticsEvent, isHiddenEvent } from "../events/eventView.ts";
import { MsgType, type DanmakuEvent } from "../protocol/types.ts";
import type { EventWindowPreferences } from "../windows/eventWindowPreferences.ts";
import {
  createGiftWindowControlState,
  applyGiftWindowControl,
} from "../windows/giftWindowModel.ts";
import {
  createStickyProjection,
  selectStickyEvents,
} from "../windows/stickyEventModel.ts";
import { pruneExpiredEvents } from "../windows/windowEventExpiry.ts";
import { mergeSameDanmuEvent } from "../windows/danmuMerge.ts";
import { COMBO_WINDOW_MS, mergeGiftInto } from "../events/giftMerge.ts";
export function createObsOutputState(
  roomId: number,
  initial: EventWindowPreferences,
  theme: { allowsMain?: (event: DanmakuEvent) => boolean; allowsSticky?: (event: DanmakuEvent) => boolean; nativeMain?: boolean } = {},
  onEffect?: (event: DanmakuEvent) => void,
) {
  let settings = initial;
  let rows: (DanmakuEvent & { receivedAt: number })[] = [];
  const immediateRemovalKeys = new Set<string>();
  const animatedRemovalKeys = new Set<string>();
  let pendingGifts: (DanmakuEvent & { receivedAt: number })[] = [];
  let effectRows: DanmakuEvent[] = [];
  const effectCombos = new Set<string>();
  const controls = createGiftWindowControlState();
  const activities = createActivityLifecycle();
  const sticky = createStickyProjection();
  const seen = new Set<string>();
  const seenComboSources = new Set<string>();
  const renderKeys = new Set<string>();
  let renderKeySequence = 0;
  const stickySettings = () => ({
    ...settings.stickyEvents,
    enabled: settings.stickyEvents.obsEnabled,
  });
  sticky.configure(stickySettings(), Date.now());
  const needs = (event: DanmakuEvent) => resolveOutputEventNeeds(event, { preferences: settings, roomId, ...theme });
  const sharedVisible = (event: DanmakuEvent) => needs(event).sticky;
  const visible = (event: DanmakuEvent) => needs(event).main;
  const trimRows = (now: number) => {
    const retained = pruneExpiredEvents(rows, now, settings.eventExpiry).slice(-settings.capacity);
    const keys = new Set(retained.map(row => row.reactKey ?? row.id));
    rows.forEach(row => { if (!keys.has(row.reactKey ?? row.id)) animatedRemovalKeys.add(row.reactKey ?? row.id); });
    rows = retained;
    pendingGifts = pendingGifts.filter(row => row.receivedAt + COMBO_WINDOW_MS > now);
  };
  return {
    acceptActivity(fact: ActivityFacts) {
      if (fact.roomId !== roomId) return;
      const accepted = activities.acceptFact(fact);
      sticky.updateActivity(accepted);
      rows = rows.map(row => activities.project(row));
      sticky.retain(event => {
        const projected = activities.project(event);
        return projected.activity?.endedAt === undefined && projected.activity?.drawnAt === undefined;
      });
    },
    configure(next: EventWindowPreferences, now: number, nextTheme = theme) {
      const previouslyVisible = rows.filter(visible);
      if (nextTheme !== theme || next.giftThreshold !== settings.giftThreshold || next.giftThresholdMode !== settings.giftThresholdMode
        || next.displayFilters !== settings.displayFilters
        || next.display.showAutoDanmaku !== settings.display.showAutoDanmaku
        || next.display.showPhoneNotVerified !== settings.display.showPhoneNotVerified
        || next.display.onlyGuardEntry !== settings.display.onlyGuardEntry
        || next.audienceFilters.showCrossRoomEvents !== settings.audienceFilters.showCrossRoomEvents
        || next.audienceFilters.minimumWealthLevel !== settings.audienceFilters.minimumWealthLevel
        || next.audienceFilters.minimumCurrentRoomMedalLevel !== settings.audienceFilters.minimumCurrentRoomMedalLevel) pendingGifts = [];
      settings = next;
      theme = nextTheme;
      previouslyVisible.forEach(row => {
        if (!visible(row)) immediateRemovalKeys.add(row.reactKey ?? row.id);
      });
      sticky.configure(stickySettings(), now);
      sticky.retain(sharedVisible);
      rows = rows.filter(visible);
      trimRows(now);
    },
    accept(incoming: DanmakuEvent, now: number) {
      if (incoming.roomId !== roomId || isStatisticsEvent(incoming) || isHiddenEvent(incoming)) return false;
      if (activities.accept(incoming)) rows = rows.map(row => activities.project(row));
      const accepted = applyGiftWindowControl(controls, incoming, theme.nativeMain === true);
      if (!accepted) return false;
      let event: DanmakuEvent = activities.project(accepted);
      if (event.msgType === MsgType.ScDeleted) {
        rows.forEach(row => { if (event.scDeleteIds?.includes(row.id)) immediateRemovalKeys.add(row.reactKey ?? row.id); });
        rows = rows.filter((row) => !event.scDeleteIds?.includes(row.id));
        sticky.accept(event, now);
        return;
      }
      if (!theme.nativeMain && (
        event.msgType === MsgType.AnchorLotAward ||
        event.msgType === MsgType.RedPocketWinner
      )) {
        const type =
          event.msgType === MsgType.AnchorLotAward
            ? MsgType.AnchorLotStart
            : MsgType.RedPocketStart;
        rows.forEach(row => { if (row.msgType === type && row.lottery?.id === event.lottery?.id) immediateRemovalKeys.add(row.reactKey ?? row.id); });
        rows = rows.filter(
          (row) =>
            row.msgType !== type || row.lottery?.id !== event.lottery?.id,
        );
      }
      const key = event.dedupe ?? event.id;
      if (!event.isComboUpdate && seen.has(key)) return false;
      if (!event.isComboUpdate) seen.add(key);
      if (event.msgType === MsgType.Gift && !event.isComboUpdate) {
        effectRows = effectRows.filter(
          (row) => event.ts - row.ts <= COMBO_WINDOW_MS,
        );
        const mergedEffect = mergeGiftInto(effectRows, event);
        const knownCombo = !!event.comboId && effectCombos.has(event.comboId);
        if (event.comboId) effectCombos.add(event.comboId);
        if (!mergedEffect && !(knownCombo && !event.gift?.blindGiftName)) {
          effectRows.push({
            ...event,
            isComboUpdate: false,
            comboFinalized: event.isComboUpdate,
          });
          if (needs(event).effect) onEffect?.(event);
        }
      }
      if ((event.msgType === MsgType.GuardBuy || event.msgType === MsgType.GuardHonor) && needs(event).effect) onEffect?.(event);
      trimRows(now);
      const giftRows = [...rows];
      const giftMerge = mergeGiftInto(giftRows, event);
      if (giftMerge) {
        if (event.comboId) seenComboSources.add(event.comboId);
        rows = giftRows;
        if (!giftMerge.updated) return false;
        if (giftMerge.updated && sharedVisible(giftMerge.updated))
          sticky.accept(giftMerge.updated, now);
        return;
      }
      const pendingMerge = mergeGiftInto(pendingGifts, event);
      if (pendingMerge?.updated) event = pendingMerge.updated;
      if (!visible(event) && event.msgType === MsgType.Gift && resolveOutputEventNeeds(event, {
        preferences: { ...settings, giftThreshold: 0 }, roomId, ...theme,
      }).main) {
        if (!pendingMerge) pendingGifts = [...pendingGifts, { ...event, receivedAt: now }].slice(-100);
        else pendingGifts = pendingGifts.map(row => row === pendingMerge.updated ? { ...row, receivedAt: now } : row);
      } else if (pendingMerge?.updated) pendingGifts = pendingGifts.filter(row => row !== pendingMerge.updated);
      if (event.isComboUpdate) {
        if (event.comboId && seenComboSources.has(event.comboId)) return false;
        event = { ...event, isComboUpdate: false, comboFinalized: true };
      }
      if (sharedVisible(event)) sticky.accept(event, now);
      if (!visible(event)) return sharedVisible(event) && sticky.snapshot(now).some(card => card.id === event.id);
      if (event.comboId) seenComboSources.add(event.comboId);
      const merged = mergeSameDanmuEvent(rows, event, settings);
      if (merged) { rows = merged as typeof rows; return; }
      const rendered = assignEventRenderKey(event, renderKeys, () => ++renderKeySequence);
      rows = [...rows, { ...rendered, receivedAt: now }];
      trimRows(now);
    },
    snapshot(now: number) {
      trimRows(now);
      const removed = [...immediateRemovalKeys];
      immediateRemovalKeys.clear();
      const animated = [...animatedRemovalKeys].filter(key => !removed.includes(key));
      animatedRemovalKeys.clear();
      return {
        immediateRemovalKeys: removed,
        animatedRemovalKeys: animated,
        events: rows,
        sticky: selectStickyEvents(
          sticky.snapshot(now).filter(sharedVisible),
          stickySettings(),
          now,
        ),
      };
    },
  };
}
