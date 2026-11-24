import type { StylePreviewPolicySettings } from "./stylePreviewPolicy.ts";
import type { PreviewElementMark } from "./stylePreviewSelection.ts";
import type { EventDisplayPreferences } from "../eventDisplaySettings.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import type { DanmakuEvent } from "../protocol/types.ts";
import type {
  StylePreviewContext,
  StylePreviewMode,
} from "../components/stylePreviewContext.ts";
import type { StickyEventSettings } from "../windows/stickyEventModel.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import type { CompatibleVisualSelection } from "../themes/compatThemeCapabilities.ts";
import type { ObsWireState } from "../obs/obsProtocol.ts";

export interface NativeStylePreviewPayload {
  previewPolicy?: StylePreviewPolicySettings;
  previewMotion?: "static" | "design" | "simulation";
  previewNow?: number;
  previewMainEventIds?: string[];
  previewCss: string;
  context: StylePreviewContext;
  mode: StylePreviewMode;
  events: DanmakuEvent[];
  eventStyleSettings: EventStyleSettings;
  displayPreferences: EventDisplayPreferences;
  eventFontSize: number;
  windowEventFontSize: number;
  scrollDirection?: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
  stickySettings: StickyEventSettings;
  previewScheme: "system" | "light" | "dark";
  previewBackground?: string;
}
export interface CompatibleStylePreviewState {
  previewEventType?: string;
  previewPolicy?: StylePreviewPolicySettings;
  document: ThemeDocument;
  previewMode: "static" | "design" | "simulation";
  previewPlaying: boolean;
  previewSpeed: number;
  previewRestartKey: number;
  displayAll: boolean;
  previewTarget: "live" | "windows" | "obs";
  scrollDirection?: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
  previewScheme: "system" | "light" | "dark";
  previewBackground: string;
  width: number;
  selection?: CompatibleVisualSelection;
  revealPart?: string | null;
}
export interface PreviewFrame {
  nativeEvents?: DanmakuEvent[];
  mainEventIds?: string[];
  selection?: PreviewElementMark;
  presentation?: { messages: unknown[]; paidMessages: unknown[] };
  windowed?: boolean;
  epoch: number;
  now?: number;
  records?: unknown[];
  events?: unknown[];
  scroll?: {
    top: number;
    left: number;
    targets?: Record<string, { top: number; left: number; anchorId?: string; anchorOffset?: number }>;
  };
  playing?: boolean;
  cursor?: number;
  restart?: number;
}
interface PreviewGeometry {
  displayScale?: number;
  width: number;
  height: number;
  nativeRowWidth?: number;
  scrollbarWidth?: number;
  scrollbarThumb?: string;
  scrollbarTrack?: string;
  palette: import("../theme.ts").Palette;
  customColor?: string;
  scheme: "light" | "dark";
}
export type StylePreviewDraft = PreviewGeometry &
  (
    | {
        kind: "native";
        content: NativeStylePreviewPayload;
        frame: PreviewFrame;
      }
    | {
        kind: "compatible";
        content: CompatibleStylePreviewState;
        frame: PreviewFrame;
      }
    | { kind: "obs"; previewBackground: string; content: ObsWireState; frame: PreviewFrame }
  );
export type StylePreviewSnapshot = StylePreviewDraft & {
  ownerId: string;
  revision: number;
};
