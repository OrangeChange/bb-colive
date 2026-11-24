import type { ObsThemeSnapshot } from "./nativeObsTheme.ts";
import type { DanmakuEvent, ConnState } from "../protocol/types.ts";
import type { EventWindowPreferences } from "../windows/eventWindowPreferences.ts";
import type { StickyEventCard } from "../windows/stickyEventModel.ts";
import type { LaplaceStateUpdate } from "../protocol/laplaceCompatibility.ts";
export interface ObsQuery {
  config?: string;
  theme?: string;
  room?: string;
  preview?: string;
  draft?: string;
  kind?: string;
  mode?: string;
}
export interface ObsWireState {
  giftEffectSession?: string;
  giftEffectSequence?: number;
  sampleAt?: number;
  userNicknames?: Record<string, string>;
  type: "state";
  identity: string;
  sequence: number;
  snapshot: ObsThemeSnapshot;
  events: DanmakuEvent[];
  immediateRemovalKeys?: string[];
  animatedRemovalKeys?: string[];
  sticky: StickyEventCard[];
  preferences: EventWindowPreferences;
  scheme: "light" | "dark";
  outputScheme?: "follow" | "light" | "dark";
  palette?: import("../theme.ts").Palette;
  customColor?: string;
  connection: ConnState;
  roomUpdates: LaplaceStateUpdate[];
}
export interface ObsWireGiftEffect {
  type: "gift-effect";
  session: string;
  sequence: number;
  notice: import("../windows/giftEffectBus.ts").GiftEffectNotice;
}
export type ObsMessage =
  ObsWireState | ObsWireGiftEffect | { type: "status"; message: string };
