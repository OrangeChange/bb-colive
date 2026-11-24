import { uiText } from "../i18n/index.ts";
import { getPersonalBroadcastRuleKey } from "../voice/personalBroadcastProjection.ts";
import type { PersonalBroadcastMode, PersonalBroadcastRuleKey, PersonalBroadcastSettings } from "../voice/personalBroadcastTypes.ts";
import type { PersonalBroadcastRuntimeSnapshot } from "../voice/personalBroadcastController.ts";
import type { VoiceRuntimeSnapshot } from "../voice/voiceTypes.ts";

export function getPersonalBroadcastPendingCount(
  voiceSnapshot: Pick<VoiceRuntimeSnapshot, "pending">,
  personalSettings: Pick<PersonalBroadcastSettings, "enabled" | "mode" | "rules">,
  onlyGuardEntry: boolean,
): number {
  if (!personalSettings.enabled || personalSettings.mode !== "before-tts") return 0;
  return voiceSnapshot.pending.filter((entry) => {
    const key = getPersonalBroadcastRuleKey(entry.event, onlyGuardEntry);
    if (!key) return false;
    const rule = personalSettings.rules[key];
    return rule.enabled && Boolean(rule.audioPath.trim());
  }).length;
}

export interface VoicePanelPlaybackState {
  serialPersonalActive: boolean;
  canControlPlayback: boolean;
  playbackPaused: boolean;
}

export function getVoicePanelPlaybackState(
  voiceSnapshot: Pick<VoiceRuntimeSnapshot, "current" | "pendingCount" | "status">,
  personalSnapshot: Pick<PersonalBroadcastRuntimeSnapshot, "current" | "pendingCount" | "status">,
  personalMode: PersonalBroadcastMode,
): VoicePanelPlaybackState {
  const serialPersonalActive = personalMode === "before-tts"
    && Boolean(personalSnapshot.current || personalSnapshot.pendingCount > 0);
  const canControlPlayback = Boolean(
    voiceSnapshot.current || voiceSnapshot.pendingCount > 0 || serialPersonalActive,
  );
  const playbackPaused = voiceSnapshot.status === "paused"
    || (serialPersonalActive && personalSnapshot.status === "paused");
  return { serialPersonalActive, canControlPlayback, playbackPaused };
}

export function getPersonalBroadcastRuleError(
  key: PersonalBroadcastRuleKey,
  snapshot: Pick<PersonalBroadcastRuntimeSnapshot, "failedRuleKey" | "error">,
  localError: { key: PersonalBroadcastRuleKey; message: string } | null,
): string | null {
  if (localError?.key === key) return localError.message;
  return snapshot.failedRuleKey === key && snapshot.error ? uiText("personalBroadcastPanelModel.getPersonalBroadcastRuleError", { error: snapshot.error }) : null;
}
