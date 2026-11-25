import { Slider } from "./shadcn/slider";
import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { localized, uiText, uiSearchText, UI_LANGUAGE_OPTIONS } from "../i18n/index.ts";
import { changeUiLanguage } from "../i18n/runtime.ts";
import { UiSelect } from "./ui/Select.tsx";
import { useUpdatePreferences } from "../updates/store";
import { SwitchButton } from "./SettingsSwitch";
import { SoftwareUpdateSettings } from "../updates/SoftwareUpdateSettings";
import { useCompatibleOutputScheme } from "../themes/compatPreviewScheme.ts";
import { X, RotateCcw, GripVertical as LucideGripVertical, ChevronDown as LucideChevronDown, Search as LucideSearch, Palette as PaletteIcon, Sun, Moon, Monitor, Power, ArrowUp, ArrowDown, SlidersHorizontal, AlignStartVertical, Layers, Wallet, MapPin } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
  type WheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { getVersion } from "@tauri-apps/api/app";
import { useTheme, PALETTE_OPTIONS, type Mode, type Palette } from "../theme";
import { applyCustomPalette, DEFAULT_CUSTOM_COLOR } from '../customPalette.ts';
import { ThemeColorField } from './ThemeColorField.tsx';
import {
  MAX_UI_SCALE,
  MIN_UI_SCALE,
  useGeneralSettings,
  type CloseBehavior,
  type MinimizeBehavior,
} from "../generalSettings";
import {
  rgbaToCss,
  type RgbaColor,
} from "../eventStyleSettings";
import {
  MAX_WINDOW_OPACITY,
  MAX_WINDOW_RADIUS,
  MIN_WINDOW_OPACITY,
  MIN_WINDOW_RADIUS,
} from "../windowAppearance";
import { createDefaultSceneSettings, type SceneSettings } from "./sceneSettings";
import type { GiftThresholdMode } from "../giftThreshold.ts";
import type { LiveScrollDirection } from "../events/feedScroll";
import { EVENT_ANIMATION_DURATION_STEP_MS, EVENT_ANIMATION_PRESET_OPTIONS } from "../eventDisplaySettings";
import {
  MAX_EVENT_EXPIRY_SECONDS,
  MIN_EVENT_EXPIRY_SECONDS,
} from "../windows/windowEventExpiry";
import {
  MAX_SAME_DANMU_WINDOW_SECONDS,
  MIN_SAME_DANMU_WINDOW_SECONDS,
} from "../windows/danmuMerge";
import { bindUiDismissableLayer } from "./ui/layer";
import { GiftThresholdInput } from "./GiftThresholdInput";
import { SettingsFlowPreview } from './SettingsFlowPreview';
import { SettingsChoiceControl } from './SettingsChoiceControl';
import { SettingsIcon } from './SettingsIcon';
import { SceneLayoutIcon } from './SceneLayoutIcon';
import { parseThemeColor } from "./themeColorValue.ts";
import { INTERACT_KIND_OPTIONS, type DisplayEventFilters } from "../eventFilterSettings";
import {
  SETTINGS_SECTIONS,
  consumeSectionWheel,
  isSectionNavigationTargetReached,
  resolveActiveSectionIndex,
  type SettingsAnchorId,
  type SettingsOpenRequest,
  type SettingsSectionId,
} from "./settingsNavigation";
import { WorkbenchScroll } from "./WorkbenchSurface";
import { SettingsListSelect as SharedSettingsListSelect, type SettingsListOption as SharedSettingsListOption } from "./SettingsListSelect";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import { MAX_VOICE_SHORTCUT_ACTIONS, type VoiceShortcutAction } from "../voice/voiceTypes.ts";
import { listAudioDevices } from "../voice/voiceRuntime.ts";
import type { AudioOutputDevice } from "../voice/audioOutput.ts";
import { MenuActionIcon, type MenuIconName } from "./EventContextMenu";
import { DiagnosticSettings, type DiagnosticExportMode } from "./DiagnosticSettings";
import { AboutDialog } from "./AboutDialog";
import { resolveWindowSurfaceColor, resolveWindowScheme } from "../windowAppearance";
import { ConfirmDialog } from "./ConfirmDialog";
import { ReviewArchiveSettings } from "./ReviewArchiveSettings";
import { CloudRecoverySettings } from "./CloudRecoverySettings";
import type { DiagnosticExportResult, DiagnosticStatusSnapshot } from "../diagnostics/diagnosticBridge.ts";
import type { IssueMarker } from "../diagnostics/diagnosticTypes.ts";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";
import type { ArchiveRepositoryContract } from "../archive/archiveTypes.ts";
import type { RevenueWindowSelection, RevenueWindowMode, RevenueWindowKind } from '../windows/giftWindowModel';

export type SettingsPanelProps = {
  sceneSettings: SceneSettings;
  setSceneSettings: Dispatch<SetStateAction<SceneSettings>>;
  displayOpen: boolean;
  displayLocked: boolean;
  onToggleDisplay: () => void;
  onToggleDisplayLock: () => void;
  onLocateDisplay?: () => void;
  giftOpen: boolean;
  giftLocked: boolean;
  onToggleGift: () => void;
  onToggleGiftLock: () => void;
  onLocateGift?: () => void;
  revenueSelection?: RevenueWindowSelection;
  onRevenueWindowMode?: (mode: RevenueWindowMode) => void;
  onToggleRevenueChild?: (kind: RevenueWindowKind) => void;
  onResetWindowLayout: () => void | Promise<void>;
  onResetDisplayWindowLayout: () => void | Promise<void>;
  onResetGiftWindowLayout: () => void | Promise<void>;
  onResetAllWindowLayout: () => void | Promise<void>;
  diagnosticStatus: DiagnosticStatusSnapshot | null;
  diagnosticMarkers: readonly IssueMarker[];
  onMarkDiagnosticIssue: (note?: string, markedAt?: number) => void | Promise<void>;
  onExportDiagnosticBundle: (mode: DiagnosticExportMode, outputPath: string) => void | Promise<Pick<DiagnosticExportResult, "outputPath" | "missingSnapshots"> | void>;
  onDiagnosticExportStateChange: (busy: boolean) => void;
  onOpenDiagnosticDirectory: () => void | Promise<void>;
  onSaveNickname?: (uid: string, nickname: string) => void;
  onDeleteNickname?: (uid: string) => void;
  archiveRepository?: ArchiveRepositoryContract | null;
  onArchiveChanged?: () => void;
  request?: SettingsOpenRequest | null;
};

const resetButtonClass = "rounded px-1.5 py-1 ui-type-meta text-t3 transition-colors hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring";

function getSettingsScrollTop(scroller: HTMLElement, target: HTMLElement, offset = 8) {
  const scrollerRect = scroller.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
  const nextTop = scroller.scrollTop + targetRect.top - scrollerRect.top - offset;
  return Math.min(maximum, Math.max(0, nextTop));
}

type SettingsRowLayout = "inline" | "stacked";

function useAdaptiveSettingsRowLayout(
  rowRef: RefObject<HTMLDivElement | null>,
  measurementKey: string,
  layoutAttribute: "data-segmented-layout" | "data-settings-layout",
) {
  const [layout, setLayout] = useState<SettingsRowLayout>("inline");

  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const labelElement = row.querySelector<HTMLElement>(".settings-control-label");
    const valueElement = row.querySelector<HTMLElement>(".settings-control-value");
    if (!labelElement || !valueElement) return;

    const measure = () => {
      row.setAttribute(layoutAttribute, "inline");
      const rowStyle = getComputedStyle(row);
      const columnGap = Number.parseFloat(rowStyle.columnGap) || 0;
      const requiredWidth = labelElement.scrollWidth + valueElement.scrollWidth + columnGap;
      const nextLayout: SettingsRowLayout = requiredWidth > row.clientWidth + 1 ? "stacked" : "inline";
      row.setAttribute(layoutAttribute, nextLayout);
      setLayout((current) => current === nextLayout ? current : nextLayout);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    return () => observer.disconnect();
  }, [layoutAttribute, measurementKey, rowRef]);

  return layout;
}

type SettingsSearchEntry = {
  id: string;
  label: string;
  keywords: string;
  sectionId: SettingsSectionId;
};

