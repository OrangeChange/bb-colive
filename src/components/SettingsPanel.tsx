import { useCompatibleOutputScheme } from "../themes/compatPreviewScheme.ts";
import { X, RotateCcw, GripVertical as LucideGripVertical, ChevronDown as LucideChevronDown, Search as LucideSearch, Palette as PaletteIcon, Sun, Moon, Monitor, Power, ArrowUp, ArrowDown, SlidersHorizontal, AlignStartVertical, Layers, Wallet, MapPin, Info } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
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
  rgbaToHex,
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
import { getColorPopoverPlacement } from "./colorPopoverPlacement";
import { bindUiDismissableLayer } from "./ui/layer";
import { GiftThresholdInput } from "./GiftThresholdInput";
import { SettingsFlowPreview } from './SettingsFlowPreview';
import { SettingsChoiceControl } from './SettingsChoiceControl';
import { SettingsIcon } from './SettingsIcon';
import { SceneLayoutIcon } from './SceneLayoutIcon';
import { ColorSlider } from "./ColorSlider";
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

const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = [
  { id: "palette", label: "配色主题", keywords: "颜色 外观 樱花粉 青瓷绿 自定义 主题色", sectionId: "general" },
  { id: "mode", label: "深浅模式", keywords: "深色 浅色 系统", sectionId: "general" },
  { id: "ui-scale", label: "界面比例", keywords: "缩放 大小 字体", sectionId: "general" },
  { id: "start-on-boot", label: "开机随系统自启", keywords: "启动 托盘 开机", sectionId: "general" },
  { id: "auto-connect", label: "启动后自动连接", keywords: "连接 主播 启动", sectionId: "general" },
  { id: "close-behavior", label: "关闭窗口时", keywords: "退出 托盘", sectionId: "general" },
  { id: "minimize-behavior", label: "最小化时", keywords: "任务栏 托盘", sectionId: "general" },
  { id: "favorite-edit", label: "收藏时编辑备注和标签", keywords: "收藏 备注 标签", sectionId: "display" },
  { id: "content-alignment", label: "内容对齐", keywords: "对齐 顶部 底部 现场 副窗口 OBS", sectionId: "display" },
  { id: "feed-direction", label: "最新事件位置", keywords: "信息流方向 顶部追加 底部追加 上方 下方 排序 滚动", sectionId: "display" },
  { id: "event-animation", label: "事件动画", keywords: "动画 进入 退出 时长", sectionId: "display" },
  { id: "auto-danmaku", label: "显示自动弹幕", keywords: "自动弹幕 天选口令", sectionId: "filters" },
  { id: "phone-not-verified", label: "显示未验证手机号用户弹幕", keywords: "手机号 验证 弹幕", sectionId: "filters" },
  { id: "guard-entry", label: "只显示大航海进房", keywords: "进房 舰长 提督 总督", sectionId: "filters" },
  { id: "gift-threshold", label: "最低显示金额", keywords: "礼物 醒目留言 大航海 金额 阈值 价格", sectionId: "filters" },
  { id: "gift-threshold-mode", label: "金额计算", keywords: "礼物筛选方式 单件价格 累计金额", sectionId: "filters" },
  { id: "layout-mode", label: "区域布局", keywords: "双区 多区 现场", sectionId: "live" },
  { id: "live-guard-effect", label: "现场：显示大航海特效", keywords: "大航海 舰长 提督 总督 特效", sectionId: "live" },
  { id: "live-gift-effect", label: "现场：显示礼物特效", keywords: "礼物 特效 现场", sectionId: "live" },
  { id: "review-owner", label: "进入回看时打开当前主播", keywords: "回看 主播 档案", sectionId: "review" },
  { id: "archive-settings", label: "回看档案", keywords: "保留 导入 导出 清理", sectionId: "review" },
  { id: "cloud-recovery", label: "云端记录服务", keywords: "服务器 采集 登录态 数据保留 下载 恢复 历史记录", sectionId: "review" },
  { id: "window-opacity", label: "玻璃着色与不透明度", keywords: "玻璃 着色 不透明度 透明度 副窗口", sectionId: "windows" },
  { id: "window-surface", label: "表面颜色", keywords: "背景颜色 副窗口", sectionId: "windows" },
  { id: "window-radius", label: "圆角", keywords: "圆角 副窗口", sectionId: "windows" },
  { id: "event-window-capacity", label: "输出保留条数", keywords: "容量 上限 条数 副窗口 OBS 输出", sectionId: "display" },
  { id: "event-expiry", label: "事件定时消失", keywords: "定时 消失 过期 事件 副窗口 OBS 输出", sectionId: "display" },
  { id: "sticky-events", label: "置顶栏", keywords: "置顶 礼物 门槛 排序 顶部 底部 OBS", sectionId: "display" },
  { id: "event-expiry-seconds", label: "消失时间", keywords: "定时 过期 秒数 副窗口 OBS 输出", sectionId: "display" },
  { id: "merge-danmu", label: "合并相同弹幕", keywords: "合并 弹幕 连击 副窗口 OBS 输出", sectionId: "display" },
  { id: "merge-danmu-seconds", label: "合并时间", keywords: "合并 秒数 弹幕 副窗口 OBS 输出", sectionId: "display" },
  { id: "display-window", label: "弹幕窗", keywords: "弹幕窗 筛选 互动", sectionId: "windows" },
  { id: "display-window-open", label: "弹幕窗：开启", keywords: "弹幕窗 开启", sectionId: "windows" },
  { id: "display-window-lock", label: "弹幕窗：锁定并穿透鼠标", keywords: "弹幕窗 穿透 锁定", sectionId: "windows" },
  { id: "gift-window", label: "收益窗", keywords: "收益窗 特效", sectionId: "windows" },
  { id: "guard-window-effect", label: "收益窗：显示大航海特效", keywords: "收益窗 大航海 特效", sectionId: "windows" },
  { id: "gift-window-effect", label: "收益窗：显示礼物特效", keywords: "收益窗 特效", sectionId: "windows" },
  { id: "gift-window-mode", label: "显示方式", keywords: "收益窗 组合窗口 分窗显示 醒目留言 大航海", sectionId: "windows" },
  { id: "gift-window-open", label: "收益窗：开启", keywords: "收益窗 开启", sectionId: "windows" },
  { id: "gift-window-lock", label: "收益窗：锁定并穿透鼠标", keywords: "收益窗 穿透 锁定", sectionId: "windows" },
  { id: "shortcut-menu", label: "事件快捷菜单", keywords: "快捷按钮 播报 筛选 收藏 标记", sectionId: "interaction" },
  { id: "nickname", label: "用户昵称", keywords: "昵称 用户名 播报", sectionId: "interaction" },
  { id: "speak-username", label: "朗读昵称/用户名", keywords: "昵称 用户名 播报", sectionId: "interaction" },
  { id: "voice-scope", label: "收听范围", keywords: "声音 主播 观众", sectionId: "voice" },
  { id: "voice-host-device", label: "主播设备", keywords: "声音 输出 音频", sectionId: "voice" },
  { id: "voice-audience-device", label: "观众设备", keywords: "声音 输出 音频", sectionId: "voice" },
  { id: "window-layout", label: "窗口布局", keywords: "恢复 主窗口 弹幕窗 收益窗", sectionId: "other" },
  { id: "diagnostics", label: "诊断", keywords: "问题 日志 导出", sectionId: "other" },
  { id: "about", label: "关于", keywords: "版本 BB CoLive", sectionId: "about" },
];

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

