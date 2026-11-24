import { previewEditorAccent } from '../../public/previewEditorHit.mjs';
import { useTheme } from '../theme.ts';
import { resolveCompatiblePreviewScheme } from "../themes/compatPreviewScheme.ts";
import type { StylePreviewPolicySettings } from "../preview/stylePreviewPolicy.ts";
import type { PreviewFrame } from "../preview/stylePreviewState.ts";
import { useMemo, useRef, type ReactNode } from "react";
import type { ThemeDocument, ThemeMode } from "../themes/themeTypes.ts";
import type { CompatibleEditorInspection, CompatibleEditorSelectionState, CompatibleThemeCapabilityMap } from "../themes/compatThemeCapabilities.ts";
import { compatibleEditorEventScopes, compatibleEditorSelectors, registerCompatibleThemeCapability } from "../themes/compatThemeCapabilities.ts";
import type { CompatibleVisualSettings } from "../themes/compatThemeSettings.ts";
import { materializeCompatibleVisualCss } from "../themes/compatManagedCss.ts";
import { compatibleSelectorFor } from "../themes/compatManagedCss.ts";
import type { CompatibleVisualSelection } from "../themes/compatThemeCapabilities.ts";
import { IsolatedPreviewFrame } from "./IsolatedPreviewFrame.tsx";
import { ThemeThumbnailShell, useThemeThumbnailDocument } from "./ThemeThumbnailShell.tsx";
export { resolveCompatiblePreviewScheme } from "../themes/compatPreviewScheme.ts";

export interface CompatibleThemeRendererProps {
  onPreviewReady?: () => void;
  onPreviewFailure?: (message: string) => void;
  previewPolicy?: StylePreviewPolicySettings;
  previewFrame?: PreviewFrame;
  onPreviewFrame?: (frame:PreviewFrame)=>void;
  document: ThemeDocument;
  thumbnail: boolean;
  previewMode?: "static" | "design" | "simulation";
  previewPlaying?: boolean;
  previewSpeed?: number;
  previewRestartKey?: number;
  displayAll?: boolean;
  previewEventType?: string;
  previewTarget?: "live" | "windows" | "obs";
  scrollDirection?: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
  revealPart?: string | null;
  editorSelection?: CompatibleEditorSelectionState;
  onEditorInspection?: (inspection: CompatibleEditorInspection) => void;
}

export type CompatibleThemeRenderer = (props: CompatibleThemeRendererProps) => ReactNode;

export interface CompatibleThemeEditingSurface {
  capability: CompatibleThemeCapabilityMap;
  renderer: CompatibleThemeRenderer;
  ownsPreviewDocument?: boolean;
  renderBasicControls?: (context: {
    document: ThemeDocument;
    onSettingsChange: (settings: CompatibleVisualSettings) => void;
  }) => ReactNode;
  composeCss?: (document: ThemeDocument) => string;
}

const compatibleThemeEditingSurfaces = new Map<ThemeMode, CompatibleThemeEditingSurface>();

export function registerCompatibleThemeEditingSurface(mode: ThemeMode, surface: CompatibleThemeEditingSurface): void {
  compatibleThemeEditingSurfaces.set(mode, surface);
  registerCompatibleThemeCapability(surface.capability);
}

export function getCompatibleThemeEditingSurface(mode: ThemeMode): CompatibleThemeEditingSurface | undefined {
  return compatibleThemeEditingSurfaces.get(mode);
}

