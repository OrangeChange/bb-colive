import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { Radio as LucideRadio, History as LucideHistory, Mic as LucideMic, AudioLines as LucideAudioLines, Paintbrush as LucidePaintbrush, Bell as LucideBell, BellOff as LucideBellOff, MessagesSquare as LucideMessagesSquare, Lock as LucideLock, LockOpen as LucideLockOpen, Gift as LucideGift, Wallet as LucideWallet, MessageSquareQuote as LucideMessageSquareQuote, Ship as LucideShip, Palette as LucidePalette, Sun as LucideSun, Moon as LucideMoon, Contrast as LucideContrast } from "lucide-react";
/**
 * 左侧边栏（64px 图标栏，ui-design §四）：
 * 上：现场 / 回看；下：弹幕窗/收益窗入口 + 主题快捷入口
 */
import { useCallback, useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { railButton as btn, railButtonIdle as btnIdle, railButtonDisabled as btnOff } from "./railPrimitives";
import { useSession } from "../stores/session";
import { useTheme } from "../theme";
import type { MainView } from "./mainView";
import { useVoiceSettings } from "../voice/voiceSettings.ts";
import { voiceController } from "../voice/voiceRuntime.ts";
import type { RevenueWindowSelection, RevenueWindowKind } from '../windows/giftWindowModel';

function IconBroadcast() {
  return (
    <LucideRadio className="size-5" />
  );
}
function IconHistory() {
  return (
    <LucideHistory className="size-5" />
  );
}
function IconVoice() {
  return (
    <LucideMic className="size-5" />
  );
}
function IconAudioWaveform() {
  return (
    <LucideAudioLines className="size-5" />
  );
}
function IconStyle() {
  return (
    <LucidePaintbrush className="size-5" aria-hidden="true" />
  );
}
function IconBell({ muted = false }: { muted?: boolean }) {
  return (
    (muted ? <LucideBellOff className="size-5" /> : <LucideBell className="size-5" />)
  );
}
function IconChatWindow() {
  return (
    <LucideMessagesSquare className="size-5" />
  );
}
function IconLock({ locked }: { locked: boolean }) {
  return (
    (locked ? <LucideLock aria-hidden="true" className="size-5" /> : <LucideLockOpen aria-hidden="true" className="size-5" />)
  );
}
function IconGiftBox() {
  return (
    <LucideGift className="size-5" />
  );
}

function IconRevenue() {
  return (
    <LucideWallet className="size-5" aria-hidden="true" />
  );
}

function IconSuperChat() {
  return (
    <LucideMessageSquareQuote className="size-5" aria-hidden="true" />
  );
}

function IconGuard() {
  return (
    <LucideShip className="size-5" aria-hidden="true" />
  );
}

function IconPalette() {
  return (
    <LucidePalette className="size-5" />
  );
}

function IconSun() {
  return (
    <LucideSun className="size-5" />
  );
}

function IconMoon() {
  return (
    <LucideMoon className="size-5" />
  );
}

function IconSystem() {
  return (
    <LucideContrast className="size-5" />
  );
}

function ThemeQuickToggle() {
  useUiLanguage();
  const palette = useTheme((state) => state.palette);
  const cyclePalette = useTheme((state) => state.cyclePalette);
  const mode = useTheme((state) => state.mode);
  const setMode = useTheme((state) => state.setMode);
  const nextMode = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
  const paletteLabel = palette === "pine" ? uiText("sidebar.ThemeQuickToggle.paletteLabel") : palette === "custom" ? uiText("sidebar.ThemeQuickToggle.paletteLabel2") : uiText("sidebar.ThemeQuickToggle.paletteLabel3");
  const modeLabel = mode === "system" ? uiText("common.followSystem") : mode === "light" ? uiText("common.light") : uiText("common.dark");

  return (
    <div className="flex flex-col items-center gap-1" aria-label={uiText("sidebar.aria_label")}>
      <button
        type="button"
        className={btnIdle}
        aria-label={uiText("sidebar.aria_label2", { paletteLabel: paletteLabel })}
        title={uiText("sidebar.title", { paletteLabel: paletteLabel })}
        onClick={cyclePalette}
      >
        <IconPalette />
      </button>
      <button
        type="button"
        className={btnIdle}
        aria-label={uiText("sidebar.aria_label3", { modeLabel: modeLabel })}
        title={uiText("sidebar.title2", { modeLabel: modeLabel })}
        onClick={() => setMode(nextMode)}
      >
        {mode === "system" ? <IconSystem /> : mode === "light" ? <IconSun /> : <IconMoon />}
      </button>
    </div>
  );
}

const btnOn = `${btn} bg-accent-subtle text-accent-text`;
const DISPLAY_LOCK_HOVER_DELAY_MS = 2000;
const DISPLAY_LOCK_COLLAPSE_DELAY_MS = 220;
const GIFT_LOCK_HOVER_DELAY_MS = 2000;
const GIFT_LOCK_COLLAPSE_DELAY_MS = 220;

type SidebarQuickToggleProps = {
  activeMainView?: MainView;
  mainView: MainView;
  mainTitle: string;
  mainIcon: ReactNode;
  enabled: boolean;
  toggleLabel: string;
  toggleIcon: ReactNode;
  onSelectMainView?: (view: MainView) => void;
  onToggle: () => void;
};

function SidebarQuickToggle({
  activeMainView,
  mainView,
  mainTitle,
  mainIcon,
  enabled,
  toggleLabel,
  toggleIcon,
  onSelectMainView,
  onToggle,
}: SidebarQuickToggleProps) {
  useUiLanguage();
  const [revealed, setRevealed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredRef = useRef(false);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = null;
  }, []);

  const reveal = () => {
    clearCollapseTimer();
    setRevealed(true);
  };

  const scheduleCollapse = () => {
    clearCollapseTimer();
    collapseTimerRef.current = setTimeout(() => {
      setRevealed(false);
      collapseTimerRef.current = null;
    }, 220);
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget && rootRef.current?.contains(nextTarget as Node)) return;
    if (!hoveredRef.current) scheduleCollapse();
  };

  useEffect(() => () => clearCollapseTimer(), [clearCollapseTimer]);

  return (
    <div
      ref={rootRef}
      className={`sidebar-feature-controls has-toggle group relative ${revealed ? "is-revealed" : ""}`}
      onMouseEnter={() => { hoveredRef.current = true; reveal(); }}
      onMouseLeave={() => { hoveredRef.current = false; scheduleCollapse(); }}
      onFocusCapture={reveal}
      onBlurCapture={handleBlur}
    >
      <button type="button" aria-current={activeMainView === mainView ? "page" : undefined} className={activeMainView === mainView ? btnOn : btnIdle} title={mainTitle} onClick={() => onSelectMainView?.(mainView)}>
        {mainIcon}
      </button>
      <button
        type="button"
        className={`${btnIdle} sidebar-feature-toggle ${enabled ? "bg-accent-subtle text-accent-text" : ""}`}
        title={toggleLabel}
        aria-label={toggleLabel}
        aria-pressed={enabled}
        onClick={onToggle}
      >
        {toggleIcon}
      </button>
    </div>
  );
}