function SwitchButton({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${checked ? "border-accent bg-accent-solid" : "border-line bg-bg"}`}
    >
      <span className={`absolute left-0.5 top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-transform ${checked ? "translate-x-[17px]" : "translate-x-0"}`} />
    </button>
  );
}

function SettingSwitch({ label, checked, onChange, searchId, disabled = false, hint, icon }: { label: string; checked: boolean; onChange: () => void; searchId?: string; disabled?: boolean; hint?: string; icon?: ReactNode }) {
  return (
    <div className={`settings-control-row settings-switch-row${disabled ? " is-disabled" : ""}`} data-settings-search={searchId} data-disabled={disabled || undefined}>
      <span className="settings-control-label ui-type-control text-t2" title={hint}>{icon}{label}</span>
      <SwitchButton label={label} checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

const VOICE_SHORTCUT_ACTION_OPTIONS: readonly { value: VoiceShortcutAction; label: string; icon: MenuIconName }[] = [
  { value: "speak", label: "播报", icon: "voice" },
  { value: "filter", label: "筛选", icon: "filter" },
  { value: "favorite", label: "收藏", icon: "favorite" },
  { value: "mark", label: "标记", icon: "mark" },
];

function ShortcutMenuPicker({ value, onChange }: { value: readonly VoiceShortcutAction[]; onChange: (value: VoiceShortcutAction[]) => void }) {
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
        <span className="ui-type-control text-t2">显示按钮</span>
        <span className="ui-type-meta text-t3">已选 {selectedCount}/3</span>
      </div>
      <div className="settings-shortcut-selected-list mt-1.5 space-y-1.5" role="list" aria-label="当前快捷按钮顺序" title="拖动或使用方向键调整顺序">
        {selectedOptions.length === 0 && <div className="rounded-md border border-dashed border-line px-2 py-1.5 ui-type-meta text-t3">未显示快捷按钮</div>}
        {selectedOptions.map((option) => (
          <div
            key={option.value}
            role="listitem"
            tabIndex={0}
            aria-label={`${option.label}，使用上下方向键排序`}
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
            <button
              type="button"
              data-shortcut-delete
              aria-label={`删除快捷${option.label}`}
              title={`删除${option.label}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onChange(value.filter((item) => item !== option.value))}
              className="size-6 rounded text-t3 hover:bg-surface hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="settings-shortcut-add-group mt-3 min-w-0" role="group" aria-label="添加事件快捷菜单按钮">
        <div className="settings-shortcut-add-label ui-type-meta text-t3">可添加</div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {availableOptions.map((option) => {
            const disabled = selectedCount >= MAX_VOICE_SHORTCUT_ACTIONS;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={false}
                aria-label={`添加快捷${option.label}`}
                title={disabled ? "最多选择 3 个" : `添加${option.label}`}
                disabled={disabled}
                onClick={() => {
                  if (!disabled) onChange([...value, option.value]);
                }}
                className="inline-flex min-h-7 min-w-[72px] flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-line px-2 ui-type-control text-t3 transition-colors enabled:hover:border-accent/50 enabled:hover:bg-surface enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring disabled:cursor-not-allowed disabled:opacity-40"
              >
                <MenuActionIcon name={option.icon} />
                <span>添加{option.label}</span>
              </button>
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
  return (
    <div className="settings-control-row settings-number-row" data-settings-search={searchId}>
      <span className="settings-control-label ui-type-control text-t2">{label}</span>
      <label className="settings-font-size-control">
        <input
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
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<"above" | "below">("below");
  const [position, setPosition] = useState({ left: 8, top: 8, ready: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !popoverRef.current) return;
    return bindUiDismissableLayer(popoverRef.current, () => setOpen(false), { trigger: triggerRef.current });
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const rect = trigger.getBoundingClientRect();
      const popoverHeight = popover.getBoundingClientRect().height;
      const nextPlacement = getColorPopoverPlacement(rect, window.innerHeight, popoverHeight);
      const width = 260;
      const maxLeft = Math.max(8, window.innerWidth - width - 8);
      const left = Math.max(8, Math.min(maxLeft, rect.right - width));
      const top = nextPlacement === "above"
        ? rect.top - popoverHeight - 8
        : rect.bottom + 8;
      const maxTop = Math.max(8, window.innerHeight - popoverHeight - 8);
      setPlacement(nextPlacement);
      setPosition({ left, top: Math.min(maxTop, Math.max(8, top)), ready: true });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <div className="settings-control-row settings-number-row" data-settings-search={searchId}>
      <span className="settings-control-label ui-type-control text-t2">表面颜色</span>
      <div className="settings-control-field relative flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          ref={triggerRef}
          aria-expanded={open}
          aria-label="表面颜色"
          onClick={() => {
            setPosition((current) => ({ ...current, ready: false }));
            setOpen((current) => !current);
          }}
          className="settings-surface-color-trigger settings-control-surface flex h-8 flex-1 min-w-0 items-center gap-2 px-2 ui-type-control text-t1"
        >
          <span className="size-4 shrink-0 rounded border border-line" style={{ backgroundColor: rgbaToCss(value) }} aria-hidden="true" />
          <span className="truncate font-mono text-t2">{automatic ? "跟随明暗" : `${rgbaToHex(value)} · ${Math.round(value.a * 100)}%`}</span>
        </button>
        {onReset && <button type="button" className="settings-surface-auto" disabled={automatic} onClick={onReset} title="恢复跟随明暗" aria-label="表面颜色恢复跟随明暗"><RotateCcw size={14} /></button>}
        {open && createPortal(
          <div
            ref={popoverRef}
            data-ui-overlay="true"
            role="dialog"
            aria-label="表面颜色"
            data-placement={placement}
            className="settings-surface-color-popover fixed z-50 w-[260px] rounded-lg border border-line bg-surface p-2 shadow-xl shadow-black/20"
            style={{ left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}
          >
            <ColorSlider compact value={value} onChange={onChange} />
          </div>,
          document.body,
        )}
      </div>
    </div>
  );
}

function SecondsInput({ label, value, onChange, min = MIN_EVENT_EXPIRY_SECONDS, max = MAX_EVENT_EXPIRY_SECONDS, searchId }: { label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; searchId?: string }) {
  return (
    <div className="settings-control-row settings-number-row" data-settings-search={searchId}>
      <span className="settings-control-label ui-type-control text-t2">{label}</span>
      <label className="settings-font-size-control">
        <input
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
        <span className="settings-font-size-unit ui-type-control text-t3">秒</span>
      </label>
    </div>
  );
}

function DurationInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return <div className="settings-control-row settings-number-row" data-settings-search="event-animation">
    <span className="settings-control-label ui-type-control text-t2">动画持续时长</span>
    <label className="settings-font-size-control">
      <input type="number" min={0} step={EVENT_ANIMATION_DURATION_STEP_MS} value={value} aria-label="动画持续时长"
        className="settings-font-size-input font-mono ui-type-control text-t1"
        onChange={event => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} />
      <span className="settings-font-size-unit ui-type-control text-t3">ms</span>
    </label>
  </div>;
}

function SectionTitle({ title, onReset }: { title: string; onReset?: () => void }) {
  return (
    <header className="settings-section-title" data-settings-level="1">
      <h3 className="settings-experience-heading ui-type-section-title font-medium text-t1"><SettingsIcon name={title} />{title}</h3>
      {onReset && <button type="button" className={`${resetButtonClass} settings-reset-button settings-icon-action`} title="恢复本分类默认" aria-label="恢复本分类默认" onClick={onReset}><RotateCcw size={16} aria-hidden="true" /></button>}
    </header>
  );
}

function SettingsSubsectionTitle({ title, level = 2, hint, icon }: { title: string; level?: 2 | 3; hint?: string; icon?: ReactNode }) {
  return (
    <div
      className={level === 3 ? "settings-tertiary-title" : "settings-subsection-title"}
      data-settings-level={level}
      title={hint}
    >
      {icon ? <span className="settings-heading-icon" aria-hidden="true">{icon}</span> : <SettingsIcon name={title} />}{title}
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
  const [open, setOpen] = useState(false);
  const hasSubmenu = Boolean(selected && onToggle);
  const surface=useRef<HTMLDivElement>(null);
  useEffect(()=>open&&surface.current?bindUiDismissableLayer(surface.current,()=>setOpen(false)):undefined,[open]);

  return (
    <div ref={surface} className="settings-filter-submenu" onKeyDown={event=>{const items=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')];const index=items.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==="Home"?0:event.key==="End"?items.length-1:event.key==="ArrowDown"?(index+1)%items.length:event.key==="ArrowUp"?(index+items.length-1)%items.length:-1;if(next>=0){event.preventDefault();items[next]?.focus();}}}>
      <div className={`settings-filter-row settings-control-surface ${active ? "is-active" : ""}`}>
        <button
          type="button"
          aria-pressed={active}
          aria-label={`${label}${active ? "已显示" : "已隐藏"}`}
          className={`settings-filter-row-toggle ui-type-control ${active ? "is-active" : ""}`}
          onClick={onPrimaryToggle}
        >
          <span className="settings-filter-row-label">{label}</span>
          <span className="settings-filter-row-state">{active ? "显示" : "隐藏"}</span>
        </button>
        {hasSubmenu && (
          <button
            type="button"
            className="settings-filter-row-disclosure"
            aria-label={`展开${label}二级筛选`}
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <LucideChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {open && selected && onToggle && (
        <div className="settings-control-menu settings-filter-menu" role="menu" aria-label={`${label}类型筛选`}>
          {INTERACT_KIND_OPTIONS.map((option) => {
            const checked = selected[option.key] !== false;
            return (
              <button
                key={option.key}
                type="button"
                role="menuitemcheckbox"
                aria-checked={checked}
                onClick={() => onToggle(option.key)}
                className="settings-filter-menu-item ui-type-control text-t2"
              >
                <span className={checked ? "size-1.5 rounded-full bg-accent" : "size-1.5 rounded-full border border-line"} aria-hidden="true" />
                {option.label}
              </button>
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
  const [aboutOpen, setAboutOpen] = useState(false);
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
  }, [settingsSearchQuery]);


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
      setNicknameNotice("昵称不能为空");
      return;
    }
    if (!onSaveNickname) {
      setNicknameNotice("昵称服务暂不可用，请稍后再试");
      return;
    }
    onSaveNickname(uid, nickname);
    setEditingNicknameUid(null);
    setEditingNicknameValue("");
    setNicknameNotice("昵称已保存，并已应用到现场显示和语音播报");
  };

  const deleteNickname = (uid: string) => {
    if (!onDeleteNickname) {
      setNicknameNotice("昵称服务暂不可用，请稍后再试");
      return;
    }
    onDeleteNickname(uid);
    if (editingNicknameUid === uid) {
      setEditingNicknameUid(null);
      setEditingNicknameValue("");
    }
    setNicknameNotice("昵称已删除");
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
    requestReset(`恢复“${section}”默认设置？`, `这会恢复“${section}”中的全部设置，但不会清除主播记录、用户数据或登录凭证。`, action);
  };

  const getVoiceOutputDeviceTitle = (deviceId: string | null) => {
    if (deviceId === null) {
      const systemDefault = voiceOutputDevices.find((candidate) => candidate.isDefault);
      return systemDefault ? `跟随系统默认设备（当前：${systemDefault.name}）` : "跟随系统默认设备";
    }
    const device = voiceOutputDevices.find((candidate) => candidate.id === deviceId);
    return device ? `${device.name}${device.isDefault ? "（系统默认）" : ""}` : undefined;
  };

  const voiceOutputOptions: SharedSettingsListOption[] = [
    { value: "", label: "跟随系统默认设备", title: getVoiceOutputDeviceTitle(null) },
    ...voiceOutputDevices.map((device) => ({
      value: device.id,
      label: `${device.name}${device.isDefault ? "（系统默认）" : ""}`,
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

  const currentLabel = SETTINGS_SECTIONS.find((section) => section.id === currentSection)?.label ?? "通用设置";
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
        <h2 className="ui-type-section-title font-medium text-t1">设置</h2>
        <div ref={settingsSearchShellRef} className="settings-search-shell relative ml-auto">
          <button
            ref={settingsSearchTriggerRef}
            type="button"
            aria-label="查找设置"
            aria-expanded={settingsSearchOpen}
            aria-haspopup="dialog"
            title="查找设置"
            className="settings-search-trigger settings-control-surface flex size-8 items-center justify-center ui-type-control text-t2"
            onClick={() => settingsSearchOpen ? closeSettingsSearch() : openSettingsSearch()}
          >
            <LucideSearch className="size-4" aria-hidden="true" />
          </button>
          {settingsSearchOpen && (
            createPortal(
              <div
                ref={settingsSearchPopoverRef}
                className="settings-search-popover fixed z-50 rounded-lg border border-line bg-surface p-2 shadow-xl shadow-black/20"
                role="dialog"
                aria-label="查找设置"
                style={{
                  left: settingsSearchPosition.left,
                  top: settingsSearchPosition.top,
                  width: settingsSearchPosition.width,
                  visibility: settingsSearchPosition.ready ? "visible" : "hidden",
                }}
              >
              <div className="settings-search-input-wrap settings-control-surface flex items-center gap-2 px-2">
                <LucideSearch className="size-4 shrink-0 text-t3" aria-hidden="true" />
                <input
                  ref={settingsSearchInputRef}
                  value={settingsSearchQuery}
                  onChange={(event) => setSettingsSearchQuery(event.target.value)}
                  onKeyDown={handleSettingsSearchKeyDown}
                  placeholder="查找设置"
                  aria-label="查找设置"
                  className="min-w-0 flex-1 bg-transparent py-1.5 ui-type-control text-t1 outline-none placeholder:text-t3"
                />
                {settingsSearchQuery && (
                  <button type="button" aria-label="清空设置搜索" className="rounded p-0.5 ui-type-control text-t3 hover:bg-raised hover:text-t1" onClick={() => { setSettingsSearchQuery(""); settingsSearchInputRef.current?.focus(); }}><X size={14} aria-hidden="true" /></button>
                )}
              </div>
              <div className="settings-search-results mt-2" aria-live="polite">
                {!settingsSearchQuery.trim() ? (
                  <div className="px-2 py-2 ui-type-meta text-t3">输入名称或关键词，定位到对应设置。</div>
                ) : settingsSearchResults.length === 0 ? (
                  <div className="px-2 py-2 ui-type-meta text-t3">没有找到匹配的设置。</div>
                ) : (
                  settingsSearchResults.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="settings-search-result flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                      onClick={() => jumpToSearchResult(entry)}
                    >
                      <span className="min-w-0 truncate ui-type-control text-t1">{entry.label}</span>
                      <span className="shrink-0 ui-type-micro text-t3">{SETTINGS_SECTIONS.find((section) => section.id === entry.sectionId)?.label}</span>
                    </button>
                  ))
                )}
              </div>
              </div>,
              document.body,
            )
          )}
        </div>
        <div className="settings-section-navigator-shell">
          <button
            type="button"
            className="settings-section-navigator settings-control-surface ml-0 flex h-8 min-w-0 items-center justify-start gap-1 px-2 text-left ui-type-control text-t2"
            aria-label={`${currentLabel}，滚轮切换分类，展开设置分类`}
            aria-haspopup="listbox"
            aria-expanded={directoryOpen}
            onClick={() => setDirectoryOpen((open) => !open)}
            onWheel={handleNavigatorWheel}
            onKeyDown={handleNavigatorKeyDown}
          >
            <span className="settings-section-navigator-label truncate">{currentLabel}</span>
            <LucideChevronDown className={`size-4 shrink-0 transition-transform ${directoryOpen ? "rotate-180" : ""}`} aria-hidden="true" />
          </button>
          {directoryOpen && (
            <div role="listbox" aria-label="设置分类" className="settings-control-menu settings-section-navigator-menu absolute">
            {SETTINGS_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                role="option"
                aria-selected={section.id === currentSection}
                onClick={() => { jumpTo(section.id); setDirectoryOpen(false); }}
                className={`flex h-8 w-full items-center rounded-md px-2 text-left ui-type-control transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring ${section.id === currentSection ? "bg-accent-subtle font-medium text-accent-text" : "text-t2 hover:bg-raised hover:text-t1"}`}
              >
                <SettingsIcon name={section.label} />{section.label}
              </button>
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
          <SectionTitle title="通用设置" onReset={() => requestSectionReset("通用设置", resetGeneral)} />
          <SettingsSubsectionTitle title="界面外观" icon={<PaletteIcon size={16} />} />
          <Segmented<Palette>
            label="配色主题"
            value={palette}
            options={PALETTE_OPTIONS}
            onChange={setPalette}
            searchId="palette"
            tiles
            decoration={value => <span className="settings-palette-swatch" style={{ background: value === "sakura" ? "#FB7299" : value === "pine" ? "#4C9A8D" : customColor }} />}
          />
          {palette === "custom" && <div className="settings-control-row" data-settings-search="palette">
            <span className="settings-control-label ui-type-control text-t2">主题色</span>
            <ThemeColorField label="主题色" value={customColor} opaque onChange={setCustomColor}
              onPreviewChange={color => applyCustomPalette(document, color)}
              onPreviewCancel={() => applyCustomPalette(document, useTheme.getState().customColor)} />
          </div>}
          <Segmented<Mode>
            label="深浅模式"
            value={mode}
            options={[{ value: "system", label: "系统" }, { value: "light", label: "浅色" }, { value: "dark", label: "深色" }]}
            onChange={setMode}
            searchId="mode"
            decoration={value => value === "system" ? <Monitor size={16} /> : value === "light" ? <Sun size={16} /> : <Moon size={16} />}
          />
          <label className="settings-slider-row" data-settings-search="ui-scale">
            <span className="flex items-center justify-between ui-type-control text-t2">
              <span>界面比例</span>
              <span className="font-mono text-t1">{Math.round(uiScale * 100)}%</span>
            </span>
            <input
              type="range"
              min={MIN_UI_SCALE * 100}
              max={MAX_UI_SCALE * 100}
              step="5"
              value={Math.round(uiScale * 100)}
              onChange={(event) => setUiScale(Number(event.target.value) / 100)}
              aria-label="界面比例"
              className="settings-range"
              style={{ "--settings-range-progress": `${((uiScale - MIN_UI_SCALE) / (MAX_UI_SCALE - MIN_UI_SCALE)) * 100}%` } as CSSProperties}
            />
          </label>
          <SettingsSubsectionTitle title="启动行为" icon={<Power size={16} />} />
          <SettingSwitch
            label="开机随系统自启"
            checked={startOnBoot}
            onChange={() => setStartOnBoot(!startOnBoot)}
            searchId="start-on-boot"
            hint="仅在托盘运行；若同时开启启动后自动连接，会连接最近使用的主播；没有凭证或主播记录时跳过。"
          />
          <SettingSwitch label="启动后自动连接" checked={autoConnectOnStartup} onChange={() => setAutoConnectOnStartup(!autoConnectOnStartup)} searchId="auto-connect" />
          <SettingsSubsectionTitle title="窗口行为" icon={<Monitor size={16} />} />
          <Segmented<CloseBehavior>
            label="关闭窗口时"
            value={closeBehavior}
            options={[{ value: "exit", label: "退出程序" }, { value: "tray", label: "隐藏到托盘" }]}
            onChange={setCloseBehavior}
            searchId="close-behavior"
          />
          <Segmented<MinimizeBehavior>
            label="最小化时"
            value={minimizeBehavior}
            options={[{ value: "taskbar", label: "任务栏" }, { value: "tray", label: "隐藏到托盘" }]}
            onChange={setMinimizeBehavior}
            searchId="minimize-behavior"
          />
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("display", node); }} className="settings-section" data-settings-section="display">
          <SectionTitle title="事件显示" onReset={() => requestSectionReset("事件显示", resetDisplay)} />
          <SettingsSubsectionTitle title="收藏行为" />
          <SettingSwitch
            label="收藏时编辑备注和标签"
            checked={favoriteEditOnAdd}
            onChange={() => setFavoriteEditOnAdd(!favoriteEditOnAdd)}
            searchId="favorite-edit"
            hint="开启后，收藏事件会立即打开备注和标签编辑；关闭时可长按收藏图标编辑。"
          />
          <SettingsSubsectionTitle title="信息流行为" icon={<AlignStartVertical size={16} />} />
          <Segmented<"top" | "bottom">
            label="内容对齐"
            value={liveContentAlignment}
            options={[{ value: "top", label: "顶部" }, { value: "bottom", label: "底部" }]}
            onChange={setLiveContentAlignment}
            searchId="content-alignment"
            tiles
            decoration={value => <span className={`settings-alignment-diagram${value === "bottom" ? " is-bottom" : ""}`}><i /><i /><i /></span>}
          />
          {liveContentAlignment === undefined && <p className="settings-hint">保持原布局；选择顶部或底部后统一应用。</p>}
          <Segmented<LiveScrollDirection>
            label="最新事件位置"
            value={liveScrollDirection}
            options={[{ value: "top", label: "上方" }, { value: "bottom", label: "下方" }]}
            onChange={setLiveScrollDirection}
            searchId="feed-direction"
            decoration={value => value === "top" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          />
          <SettingsSubsectionTitle title="事件动画" icon={<SlidersHorizontal size={16} />} />
          <DurationInput value={eventDisplayPreferences.eventAnimationDurationMs} onChange={setEventAnimationDuration} />
          <Segmented
            label="动画效果"
            value={eventDisplayPreferences.eventAnimationPreset}
            options={[...EVENT_ANIMATION_PRESET_OPTIONS]}
            onChange={setEventAnimationPreset}
            searchId="event-animation"
          />
          <SettingsFlowPreview alignment={liveContentAlignment} direction={liveScrollDirection} preset={eventDisplayPreferences.eventAnimationPreset} duration={eventDisplayPreferences.eventAnimationDurationMs} />
          <SettingsSubsectionTitle title="置顶栏" />
          <SettingSwitch label="副窗口置顶栏" checked={stickyEvents.enabled} onChange={() => setStickyEvents(current => ({...current,enabled:!current.enabled}))} searchId="sticky-events" />
          <SettingSwitch label="OBS置顶栏" checked={stickyEvents.obsEnabled} onChange={() => setStickyEvents(current => ({...current,obsEnabled:!current.obsEnabled}))} searchId="obs-sticky-events" />
          {(stickyEvents.enabled || stickyEvents.obsEnabled) && <>
            <div className="settings-control-row" data-settings-search="sticky-position"><span className="settings-control-label ui-type-control text-t2">显示位置</span>
              <SettingsChoiceControl label="置顶栏位置" value={stickyEvents.position} options={[{value:'top',label:'顶部'},{value:'bottom',label:'底部'}]} onChange={position => setStickyEvents(current => ({...current,position:position === 'bottom' ? 'bottom' : 'top'}))} />
            </div>
            <PixelInput label="置顶最低金额" value={stickyEvents.giftThreshold} min={0} max={Number.MAX_SAFE_INTEGER} step={0.01} unit="元" searchId="sticky-threshold" onChange={giftThreshold => setStickyEvents(current => ({...current,giftThreshold}))} />
            <PixelInput label="最大显示条数" value={stickyEvents.maxCount} min={1} max={100} step={1} unit="条" searchId="sticky-count" onChange={maxCount => setStickyEvents(current => ({...current,maxCount}))} />
            <div className="settings-control-row" data-settings-search="sticky-sort"><span className="settings-control-label ui-type-control text-t2">排序方式</span>
              <SettingsChoiceControl label="置顶栏排序" value={stickyEvents.sort} options={[{value:'amount',label:'按金额降序'},{value:'time',label:'按时间倒序'}]} onChange={sort => setStickyEvents(current => ({...current,sort:sort === 'time' ? 'time' : 'amount'}))} />
            </div>
          </>}
          <SettingsSubsectionTitle title="副窗口与 OBS" hint="仅影响副窗口与 OBS，不影响现场历史和回看。" />
          <PixelInput label="输出保留条数" value={eventWindowCapacity} min={1} max={100} step={1} unit="条" searchId="event-window-capacity" onChange={setEventWindowCapacity} />
          <SettingSwitch
            label="事件定时消失"
            checked={eventExpiry.enabled}
            onChange={() => setEventExpiry((current) => ({ ...current, enabled: !current.enabled }))}
            searchId="event-expiry"
          />
          {eventExpiry.enabled && (
            <SecondsInput
              label="消失时间"
              value={eventExpiry.seconds}
              onChange={(seconds) => setEventExpiry((current) => ({ ...current, seconds }))}
              searchId="event-expiry-seconds"
            />
          )}
          <SettingSwitch label="合并相同弹幕" checked={mergeSameDanmu} onChange={() => setMergeSameDanmu(!mergeSameDanmu)} searchId="merge-danmu" />
          {mergeSameDanmu && (
            <SecondsInput
              label="合并时间"
              value={sameDanmuWindowSeconds}
              min={MIN_SAME_DANMU_WINDOW_SECONDS}
              max={MAX_SAME_DANMU_WINDOW_SECONDS}
              onChange={setSameDanmuWindowSeconds}
              searchId="merge-danmu-seconds"
            />
          )}
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("filters", node); }} className="settings-section" data-settings-section="filters">
          <SectionTitle title="事件筛选" onReset={() => requestSectionReset("事件筛选", resetFilters)} />
          <SettingsSubsectionTitle title="事件显示策略" />
          <SettingSwitch label="显示自动弹幕" checked={eventDisplayPreferences.showAutoDanmaku} onChange={() => setEventDisplayPreference("showAutoDanmaku", !eventDisplayPreferences.showAutoDanmaku)} searchId="auto-danmaku" />
          <SettingSwitch label="显示未验证手机号用户弹幕" checked={eventDisplayPreferences.showPhoneNotVerified} onChange={() => setEventDisplayPreference("showPhoneNotVerified", !eventDisplayPreferences.showPhoneNotVerified)} searchId="phone-not-verified" />
          <SettingSwitch
            label="只显示大航海进房"
            checked={eventDisplayPreferences.onlyGuardEntry}
            onChange={() => setEventDisplayPreference("onlyGuardEntry", !eventDisplayPreferences.onlyGuardEntry)}
            searchId="guard-entry"
          />
          <SettingSwitch
            label="显示跨房事件"
            checked={sceneSettings.audienceFilters.showCrossRoomEvents}
            onChange={() => updateScene("audienceFilters", { ...sceneSettings.audienceFilters, showCrossRoomEvents: !sceneSettings.audienceFilters.showCrossRoomEvents })}
            searchId="cross-room-events"
          />
          <PixelInput label="最低荣耀等级" unit="级" value={sceneSettings.audienceFilters.minimumWealthLevel} min={0} max={Number.MAX_SAFE_INTEGER} step={1} searchId="minimum-wealth-level" onChange={(minimumWealthLevel) => updateScene("audienceFilters", { ...sceneSettings.audienceFilters, minimumWealthLevel })} />
          <PixelInput label="最低当前主播粉丝牌等级" unit="级" value={sceneSettings.audienceFilters.minimumCurrentRoomMedalLevel} min={0} max={Number.MAX_SAFE_INTEGER} step={1} searchId="minimum-current-room-medal-level" onChange={(minimumCurrentRoomMedalLevel) => updateScene("audienceFilters", { ...sceneSettings.audienceFilters, minimumCurrentRoomMedalLevel })} />
          <GiftThresholdInput
            value={sceneSettings.giftThreshold}
            mode={sceneSettings.giftThresholdMode}
            onChange={(value) => updateScene("giftThreshold", value)}
            searchId="gift-threshold"
          />
          <Segmented<GiftThresholdMode>
            label="金额计算"
            value={sceneSettings.giftThresholdMode}
            options={[{ value: "unit", label: "按单件价格" }, { value: "cumulative", label: "按累计金额" }]}
            onChange={(value) => updateScene("giftThresholdMode", value)}
            searchId="gift-threshold-mode"
          />
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("live", node); }} className="settings-section" data-settings-section="live">
          <SectionTitle title="现场" onReset={() => requestSectionReset("现场", resetLive)} />
          <Segmented
            label="区域布局"
            value={sceneSettings.layoutMode}
            options={[{ value: "dual", label: "双区" }, { value: "partition", label: "多区" }]}
            onChange={(value) => updateScene("layoutMode", value)}
            searchId="layout-mode"
            decoration={value => <SceneLayoutIcon mode={value} />}
          />
          <SettingSwitch label="显示礼物特效" checked={showLiveGiftEffect} onChange={() => setShowLiveGiftEffect(!showLiveGiftEffect)} searchId="live-gift-effect" />
          <SettingSwitch label="显示大航海特效" checked={showLiveGuardEffect} onChange={() => setShowLiveGuardEffect(!showLiveGuardEffect)} searchId="live-guard-effect" />
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("review", node); }} className="settings-section" data-settings-section="review">
          <SectionTitle title="回看" onReset={() => requestSectionReset("回看", resetReviewSettings)} />
          <div className="settings-control-row settings-switch-row" data-settings-search="review-owner">
            <div className="min-w-0">
            <div className="settings-control-label ui-type-control text-t2" title="开启后优先进入当前连接栏主播的档案；关闭后进入所有主播档案馆。快捷入口仍可直接查看当前主播和当前场次。">进入回看时打开当前主播</div>
            </div>
            <SwitchButton
              label="进入回看时打开当前主播"
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
          <SectionTitle title="副窗口" onReset={() => requestSectionReset("副窗口", resetWindows)} />
          <SettingsSubsectionTitle title="窗口外观" />
          <Segmented label="材质" value={windowAppearance.material} onChange={material => { setWindowAppearance(current => ({...current, material})); }} options={[{value:'glass',label:'玻璃'},{value:'solid',label:'纯色'},{value:'transparent',label:'透明'}]} />
          {windowAppearance.material !== 'transparent' && <Segmented label="窗口明暗" value={windowAppearance.scheme} onChange={scheme => setWindowAppearance(current => ({...current, scheme}))} options={[{value:"follow",label:"跟随软件"},{value:"light",label:"浅色"},{value:"dark",label:"深色"}]} decoration={value => value === "follow" ? <Monitor size={15} /> : value === "light" ? <Sun size={15} /> : <Moon size={15} />} />}
          {windowAppearance.material !== 'transparent' && <>
          <label className="settings-slider-row" data-settings-search="window-opacity">
            <span className="flex items-center justify-between ui-type-control text-t2">
              <span>{windowAppearance.material === 'glass' ? "玻璃着色" : "不透明度"}</span>
              <span className="font-mono text-t1">{Math.round((windowAppearance.material === 'glass' ? windowAppearance.glassTint : windowAppearance.solidOpacity) * 100)}%</span>
            </span>
            <input
              type="range"
              min={MIN_WINDOW_OPACITY * 100}
              max={MAX_WINDOW_OPACITY * 100}
              step="1"
              value={Math.round((windowAppearance.material === 'glass' ? windowAppearance.glassTint : windowAppearance.solidOpacity) * 100)}
              onChange={(event) => setWindowAppearance((current) => ({ ...current, [current.material === 'glass' ? 'glassTint' : 'solidOpacity']: Number(event.target.value) / 100 }))}
              aria-label={windowAppearance.material === 'glass' ? "玻璃着色" : "不透明度"}
              className="settings-range"
              style={{ "--settings-range-progress": `${(((windowAppearance.material === 'glass' ? windowAppearance.glassTint : windowAppearance.solidOpacity) - MIN_WINDOW_OPACITY) / (MAX_WINDOW_OPACITY - MIN_WINDOW_OPACITY)) * 100}%` } as CSSProperties}
            />
          </label>
          <SurfaceColorInput
            value={resolveWindowSurfaceColor(windowAppearance, resolveWindowScheme(windowAppearance.scheme, softwareScheme))}
            onChange={(surfaceColor) => setWindowAppearance((current) => ({ ...current, surfaceColor }))}
            automatic={windowAppearance.surfaceColor === null}
            onReset={() => setWindowAppearance(current => ({...current, surfaceColor:null}))}
            searchId="window-surface"
          />
          <PixelInput
            label="圆角"
            value={windowAppearance.radius}
            onChange={(radius) => setWindowAppearance((current) => ({ ...current, radius }))}
            min={MIN_WINDOW_RADIUS}
            max={MAX_WINDOW_RADIUS}
            step={1}
            searchId="window-radius"
          />
          </>}
          <SettingsSubsectionTitle title="弹幕内容" />
          <Segmented label="内容明暗" value={windowScheme} onChange={setWindowScheme} options={[{value:"follow",label:"跟随软件"},{value:"light",label:"浅色"},{value:"dark",label:"深色"}]} decoration={value => value === "follow" ? <Monitor size={15} /> : value === "light" ? <Sun size={15} /> : <Moon size={15} />} />
          <div ref={(node) => { if (node) anchorRefs.current.set("display", node); }} data-settings-anchor="display" data-settings-search="display-window" className="settings-window-group">
            <SettingsSubsectionTitle title="弹幕窗" />
            <div className="settings-window-toggle"><SettingSwitch label="开启弹幕窗" checked={displayOpen} onChange={onToggleDisplay} searchId="display-window-open" /><button type="button" disabled={!displayOpen} onClick={onLocateDisplay} title="定位弹幕窗" aria-label="定位弹幕窗" className="settings-locate-button"><MapPin size={16} /></button></div>
            <SettingSwitch label="锁定并穿透鼠标" checked={displayLocked} onChange={onToggleDisplayLock} searchId="display-window-lock" />
            <SettingsSubsectionTitle title="事件筛选" level={3} />
            <div className="settings-tertiary-content">
              <div className="settings-filter-grid">
                <SettingsFilterRow
                  label="弹幕"
                  active={displayWindowFilters.danmu}
                  onPrimaryToggle={() => toggleDisplayWindowFilter("danmu")}
                />
                <SettingsFilterRow
                  label="互动"
                  active={displayWindowFilters.interact}
                  onPrimaryToggle={() => toggleDisplayWindowFilter("interact")}
                  selected={displayWindowFilters.interactKinds}
                  onToggle={toggleDisplayWindowInteractKind}
                />
              </div>
            </div>
          </div>
          <div ref={(node) => { if (node) anchorRefs.current.set("gift", node); }} data-settings-anchor="gift" data-settings-search="gift-window" className="settings-window-group">
            <SettingsSubsectionTitle title="收益窗" />
            <div className="settings-window-toggle"><SettingSwitch label="开启收益窗" checked={giftOpen} onChange={onToggleGift} searchId="gift-window-open" /><button type="button" disabled={!giftOpen} onClick={onLocateGift} title="定位收益窗" aria-label="定位收益窗" className="settings-locate-button"><MapPin size={16} /></button></div>
            <SettingSwitch label="锁定并穿透鼠标" checked={giftLocked} onChange={onToggleGiftLock} disabled={!giftOpen} searchId="gift-window-lock" />
            <Segmented<RevenueWindowMode> label="显示方式" searchId="gift-window-mode" value={revenueSelection?.mode ?? 'combined'}
              options={[{ value: 'combined', label: '组合窗口' }, { value: 'split', label: '分窗显示' }]}
              onChange={value => onRevenueWindowMode?.(value)} decoration={value => value === 'combined' ? <Wallet size={15} /> : <Layers size={15} />} />
            <SettingSwitch label="显示礼物特效" checked={showGiftWindowEffect} onChange={() => setShowGiftWindowEffect(!showGiftWindowEffect)} searchId="gift-window-effect" />
          <SettingSwitch label="显示大航海特效" checked={showGuardWindowEffect} onChange={() => setShowGuardWindowEffect(!showGuardWindowEffect)} searchId="guard-window-effect" />
            {revenueSelection?.mode === 'split' && <>
              <SettingsSubsectionTitle title="分窗" level={3} />
              <div className="settings-tertiary-content" role="group" aria-label="分窗">
                {([['gift', '礼物窗'], ['superchat', '醒目留言窗'], ['guard', '大航海窗']] as const).map(([kind, label]) => <SettingSwitch key={kind}
                  label={label} icon={<SettingsIcon name={label} />}
                  checked={revenueSelection.selected.includes(kind)} onChange={() => onToggleRevenueChild?.(kind)}
                  searchId={`revenue-${kind}-open`} />)}
              </div>
            </>}
          </div>
        </section>

        <section ref={(node) => { if (node) sectionRefs.current.set("interaction", node); }} className="settings-section" data-settings-section="interaction">
          <SectionTitle title="事件交互" onReset={() => requestSectionReset("事件交互", resetEventInteractionSettings)} />
          <SettingsSubsectionTitle title="事件快捷菜单" hint="事件行的更多菜单左侧可显示快捷按钮；收藏和标记状态会单独常驻。" />
          <div data-settings-search="shortcut-menu">
            <ShortcutMenuPicker
              value={voiceSettings.shortcutActions}
              onChange={(shortcutActions) => voiceSettings.setVoiceSettings({ shortcutActions })}
            />
          </div>
          <SettingsSubsectionTitle title="用户昵称" hint="昵称作为通用用户名，影响界面显示和语音播报。" />
          <SettingSwitch
            label="朗读昵称/用户名"
            checked={voiceSettings.speakUsername}
            onChange={() => voiceSettings.setVoiceSettings({ speakUsername: !voiceSettings.speakUsername })}
            searchId="speak-username"
          />
          <div className="settings-style-editor-summary settings-user-nickname-summary" data-settings-search="nickname">
            <div className="settings-style-editor-copy">
              <div className="ui-type-control text-t2">用户昵称</div>
              <div className="ui-type-meta text-t3">已设置 {nicknameEntries.length} 个</div>
            </div>
            <button
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
              管理昵称
            </button>
          </div>
          {nicknameManagerOpen && createPortal(
            <div
              ref={nicknameManagerRef}
              role="dialog"
              aria-label="用户昵称管理"
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
                <div className="ui-type-control font-medium text-t1" title="昵称作为通用用户名，影响界面显示和语音播报。">用户昵称</div>
                <button
                  type="button"
                  aria-label="关闭用户昵称管理"
                  className="rounded px-1.5 py-0.5 ui-type-control text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                  onClick={() => {
                    setNicknameManagerOpen(false);
                    setEditingNicknameUid(null);
                    setNicknameNotice("");
                    nicknameManagerTriggerRef.current?.focus();
                  }}
                >
                  ×
                </button>
              </div>
              {nicknameNotice && <div className="mt-2 ui-type-meta text-t3" role="status">{nicknameNotice}</div>}
              {nicknameEntries.length === 0 ? (
                <div className="mt-3 rounded-md border border-line/70 bg-bg px-2.5 py-2 ui-type-meta text-t3">暂无已保存昵称，请在事件菜单中添加。</div>
              ) : (
                <div className="settings-user-nickname-list mt-3 flex max-h-64 flex-col gap-1 overflow-y-auto" aria-label="已保存的用户昵称">
                  {nicknameEntries.map(([uid, nickname]) => (
                    <div key={uid} className="rounded-md border border-line/70 bg-bg px-2 py-1.5">
                      {editingNicknameUid === uid ? (
                        <div className="settings-user-nickname-entry-editor">
                          <div className="font-mono ui-type-micro text-t3">{uid}</div>
                          <input
                            autoFocus
                            value={editingNicknameValue}
                            onChange={(event) => setEditingNicknameValue(event.target.value)}
                            className="settings-control-surface mt-1 h-8 w-full px-2 ui-type-control text-t1"
                            aria-label={`编辑昵称 ${uid}`}
                          />
                          <div className="mt-1.5 flex justify-end gap-1.5">
                            <button
                              type="button"
                              className="rounded px-1.5 py-1 ui-type-micro text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                              onClick={() => { setEditingNicknameUid(null); setEditingNicknameValue(""); setNicknameNotice(""); }}
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              className="rounded border border-accent/60 bg-accent-subtle px-2 py-1 ui-type-micro font-medium text-accent-text transition-colors hover:border-accent hover:bg-accent-solid hover:text-accent-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                              onClick={() => saveNicknameEntry(uid)}
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex min-h-8 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate ui-type-control text-t2" title={`${nickname} · ${uid}`}>
                            <span className="font-medium text-t1">{nickname}</span>
                            <span className="ml-2 font-mono ui-type-micro text-t3">{uid}</span>
                          </span>
                          <button
                            type="button"
                            className="shrink-0 rounded px-1.5 py-1 ui-type-micro text-t3 transition-colors hover:bg-raised hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                            onClick={() => { setEditingNicknameUid(uid); setEditingNicknameValue(nickname); setNicknameNotice(""); }}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            aria-label={`删除昵称 ${nickname}`}
                            className="shrink-0 rounded px-1.5 py-1 ui-type-micro text-t3 transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"
                            onClick={() => deleteNickname(uid)}
                          >
                            删除
                          </button>
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
          <SectionTitle title="语音与播报" onReset={() => requestSectionReset("语音与播报", resetVoiceOutputSettings)} />
          <SettingsSubsectionTitle title="声音输出" />
          <div data-settings-search="voice-scope">
            <Segmented
              label="收听范围"
              value={voiceSettings.outputScope}
              options={[{ value: "host", label: "仅主播" }, { value: "audience", label: "仅观众" }, { value: "both", label: "主播与观众" }]}
              onChange={(outputScope) => voiceSettings.setVoiceSettings({ outputScope })}
            />
          </div>
          {(voiceSettings.outputScope === "host" || voiceSettings.outputScope === "both") && (
            <div ref={hostDeviceRowRef} className="settings-control-row" data-settings-search="voice-host-device" data-settings-layout={hostDeviceLayout}>
              <span className="settings-control-label ui-type-control text-t2">主播设备</span>
              <div className="settings-control-value">
                <SharedSettingsListSelect
                  ariaLabel="主播输出设备"
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
              <span className="settings-control-label ui-type-control text-t2">观众设备</span>
              <div className="settings-control-value">
                <SharedSettingsListSelect
                  ariaLabel="观众输出设备"
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
          <SectionTitle title="其他设置" />
          <div className="settings-control-row" data-settings-search="window-layout">
            <span className="settings-control-label ui-type-control text-t2">主窗口布局</span>
            <button type="button" onClick={() => requestReset("恢复主窗口布局？", "将恢复主窗口及工作台的默认尺寸和位置，不会关闭副窗口或清除现场数据。", onResetWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">恢复布局</button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">弹幕窗布局</span>
            <button type="button" onClick={() => requestReset("恢复弹幕窗布局？", "将恢复弹幕窗的默认尺寸和位置，不会关闭窗口或清除现场数据。", onResetDisplayWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">恢复布局</button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">收益窗布局</span>
            <button type="button" onClick={() => requestReset("恢复收益窗布局？", "将恢复收益窗的默认尺寸和位置，不会关闭窗口或清除现场数据。", onResetGiftWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">恢复布局</button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">全部窗口布局</span>
            <button type="button" onClick={() => requestReset("恢复全部窗口布局？", "将恢复主窗口、工作台、弹幕窗和收益窗的默认尺寸和位置，不会清除现场数据。", onResetAllWindowLayout)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">恢复全部布局</button>
          </div>
          <div className="settings-control-row">
            <span className="settings-control-label ui-type-control text-t2">设置页默认</span>
            <button type="button" onClick={() => requestReset("恢复设置页全部默认？", "将恢复设置页中的全部设置，但不会清除主播记录、用户数据或登录凭证。", resetAll)} className="h-8 rounded-md border border-line bg-bg px-2.5 ui-type-control text-t2 transition-colors hover:border-accent/50 hover:bg-surface hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">恢复设置页默认</button>
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
          <SectionTitle title="关于" />
          <button type="button" onClick={() => setAboutOpen(true)} className="settings-control-row settings-about-entry" data-settings-search="about" aria-label="关于 BB CoLive">
            <span className="settings-control-label ui-type-control text-t2"><Info size={16} aria-hidden="true" />BB CoLive</span>
            <span className="font-mono ui-type-meta text-t3">v{version}</span>
          </button>
        </section>
      </WorkbenchScroll>
      {aboutOpen && <AboutDialog version={version} onClose={() => setAboutOpen(false)} />}
      {pendingReset && (
        <ConfirmDialog
          title={pendingReset.title}
          description={pendingReset.description}
          confirmLabel="确认恢复"
          onCancel={() => setPendingReset(null)}
          onConfirm={pendingReset.action}
        />
      )}
    </div>
  );
}