export function CompatibleThemePreview({ onPreviewReady, onPreviewFailure, transparentCanvas = false, previewPolicy, previewFrame, onPreviewFrame, document, capability, renderer, composeCss, thumbnail = false, previewMode, previewPlaying = true, previewSpeed = 1, previewRestartKey = 0, previewEventType, displayAll = true, previewTarget = "windows", scrollDirection, contentAlignment, previewScheme = "system", previewBackground = "transparent", previewWidth, revealPart = null, selection, inspectionRevision = 0, onEditorInspection }: {
  onPreviewReady?: () => void;
  onPreviewFailure?: (message: string) => void;
  previewPolicy?: StylePreviewPolicySettings;
  previewFrame?: PreviewFrame;
  onPreviewFrame?: (frame:PreviewFrame)=>void;
  document: ThemeDocument;
  capability: CompatibleThemeCapabilityMap;
  renderer: CompatibleThemeRenderer;
  composeCss?: (document: ThemeDocument) => string;
  thumbnail?: boolean;
  previewMode?: "static" | "design" | "simulation";
  previewPlaying?: boolean;
  previewSpeed?: number;
  previewRestartKey?: number;
  displayAll?: boolean;
  previewEventType?: string;
  previewTarget?: "live" | "windows" | "obs";
  scrollDirection?: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
  previewScheme?: "system" | "light" | "dark";
  previewBackground?: string;
  transparentCanvas?: boolean;
  previewWidth?: number;
  revealPart?: string | null;
  selection?: CompatibleVisualSelection;
  inspectionRevision?: number;
  onEditorInspection?: (inspection: CompatibleEditorInspection) => void;
}) {
  const previewCss = useMemo(() => {
    const base = composeCss ? composeCss(document) : [
      document.styles.baseCss,
      materializeCompatibleVisualCss(document as ThemeDocument & { settings: CompatibleVisualSettings }, capability),
      document.styles.customCss,
    ].filter(Boolean).join("\n\n");
    return base;
  }, [capability, composeCss, document]);
  const transparent = previewBackground === "transparent";
  const focusSelector = selection ? compatibleSelectorFor(capability, `${selection.event}|${selection.identity}|${selection.placement ?? "main"}|${selection.part}`, "common") : null;
  const palette = useTheme(state=>state.palette);
  const softwareMode = useTheme(state=>state.mode);
  const actualScheme = previewScheme === "system" && softwareMode !== "system" ? softwareMode : resolveCompatiblePreviewScheme(document,previewScheme);
  const accentColor = useMemo(()=>typeof window === "undefined" ? undefined : previewEditorAccent(window.document,actualScheme),[palette,actualScheme]);
  const inspectionEnabled = Boolean(onEditorInspection);
  const editorSelection = useMemo<CompatibleEditorSelectionState>(() => ({
      accentColor,
      eventId: selection?.eventId,
      identityPriority: capability.identityPriority,
      part: inspectionEnabled ? selection?.part ?? revealPart ?? "" : "",
      readOnly: Boolean(previewFrame),
      pickEnabled: previewMode === "design",
      inspectionRevision,
      scope: {
        part: selection?.part ?? revealPart ?? "",
        eventType: selection?.event ?? "all",
        identity: selection?.identity ?? "all",
        placement: selection?.placement ?? "main",
      },
      reveal: inspectionEnabled && previewMode === "design" && Boolean(revealPart),
      selectors: inspectionEnabled ? compatibleEditorSelectors(capability) : {},
      focusSelectors: inspectionEnabled && focusSelector ? focusSelector.split(",\n") : [],
      strictScope: Boolean(selection),
      scheme: actualScheme,
      partPlacements: Object.fromEntries(Object.entries(capability.parts).map(([key,value])=>[key,value.placements ?? ["main","sticky","detail"]])),
      properties: Object.fromEntries(Object.entries(capability.parts).map(([key, value]) => [key, value.properties])),
      scopeSelectors: {
        eventsByPlacement: compatibleEditorEventScopes(capability),
        identities: capability.identitySelectors ?? {},
        placements: Object.fromEntries(Object.entries(capability.eventSelectorsByPlacement ?? {}).map(([placement, events]) => [placement, Object.values(events).join(",")])),
      },
    }), [accentColor, Boolean(previewFrame), actualScheme, capability, focusSelector, inspectionEnabled, inspectionRevision, previewMode, revealPart, selection?.eventId, selection?.event, selection?.identity, selection?.part, selection?.placement]);
  const preview = useMemo(() => renderer({
    onPreviewReady, onPreviewFailure,
    previewPolicy, previewFrame, onPreviewFrame,
    document,
    thumbnail,
    previewMode,
    previewPlaying,
    previewSpeed,
    previewRestartKey,
    previewEventType,
    displayAll,
    previewTarget,
    scrollDirection,
    contentAlignment,
    revealPart,
    editorSelection,
    onEditorInspection,
  }), [onPreviewReady,onPreviewFailure,previewPolicy,previewFrame,onPreviewFrame,displayAll, document, editorSelection, onEditorInspection, previewMode, previewEventType, previewPlaying, previewRestartKey, previewSpeed, previewTarget, scrollDirection, contentAlignment, renderer, revealPart, thumbnail]);
  return <div className={`compatible-theme-preview${thumbnail ? " is-thumbnail theme-library-thumbnail-canvas" : ""}${transparent && !thumbnail && !transparentCanvas ? " is-checkerboard" : ""} is-${actualScheme}`} style={previewWidth ? { width: `${previewWidth}px`, maxWidth: "100%" } : undefined}>
    <div className="compatible-theme-preview-viewport" key={!previewFrame && previewMode === "simulation" ? `simulation:${previewRestartKey}` : "content"}>
    {getCompatibleThemeEditingSurface(document.mode)?.ownsPreviewDocument ? preview : <IsolatedPreviewFrame
      title={thumbnail ? "主题缩略预览" : "主题样式预览"}
      previewCss={previewCss}
      previewScheme={actualScheme}
      previewBackground={previewBackground}
    >
      {preview}
    </IsolatedPreviewFrame>}
    </div>
  </div>;
}

export function CompatibleThemeThumbnail({ mode, themeId, revision, load, onPreviewReady, onPreviewFailure }: {
  onPreviewReady?: () => void;
  onPreviewFailure?: (message: string) => void;
  mode: ThemeMode;
  themeId: string;
  revision: number;
  load: (themeId: string) => Promise<ThemeDocument>;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { document, failed } = useThemeThumbnailDocument({ root, themeId, revision, load });
  const surface = getCompatibleThemeEditingSurface(mode);
  if (!surface) return <ThemeThumbnailShell root={root} failed ready={false} />;
  if (!document) return <ThemeThumbnailShell root={root} failed={failed} ready={false} />;
  return <ThemeThumbnailShell root={root} failed={false} ready><CompatibleThemePreview document={document} capability={surface.capability} renderer={surface.renderer} composeCss={surface.composeCss} thumbnail previewTarget="live" onPreviewReady={onPreviewReady} onPreviewFailure={onPreviewFailure} /></ThemeThumbnailShell>;
}
