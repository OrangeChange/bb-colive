import { createNativeEventVisibilityPredicate } from '../events/outputEventPolicy.ts';
import { resolveThemeEventVisibility } from '../themes/themeEventVisibility.ts';
import type { EventFilterState } from '../events/eventView.ts';
import { subscribeNativeThemeTarget } from '../themes/nativeThemeRuntime.ts';
import type { NativeThemeProjection } from '../themes/nativeThemeProjection.ts';
import { resolveCompatibleEventRender, compatibleEventDecisionOf, subscribeCompatibleEventRenderChange } from '../compat/CompatibleEventRenderer.tsx';
import { useConnection } from '../stores/connection.ts';
import { setDisplayOutputPolicy } from './displayBridge.ts';
import { setGiftOutputPolicy } from './giftBridge.ts';
import { invoke } from "@tauri-apps/api/core";
import { useEffect,useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useGeneralSettings } from "../generalSettings.ts";
import type { GiftThresholdMode } from "../giftThreshold.ts";
import type { AudienceFilterSettings } from "../events/audienceFilters.ts";
import {
closeDisplayBridge,
isDisplayWindowLocked,
isDisplayWindowOpen,
setDisplayWindowPreferences,
startDisplayBridge,
subscribeDisplayWindowLockState,
subscribeDisplayWindowState
} from "../windows/displayBridge";
import {
closeGiftBridge,
isGiftWindowLocked,
isGiftWindowOpen,
setGiftWindowPreferences,
startGiftBridge,
subscribeGiftWindowLockState,
subscribeGiftWindowState,
getRevenueWindowSelection,
subscribeRevenueWindowSelection
} from "../windows/giftBridge";
import { createEventWindowPreferences } from "./eventWindowPreferences.ts";
import { useVoiceSettings } from "../voice/voiceSettings.ts";

export function useAuxiliaryWindows(scene: { giftThreshold: number; giftThresholdMode: GiftThresholdMode; audienceFilters: AudienceFilterSettings; filters: EventFilterState }) {
  const userNicknames = useVoiceSettings(state => state.userNicknames);
  const [displayOpen, setDisplayOpen] = useState(() => isDisplayWindowOpen());
  const [displayLocked, setDisplayLocked] = useState(() => isDisplayWindowLocked());
  const [giftOpen, setGiftOpen] = useState(() => isGiftWindowOpen());
  const [giftLocked, setGiftLocked] = useState(() => isGiftWindowLocked());
  const [revenueSelection, setRevenueSelection] = useState(getRevenueWindowSelection);
  useEffect(() => subscribeRevenueWindowSelection(setRevenueSelection), []);
  const settings = useGeneralSettings(useShallow((state) => ({
    windowEventFontSize: state.windowEventFontSize,
    liveScrollDirection: state.liveScrollDirection,
    liveContentAlignment: state.liveContentAlignment,
    windowAppearance: state.windowAppearance,
    eventExpiry: state.eventExpiry,
    stickyEvents: state.stickyEvents,
    eventWindowCapacity: state.eventWindowCapacity,
    mergeSameDanmu: state.mergeSameDanmu,
    sameDanmuWindowSeconds: state.sameDanmuWindowSeconds,
    showGiftWindowEffect: state.showGiftWindowEffect,
    showGuardWindowEffect: state.showGuardWindowEffect,
    displayWindowFilters: state.displayWindowFilters,
    eventDisplayPreferences: state.eventDisplayPreferences,
    eventStyleSettings: state.eventStyleSettings,
  })));
  const roomId = useConnection(state => state.state.roomId);
  const [projection, setProjection] = useState<NativeThemeProjection>();
  const [themeVersion, setThemeVersion] = useState(0);
  useEffect(() => subscribeCompatibleEventRenderChange(() => setThemeVersion(v => v + 1)), []);
  useEffect(() => { let disposed = false, stop: (() => void) | undefined; void subscribeNativeThemeTarget('windows', 'windows', value => { if (!disposed) setProjection(value); }, false).then(value => { if (disposed) value(); else stop = value; }); return () => { disposed = true; stop?.(); }; }, []);
  useEffect(() => {
    const preferences = { ...createEventWindowPreferences(settings, scene), userNicknames };
    const context = { target: 'windows' as const, targetId: 'windows', roomId: roomId ?? null };
    const main = resolveCompatibleEventRender({ ...context, placement: 'main' });
    const sticky = resolveCompatibleEventRender({ ...context, placement: 'sticky' });
    const nativeAllows = createNativeEventVisibilityPredicate(resolveThemeEventVisibility(projection?.eventVisibility, 'windows'));
    const allowsMain = (event: import('../protocol/types.ts').DanmakuEvent) => main ? compatibleEventDecisionOf(main, event) !== 'omit' : nativeAllows(event);
    setDisplayOutputPolicy(allowsMain);
    setGiftOutputPolicy({ nativeMain: !main, allowsMain, allowsSticky: event => sticky ? compatibleEventDecisionOf(sticky, event) !== 'omit' : nativeAllows(event) });
    setDisplayWindowPreferences(preferences);
    setGiftWindowPreferences(preferences);
  }, [settings, scene.giftThreshold, scene.giftThresholdMode, scene.audienceFilters, scene.filters, roomId, projection, themeVersion, userNicknames]);

  useEffect(() => {
    const unsubscribeState = subscribeDisplayWindowState(setDisplayOpen);
    const unsubscribeLockState = subscribeDisplayWindowLockState(setDisplayLocked);
    window.addEventListener("beforeunload", closeDisplayBridge);
    let disposed = false;
    let stop: (() => void) | undefined;
    void startDisplayBridge()
      .then((cleanup) => {
        if (disposed) cleanup();
        else stop = cleanup;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", closeDisplayBridge);
      stop?.();
      closeDisplayBridge();
      unsubscribeLockState();
      unsubscribeState();
    };
  }, []);

  useEffect(() => {
    const unsubscribeState = subscribeGiftWindowState(setGiftOpen);
    const unsubscribeLockState = subscribeGiftWindowLockState(setGiftLocked);
    window.addEventListener("beforeunload", closeGiftBridge);
    let disposed = false;
    let stop: (() => void) | undefined;
    void startGiftBridge()
      .then((cleanup) => {
        if (disposed) cleanup();
        else stop = cleanup;
      })
      .catch(() => {});
    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", closeGiftBridge);
      stop?.();
      closeGiftBridge();
      unsubscribeLockState();
      unsubscribeState();
    };
  }, []);
  useEffect(() => {
    void Promise.all([
      invoke("set_tray_window_state", { window: "display", open: displayOpen }),
      invoke("set_tray_window_state", { window: "gift", open: giftOpen }),
    ]).catch(() => {});
  }, [displayOpen, giftOpen]);
  return { displayOpen, displayLocked, giftOpen, giftLocked, revenueSelection };
}
