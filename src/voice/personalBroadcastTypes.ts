export type PersonalBroadcastMode = "independent" | "before-tts";
export type PersonalBroadcastRuleKey =
  | "interact-entry" | "interact-follow" | "interact-share"
  | "interact-special-follow" | "interact-mutual-follow" | "interact-like"
  | "interact-guard-entry" | "gift" | "blind-box" | "red-pocket-start"
  | "anchor-lottery-start" | "super-chat" | "guard-captain"
  | "guard-admiral" | "guard-governor" | "system-warning" | "system-cut-off";

export const PERSONAL_BROADCAST_RULE_KEYS = [
  "interact-entry", "interact-follow", "interact-share",
  "interact-special-follow", "interact-mutual-follow", "interact-like",
  "interact-guard-entry", "gift", "blind-box", "red-pocket-start",
  "anchor-lottery-start", "super-chat", "guard-captain",
  "guard-admiral", "guard-governor", "system-warning", "system-cut-off",
] as const satisfies readonly PersonalBroadcastRuleKey[];

export interface PersonalBroadcastRule {
  enabled: boolean;
  audioPath: string;
}

export interface PersonalBroadcastSettings {
  enabled: boolean;
  mode: PersonalBroadcastMode;
  promptIntervalSeconds: number;
  promptToTtsIntervalSeconds: number;
  rules: Record<PersonalBroadcastRuleKey, PersonalBroadcastRule>;
}

export const DEFAULT_PERSONAL_BROADCAST_SETTINGS: PersonalBroadcastSettings = {
  enabled: false,
  mode: "independent",
  promptIntervalSeconds: 0,
  promptToTtsIntervalSeconds: 0,
  rules: Object.fromEntries(
    PERSONAL_BROADCAST_RULE_KEYS.map((key) => [key, { enabled: false, audioPath: "" }]),
  ) as Record<PersonalBroadcastRuleKey, PersonalBroadcastRule>,
};