/** 已登录用户标识：头像悬停显示登录状态，点击弹出用户菜单（退出需二次点击，防误触） */
function UserBadge() {
  useUiLanguage();
  const session = useSession((s) => s.session);
  const logout = useSession((s) => s.logout);
  const [open, setOpen] = useState(false);
  const [failedFaceUrl, setFailedFaceUrl] = useState<string | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // 点击菜单外部关闭（与主播卡菜单一致的交互）
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  if (!session) return null;
  const face =
    session.face && failedFaceUrl !== session.face ? (
      // hdslb.com 有 Referer 防盗链：localhost 来源会被 403，必须不带 Referer 请求
      <img
        src={session.face}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailedFaceUrl(session.face)}
        className="size-full rounded-full object-cover"
      />
    ) : (
      <span className="flex size-full items-center justify-center rounded-full bg-accent-subtle ui-type-control text-accent-text">
        {session.uname.slice(0, 1)}
      </span>
    );

  return (
    <div ref={rootRef} className="relative">
      <button
        className={`${btnIdle} flex-col gap-0.5 ${open ? "bg-raised text-t1" : ""}`}
        aria-label={uiText("sidebar.aria_label4", { uname: session.uname })}
        title={uiText("sidebar.title3", { uname: session.uname })}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="size-6">{face}</span>
      </button>
      {open && (
        <div className="ui-motion-enter absolute bottom-0 left-12 z-50 w-52 rounded-lg border border-line bg-surface p-2 shadow-xl shadow-black/20">
          <div className="flex items-center gap-2.5 px-1 pb-2">
            <span className="size-8 shrink-0">{face}</span>
            <div className="min-w-0">
        <div className="truncate ui-type-section-title text-t1">{session.uname}</div>
          <div className="ui-type-meta text-t3">UID {session.mid}</div>
            </div>
          </div>
          <button
            className="mt-1 flex w-full items-center gap-2 rounded-md border-t border-line px-1 pt-2 ui-type-section-title text-t3 transition-colors hover:bg-raised hover:text-danger"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
          >
            {uiText("sidebar.UserBadge")}</button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({
  activeMainView = "scene",
  onSelectMainView,
  displayOpen = false,
  displayLocked = false,
  onToggleDisplay,
  onToggleDisplayLock,
  giftOpen = false,
  giftLocked = false,
  onToggleGift,
  onToggleGiftLock,
  onOpenDisplaySettings,
  onOpenGiftSettings,
  revenueSelection,
  onToggleRevenueChild,
}: {
  activeMainView?: MainView;
  onSelectMainView?: (view: MainView) => void;
  displayOpen?: boolean;
  displayLocked?: boolean;
  onToggleDisplay?: () => void;
  onToggleDisplayLock?: () => void;
  giftOpen?: boolean;
  giftLocked?: boolean;
  onToggleGift?: () => void;
  onToggleGiftLock?: () => void;
  onOpenDisplaySettings?: () => void;
  onOpenGiftSettings?: () => void;
  revenueSelection?: RevenueWindowSelection;
  onToggleRevenueChild?: (kind: RevenueWindowKind) => void;
}) {
  useUiLanguage();
  const voiceEnabled = useVoiceSettings((state) => state.enabled);
  const personalBroadcastEnabled = useVoiceSettings((state) => state.personalBroadcast.enabled);
  const personalBroadcast = useVoiceSettings((state) => state.personalBroadcast);
  const setVoiceSettings = useVoiceSettings((state) => state.setVoiceSettings);
  const [displayControlsRevealed, setDisplayControlsRevealed] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const displayOpenRef = useRef(displayOpen);
  const displayControlsHoveredRef = useRef(false);
  const lockToggleRef = useRef(onToggleDisplayLock);
  const [giftControlsRevealed, setGiftControlsRevealed] = useState(false);
  const giftControlsRef = useRef<HTMLDivElement>(null);
  const giftRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giftCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const giftOpenRef = useRef(giftOpen);
  const giftControlsHoveredRef = useRef(false);
  const giftLockToggleRef = useRef(onToggleGiftLock);
  const revenueSplit = revenueSelection?.mode === 'split';
  const hasGiftControls = revenueSplit || (giftOpen && !!onToggleGiftLock);
  const clearDisplayControlTimers = useCallback(() => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    revealTimerRef.current = null;
    collapseTimerRef.current = null;
  }, []);

  const startLazyDisplayControlReveal = useCallback(() => {
    clearDisplayControlTimers();
    if (!onToggleDisplayLock) return;
    revealTimerRef.current = setTimeout(() => {
      if (displayOpenRef.current && displayControlsHoveredRef.current && lockToggleRef.current) {
        setDisplayControlsRevealed(true);
      }
      revealTimerRef.current = null;
    }, DISPLAY_LOCK_HOVER_DELAY_MS);
  }, [clearDisplayControlTimers, onToggleDisplayLock]);

  const revealDisplayControls = () => {
    clearDisplayControlTimers();
    if (displayOpenRef.current && onToggleDisplayLock) setDisplayControlsRevealed(true);
  };

  const scheduleDisplayControlsCollapse = () => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = null;
    if (collapseTimerRef.current) clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = setTimeout(() => {
      setDisplayControlsRevealed(false);
      collapseTimerRef.current = null;
    }, DISPLAY_LOCK_COLLAPSE_DELAY_MS);
  };

  const handleDisplayControlsMouseEnter = () => {
    displayControlsHoveredRef.current = true;
    clearDisplayControlTimers();
    if (displayOpenRef.current && onToggleDisplayLock) {
      setDisplayControlsRevealed(true);
    }
  };

  const handleDisplayControlsMouseLeave = () => {
    displayControlsHoveredRef.current = false;
    scheduleDisplayControlsCollapse();
  };

  const handleDisplayButtonClick = () => {
    if (!displayOpenRef.current && onToggleDisplay && onToggleDisplayLock) {
      // 懒启动从“打开”这一刻开始计时，点击前路过按钮不会提前消耗等待时间。
      startLazyDisplayControlReveal();
    }
    onToggleDisplay?.();
  };

  const handleDisplayControlsBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget && controlsRef.current?.contains(nextTarget as Node)) return;
    // 打开独立弹幕窗会让主按钮失焦，但鼠标仍可能停在按钮上；此时不能取消懒启动计时。
    if (!displayControlsHoveredRef.current) scheduleDisplayControlsCollapse();
  };

  const clearGiftControlTimers = useCallback(() => {
    if (giftRevealTimerRef.current) clearTimeout(giftRevealTimerRef.current);
    if (giftCollapseTimerRef.current) clearTimeout(giftCollapseTimerRef.current);
    giftRevealTimerRef.current = null;
    giftCollapseTimerRef.current = null;
  }, []);

  const startLazyGiftControlReveal = useCallback(() => {
    clearGiftControlTimers();
    if (!onToggleGiftLock) return;
    giftRevealTimerRef.current = setTimeout(() => {
      if (giftOpenRef.current && giftControlsHoveredRef.current && giftLockToggleRef.current) {
        setGiftControlsRevealed(true);
      }
      giftRevealTimerRef.current = null;
    }, GIFT_LOCK_HOVER_DELAY_MS);
  }, [clearGiftControlTimers, onToggleGiftLock]);

  const revealGiftControls = () => {
    clearGiftControlTimers();
    if (hasGiftControls) setGiftControlsRevealed(true);
  };

  const scheduleGiftControlsCollapse = () => {
    if (giftRevealTimerRef.current) clearTimeout(giftRevealTimerRef.current);
    giftRevealTimerRef.current = null;
    if (giftCollapseTimerRef.current) clearTimeout(giftCollapseTimerRef.current);
    giftCollapseTimerRef.current = setTimeout(() => {
      setGiftControlsRevealed(false);
      giftCollapseTimerRef.current = null;
    }, GIFT_LOCK_COLLAPSE_DELAY_MS);
  };

  const handleGiftControlsMouseEnter = () => {
    giftControlsHoveredRef.current = true;
    clearGiftControlTimers();
    if (hasGiftControls) setGiftControlsRevealed(true);
  };

  const handleGiftControlsMouseLeave = () => {
    giftControlsHoveredRef.current = false;
    scheduleGiftControlsCollapse();
  };

  const handleGiftButtonClick = () => {
    if (!revenueSplit && !giftOpenRef.current && onToggleGift && onToggleGiftLock) startLazyGiftControlReveal();
    onToggleGift?.();
  };

  const handleGiftControlsBlur = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget && giftControlsRef.current?.contains(nextTarget as Node)) return;
    if (!giftControlsHoveredRef.current) scheduleGiftControlsCollapse();
  };

  const toggleVoice = () => {
    if (voiceEnabled) {
      setVoiceSettings({ enabled: false });
      voiceController.stop();
      return;
    }
    setVoiceSettings({ enabled: true });
    voiceController.start();
  };

  const togglePersonalBroadcast = () => {
    setVoiceSettings({ personalBroadcast: { ...personalBroadcast, enabled: !personalBroadcastEnabled } });
  };

  useEffect(() => {
    displayOpenRef.current = displayOpen;
    lockToggleRef.current = onToggleDisplayLock;
    if (!displayOpen || !onToggleDisplayLock) {
      clearDisplayControlTimers();
      setDisplayControlsRevealed(false);
    }
  }, [clearDisplayControlTimers, displayOpen, onToggleDisplayLock]);

  useEffect(() => {
    giftOpenRef.current = giftOpen;
    giftLockToggleRef.current = onToggleGiftLock;
    if (!hasGiftControls) {
      clearGiftControlTimers();
      setGiftControlsRevealed(false);
    }
  }, [clearGiftControlTimers, giftOpen, onToggleGiftLock, hasGiftControls]);

  useEffect(() => () => {
    clearDisplayControlTimers();
    clearGiftControlTimers();
  }, [clearDisplayControlTimers, clearGiftControlTimers]);

  return (
    <aside className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-line bg-surface py-3">
      <button type="button" aria-current={activeMainView === "scene" ? "page" : undefined} className={activeMainView === "scene" ? btnOn : btnIdle} title={uiText("sidebar.title4")} onClick={() => onSelectMainView?.("scene")}>
        <IconBroadcast />
      </button>
      <button
        type="button"
        aria-current={activeMainView === "review" ? "page" : undefined}
        className={activeMainView === "review" ? btnOn : btnIdle}
        title={uiText("common.review")}
        onClick={() => onSelectMainView?.("review")}
      >
        <IconHistory />
      </button>
      <SidebarQuickToggle
        activeMainView={activeMainView}
        mainView="voice"
        mainTitle={uiText("uiControls.voiceTip")}
        mainIcon={<IconVoice />}
        enabled={voiceEnabled}
        toggleLabel={voiceEnabled ? uiText("sidebar.toggleLabel") : uiText("sidebar.toggleLabel2")}
        toggleIcon={<IconBell muted={!voiceEnabled} />}
        onSelectMainView={onSelectMainView}
        onToggle={toggleVoice}
      />
      <SidebarQuickToggle
        activeMainView={activeMainView}
        mainView="personal"
        mainTitle={uiText("uiControls.audioTip")}
        mainIcon={<IconAudioWaveform />}
        enabled={personalBroadcastEnabled}
        toggleLabel={personalBroadcastEnabled ? uiText("sidebar.toggleLabel3") : uiText("sidebar.toggleLabel4")}
        toggleIcon={<IconBell muted={!personalBroadcastEnabled} />}
        onSelectMainView={onSelectMainView}
        onToggle={togglePersonalBroadcast}
      />
      <button
        type="button"
        aria-current={activeMainView === "style" ? "page" : undefined}
        className={activeMainView === "style" ? btnOn : btnIdle}
        title={uiText("common.styles")}
        aria-label={uiText("common.styles")}
        onClick={() => onSelectMainView?.("style")}
      >
        <IconStyle />
      </button>

      <div className="mt-auto flex flex-col items-center gap-1">
        <UserBadge />
        <div
          ref={controlsRef}
          className={`sidebar-display-controls group relative ${displayOpen && onToggleDisplayLock ? "has-lock" : ""} ${displayOpen && onToggleDisplayLock && displayControlsRevealed ? "is-revealed" : ""}`}
          onMouseEnter={handleDisplayControlsMouseEnter}
          onMouseLeave={handleDisplayControlsMouseLeave}
          onFocusCapture={revealDisplayControls}
          onBlurCapture={handleDisplayControlsBlur}
        >
          <button
            type="button"
            className={onToggleDisplay ? (displayOpen ? btnOn : btnIdle) : btnOff}
            title={uiText("sidebar.title5", { value: displayOpen ? uiText("sidebar.title.value") : uiText("sidebar.title.value2") })}
            aria-label={displayOpen ? uiText("sidebar.aria_label5") : uiText("sidebar.aria_label6")}
            aria-pressed={displayOpen}
            onClick={handleDisplayButtonClick}
            onContextMenu={(event) => { event.preventDefault(); onOpenDisplaySettings?.(); }}
            disabled={!onToggleDisplay}
          >
            <IconChatWindow />
          </button>
          {displayOpen && onToggleDisplayLock && (
            <button
              type="button"
              className={`${btnIdle} sidebar-display-lock ${displayLocked ? "bg-accent-subtle text-accent-text" : ""}`}
              title={displayLocked ? uiText("sidebar.title6") : uiText("sidebar.title7")}
              aria-label={displayLocked ? uiText("sidebar.aria_label7") : uiText("sidebar.aria_label8")}
              aria-pressed={displayLocked}
              onClick={onToggleDisplayLock}
            >
              <IconLock locked={displayLocked} />
            </button>
          )}
        </div>
        <div
          ref={giftControlsRef}
          className={`sidebar-gift-controls group relative ${hasGiftControls ? "has-lock" : ""} ${revenueSplit ? "has-revenue" : ""} ${hasGiftControls && giftControlsRevealed ? "is-revealed" : ""}`}
          onMouseEnter={handleGiftControlsMouseEnter}
          onMouseLeave={handleGiftControlsMouseLeave}
          onFocusCapture={revealGiftControls}
          onBlurCapture={handleGiftControlsBlur}
        >
          <button
            type="button"
            className={onToggleGift ? (giftOpen ? btnOn : btnIdle) : btnOff}
            title={uiText("sidebar.title5", { value: giftOpen ? uiText("sidebar.title.value3") : uiText("sidebar.title.value4") })}
            aria-label={giftOpen ? uiText("sidebar.aria_label9") : uiText("sidebar.aria_label10")}
            aria-pressed={giftOpen}
            onClick={handleGiftButtonClick}
            onContextMenu={(event) => { event.preventDefault(); onOpenGiftSettings?.(); }}
            disabled={!onToggleGift}
          >
          <IconRevenue />
          </button>
          {hasGiftControls && <div className="sidebar-gift-actions" role="group" aria-label={revenueSplit ? uiText("sidebar.aria_label11") : uiText("sidebar.aria_label12")}>
          {revenueSplit && (['gift', 'superchat', 'guard'] as const).map((kind, index) => {
            const open = revenueSelection.selected.includes(kind);
            const name = [uiText("sidebar.Sidebar.name"), uiText("sidebar.Sidebar.name2"), uiText("sidebar.Sidebar.name3")][index];
            return <button key={kind} type="button" className={open ? btnOn : btnIdle}
              aria-label={uiText("sidebar.aria_label13", { name: name, value: open ? uiText("sidebar.aria_label.value") : uiText("sidebar.aria_label.value2") })} title={uiText("sidebar.title8", { name: name, value: open ? uiText("sidebar.title.value5") : uiText("sidebar.title.value6") })}
              aria-pressed={open} onClick={() => onToggleRevenueChild?.(kind)} disabled={!onToggleRevenueChild}>
              {kind === 'gift' ? <IconGiftBox /> : kind === 'superchat' ? <IconSuperChat /> : <IconGuard />}
            </button>;
          })}
          {onToggleGiftLock && (
            <button
              type="button"
              className={giftOpen ? `${btnIdle} sidebar-gift-lock ${giftLocked ? "bg-accent-subtle text-accent-text" : ""}` : btnOff}
              title={giftLocked ? uiText("sidebar.title9") : uiText("sidebar.title10")}
              aria-label={giftLocked ? uiText("sidebar.aria_label14") : uiText("sidebar.aria_label15")}
              aria-pressed={giftLocked}
              onClick={giftOpen ? onToggleGiftLock : undefined}
              disabled={!giftOpen}
            >
              <IconLock locked={giftLocked} />
            </button>
          )}
          </div>}
        </div>
        <div className="mt-1 border-t border-line pt-1">
          <ThemeQuickToggle />
        </div>
      </div>
    </aside>
  );
}
