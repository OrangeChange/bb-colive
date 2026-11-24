import { BLIVECHAT_CAPABILITY } from "../compat/blivechat/theme.ts";
import { OPENLIVE_CAPABILITY } from "../compat/openlive/theme.ts";
import { LAPLACE_CAPABILITY } from "../compat/laplace/theme.ts";
import type { ThemeMode } from "../themes/themeTypes.ts";
import {
  createStylePreviewEvents,
  type PreviewEventKind,
} from "../components/stylePreviewEvents.ts";
import { resolveStylePreviewContext } from "../components/stylePreviewContext.ts";
import { createObsSnapshot } from "./createObsSnapshot.ts";
import type { ObsWireState } from "./obsProtocol.ts";
export const OBS_SAMPLE_KINDS: PreviewEventKind[] = [
  "混合流",
  "弹幕",
  "互动",
  "礼物",
  "红包/天选",
  "醒目留言",
  "大航海",
  "系统",
];
export const obsSampleEvents = (kind?: string) =>
  createStylePreviewEvents(
    OBS_SAMPLE_KINDS.includes(kind as PreviewEventKind)
      ? (kind as PreviewEventKind)
      : "混合流",
  );
export function obsSampleDisplay(
  state: ObsWireState,
  displayAll: boolean,
): ObsWireState {
  if (!displayAll) return state;
  const preferences = resolveStylePreviewContext("obs", "all", {
    displayPreferences: state.preferences.display,
    eventFontSize: 16,
    windowEventFontSize: 16,
  }).displayPreferences;
  let snapshot = state.snapshot;
  if ("document" in snapshot) {
    const document = {
      ...snapshot.document,
      settings: {
        ...snapshot.document.settings,
        showAvatar: true,
        showUsername: true,
        showAvatarFrame: true,
        showGuardBadge: true,
        showModBadge: true,
        showMedal: true,
        showWealthMedal: true,
        showCurrentRank: true,
      },
    };
    snapshot = createObsSnapshot(
      document,
      snapshot.targetId,
      String(snapshot.roomId ?? 1),
      snapshot.displayScale,
      state.preferences.stickyEvents,
    );
    if (snapshot.mode === "blivechat" && state.snapshot.mode === "blivechat") snapshot.publicationId = state.snapshot.publicationId;
  } else
    snapshot = {
      ...snapshot,
      displayPreferences: { ...snapshot.displayPreferences, ...preferences },
    };
  return {
    ...state,
    snapshot,
    preferences: {
      ...state.preferences,
      display: { ...state.preferences.display, ...preferences },
    },
  };
}

export function obsSampleOptions(mode: ThemeMode) {
  const capability =
    mode === "blivechat"
      ? BLIVECHAT_CAPABILITY
      : mode === "blivechat-open"
        ? OPENLIVE_CAPABILITY
        : mode === "laplace"
          ? LAPLACE_CAPABILITY
          : undefined;
  const keys = Object.keys(
    capability?.eventSelectorsByPlacement?.main ??
      capability?.eventSelectors ??
      {},
  );
  const rules: Record<string, RegExp> = {
    弹幕: /danmaku/,
    互动: /interact/,
    礼物: /^gift/,
    "红包/天选": /lottery|red/,
    醒目留言: /superchat/,
    大航海: /guard/,
    系统: /system|live-start|live-end|room-/,
  };
  return OBS_SAMPLE_KINDS.filter(
    (kind) =>
      !capability ||
      kind === "混合流" ||
      keys.some((key) => rules[kind]?.test(key)),
  ).map((value) => ({ value, label: value }));
}