const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = localized(() => ([
  { id: "ui-language", label: uiText("settings.language"), keywords: uiSearchText("settings.language", "settings.languageKeywords"), sectionId: "general" },
  { id: "palette", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords"), sectionId: "general" },
  { id: "mode", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label2"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label2", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords2"), sectionId: "general" },
  { id: "ui-scale", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label3"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label3", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords3"), sectionId: "general" },
  { id: "start-on-boot", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label4"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label4", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords4"), sectionId: "general" },
  { id: "auto-connect", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label5"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label5", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords5"), sectionId: "general" },
  { id: "close-behavior", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label6"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label6", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords6"), sectionId: "general" },
  { id: "minimize-behavior", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label7"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label7", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords7"), sectionId: "general" },
  { id: "favorite-edit", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label8"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label8", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords8"), sectionId: "display" },
  { id: "content-alignment", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label9"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label9", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords9"), sectionId: "display" },
  { id: "feed-direction", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label10"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label10", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords10"), sectionId: "display" },
  { id: "event-animation", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label11"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label11", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords11"), sectionId: "display" },
  { id: "auto-danmaku", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label12"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label12", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords12"), sectionId: "filters" },
  { id: "phone-not-verified", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label13"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label13", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords13"), sectionId: "filters" },
  { id: "guard-entry", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label14"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label14", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords14"), sectionId: "filters" },
  { id: "gift-threshold", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label15"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label15", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords15"), sectionId: "filters" },
  { id: "gift-threshold-mode", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label16"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label16", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords16"), sectionId: "filters" },
  { id: "layout-mode", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label17"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label17", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords17"), sectionId: "live" },
  { id: "live-guard-effect", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label18"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label18", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords18"), sectionId: "live" },
  { id: "live-gift-effect", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label19"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label19", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords19"), sectionId: "live" },
  { id: "review-owner", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label20"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label20", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords20"), sectionId: "review" },
  { id: "archive-settings", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label21"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label21", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords21"), sectionId: "review" },
  { id: "cloud-recovery", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label22"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label22", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords22"), sectionId: "review" },
  { id: "window-opacity", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label23"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label23", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords23"), sectionId: "windows" },
  { id: "window-surface", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label24"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label24", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords24"), sectionId: "windows" },
  { id: "window-radius", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label25"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label25", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords25"), sectionId: "windows" },
  { id: "event-window-capacity", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label26"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label26", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords26"), sectionId: "display" },
  { id: "event-expiry", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label27"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label27", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords27"), sectionId: "display" },
  { id: "sticky-events", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label28"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label28", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords28"), sectionId: "display" },
  { id: "event-expiry-seconds", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label29"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label29", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords29"), sectionId: "display" },
  { id: "merge-danmu", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label30"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label30", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords30"), sectionId: "display" },
  { id: "merge-danmu-seconds", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label31"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label31", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords31"), sectionId: "display" },
  { id: "display-window", label: uiText("common.chatWindow"), keywords: uiSearchText("common.chatWindow", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords32"), sectionId: "windows" },
  { id: "display-window-open", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label32"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label32", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords33"), sectionId: "windows" },
  { id: "display-window-lock", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label33"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label33", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords34"), sectionId: "windows" },
  { id: "gift-window", label: uiText("common.revenueWindow"), keywords: uiSearchText("common.revenueWindow", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords35"), sectionId: "windows" },
  { id: "guard-window-effect", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label34"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label34", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords36"), sectionId: "windows" },
  { id: "gift-window-effect", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label35"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label35", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords35"), sectionId: "windows" },
  { id: "gift-window-mode", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label36"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label36", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords37"), sectionId: "windows" },
  { id: "gift-window-open", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label37"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label37", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords38"), sectionId: "windows" },
  { id: "gift-window-lock", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label38"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label38", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords39"), sectionId: "windows" },
  { id: "shortcut-menu", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label39"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label39", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords40"), sectionId: "interaction" },
  { id: "nickname", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label40"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label40", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords41"), sectionId: "interaction" },
  { id: "speak-username", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label41"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label41", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords41"), sectionId: "interaction" },
  { id: "voice-scope", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label42"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label42", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords42"), sectionId: "voice" },
  { id: "voice-host-device", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label43"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label43", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords43"), sectionId: "voice" },
  { id: "voice-audience-device", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label44"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label44", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords43"), sectionId: "voice" },
  { id: "window-layout", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label45"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label45", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords44"), sectionId: "other" },
  { id: "diagnostics", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label46"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label46", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords45"), sectionId: "other" },
  { id: "about", label: uiText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label47"), keywords: uiSearchText("settingsPanel.SETTINGS_SEARCH_ENTRIES.label47", "settingsPanel.SETTINGS_SEARCH_ENTRIES.keywords46"), sectionId: "about" },
]));

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
  searchId,
  disabled = false,
  decoration,
  tiles = false,
}: {
  label: string;
  value: T | undefined;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  searchId?: string;
  disabled?: boolean;
  decoration?: (value: T) => ReactNode;
  tiles?: boolean;
}) {
  useUiLanguage();
  const rowRef = useRef<HTMLDivElement>(null);
  const optionSignature = options.map((option) => `${String(option.value)}:${option.label}`).join("\u001f");
  const layout = useAdaptiveSettingsRowLayout(rowRef, `${label}\u001f${optionSignature}`, "data-segmented-layout");

  return (
    <div ref={rowRef} className={`settings-control-row settings-segmented-row${tiles ? " settings-choice-tiles" : ""}${disabled ? " is-disabled" : ""}`} data-settings-search={searchId} data-disabled={disabled || undefined} data-segmented-layout={layout}>
      <span className="settings-control-label ui-type-control text-t2">{label}</span>
      <SettingsChoiceControl className="settings-control-value ui-type-control" label={label} value={value} options={options} onChange={onChange} disabled={disabled} decoration={decoration} />
    </div>
  );
}


function SettingSwitch({ label, checked, onChange, searchId, disabled = false, hint, icon }: { label: string; checked: boolean; onChange: () => void; searchId?: string; disabled?: boolean; hint?: string; icon?: ReactNode }) {
  useUiLanguage();
  return (
    <div className={`settings-control-row settings-switch-row${disabled ? " is-disabled" : ""}`} data-settings-search={searchId} data-disabled={disabled || undefined}>
      <span className="settings-control-label ui-type-control text-t2" title={hint}>{icon}{label}</span>
      <SwitchButton label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

const VOICE_SHORTCUT_ACTION_OPTIONS: readonly { value: VoiceShortcutAction; label: string; icon: MenuIconName }[] = localized(() => ([
  { value: "reply", label: uiText("danmaku.reply"), icon: "reply" },
  { value: "speak", label: uiText("settingsPanel.VOICE_SHORTCUT_ACTION_OPTIONS.label"), icon: "voice" },
  { value: "filter", label: uiText("settingsPanel.VOICE_SHORTCUT_ACTION_OPTIONS.label2"), icon: "filter" },
  { value: "favorite", label: uiText("settingsPanel.VOICE_SHORTCUT_ACTION_OPTIONS.label3"), icon: "favorite" },
  { value: "mark", label: uiText("settingsPanel.VOICE_SHORTCUT_ACTION_OPTIONS.label4"), icon: "mark" },
]));

function ShortcutMenuPicker({ value, onChange }: { value: readonly VoiceShortcutAction[]; onChange: (value: VoiceShortcutAction[]) => void }) {
  useUiLanguage();
  const selectedCount = value.length;
  const [draggingAction, setDraggingAction] = useState<VoiceShortcutAction | null>(null);
  const [dragOverAction, setDragOverAction] = useState<VoiceShortcutAction | null>(null);
  const [dragPointer, setDragPointer] = useState<{ x: number; y: number } | null>(null);
  const [dragRowSlot, setDragRowSlot] = useState(0);
  const [dragGrabOffset, setDragGrabOffset] = useState({ x: 0, y: 0 });
  const [dragPreviewSize, setDragPreviewSize] = useState({ width: 0, height: 0 });
  const dragRowCenters = useRef(new Map<VoiceShortcutAction, number>());
  const optionForAction = (action: VoiceShortcutAction) => VOICE_SHORTCUT_ACTION_OPTIONS.find((option) => option.value === action)!;
  const selectedOptions = value.map(optionForAction);
  const availableOptions = VOICE_SHORTCUT_ACTION_OPTIONS.filter((option) => !value.includes(option.value));

  const reorderShortcuts = (sourceAction: VoiceShortcutAction, targetAction: VoiceShortcutAction) => {
    if (sourceAction === targetAction) return;
    const fromIndex = value.indexOf(sourceAction);
    const toIndex = value.indexOf(targetAction);
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...value];
    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, sourceAction);
    onChange(next);
  };

  const dragTransformFor = (action: VoiceShortcutAction): number => {
    if (!draggingAction || !dragOverAction || !dragRowSlot || action === draggingAction) return 0;
    const sourceIndex = value.indexOf(draggingAction);
    const targetIndex = value.indexOf(dragOverAction);
    const currentIndex = value.indexOf(action);
    if (sourceIndex < 0 || targetIndex < 0 || currentIndex < 0) return 0;
    if (sourceIndex < targetIndex && currentIndex > sourceIndex && currentIndex <= targetIndex) return -dragRowSlot;
    if (sourceIndex > targetIndex && currentIndex >= targetIndex && currentIndex < sourceIndex) return dragRowSlot;
    return 0;
  };

  const readDragRowCenters = (draggedRow: HTMLElement) => {
    const centers = new Map<VoiceShortcutAction, number>();
    const rows = Array.from(draggedRow.parentElement?.querySelectorAll<HTMLElement>("[data-shortcut-action]") ?? []);
    for (const row of rows) {
      const action = row.dataset.shortcutAction as VoiceShortcutAction | undefined;
      if (!action || !value.includes(action)) continue;
      const rect = row.getBoundingClientRect();
      centers.set(action, rect.top + rect.height / 2 - dragTransformFor(action));
    }
    return centers;
  };

  const findShortcutTarget = (clientY: number): VoiceShortcutAction | null => {
    if (!draggingAction) return null;
    const sourceIndex = value.indexOf(draggingAction);
    if (sourceIndex < 0) return null;
    const remainingActions = value.filter((action) => action !== draggingAction);
    let insertionIndex = 0;
    for (const action of remainingActions) {
      const center = dragRowCenters.current.get(action);
      if (center !== undefined && clientY >= center) insertionIndex += 1;
    }
    if (insertionIndex === sourceIndex) return draggingAction;
    const targetIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
    const candidate = remainingActions[targetIndex] ?? draggingAction;
    const currentTarget = dragOverAction ?? draggingAction;
    if (candidate === currentTarget || candidate === draggingAction) return candidate;
    const currentIndex = value.indexOf(currentTarget);
    const candidateIndex = value.indexOf(candidate);
    const boundaryAction = value[candidateIndex > currentIndex ? candidateIndex : currentIndex];
    const boundary = dragRowCenters.current.get(boundaryAction);
    const dragTargetHysteresisPx = Math.min(8, Math.max(4, dragRowSlot * 0.12));
    if (boundary !== undefined) {
      if (candidateIndex > currentIndex && clientY < boundary + dragTargetHysteresisPx) return currentTarget;
      if (candidateIndex < currentIndex && clientY > boundary - dragTargetHysteresisPx) return currentTarget;
    }
    return candidate;
  };

  const beginShortcutDrag = (event: ReactPointerEvent<HTMLDivElement>, action: VoiceShortcutAction) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rowRect = event.currentTarget.getBoundingClientRect();
    setDraggingAction(action);
    setDragOverAction(action);
    setDragPointer({ x: event.clientX, y: event.clientY });
    setDragGrabOffset({ x: event.clientX - rowRect.left, y: event.clientY - rowRect.top });
    setDragPreviewSize({ width: rowRect.width, height: rowRect.height });
    dragRowCenters.current = readDragRowCenters(event.currentTarget);
    const nextRow = event.currentTarget.nextElementSibling as HTMLElement | null;
    const previousRow = event.currentTarget.previousElementSibling as HTMLElement | null;
    const measuredGap = nextRow
      ? nextRow.getBoundingClientRect().top - rowRect.bottom
      : previousRow
        ? rowRect.top - previousRow.getBoundingClientRect().bottom
        : Number.parseFloat(getComputedStyle(event.currentTarget.parentElement ?? event.currentTarget).rowGap || "0");
    setDragRowSlot(rowRect.height + Math.max(0, Number.isFinite(measuredGap) ? measuredGap : 0));
  };

  const moveShortcutDrag = (event: ReactPointerEvent<HTMLDivElement>, action: VoiceShortcutAction) => {
    if (draggingAction !== action) return;
    event.preventDefault();
    setDragPointer({ x: event.clientX, y: event.clientY });
    const nextTarget = findShortcutTarget(event.clientY);
    setDragOverAction((current) => current === nextTarget ? current : nextTarget);
  };

  const finishShortcutDrag = (event: ReactPointerEvent<HTMLDivElement>, action: VoiceShortcutAction) => {
    if (draggingAction !== action) return;
    event.preventDefault();
    const targetAction = findShortcutTarget(event.clientY) ?? dragOverAction;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingAction(null);
    setDragOverAction(null);
    setDragPointer(null);
    setDragRowSlot(0);
    setDragGrabOffset({ x: 0, y: 0 });
    setDragPreviewSize({ width: 0, height: 0 });
    dragRowCenters.current = new Map();
    if (targetAction) reorderShortcuts(action, targetAction);
  };

  const cancelShortcutDrag = (event: ReactPointerEvent<HTMLDivElement>, action: VoiceShortcutAction) => {
    if (draggingAction !== action) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingAction(null);
    setDragOverAction(null);
    setDragPointer(null);
    setDragRowSlot(0);
    setDragGrabOffset({ x: 0, y: 0 });
    setDragPreviewSize({ width: 0, height: 0 });
    dragRowCenters.current = new Map();
  };

  const dragPreviewOption = draggingAction ? optionForAction(draggingAction) : null;

  return (
    <div className="settings-shortcut-picker min-w-0">
      <div className="settings-shortcut-picker-header flex min-h-6 items-baseline justify-between gap-2">
        <span className="ui-type-control text-t2">{uiText("settingsPanel.ShortcutMenuPicker")}</span>
        <span className="ui-type-meta text-t3">{uiText("settingsPanel.ShortcutMenuPicker2")}{selectedCount}/3</span>
      </div>
      <div className="settings-shortcut-selected-list mt-1.5 space-y-1.5" role="list" aria-label={uiText("settingsPanel.aria_label")} title={uiText("settingsPanel.title")}>
        {selectedOptions.length === 0 && <div className="rounded-md border border-dashed border-line px-2 py-1.5 ui-type-meta text-t3">{uiText("settingsPanel.ShortcutMenuPicker3")}</div>}
        {selectedOptions.map((option) => (
          <div
            key={option.value}
            role="listitem"
            tabIndex={0}
            aria-label={uiText("settingsPanel.aria_label2", { label: option.label })}
            onKeyDown={event=>{if(event.key!=="ArrowUp"&&event.key!=="ArrowDown")return;event.preventDefault();const next=value[value.indexOf(option.value)+(event.key==="ArrowUp"?-1:1)];if(next)reorderShortcuts(option.value,next);}}
            aria-grabbed={draggingAction === option.value}
            data-shortcut-action={option.value}
            style={dragTransformFor(option.value) === 0 ? undefined : { transform: `translateY(${dragTransformFor(option.value)}px)` }}
            className={`settings-shortcut-item flex min-h-8 cursor-grab items-center gap-1 rounded-md border px-1.5 transition-colors ${draggingAction === option.value ? "cursor-grabbing border-accent/70 bg-accent-subtle/70 opacity-45" : dragOverAction === option.value ? "border-accent/50 bg-accent-subtle/30" : "border-line bg-bg"}`}
            onPointerDown={(event) => beginShortcutDrag(event, option.value)}
            onPointerMove={(event) => moveShortcutDrag(event, option.value)}
            onPointerUp={(event) => finishShortcutDrag(event, option.value)}
            onPointerCancel={(event) => cancelShortcutDrag(event, option.value)}
          >
            <div
              className="flex min-w-0 flex-1 cursor-grab select-none touch-none items-center gap-1.5 rounded px-1 py-0.5 text-left ui-type-control text-t2"
            >
              <LucideGripVertical className="size-4 shrink-0 text-t3" aria-hidden="true" /><MenuActionIcon name={option.icon} active />
              <span className="truncate">{option.label}</span>
            </div>
            <Button size="icon-sm" variant="ghost"
              type="button"
              data-shortcut-delete
              aria-label={uiText("settingsPanel.aria_label3", { label: option.label })}
              title={uiText("settingsPanel.title2", { label: option.label })}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onChange(value.filter((item) => item !== option.value))}
              className="size-6 rounded text-t3 hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <div className="settings-shortcut-add-group mt-3 min-w-0" role="group" aria-label={uiText("settingsPanel.aria_label4")}>
        <div className="settings-shortcut-add-label ui-type-meta text-t3">{uiText("settingsPanel.ShortcutMenuPicker4")}</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {availableOptions.map((option) => {
            const disabled = selectedCount >= MAX_VOICE_SHORTCUT_ACTIONS;
            return (
              <Button variant="outline"
                key={option.value}
                type="button"
                aria-pressed={false}
                aria-label={uiText("settingsPanel.aria_label5", { label: option.label })}
                title={disabled ? uiText("settingsPanel.title3") : uiText("settingsPanel.title4", { label: option.label })}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onChange([...value, option.value]);
                }}
                className="inline-flex min-h-7 min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-line px-2 ui-type-control text-t3 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-surface enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MenuActionIcon name={option.icon} />
                <span>{uiText("common.add")}{option.label}</span>
              </Button>
            );
          })}
        </div>
      </div>
      {dragPointer && dragPreviewOption && createPortal(
        <div
          className="settings-shortcut-drag-preview fixed z-[70] flex items-center gap-1.5 rounded-md border border-accent/70 bg-surface px-2 py-1 ui-type-control text-t1 shadow-xl shadow-black/30"
          style={{
            left: dragPointer.x - dragGrabOffset.x,
            top: dragPointer.y - dragGrabOffset.y,
            width: dragPreviewSize.width,
            height: dragPreviewSize.height,
          }}
          aria-hidden="true"
        >
          <MenuActionIcon name={dragPreviewOption.icon} active />
          <span>{dragPreviewOption.label}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}

function PixelInput({
  label,
  value,
  onChange,
  min,
  max,
  step,
  unit = 'px',
  searchId,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  searchId?: string;
}) {
  useUiLanguage();
  return (
    <div className="settings-control-row settings-number-row" data-settings-search={searchId}>
      <span className="settings-control-label ui-type-control text-t2">{label}</span>
      <label className="settings-font-size-control">
        <Input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          aria-label={label}
          className="settings-font-size-input font-mono ui-type-control text-t1"
        />
        <span className="settings-font-size-unit ui-type-control text-t3">{unit}</span>
      </label>
    </div>
  );
}

function SurfaceColorInput({ value, onChange, searchId, automatic = false, onReset }: { value: RgbaColor; onChange: (value: RgbaColor) => void; searchId?: string; automatic?: boolean; onReset?: () => void }) {
  useUiLanguage();
  return (
    <div className="settings-control-row settings-number-row" data-settings-search={searchId}>
      <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SurfaceColorInput")}</span>
      <div className="settings-control-field settings-surface-color-field flex min-w-0 flex-1 items-center gap-2">
        <ThemeColorField
          label={uiText("settingsPanel.aria_label6")}
          value={rgbaToCss(value)}
          valueLabel={automatic ? uiText("settingsPanel.SurfaceColorInput2") : undefined}
          onChange={next => { const color = parseThemeColor(next); if (color) onChange(color); }}
        />
        {onReset && <Button variant="ghost" size={null} type="button" className="settings-surface-auto" disabled={automatic} onClick={onReset} title={uiText("settingsPanel.title5")} aria-label={uiText("settingsPanel.aria_label7")}><RotateCcw size={14} /></Button>}
      </div>
    </div>
  );
}

function SecondsInput({ label, value, onChange, min = MIN_EVENT_EXPIRY_SECONDS, max = MAX_EVENT_EXPIRY_SECONDS, searchId }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; searchId?: string }) {
  useUiLanguage();
  return (
    <div className="settings-control-row settings-number-row" data-settings-search={searchId}>
      <span className="settings-control-label ui-type-control text-t2">{label}</span>
      <label className="settings-font-size-control">
        <Input
          type="number"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(next);
          }}
          aria-label={label}
          className="settings-font-size-input font-mono ui-type-control text-t1"
        />
        <span className="settings-font-size-unit ui-type-control text-t3">{uiText("settingsPanel.SecondsInput")}</span>
      </label>
    </div>
  );
}

function DurationInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  useUiLanguage();
  return <div className="settings-control-row settings-number-row" data-settings-search="event-animation">
    <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.DurationInput")}</span>
    <label className="settings-font-size-control">
      <Input type="number" min={0} step={EVENT_ANIMATION_DURATION_STEP_MS} value={value} aria-label={uiText("settingsPanel.aria_label8")}
        className="settings-font-size-input font-mono ui-type-control text-t1"
        onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} />
      <span className="settings-font-size-unit ui-type-control text-t3">ms</span>
    </label>
  </div>;
}

function SectionTitle({ title, onReset, iconName }: { title: string; iconName?: string; onReset?: () => void }) {
  useUiLanguage();
  return (
    <header className="settings-section-title" data-settings-level="1">
      <h3 className="settings-experience-heading ui-type-section-title font-medium text-t1"><SettingsIcon name={iconName ?? ""} />{title}</h3>
      {onReset && <Button variant="ghost" size={null} type="button" className={`${resetButtonClass} settings-reset-button settings-icon-action`} title={uiText("settingsPanel.title6")} aria-label={uiText("settingsPanel.aria_label9")} onClick={onReset}><RotateCcw size={16} aria-hidden="true" /></Button>}
    </header>
  );
}

function SettingsSubsectionTitle({ title, level = 2, hint, icon, iconName }: { title: string; iconName?: string; level?: 2 | 3; hint?: string; icon?: ReactNode }) {
  useUiLanguage();
  return (
    <div
      className={level === 3 ? "settings-tertiary-title" : "settings-subsection-title"}
      data-settings-level={level}
      title={hint}
    >
      {icon ? <span className="settings-heading-icon" aria-hidden="true">{icon}</span> : <SettingsIcon name={iconName ?? ""} />}{title}
    </div>
  );
}

type PendingReset = {
  title: string;
  description: string;
  action: () => void | Promise<void>;
};

function SettingsFilterRow({
  label,
  active,
  onPrimaryToggle,
  selected,
  onToggle,
}: {
  label: string;
  active: boolean;
  onPrimaryToggle: () => void;
  selected?: DisplayEventFilters["interactKinds"];
  onToggle?: (key: keyof DisplayEventFilters["interactKinds"]) => void;
}) {
  useUiLanguage();
  const [open, setOpen] = useState(false);
  const hasSubmenu = Boolean(selected && onToggle);
  const surface=useRef<HTMLDivElement>(null);
  useEffect(()=>open&&surface.current?bindUiDismissableLayer(surface.current,()=>setOpen(false)):undefined,[open]);

  return (
    <div ref={surface} className="settings-filter-submenu" onKeyDown={event=>{const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')];const index=items.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==="Home"?0:event.key==="End"?items.length-1:event.key==="ArrowDown"?(index+1)%items.length:event.key==="ArrowUp"?(index+items.length-1)%items.length:-1;if(next>=0){event.preventDefault();items[next]?.focus();}}}>
      <div className={`settings-filter-row settings-control-surface ${active ? "is-active" : ""}`}>
        <Button variant="ghost" size={null}
          type="button"
          aria-pressed={active}
          aria-label={`${label}${active ? uiText("settingsPanel.aria_label10") : uiText("settingsPanel.aria_label11")}`}
          className={`settings-filter-row-toggle h-full border-0 bg-transparent ui-type-control ${active ? "is-active" : ""}`}
          onClick={onPrimaryToggle}
        >
          <span className="settings-filter-row-label">{label}</span>
          <span className="settings-filter-row-state">{active ? uiText("common.show") : uiText("common.hide")}</span>
        </Button>
        {hasSubmenu && (
          <Button variant="ghost" size={null}
            type="button"
            className="settings-filter-row-disclosure h-full border-0 bg-transparent"
            aria-label={uiText("settingsPanel.aria_label12", { label: label })}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <LucideChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
        )}
      </div>
      {open && selected && onToggle && (
        <div className="settings-control-menu settings-filter-menu" role="menu" aria-label={uiText("settingsPanel.aria_label13", { label: label })}>
          {INTERACT_KIND_OPTIONS.map((option) => {
            const checked = selected[option.key] !== false;
            return (
              <Button variant="ghost" size={null}
                key={option.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                onClick={() => onToggle(option.key)}
                className="settings-filter-menu-item h-auto justify-start border-0 bg-transparent ui-type-control text-t2"
              >
                <span className={checked ? "size-1.5 rounded-full bg-accent" : "size-1.5 rounded-full border border-line"} aria-hidden="true" />
                {option.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SettingsPanel({
  sceneSettings,
  setSceneSettings,
  displayOpen,
  displayLocked,
  onToggleDisplay,
  onToggleDisplayLock,
  onLocateDisplay,
  giftOpen,
  giftLocked,
  onToggleGift,
  onToggleGiftLock,
  onLocateGift,
  revenueSelection,
  onRevenueWindowMode,
  onToggleRevenueChild,
  onResetWindowLayout,
  onResetDisplayWindowLayout,
  onResetGiftWindowLayout,
  onResetAllWindowLayout,
  diagnosticStatus,
  diagnosticMarkers,
  onMarkDiagnosticIssue,
  onExportDiagnosticBundle,
  onDiagnosticExportStateChange,
  onOpenDiagnosticDirectory,
  onSaveNickname,
  onDeleteNickname,
  archiveRepository,
  onArchiveChanged,
  request,
}: SettingsPanelProps) {
  const uiLanguage = useUiLanguage();
  const [aboutOpen, setAboutOpen] = useState(false);
  const [languageError, setLanguageError] = useState("");
  const palette = useTheme((state) => state.palette);
  const customColor = useTheme(state => state.customColor);
  const setCustomColor = useTheme(state => state.setCustomColor);
  const mode = useTheme((state) => state.mode);
  const softwareScheme = useCompatibleOutputScheme();
  const setPalette = useTheme((state) => state.setPalette);
  const setMode = useTheme((state) => state.setMode);
  const uiScale = useGeneralSettings((state) => state.uiScale);
  const eventDisplayPreferences = useGeneralSettings((state) => state.eventDisplayPreferences);
  const favoriteEditOnAdd = useGeneralSettings((state) => state.favoriteEditOnAdd);
  const liveScrollDirection = useGeneralSettings((state) => state.liveScrollDirection);
  const liveContentAlignment = useGeneralSettings((state) => state.liveContentAlignment);
  const windowAppearance = useGeneralSettings((state) => state.windowAppearance);
  const eventExpiry = useGeneralSettings((state) => state.eventExpiry);
  const stickyEvents = useGeneralSettings(state => state.stickyEvents);
  const setStickyEvents = useGeneralSettings(state => state.setStickyEvents);
  const eventWindowCapacity = useGeneralSettings(state => state.eventWindowCapacity);
  const setEventWindowCapacity = useGeneralSettings(state => state.setEventWindowCapacity);
  const mergeSameDanmu = useGeneralSettings((state) => state.mergeSameDanmu);
  const showLiveGiftEffect = useGeneralSettings((state) => state.showLiveGiftEffect);
  const showLiveGuardEffect = useGeneralSettings((state) => state.showLiveGuardEffect);
  const showGiftWindowEffect = useGeneralSettings((state) => state.showGiftWindowEffect);
  const showGuardWindowEffect = useGeneralSettings((state) => state.showGuardWindowEffect);
  const sameDanmuWindowSeconds = useGeneralSettings((state) => state.sameDanmuWindowSeconds);
  const displayWindowFilters = useGeneralSettings((state) => state.displayWindowFilters);
  const closeBehavior = useGeneralSettings((state) => state.closeBehavior);
  const minimizeBehavior = useGeneralSettings((state) => state.minimizeBehavior);
  const startOnBoot = useGeneralSettings((state) => state.startOnBoot);
  const autoConnectOnStartup = useGeneralSettings((state) => state.autoConnectOnStartup);
  const reviewOpenCurrentOwner = useGeneralSettings((state) => state.reviewOpenCurrentOwner);
  const reviewArchiveRetentionDays = useGeneralSettings((state) => state.reviewArchiveRetentionDays);
  const setUiScale = useGeneralSettings((state) => state.setUiScale);
  const setEventAnimationPreset = useGeneralSettings((state) => state.setEventAnimationPreset);
  const setEventAnimationDuration = useGeneralSettings((state) => state.setEventAnimationDuration);
  const setEventDisplayPreference = useGeneralSettings((state) => state.setEventDisplayPreference);
  const setLiveScrollDirection = useGeneralSettings((state) => state.setLiveScrollDirection);
  const setLiveContentAlignment = useGeneralSettings((state) => state.setLiveContentAlignment);
  const windowScheme = useGeneralSettings(state=>state.windowScheme);
  const setWindowScheme = useGeneralSettings(state=>state.setWindowScheme);
  const setWindowAppearance = useGeneralSettings((state) => state.setWindowAppearance);
  const setEventExpiry = useGeneralSettings((state) => state.setEventExpiry);
  const setMergeSameDanmu = useGeneralSettings((state) => state.setMergeSameDanmu);
  const setSameDanmuWindowSeconds = useGeneralSettings((state) => state.setSameDanmuWindowSeconds);
  const setShowLiveGiftEffect = useGeneralSettings((state) => state.setShowLiveGiftEffect);
  const setShowLiveGuardEffect = useGeneralSettings((state) => state.setShowLiveGuardEffect);
  const setShowGiftWindowEffect = useGeneralSettings((state) => state.setShowGiftWindowEffect);
  const setShowGuardWindowEffect = useGeneralSettings((state) => state.setShowGuardWindowEffect);
  const setFavoriteEditOnAdd = useGeneralSettings((state) => state.setFavoriteEditOnAdd);
  const setDisplayWindowFilters = useGeneralSettings((state) => state.setDisplayWindowFilters);
  const setCloseBehavior = useGeneralSettings((state) => state.setCloseBehavior);
  const setMinimizeBehavior = useGeneralSettings((state) => state.setMinimizeBehavior);
  const setStartOnBoot = useGeneralSettings((state) => state.setStartOnBoot);
  const setAutoConnectOnStartup = useGeneralSettings((state) => state.setAutoConnectOnStartup);
  const setReviewOpenCurrentOwner = useGeneralSettings((state) => state.setReviewOpenCurrentOwner);
  const setReviewArchiveRetentionDaysState = useGeneralSettings((state) => state.setReviewArchiveRetentionDays);
  const resetLiveSettings = useGeneralSettings((state) => state.resetLive);
  const resetWindowsSettings = useGeneralSettings((state) => state.resetWindows);
  const resetEventDisplaySettings = useGeneralSettings((state) => state.resetEventDisplay);
  const resetEventFiltersSettings = useGeneralSettings((state) => state.resetEventFilters);
  const resetReviewSettings = useGeneralSettings((state) => state.resetReview);
  const resetGeneralSettings = useGeneralSettings((state) => state.resetGeneral);
  const voiceSettings = useVoiceSettings();
  const resetVoiceOutputSettings = useVoiceSettings((state) => state.resetVoiceOutputSettings);
  const resetEventInteractionSettings = useVoiceSettings((state) => state.resetEventInteractionSettings);
  const [version, setVersion] = useState("0.1.2");
  const [voiceOutputDevices, setVoiceOutputDevices] = useState<AudioOutputDevice[]>([]);
  const [currentSection, setCurrentSection] = useState<SettingsSectionId>(SETTINGS_SECTIONS[0].id);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [settingsSearchOpen, setSettingsSearchOpen] = useState(false);
  const [settingsSearchQuery, setSettingsSearchQuery] = useState("");
  const [settingsSearchPosition, setSettingsSearchPosition] = useState({ left: 8, top: 8, width: 280, ready: false });
  const setReviewArchiveRetentionDays = useCallback((days: number | null) => {
    setReviewArchiveRetentionDaysState(days);
    recordFeatureDiagnostic({
      featureId: "review-archive",
      stage: "setting-change",
      action: "retention-policy",
      outcome: "changed",
      data: { retentionDays: days },
    });
  }, [setReviewArchiveRetentionDaysState]);
  const [nicknameManagerOpen, setNicknameManagerOpen] = useState(false);
  const [editingNicknameUid, setEditingNicknameUid] = useState<string | null>(null);
  const [editingNicknameValue, setEditingNicknameValue] = useState("");
  const [nicknameNotice, setNicknameNotice] = useState("");
  const [pendingReset, setPendingReset] = useState<PendingReset | null>(null);
  const [nicknameManagerPosition, setNicknameManagerPosition] = useState({ left: 8, top: 8, width: 320, maxHeight: 420, ready: false });
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const directoryRef = useRef<HTMLDivElement>(null);
  const settingsSearchShellRef = useRef<HTMLDivElement>(null);
  const settingsSearchPopoverRef = useRef<HTMLDivElement>(null);
  const settingsSearchInputRef = useRef<HTMLInputElement>(null);
  const settingsSearchTriggerRef = useRef<HTMLButtonElement>(null);
  const nicknameManagerTriggerRef = useRef<HTMLButtonElement>(null);
  const nicknameManagerRef = useRef<HTMLDivElement>(null);
  const hostDeviceRowRef = useRef<HTMLDivElement>(null);
  const audienceDeviceRowRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef(new Map<SettingsSectionId, HTMLElement>());
  const anchorRefs = useRef(new Map<SettingsAnchorId, HTMLElement>());
  const currentIndexRef = useRef(0);
  const wheelRemainderRef = useRef(0);
  const wheelResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollTargetRef = useRef<SettingsSectionId | null>(null);

  const settingsSearchResults = useMemo(() => {
    const query = settingsSearchQuery.trim().toLocaleLowerCase();
    if (!query) return [];
    return SETTINGS_SEARCH_ENTRIES
      .filter((entry) => `${entry.label} ${entry.keywords}`.toLocaleLowerCase().includes(query))
      .slice(0, 8);
  }, [settingsSearchQuery, uiLanguage]);


  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  useEffect(() => {
    let active = true;
    void listAudioDevices().then((devices) => { if (active) setVoiceOutputDevices(devices); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (directoryRef.current && !directoryRef.current.contains(target)) setDirectoryOpen(false);
      if (
        settingsSearchShellRef.current
        && !settingsSearchShellRef.current.contains(target)
        && !settingsSearchPopoverRef.current?.contains(target)
      ) setSettingsSearchOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (!directoryOpen) return;
    directoryRef.current?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')?.focus();
  }, [directoryOpen]);

  useEffect(() => () => {
    if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
  }, []);

  useLayoutEffect(() => {
    if (!settingsSearchOpen) return;
    const updatePosition = () => {
      const trigger = settingsSearchTriggerRef.current;
      const frame = frameRef.current;
      if (!trigger || !frame) return;
      const triggerRect = trigger.getBoundingClientRect();
      const frameRect = frame.getBoundingClientRect();
      const margin = 8;
      const width = Math.max(196, Math.min(308, frameRect.width - margin * 2));
      const minLeft = Math.max(margin, frameRect.left + margin);
      const maxLeft = Math.min(window.innerWidth - width - margin, frameRect.right - width - margin);
      const preferredLeft = triggerRect.right - width;
      const left = maxLeft >= minLeft
        ? Math.max(minLeft, Math.min(maxLeft, preferredLeft))
        : Math.max(margin, Math.min(window.innerWidth - width - margin, preferredLeft));
      const preferredTop = triggerRect.bottom + margin;
      const top = Math.max(margin, Math.min(window.innerHeight - 120, preferredTop));
      setSettingsSearchPosition({ left, top, width, ready: true });
    };
    setSettingsSearchPosition((current) => ({ ...current, ready: false }));
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined" || !frameRef.current
      ? null
      : new ResizeObserver(updatePosition);
    if (resizeObserver && frameRef.current) resizeObserver.observe(frameRef.current);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [settingsSearchOpen]);

  const jumpTo = (sectionId: SettingsSectionId, anchorId?: SettingsAnchorId) => {
    const scroller = scrollRef.current;
    const target = (anchorId && anchorRefs.current.get(anchorId)) || sectionRefs.current.get(sectionId);
    if (!scroller || !target) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollTargetRef.current = sectionId;
    scroller.scrollTo({
      top: getSettingsScrollTop(scroller, target),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    const index = SETTINGS_SECTIONS.findIndex((section) => section.id === sectionId);
    currentIndexRef.current = Math.max(0, index);
    setCurrentSection(sectionId);
  };

  const jumpToSearchResult = (entry: SettingsSearchEntry) => {
    const scroller = scrollRef.current;
    const target = scroller?.querySelector<HTMLElement>(`[data-settings-search="${entry.id}"]`);
    if (!scroller || !target) {
      jumpTo(entry.sectionId);
      return;
    }
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollerRect = scroller.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    scrollTargetRef.current = null;
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + targetRect.top - scrollerRect.top - 16),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    const index = SETTINGS_SECTIONS.findIndex((section) => section.id === entry.sectionId);
    currentIndexRef.current = Math.max(0, index);
    setCurrentSection(entry.sectionId);
    setSettingsSearchOpen(false);
    setSettingsSearchQuery("");
    requestAnimationFrame(() => target.classList.add("is-search-target"));
    window.setTimeout(() => target.classList.remove("is-search-target"), 900);
  };

  useEffect(() => {
    if (!request) return;
    const id = requestAnimationFrame(() => jumpTo(request.sectionId, request.anchorId));
    return () => cancelAnimationFrame(id);
  }, [request?.requestId]);

  useEffect(() => {
    if (!nicknameManagerOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (nicknameManagerTriggerRef.current?.contains(target) || nicknameManagerRef.current?.contains(target)) return;
      setNicknameManagerOpen(false);
      setEditingNicknameUid(null);
      setNicknameNotice("");
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setNicknameManagerOpen(false);
      setEditingNicknameUid(null);
      setNicknameNotice("");
      nicknameManagerTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [nicknameManagerOpen]);

  useLayoutEffect(() => {
    if (!nicknameManagerOpen) return;
    const updatePosition = () => {
      const frameRect = frameRef.current?.getBoundingClientRect();
      const popup = nicknameManagerRef.current;
      if (!frameRect || !popup) return;
      const popupRect = popup.getBoundingClientRect();
      const margin = 8;
      const width = Math.min(460, Math.max(280, window.innerWidth - margin * 2));
      const maxHeight = Math.max(180, Math.min(520, frameRect.height - 32));
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      const maxTop = Math.max(margin, window.innerHeight - popupRect.height - margin);
      const centeredLeft = frameRect.left + (frameRect.width - width) / 2;
      const centeredTop = frameRect.top + (frameRect.height - popupRect.height) / 2;
      setNicknameManagerPosition({
        left: Math.max(margin, Math.min(maxLeft, centeredLeft)),
        top: Math.max(margin, Math.min(maxTop, centeredTop)),
        width,
        maxHeight,
        ready: true,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver = typeof ResizeObserver === "undefined" || !nicknameManagerRef.current
      ? null
      : new ResizeObserver(updatePosition);
    if (resizeObserver && nicknameManagerRef.current) {
      resizeObserver.observe(nicknameManagerRef.current);
      if (frameRef.current) resizeObserver.observe(frameRef.current);
    }
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      resizeObserver?.disconnect();
    };
  }, [nicknameManagerOpen]);

  const saveNicknameEntry = (uid: string) => {
    const nickname = editingNicknameValue.trim();
    if (!nickname) {
      setNicknameNotice(uiText("settingsPanel.SettingsPanel.saveNicknameEntry"));
      return;
    }
    if (!onSaveNickname) {
      setNicknameNotice(uiText("settingsPanel.SettingsPanel.saveNicknameEntry2"));
      return;
    }
    onSaveNickname(uid, nickname);
    setEditingNicknameUid(null);
    setEditingNicknameValue("");
    setNicknameNotice(uiText("settingsPanel.SettingsPanel.saveNicknameEntry3"));
  };

  const deleteNickname = (uid: string) => {
    if (!onDeleteNickname) {
      setNicknameNotice(uiText("settingsPanel.SettingsPanel.deleteNickname"));
      return;
    }
    onDeleteNickname(uid);
    if (editingNicknameUid === uid) {
      setEditingNicknameUid(null);
      setEditingNicknameValue("");
    }
    setNicknameNotice(uiText("settingsPanel.SettingsPanel.deleteNickname2"));
  };

  const nicknameEntries = Object.entries(voiceSettings.userNicknames);

  const handleNavigatorWheel = (event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const scroller = scrollRef.current;
    const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? (scroller?.clientHeight ?? 400) : 1;
    const result = consumeSectionWheel(
      currentIndexRef.current,
      wheelRemainderRef.current,
      event.deltaY * unit,
      SETTINGS_SECTIONS.length,
    );
    wheelRemainderRef.current = result.remainder;
    if (result.index !== currentIndexRef.current) jumpTo(SETTINGS_SECTIONS[result.index].id);
    if (wheelResetTimerRef.current) clearTimeout(wheelResetTimerRef.current);
    wheelResetTimerRef.current = setTimeout(() => { wheelRemainderRef.current = 0; }, 180);
  };

  const handleNavigatorKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "Escape") {
      setDirectoryOpen(false);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = Math.min(SETTINGS_SECTIONS.length - 1, Math.max(0, currentIndexRef.current + direction));
    if (next !== currentIndexRef.current) jumpTo(SETTINGS_SECTIONS[next].id);
  };

  const handleScroll = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const targetSectionId = scrollTargetRef.current;
    if (targetSectionId) {
      const target = sectionRefs.current.get(targetSectionId);
      if (!target) return;
      const targetTop = getSettingsScrollTop(scroller, target);
      if (!isSectionNavigationTargetReached(targetTop, scroller.scrollTop)) return;
      scrollTargetRef.current = null;
      const targetIndex = SETTINGS_SECTIONS.findIndex((section) => section.id === targetSectionId);
      currentIndexRef.current = Math.max(0, targetIndex);
      setCurrentSection(targetSectionId);
      return;
    }
    const sectionScrollerRect = scroller.getBoundingClientRect();
    const offsets = SETTINGS_SECTIONS.map((section) => {
      const target = sectionRefs.current.get(section.id);
      if (!target) return 0;
      return scroller.scrollTop + target.getBoundingClientRect().top - sectionScrollerRect.top;
    });
    const activeIndex = resolveActiveSectionIndex(
      offsets,
      scroller.scrollTop,
      scroller.clientHeight,
      scroller.scrollHeight,
    );
    if (activeIndex !== currentIndexRef.current) {
      currentIndexRef.current = activeIndex;
      setCurrentSection(SETTINGS_SECTIONS[activeIndex].id);
    }
  };

  const updateScene = <K extends keyof SceneSettings>(key: K, value: SceneSettings[K]) => {
    setSceneSettings((current) => ({ ...current, [key]: value }));
  };

  const resetGeneral = () => {
    setPalette("sakura");
    setCustomColor(DEFAULT_CUSTOM_COLOR);
    setMode("system");
    resetGeneralSettings();
  };
  const resetDisplay = () => {
    resetEventDisplaySettings();
  };
  const resetFilters = () => {
    const defaults = createDefaultSceneSettings();
    setSceneSettings((current) => ({
      ...current,
      giftThreshold: defaults.giftThreshold,
      giftThresholdMode: defaults.giftThresholdMode,
      audienceFilters: defaults.audienceFilters,
    }));
    resetEventFiltersSettings();
  };
  const resetLive = () => {
    const defaults = createDefaultSceneSettings();
    setSceneSettings((current) => ({
      ...current,
      layoutMode: defaults.layoutMode,
      leftRatio: defaults.leftRatio,
      leftBoundaries: [...defaults.leftBoundaries],
      rightBoundaries: [...defaults.rightBoundaries],
    }));
    resetLiveSettings();
  };
  const resetWindows = () => {
    resetWindowsSettings();
  };
  const resetAll = () => {
    useUpdatePreferences.setState({automatic:true,route:"auto"});
    resetGeneral();
    resetDisplay();
    resetFilters();
    resetLive();
    resetReviewSettings();
    resetWindows();
    resetEventInteractionSettings();
    resetVoiceOutputSettings();
  };

  const requestReset = (title: string, description: string, action: () => void | Promise<void>) => {
    setPendingReset({ title, description, action });
  };

  const requestSectionReset = (section: string, action: () => void | Promise<void>) => {
    requestReset(uiText("settingsPanel.SettingsPanel.requestSectionReset", { section: section }), uiText("settingsPanel.SettingsPanel.requestSectionReset2", { section: section }), action);
  };

  const getVoiceOutputDeviceTitle = (deviceId: string | null) => {
    if (deviceId === null) {
      const systemDefault = voiceOutputDevices.find((candidate) => candidate.isDefault);
      return systemDefault ? uiText("settingsPanel.SettingsPanel.getVoiceOutputDeviceTitle", { name: systemDefault.name }) : uiText("settingsPanel.SettingsPanel.getVoiceOutputDeviceTitle2");
    }
    const device = voiceOutputDevices.find((candidate) => candidate.id === deviceId);
    return device ? `${device.name}${device.isDefault ? uiText("settingsPanel.SettingsPanel.getVoiceOutputDeviceTitle3") : ""}` : undefined;
  };

  const voiceOutputOptions: SharedSettingsListOption[] = [
    { value: "", label: uiText("settingsPanel.SettingsPanel.voiceOutputOptions.label"), title: getVoiceOutputDeviceTitle(null) },
    ...voiceOutputDevices.map((device) => ({
      value: device.id,
      label: `${device.name}${device.isDefault ? uiText("settingsPanel.SettingsPanel.voiceOutputOptions.label2") : ""}`,
      title: device.name,
    })),
  ];
  const voiceOutputOptionsSignature = voiceOutputOptions.map((option) => `${option.value}:${option.label}`).join("\u001f");
  const hostDeviceLayout = useAdaptiveSettingsRowLayout(
    hostDeviceRowRef,
    `${voiceOutputOptionsSignature}\u001f${voiceSettings.outputScope === "host" || voiceSettings.outputScope === "both" ? "visible" : "hidden"}`,
    "data-settings-layout",
  );
  const audienceDeviceLayout = useAdaptiveSettingsRowLayout(
    audienceDeviceRowRef,
    `${voiceOutputOptionsSignature}\u001f${voiceSettings.outputScope === "audience" || voiceSettings.outputScope === "both" ? "visible" : "hidden"}`,
    "data-settings-layout",
  );

  const toggleDisplayWindowFilter = (key: "danmu" | "interact") => {
    setDisplayWindowFilters((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleDisplayWindowInteractKind = (key: keyof DisplayEventFilters["interactKinds"]) => {
    setDisplayWindowFilters((current) => ({
      ...current,
      interactKinds: { ...current.interactKinds, [key]: !current.interactKinds[key] },
    }));
  };

  const currentLabel = SETTINGS_SECTIONS.find((section) => section.id === currentSection)?.label ?? uiText("settingsPanel.SettingsPanel.currentLabel");
  const openSettingsSearch = () => {
    setDirectoryOpen(false);
    setSettingsSearchPosition((current) => ({ ...current, ready: false }));
    setSettingsSearchOpen(true);
    requestAnimationFrame(() => settingsSearchInputRef.current?.focus());
  };

  const closeSettingsSearch = (restoreFocus = false) => {
    setSettingsSearchOpen(false);
    setSettingsSearchQuery("");
    if (restoreFocus) requestAnimationFrame(() => settingsSearchTriggerRef.current?.focus());
  };

  const handleSettingsSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettingsSearch(true);
    }
  };

  return (
    <div ref={frameRef} className="settings-panel-frame absolute inset-3 flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-bg">
      <div ref={directoryRef} className="settings-panel-header relative z-20 flex h-11 shrink-0 items-center gap-2 border-b border-line px-4 pr-11">
        <h2 className="ui-type-section-title font-medium text-t1">{uiText("common.settings")}</h2>
        <div ref={settingsSearchShellRef} className="settings-search-shell relative ml-auto">
          <Button variant="outline"
            ref={settingsSearchTriggerRef}
            type="button"
            aria-label={uiText("settingsPanel.aria_label14")}
            aria-expanded={settingsSearchOpen}
            aria-haspopup="dialog"
            title={uiText("settingsPanel.title7")}
            className="settings-search-trigger settings-control-surface flex size-8 items-center justify-center ui-type-control text-t2"
            onClick={() => settingsSearchOpen ? closeSettingsSearch() : openSettingsSearch()}
          >
            <LucideSearch className="size-4" aria-hidden="true" />
          </Button>
          {settingsSearchOpen && (
            createPortal(
              <div
                ref={settingsSearchPopoverRef}
                className="settings-search-popover fixed z-50 rounded-lg border border-line bg-surface p-2 shadow-xl shadow-black/20"
                role="dialog"
                aria-label={uiText("settingsPanel.aria_label14")}
                style={{
                  left: settingsSearchPosition.left,
                  top: settingsSearchPosition.top,
                  width: settingsSearchPosition.width,
                  visibility: settingsSearchPosition.ready ? "visible" : "hidden",
                }}
              >
              <div className="settings-search-input-wrap settings-control-surface flex items-center gap-2 px-2">
                <LucideSearch className="size-4 shrink-0 text-t3" aria-hidden="true" />
                <Input
                  ref={settingsSearchInputRef}
                  value={settingsSearchQuery}
                  onChange={(event) => setSettingsSearchQuery(event.target.value)}
                  onKeyDown={handleSettingsSearchKeyDown}
                  placeholder={uiText("settingsPanel.placeholder")}
                  aria-label={uiText("settingsPanel.aria_label14")}
                  className="h-full min-w-0 flex-1 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 ui-type-control text-t1 placeholder:text-t3"
                />
                {settingsSearchQuery && (
                  <Button size="icon-sm" variant="ghost" type="button" aria-label={uiText("settingsPanel.aria_label15")} className="rounded p-0.5 ui-type-control text-t3 hover:bg-raised hover:text-t1" onClick={() => { setSettingsSearchQuery(""); settingsSearchInputRef.current?.focus(); }}><X size={14} aria-hidden="true" /></Button>
                )}
              </div>
              <div className="settings-search-results mt-2" aria-live="polite">
                {!settingsSearchQuery.trim() ? (
                  <div className="px-2 py-2 ui-type-meta text-t3">{uiText("settingsPanel.SettingsPanel")}</div>
                ) : settingsSearchResults.length === 0 ? (
                  <div className="px-2 py-2 ui-type-meta text-t3">{uiText("settingsPanel.SettingsPanel2")}</div>
                ) : (
                  settingsSearchResults.map((entry) => (
                    <Button variant="ghost" size={null}
                      key={entry.id}
                      type="button"
                      className="settings-search-result flex h-auto w-full border-0 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                      onClick={() => jumpToSearchResult(entry)}
                    >
                      <span className="min-w-0 truncate ui-type-control text-t1">{entry.label}</span>
                      <span className="shrink-0 ui-type-micro text-t3">{SETTINGS_SECTIONS.find((section) => section.id === entry.sectionId)?.label}</span>
                    </Button>
                  ))
                )}
              </div>
              </div>,
              document.body,
            )
          )}
        </div>
        <div className="settings-section-navigator-shell">
          <Button variant="ghost"
            type="button"
            className="settings-section-navigator settings-control-surface ml-0 flex h-8 min-w-0 items-center justify-start gap-1 px-2 text-left ui-type-control text-t2"
            aria-label={uiText("settingsPanel.aria_label16", { currentLabel: currentLabel })}
            aria-haspopup="listbox"
            aria-expanded={directoryOpen}
            onClick={() => setDirectoryOpen((open) => !open)}
            onWheel={handleNavigatorWheel}
            onKeyDown={handleNavigatorKeyDown}
          >
            <span className="settings-section-navigator-label truncate">{currentLabel}</span>
            <LucideChevronDown className={`size-4 shrink-0 transition-transform ${directoryOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
          {directoryOpen && (
            <div role="listbox" aria-label={uiText("settingsPanel.aria_label17")} className="settings-control-menu settings-section-navigator-menu absolute" onKeyDown={event => {
              const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="option"]')];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (index + 1) % items.length : event.key === "ArrowUp" ? (index + items.length - 1) % items.length : -1;
              if (next >= 0) { event.preventDefault(); items[next]?.focus(); }
              if (event.key === "Escape" || event.key === "Tab") { event.stopPropagation(); setDirectoryOpen(false); directoryRef.current?.querySelector<HTMLButtonElement>(".settings-section-navigator")?.focus(); }
            }}>
            {SETTINGS_SECTIONS.map((section) => (
              <Button variant="ghost"
                key={section.id}
                type="button"
                role="option"
                aria-selected={section.id === currentSection}
                onClick={() => { jumpTo(section.id); setDirectoryOpen(false); directoryRef.current?.querySelector<HTMLButtonElement>(".settings-section-navigator")?.focus(); }}
                className={`flex h-8 w-full items-center justify-start gap-2 rounded-md border-0 px-2 text-left ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${section.id === currentSection ? "bg-accent-subtle font-medium text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`}
              >
                <SettingsIcon name={section.id} />{section.label}
              </Button>
            ))}
            </div>
          )}
        </div>
      </div>

      <WorkbenchScroll
        ref={scrollRef}
        className="settings-content"
        onScroll={handleScroll}
        onPointerDown={() => {
          scrollTargetRef.current = null;
        }}
        onWheelCapture={() => {
          scrollTargetRef.current = null;
        }}
      >
        <section ref={(node) => { if (node) sectionRefs.current.set("general", node); }} className="settings-section" data-settings-section="general">
          <SectionTitle iconName="general" title={uiText("settingsPanel.title8")} onReset={() => requestSectionReset(uiText("settingsPanel.onReset"), resetGeneral)} />
          <SettingsSubsectionTitle title={uiText("settingsPanel.title9")} icon={<PaletteIcon size={16} />} />
          <div className="settings-control-row" data-settings-search="ui-language">
            <label htmlFor="ui-language" className="settings-control-label ui-type-control text-t2">{uiText("settings.language")}</label>
            <UiSelect id="ui-language" ariaLabel={uiText("settings.language")} value={uiLanguage}
              options={UI_LANGUAGE_OPTIONS} onValueChange={value => { setLanguageError(""); void changeUiLanguage(value).catch(cause => setLanguageError(uiText("settings.languageChangeFailed", { detail: String(cause) }))); }} />
          </div>
          {languageError && <p role="alert" className="text-danger">{languageError}</p>}
          <Segmented<Palette>
            label={uiText("settingsPanel.label")}
            value={palette}
            options={PALETTE_OPTIONS}
            onChange={setPalette}
            searchId="palette"
            tiles
            decoration={value => <span className="settings-palette-swatch" style={{ background: value === "sakura" ? "#FB7299" : value === "pine" ? "#4C9A8D" : customColor }} />}
          />
          {palette === "custom" && <div className="settings-control-row" data-settings-search="palette">
            <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel3")}</span>
            <ThemeColorField label={uiText("settingsPanel.label2")} value={customColor} opaque onChange={setCustomColor}
              onPreviewChange={color => applyCustomPalette(document, color)}
              onPreviewCancel={() => applyCustomPalette(document, useTheme.getState().customColor)} />
          </div>}
          <Segmented<Mode>
            label={uiText("settingsPanel.label3")}
            value={mode}
            options={[{ value: "system", label: uiText("settingsPanel.options.label") }, { value: "light", label: uiText("common.light") }, { value: "dark", label: uiText("common.dark") }]}
            onChange={setMode}
            searchId="mode"
            decoration={value => value === "system" ? <Monitor size={16} /> : value === "light" ? <Sun size={16} /> : <Moon size={16} />}
          />
          <label className="settings-slider-row" data-settings-search="ui-scale">
            <span className="flex items-center justify-between ui-type-control text-t2">
              <span>{uiText("settingsPanel.SettingsPanel4")}</span>
              <span className="font-mono text-t1">{Math.round(uiScale * 100)}%</span>
            </span>
            <Slider min={MIN_UI_SCALE*100} max={MAX_UI_SCALE*100} step={5} value={[Math.round(uiScale*100)]} onValueChange={([value])=>setUiScale(value/100)} aria-label={uiText("settingsPanel.aria_label18")} />
          </label>
          <SettingsSubsectionTitle title={uiText("settingsPanel.title10")} icon={<Power size={16} />} />
          <SettingSwitch
            label={uiText("settingsPanel.label4")}
            checked={startOnBoot}
            onChange={() => setStartOnBoot(!startOnBoot)}
            searchId="start-on-boot"
            hint={uiText("settingsPanel.hint")}
          />
          <SettingSwitch label={uiText("settingsPanel.label5")} checked={autoConnectOnStartup} onChange={() => setAutoConnectOnStartup(!autoConnectOnStartup)} searchId="auto-connect" />
          <SettingsSubsectionTitle title={uiText("settingsPanel.title11")} icon={<Monitor size={16} />} />
          <Segmented<CloseBehavior>
            label={uiText("settingsPanel.label6")}
            value={closeBehavior}
            options={[{ value: "exit", label: uiText("settingsPanel.options.label2") }, { value: "tray", label: uiText("settingsPanel.options.label3") }]}
            onChange={setCloseBehavior}
            searchId="close-behavior"
          />
          <Segmented<MinimizeBehavior>
            label={uiText("settingsPanel.label7")}
            value={minimizeBehavior}
            options={[{ value: "taskbar", label: uiText("settingsPanel.options.label4") }, { value: "tray", label: uiText("settingsPanel.options.label3") }]}
            onChange={setMinimizeBehavior}
            searchId="minimize-behavior"
          />
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("display", node); }} className="settings-section" data-settings-section="display">
          <SectionTitle iconName="display" title={uiText("settingsPanel.title12")} onReset={() => requestSectionReset(uiText("settingsPanel.onReset2"), resetDisplay)} />
          <SettingsSubsectionTitle iconName="favoriteBehavior" title={uiText("settingsPanel.title13")} />
          <SettingSwitch
            label={uiText("settingsPanel.label8")}
            checked={favoriteEditOnAdd}
            onChange={() => setFavoriteEditOnAdd(!favoriteEditOnAdd)}
            searchId="favorite-edit"
            hint={uiText("settingsPanel.hint2")}
          />
          <SettingsSubsectionTitle title={uiText("settingsPanel.title14")} icon={<AlignStartVertical size={16} />} />
          <Segmented<"top" | "bottom">
            label={uiText("settingsPanel.label9")}
            value={liveContentAlignment}
            options={[{ value: "top", label: uiText("common.top") }, { value: "bottom", label: uiText("common.bottom") }]}
            onChange={setLiveContentAlignment}
            searchId="content-alignment"
            tiles
            decoration={value => <span className={`settings-alignment-diagram${value === "bottom" ? " is-bottom" : ""}`}><i /><i /><i /></span>}
          />
          {liveContentAlignment === undefined && <p className="settings-hint">{uiText("settingsPanel.SettingsPanel5")}</p>}
          <Segmented<LiveScrollDirection>
            label={uiText("settingsPanel.label10")}
            value={liveScrollDirection}
            options={[{ value: "top", label: uiText("settingsPanel.options.label5") }, { value: "bottom", label: uiText("settingsPanel.options.label6") }]}
            onChange={setLiveScrollDirection}
            searchId="feed-direction"
            decoration={value => value === "top" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          />
          <SettingsSubsectionTitle title={uiText("settingsPanel.title15")} icon={<SlidersHorizontal size={16} />} />
          <DurationInput value={eventDisplayPreferences.eventAnimationDurationMs} onChange={setEventAnimationDuration} />
          <Segmented
            label={uiText("settingsPanel.label11")}
            value={eventDisplayPreferences.eventAnimationPreset}
            options={[...EVENT_ANIMATION_PRESET_OPTIONS]}
            onChange={setEventAnimationPreset}
            searchId="event-animation"
          />
          <SettingsFlowPreview alignment={liveContentAlignment} direction={liveScrollDirection} preset={eventDisplayPreferences.eventAnimationPreset} duration={eventDisplayPreferences.eventAnimationDurationMs} />
          <SettingsSubsectionTitle iconName="sticky" title={uiText("settingsPanel.title16")} />
          <SettingSwitch label={uiText("settingsPanel.label12")} checked={stickyEvents.enabled} onChange={() => setStickyEvents(current => ({...current,enabled:!current.enabled}))} searchId="sticky-events" />
          <SettingSwitch label={uiText("settingsPanel.label13")} checked={stickyEvents.obsEnabled} onChange={() => setStickyEvents(current => ({...current,obsEnabled:!current.obsEnabled}))} searchId="obs-sticky-events" />
          {(stickyEvents.enabled || stickyEvents.obsEnabled) && <>
            <div className="settings-control-row" data-settings-search="sticky-position"><span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel6")}</span>
              <SettingsChoiceControl label={uiText("settingsPanel.label14")} value={stickyEvents.position} options={[{value:'top',label:uiText("common.top")},{value:'bottom',label:uiText("common.bottom")}]} onChange={position => setStickyEvents(current => ({...current,position:position === 'bottom' ? 'bottom' : 'top'}))} />
            </div>
            <PixelInput label={uiText("settingsPanel.label15")} value={stickyEvents.giftThreshold} min={0} max={Number.MAX_SAFE_INTEGER} step={0.01} unit={uiText("settingsPanel.unit")} searchId="sticky-threshold" onChange={giftThreshold => setStickyEvents(current => ({...current,giftThreshold}))} />
            <PixelInput label={uiText("settingsPanel.label16")} value={stickyEvents.maxCount} min={1} max={100} step={1} unit={uiText("settingsPanel.unit2")} searchId="sticky-count" onChange={maxCount => setStickyEvents(current => ({...current,maxCount}))} />
            <div className="settings-control-row" data-settings-search="sticky-sort"><span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel7")}</span>
              <SettingsChoiceControl label={uiText("settingsPanel.label17")} value={stickyEvents.sort} options={[{value:'amount',label:uiText("settingsPanel.options.label7")},{value:'time',label:uiText("settingsPanel.options.label8")}]} onChange={sort => setStickyEvents(current => ({...current,sort:sort === 'time' ? 'time' : 'amount'}))} />
            </div>
          </>}
          <SettingsSubsectionTitle iconName="windowOutputs" title={uiText("settingsPanel.title17")} hint={uiText("settingsPanel.hint3")} />
          <PixelInput label={uiText("settingsPanel.label18")} value={eventWindowCapacity} min={1} max={100} step={1} unit={uiText("settingsPanel.unit2")} searchId="event-window-capacity" onChange={setEventWindowCapacity} />
          <SettingSwitch
            label={uiText("settingsPanel.label19")}
            checked={eventExpiry.enabled}
            onChange={() => setEventExpiry((current) => ({ ...current, enabled: !current.enabled }))}
            searchId="event-expiry"
          />
          {eventExpiry.enabled && (
            <SecondsInput
              label={uiText("settingsPanel.label20")}
              value={eventExpiry.seconds}
              onChange={(seconds) => setEventExpiry((current) => ({ ...current, seconds }))}
              searchId="event-expiry-seconds"
            />
          )}
          <SettingSwitch label={uiText("settingsPanel.label21")} checked={mergeSameDanmu} onChange={() => setMergeSameDanmu(!mergeSameDanmu)} searchId="merge-danmu" />
          {mergeSameDanmu && (
            <SecondsInput
              label={uiText("settingsPanel.label22")}
              value={sameDanmuWindowSeconds}
              min={MIN_SAME_DANMU_WINDOW_SECONDS}
              max={MAX_SAME_DANMU_WINDOW_SECONDS}
              onChange={setSameDanmuWindowSeconds}
              searchId="merge-danmu-seconds"
            />
          )}
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("filters", node); }} className="settings-section" data-settings-section="filters">
          <SectionTitle iconName="filters" title={uiText("settingsPanel.title18")} onReset={() => requestSectionReset(uiText("settingsPanel.onReset3"), resetFilters)} />
          <SettingsSubsectionTitle iconName="eventPolicy" title={uiText("settingsPanel.title19")} />
          <SettingSwitch label={uiText("settingsPanel.label23")} checked={eventDisplayPreferences.showAutoDanmaku} onChange={() => setEventDisplayPreference("showAutoDanmaku", !eventDisplayPreferences.showAutoDanmaku)} searchId="auto-danmaku" />
          <SettingSwitch label={uiText("settingsPanel.label24")} checked={eventDisplayPreferences.showPhoneNotVerified} onChange={() => setEventDisplayPreference("showPhoneNotVerified", !eventDisplayPreferences.showPhoneNotVerified)} searchId="phone-not-verified" />
          <SettingSwitch
            label={uiText("settingsPanel.label25")}
            checked={eventDisplayPreferences.onlyGuardEntry}
            onChange={() => setEventDisplayPreference("onlyGuardEntry", !eventDisplayPreferences.onlyGuardEntry)}
            searchId="guard-entry"
          />
          <SettingSwitch
            label={uiText("settingsPanel.label26")}
            checked={sceneSettings.audienceFilters.showCrossRoomEvents}
            onChange={() => updateScene("audienceFilters", { ...sceneSettings.audienceFilters, showCrossRoomEvents: !sceneSettings.audienceFilters.showCrossRoomEvents })}
            searchId="cross-room-events"
          />
          <PixelInput label={uiText("settingsPanel.label27")} unit={uiText("settingsPanel.unit3")} value={sceneSettings.audienceFilters.minimumWealthLevel} min={0} max={Number.MAX_SAFE_INTEGER} step={1} searchId="minimum-wealth-level" onChange={(minimumWealthLevel) => updateScene("audienceFilters", { ...sceneSettings.audienceFilters, minimumWealthLevel })} />
          <PixelInput label={uiText("settingsPanel.label28")} unit={uiText("settingsPanel.unit3")} value={sceneSettings.audienceFilters.minimumCurrentRoomMedalLevel} min={0} max={Number.MAX_SAFE_INTEGER} step={1} searchId="minimum-current-room-medal-level" onChange={(minimumCurrentRoomMedalLevel) => updateScene("audienceFilters", { ...sceneSettings.audienceFilters, minimumCurrentRoomMedalLevel })} />
          <GiftThresholdInput
            value={sceneSettings.giftThreshold}
            mode={sceneSettings.giftThresholdMode}
            onChange={(value) => updateScene("giftThreshold", value)}
            searchId="gift-threshold"
          />
          <Segmented<GiftThresholdMode>
            label={uiText("settingsPanel.label29")}
            value={sceneSettings.giftThresholdMode}
            options={[{ value: "unit", label: uiText("settingsPanel.options.label9") }, { value: "cumulative", label: uiText("settingsPanel.options.label10") }]}
            onChange={(value) => updateScene("giftThresholdMode", value)}
            searchId="gift-threshold-mode"
          />
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("live", node); }} className="settings-section" data-settings-section="live">
          <SectionTitle iconName="live" title={uiText("common.live")} onReset={() => requestSectionReset(uiText("common.live"), resetLive)} />
          <Segmented
            label={uiText("settingsPanel.label30")}
            value={sceneSettings.layoutMode}
            options={[{ value: "dual", label: uiText("settingsPanel.options.label11") }, { value: "partition", label: uiText("settingsPanel.options.label12") }]}
            onChange={(value) => updateScene("layoutMode", value)}
            searchId="layout-mode"
            decoration={value => <SceneLayoutIcon mode={value} />}
          />
          <SettingSwitch label={uiText("settingsPanel.label31")} checked={showLiveGiftEffect} onChange={() => setShowLiveGiftEffect(!showLiveGiftEffect)} searchId="live-gift-effect" />
          <SettingSwitch label={uiText("settingsPanel.label32")} checked={showLiveGuardEffect} onChange={() => setShowLiveGuardEffect(!showLiveGuardEffect)} searchId="live-guard-effect" />
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("review", node); }} className="settings-section" data-settings-section="review">
          <SectionTitle iconName="review" title={uiText("common.review")} onReset={() => requestSectionReset(uiText("common.review"), resetReviewSettings)} />
          <div className="settings-control-row settings-switch-row" data-settings-search="review-owner">
            <div className="min-w-0">
            <div className="settings-control-label ui-type-control text-t2" title={uiText("settingsPanel.title20")}>{uiText("settingsPanel.SettingsPanel8")}</div>
            </div>
            <SwitchButton
              label={uiText("settingsPanel.label33")}
              checked={reviewOpenCurrentOwner}
              onChange={() => {
                const next = !reviewOpenCurrentOwner;
                setReviewOpenCurrentOwner(next);
                recordFeatureDiagnostic({
                  featureId: "review-archive",
                  stage: "setting-change",
                  action: "entry-preference",
                  outcome: next ? "current-owner" : "archive-home",
                  data: { openCurrentOwner: next },
                });
              }}
            />
          </div>
          <div data-settings-search="archive-settings">
            <ReviewArchiveSettings
              repository={archiveRepository ?? null}
              retentionDays={reviewArchiveRetentionDays}
              onRetentionDaysChange={setReviewArchiveRetentionDays}
              onChanged={onArchiveChanged}
            />
          </div>
          <div ref={(node) => { if (node) anchorRefs.current.set("cloud-recovery", node); }} data-settings-anchor="cloud-recovery">
            <CloudRecoverySettings repository={archiveRepository ?? null} onChanged={onArchiveChanged}
              connectionRequested={request?.action === "connect-cloud-recovery"} />
          </div>
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("windows", node); }} className="settings-section" data-settings-section="windows">
          <SectionTitle iconName="windows" title={uiText("settingsPanel.title21")} onReset={() => requestSectionReset(uiText("settingsPanel.onReset4"), resetWindows)} />
          <SettingsSubsectionTitle title={uiText("settingsPanel.title22")} />
          <Segmented label={uiText("settingsPanel.label34")} value={windowAppearance.material} onChange={material => { setWindowAppearance(current => ({...current, material})); }} options={[{value:'glass',label:uiText("settingsPanel.options.label13")},{value:'solid',label:uiText("settingsPanel.options.label14")},{value:'transparent',label:uiText("settingsPanel.options.label15")}]} />
          {windowAppearance.material !== 'transparent' && <Segmented label={uiText("settingsPanel.label35")} value={windowAppearance.scheme} onChange={scheme => setWindowAppearance(current => ({...current, scheme}))} options={[{value:"follow",label:uiText("settingsPanel.options.label16")},{value:"light",label:uiText("common.light")},{value:"dark",label:uiText("common.dark")}]} decoration={value => value === "follow" ? <Monitor size={15} /> : value === "light" ? <Sun size={15} /> : <Moon size={15} />} />}
          {windowAppearance.material !== 'transparent' && <>
          <label className="settings-slider-row" data-settings-search="window-opacity">
            <span className="flex items-center justify-between ui-type-control text-t2">
              <span>{windowAppearance.material === 'glass' ? uiText("settingsPanel.SettingsPanel9") : uiText("settingsPanel.SettingsPanel10")}</span>
              <span className="font-mono text-t1">{Math.round((windowAppearance.material === 'glass' ? windowAppearance.glassTint : windowAppearance.solidOpacity) * 100)}%</span>
            </span>
            <Slider min={MIN_WINDOW_OPACITY*100} max={MAX_WINDOW_OPACITY*100} step={1} value={[Math.round((windowAppearance.material === 'glass' ? windowAppearance.glassTint : windowAppearance.solidOpacity)*100)]} onValueChange={([value])=>setWindowAppearance(current=>({...current,[current.material === 'glass' ? 'glassTint' : 'solidOpacity']:value/100}))} aria-label={windowAppearance.material === 'glass' ? uiText("settingsPanel.aria_label19") : uiText("settingsPanel.aria_label20")} />
          </label>
          <SurfaceColorInput
            value={resolveWindowSurfaceColor(windowAppearance, resolveWindowScheme(windowAppearance.scheme, softwareScheme))}
            onChange={(surfaceColor) => setWindowAppearance((current) => ({ ...current, surfaceColor }))}
            automatic={windowAppearance.surfaceColor === null}
            onReset={() => setWindowAppearance(current => ({...current, surfaceColor:null}))}
            searchId="window-surface"
          />
          <PixelInput
            label={uiText("settingsPanel.label36")}
            value={windowAppearance.radius}
            onChange={(radius) => setWindowAppearance((current) => ({ ...current, radius }))}
            min={MIN_WINDOW_RADIUS}
            max={MAX_WINDOW_RADIUS}
            step={1}
            searchId="window-radius"
          />
          </>}
          <SettingsSubsectionTitle title={uiText("settingsPanel.title23")} />
          <Segmented label={uiText("settingsPanel.label37")} value={windowScheme} onChange={setWindowScheme} options={[{value:"follow",label:uiText("settingsPanel.options.label16")},{value:"light",label:uiText("common.light")},{value:"dark",label:uiText("common.dark")}]} decoration={value => value === "follow" ? <Monitor size={15} /> : value === "light" ? <Sun size={15} /> : <Moon size={15} />} />
          <div ref={(node) => { if (node) anchorRefs.current.set("display", node); }} data-settings-anchor="display" data-settings-search="display-window" className="settings-window-group">
            <SettingsSubsectionTitle iconName="chatWindow" title={uiText("common.chatWindow")} />
            <div className="settings-window-toggle"><SettingSwitch label={uiText("settingsPanel.label38")} checked={displayOpen} onChange={onToggleDisplay} searchId="display-window-open" /><Button variant="outline" type="button" disabled={!displayOpen} onClick={onLocateDisplay} title={uiText("settingsPanel.title24")} aria-label={uiText("settingsPanel.aria_label21")} className="settings-locate-button"><MapPin size={16} /></Button></div>
            <SettingSwitch label={uiText("settingsPanel.label39")} checked={displayLocked} onChange={onToggleDisplayLock} searchId="display-window-lock" />
            <SettingsSubsectionTitle iconName="filters" title={uiText("settingsPanel.title18")} level={3} />
            <div className="settings-tertiary-content">
              <div className="settings-filter-grid">
                <SettingsFilterRow
                  label={uiText("settingsPanel.label40")}
                  active={displayWindowFilters.danmu}
                  onPrimaryToggle={() => toggleDisplayWindowFilter("danmu")}
                />
                <SettingsFilterRow
                  label={uiText("settingsPanel.label41")}
                  active={displayWindowFilters.interact}
                  onPrimaryToggle={() => toggleDisplayWindowFilter("interact")}
                  selected={displayWindowFilters.interactKinds}
                  onToggle={toggleDisplayWindowInteractKind}
                />
              </div>
            </div>
          </div>
          <div ref={(node) => { if (node) anchorRefs.current.set("gift", node); }} data-settings-anchor="gift" data-settings-search="gift-window" className="settings-window-group">
            <SettingsSubsectionTitle iconName="revenueWindow" title={uiText("common.revenueWindow")} />
            <div className="settings-window-toggle"><SettingSwitch label={uiText("settingsPanel.label42")} checked={giftOpen} onChange={onToggleGift} searchId="gift-window-open" /><Button variant="outline" type="button" disabled={!giftOpen} onClick={onLocateGift} title={uiText("settingsPanel.title25")} aria-label={uiText("settingsPanel.aria_label22")} className="settings-locate-button"><MapPin size={16} /></Button></div>
            <SettingSwitch label={uiText("settingsPanel.label39")} checked={giftLocked} onChange={onToggleGiftLock} disabled={!giftOpen} searchId="gift-window-lock" />
            <Segmented<RevenueWindowMode> label={uiText("settingsPanel.label43")} searchId="gift-window-mode" value={revenueSelection?.mode ?? 'combined'}
              options={[{ value: 'combined', label: uiText("settingsPanel.options.label17") }, { value: 'split', label: uiText("settingsPanel.options.label18") }]}
              onChange={value => onRevenueWindowMode?.(value)} decoration={value => value === 'combined' ? <Wallet size={15} /> : <Layers size={15} />} />
            <SettingSwitch label={uiText("settingsPanel.label31")} checked={showGiftWindowEffect} onChange={() => setShowGiftWindowEffect(!showGiftWindowEffect)} searchId="gift-window-effect" />
          <SettingSwitch label={uiText("settingsPanel.label32")} checked={showGuardWindowEffect} onChange={() => setShowGuardWindowEffect(!showGuardWindowEffect)} searchId="guard-window-effect" />
            {revenueSelection?.mode === 'split' && <>
              <SettingsSubsectionTitle iconName="splitWindows" title={uiText("settingsPanel.title26")} level={3} />
              <div className="settings-tertiary-content" role="group" aria-label={uiText("settingsPanel.aria_label23")}>
                {([['gift', uiText("settingsPanel.SettingsPanel11")], ['superchat', uiText("settingsPanel.SettingsPanel12")], ['guard', uiText("settingsPanel.SettingsPanel13")]] as const).map(([kind, label]) => <SettingSwitch key={kind}
                  label={label} icon={<SettingsIcon name={kind} />}
                  checked={revenueSelection.selected.includes(kind)} onChange={() => onToggleRevenueChild?.(kind)}
                  searchId={`revenue-${kind}-open`} />)}
              </div>
            </>}
          </div>
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("interaction", node); }} className="settings-section" data-settings-section="interaction">
          <SectionTitle iconName="interaction" title={uiText("settingsPanel.title27")} onReset={() => requestSectionReset(uiText("settingsPanel.onReset5"), resetEventInteractionSettings)} />
          <SettingsSubsectionTitle iconName="eventMenu" title={uiText("settingsPanel.title28")} hint={uiText("settingsPanel.hint4")} />
          <div data-settings-search="shortcut-menu">
            <ShortcutMenuPicker
              value={voiceSettings.shortcutActions}
              onChange={(shortcutActions) => voiceSettings.setVoiceSettings({ shortcutActions })}
            />
          </div>
          <SettingsSubsectionTitle iconName="nicknames" title={uiText("settingsPanel.title29")} hint={uiText("settingsPanel.hint5")} />
          <SettingSwitch
            label={uiText("settingsPanel.label44")}
            checked={voiceSettings.speakUsername}
            onChange={() => voiceSettings.setVoiceSettings({ speakUsername: !voiceSettings.speakUsername })}
            searchId="speak-username"
          />
          <div className="settings-style-editor-summary settings-user-nickname-summary" data-settings-search="nickname">
            <div className="settings-style-editor-copy">
              <div className="ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel14")}</div>
              <div className="ui-type-meta text-t3">{uiText("settingsPanel.SettingsPanel15")}{nicknameEntries.length} {uiText("settingsPanel.SettingsPanel16")}</div>
            </div>
            <Button variant="outline"
              ref={nicknameManagerTriggerRef}
              type="button"
              aria-expanded={nicknameManagerOpen}
              aria-haspopup="dialog"
              className="settings-style-editor-launch ui-type-control"
              onClick={() => {
                setNicknameNotice("");
                setEditingNicknameUid(null);
                setEditingNicknameValue("");
                setNicknameManagerPosition((current) => ({ ...current, ready: false }));
                setNicknameManagerOpen((current) => !current);
              }}
            >
              {uiText("settingsPanel.SettingsPanel17")}</Button>
          </div>
          {nicknameManagerOpen && createPortal(
            <div
              ref={nicknameManagerRef}
              role="dialog"
              aria-label={uiText("settingsPanel.aria_label24")}
              className="settings-user-nickname-popover fixed z-50 w-[min(460px,calc(100vw-16px))] overflow-y-auto rounded-lg border border-line bg-surface p-3 shadow-xl shadow-black/20"
              style={{
                left: nicknameManagerPosition.left,
                top: nicknameManagerPosition.top,
                width: nicknameManagerPosition.width,
                maxHeight: nicknameManagerPosition.maxHeight,
                visibility: nicknameManagerPosition.ready ? "visible" : "hidden",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="ui-type-control font-medium text-t1" title={uiText("settingsPanel.title30")}>{uiText("settingsPanel.SettingsPanel14")}</div>
                <Button size="icon-sm" variant="ghost"
                  type="button"
                  aria-label={uiText("settingsPanel.aria_label25")}
                  className="rounded px-1.5 py-0.5 ui-type-control text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                  onClick={() => {
                    setNicknameManagerOpen(false);
                    setEditingNicknameUid(null);
                    setNicknameNotice("");
                    nicknameManagerTriggerRef.current?.focus();
                  }}
                >
                  ×
                </Button>
              </div>
              {nicknameNotice && <div className="mt-2 ui-type-meta text-t3" role="status">{nicknameNotice}</div>}
              {nicknameEntries.length === 0 ? (
                <div className="mt-3 rounded-md border border-line/70 bg-bg px-2.5 py-2 ui-type-meta text-t3">{uiText("settingsPanel.SettingsPanel18")}</div>
              ) : (
                <div className="settings-user-nickname-list mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label={uiText("settingsPanel.aria_label26")}>
                  {nicknameEntries.map(([uid, nickname]) => (
                    <div key={uid} className="rounded-md border border-line/70 bg-bg px-2 py-1.5">
                      {editingNicknameUid === uid ? (
                        <div className="settings-user-nickname-entry-editor">
                          <div className="font-mono ui-type-micro text-t3">{uid}</div>
                          <Input
                            autoFocus
                            value={editingNicknameValue}
                            onChange={(event) => setEditingNicknameValue(event.target.value)}
                            className="settings-control-surface mt-1 h-8 w-full px-2 ui-type-control text-t1"
                            aria-label={uiText("settingsPanel.aria_label27", { uid: uid })}
                          />
                          <div className="mt-1.5 flex justify-end gap-1.5">
                            <Button variant="ghost" size={null}
                              type="button"
                              className="rounded px-1.5 py-1 ui-type-micro text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                              onClick={() => { setEditingNicknameUid(null); setEditingNicknameValue(""); setNicknameNotice(""); }}
                            >
                              {uiText("common.cancel")}</Button>
                            <Button variant="default"
                              type="button"
                              className="rounded border border-accent/60 bg-accent-subtle px-2 py-1 ui-type-micro font-medium text-accent-text transition-colors hover:border-accent hover:bg-accent-solid hover:text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                              onClick={() => saveNicknameEntry(uid)}
                            >
                              {uiText("common.save")}</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-8 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate ui-type-control text-t2" title={`${nickname} · ${uid}`}>
                            <span className="font-medium text-t1">{nickname}</span>
                            <span className="ml-2 font-mono ui-type-micro text-t3">{uid}</span>
                          </span>
                          <Button variant="ghost" size={null}
                            type="button"
                            className="shrink-0 rounded px-1.5 py-1 ui-type-micro text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                            onClick={() => { setEditingNicknameUid(uid); setEditingNicknameValue(nickname); setNicknameNotice(""); }}
                          >
                            {uiText("common.edit")}</Button>
                          <Button variant="ghost" size={null}
                            type="button"
                            aria-label={uiText("settingsPanel.aria_label28", { nickname: nickname })}
                            className="shrink-0 rounded px-1.5 py-1 ui-type-micro text-t3 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                            onClick={() => deleteNickname(uid)}
                          >
                            {uiText("common.delete")}</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>,
            document.body,
          )}
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("voice", node); }} className="settings-section" data-settings-section="voice">
          <SectionTitle iconName="voice" title={uiText("settingsPanel.title31")} onReset={() => requestSectionReset(uiText("settingsPanel.onReset6"), resetVoiceOutputSettings)} />
          <SettingsSubsectionTitle title={uiText("settingsPanel.title32")} />
          <div data-settings-search="voice-scope">
            <Segmented
              label={uiText("settingsPanel.label45")}
              value={voiceSettings.outputScope}
              options={[{ value: "host", label: uiText("settingsPanel.options.label19") }, { value: "audience", label: uiText("settingsPanel.options.label20") }, { value: "both", label: uiText("settingsPanel.options.label21") }]}
              onChange={(outputScope) => voiceSettings.setVoiceSettings({ outputScope })}
            />
          </div>
          {(voiceSettings.outputScope === "host" || voiceSettings.outputScope === "both") && (
            <div ref={hostDeviceRowRef} className="settings-control-row" data-settings-search="voice-host-device" data-settings-layout={hostDeviceLayout}>
              <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel19")}</span>
              <div className="settings-control-value">
                <SharedSettingsListSelect
                  ariaLabel={uiText("settingsPanel.ariaLabel")}
                  options={voiceOutputOptions}
                  value={voiceSettings.monitorDeviceId ?? ""}
                  onChange={(value) => voiceSettings.setVoiceSettings({ monitorDeviceId: value || null })}
                  onFocus={() => { void listAudioDevices().then(setVoiceOutputDevices).catch(() => {}); }}
                />
              </div>
            </div>
          )}
          {(voiceSettings.outputScope === "audience" || voiceSettings.outputScope === "both") && (
            <div ref={audienceDeviceRowRef} className="settings-control-row" data-settings-search="voice-audience-device" data-settings-layout={audienceDeviceLayout}>
              <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel20")}</span>
              <div className="settings-control-value">
                <SharedSettingsListSelect
                  ariaLabel={uiText("settingsPanel.ariaLabel2")}
                  options={voiceOutputOptions}
                  value={voiceSettings.streamDeviceId ?? ""}
                  onChange={(value) => voiceSettings.setVoiceSettings({ streamDeviceId: value || null })}
                  onFocus={() => { void listAudioDevices().then(setVoiceOutputDevices).catch(() => {}); }}
                />
              </div>
            </div>
          )}
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("other", node); }} className="settings-section" data-settings-section="other">
          <SectionTitle iconName="other" title={uiText("settingsPanel.title33")} />
          <div className="settings-control-row" data-settings-search="window-layout">
            <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel21")}</span>
            <Button variant="outline" type="button" onClick={() => requestReset(uiText("settingsPanel.onClick"), uiText("settingsPanel.onClick2"), onResetWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("settingsPanel.SettingsPanel22")}</Button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel23")}</span>
            <Button variant="outline" type="button" onClick={() => requestReset(uiText("settingsPanel.onClick3"), uiText("settingsPanel.onClick4"), onResetDisplayWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("settingsPanel.SettingsPanel22")}</Button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel24")}</span>
            <Button variant="outline" type="button" onClick={() => requestReset(uiText("settingsPanel.onClick5"), uiText("settingsPanel.onClick6"), onResetGiftWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("settingsPanel.SettingsPanel22")}</Button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel25")}</span>
            <Button variant="outline" type="button" onClick={() => requestReset(uiText("settingsPanel.onClick7"), uiText("settingsPanel.onClick8"), onResetAllWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("settingsPanel.SettingsPanel26")}</Button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">{uiText("settingsPanel.SettingsPanel27")}</span>
            <Button variant="outline" type="button" onClick={() => requestReset(uiText("settingsPanel.onClick9"), uiText("settingsPanel.onClick10"), resetAll)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{uiText("settingsPanel.SettingsPanel28")}</Button>
          </div>
          <div ref={(node) => { if (node) anchorRefs.current.set("diagnostics", node); }} data-settings-search="diagnostics">
            <DiagnosticSettings
              status={diagnosticStatus}
              markers={diagnosticMarkers}
              openMarkRequest={request?.action === "mark-issue" ? request.requestId : undefined}
              onMarkIssue={onMarkDiagnosticIssue}
              onExport={onExportDiagnosticBundle}
              onExportStateChange={onDiagnosticExportStateChange}
              onOpenDirectory={onOpenDiagnosticDirectory}
            />
          </div>
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("about", node); }} className="settings-section" data-settings-section="about">
          <SectionTitle iconName="about" title={uiText("settingsPanel.title34")} />
          <SoftwareUpdateSettings version={version} onOpenAbout={() => setAboutOpen(true)} />
        </section>
      </WorkbenchScroll>
      {aboutOpen && <AboutDialog version={version} onClose={() => setAboutOpen(false)} />}
      {pendingReset && (
        <ConfirmDialog
          title={pendingReset.title}
          description={pendingReset.description}
          confirmLabel={uiText("settingsPanel.confirmLabel")}
          onCancel={() => setPendingReset(null)}
          onConfirm={pendingReset.action}
        />
      )}
    </div>
  );
}
