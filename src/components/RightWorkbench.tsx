import { uiText } from "../i18n/index.ts";
import { PanelRightOpen as LucidePanelRightOpen, PanelRightClose as LucidePanelRightClose } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type Dispatch, type PointerEvent, type RefObject, type SetStateAction, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { useConnection } from "../stores/connection";
import { useGeneralSettings } from "../generalSettings";
import { clampRightWorkbenchWidth, RIGHT_WORKBENCH_MAX_WIDTH, RIGHT_WORKBENCH_MIN_WIDTH, STYLE_PREVIEW_WORKBENCH_MAX_WIDTH, STYLE_PREVIEW_WORKBENCH_MIN_WIDTH, rightWorkbenchPanelDelta, rightWorkbenchToggleLabel, rightWorkbenchWidth } from "./rightWorkbenchState";
import { loadWorkbenchWindowState, saveWorkbenchWindowState, resetWorkbenchWindowState, workbenchCloseTarget, workbenchCloseFallbackTarget, shouldReuseWorkbenchGeometry, workbenchResizeFrame, planWorkbenchWindowResize, waitForWindowGeometry, RIGHT_WORKBENCH_MIN_SCENE_WIDTH, type WindowGeometry } from "./rightWorkbenchWindow";
import { IconSettings, railButtonIdle } from "./railPrimitives";
import { SettingsPanel } from "./SettingsPanel";
import { WorkbenchScroll } from "./WorkbenchSurface";
import type { RevenueWindowSelection, RevenueWindowMode, RevenueWindowKind } from "../windows/giftWindowModel";
import type { SceneSettings } from "./sceneSettings";
import type { SettingsOpenRequest } from "./settingsNavigation";
import type { DiagnosticExportMode } from "./DiagnosticSettings";
import type { DiagnosticExportResult, DiagnosticStatusSnapshot } from "../diagnostics/diagnosticBridge";
import type { IssueMarker } from "../diagnostics/diagnosticTypes";
import type { ArchiveRepositoryContract } from "../archive/archiveTypes";
import type { NativePreviewGeometry } from "./nativePreviewGeometry";

type RightWorkbenchProps = {
  expanded: boolean; onToggle: () => void;
  active: boolean;
  sceneColumnRef: RefObject<HTMLDivElement | null>;
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
  onExportDiagnosticBundle: (mode: DiagnosticExportMode, outputPath: string) => void | Promise<Pick<DiagnosticExportResult, "outputPath"> | void>;
  onDiagnosticExportStateChange: (busy: boolean) => void;
  onOpenDiagnosticDirectory: () => void | Promise<void>;
  onSaveNickname?: (uid: string, nickname: string) => void;
  onDeleteNickname?: (uid: string) => void;
  archiveRepository?: ArchiveRepositoryContract | null;
  onArchiveChanged?: () => void;
  settingsRequest?: SettingsOpenRequest | null;
  stylePreviewActive?: boolean;
  stylePreviewTitle?: string;
  onStylePreviewTarget?: (element: HTMLDivElement | null) => void;
  onStylePreviewHeaderTarget?: (element: HTMLDivElement | null) => void;
  onStylePreviewGeometry?: (geometry: NativePreviewGeometry | null) => void;
};
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
const RIGHT_WORKBENCH_TRANSITION_MS = 240;
function minimumSceneWidth(scene: HTMLElement) {
  const toolbar = scene.querySelector<HTMLElement>("[data-scene-toolbar]");
  if (!toolbar) return RIGHT_WORKBENCH_MIN_SCENE_WIDTH;
  const css = getComputedStyle(toolbar);
  const groups = Array.from(toolbar.children) as HTMLElement[];
  const required = groups.reduce((sum, el) => sum + el.getBoundingClientRect().width, 0)
    + parseFloat(css.paddingLeft) + parseFloat(css.paddingRight)
    + (parseFloat(css.columnGap) || 0) * Math.max(0, groups.length - 1);
  return Math.max(RIGHT_WORKBENCH_MIN_SCENE_WIDTH, Math.ceil(required));
}
export function RightWorkbench({
  expanded,
  onToggle,
  active,
  sceneColumnRef,
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
  revenueSelection, onRevenueWindowMode, onToggleRevenueChild,
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
  settingsRequest,
  stylePreviewActive = false,
  stylePreviewTitle,
  onStylePreviewTarget,
  onStylePreviewHeaderTarget,
  onStylePreviewGeometry,
}: RightWorkbenchProps) {
  const [appWindow] = useState(() => getCurrentWindow());
  const uiScale = useGeneralSettings(state => state.uiScale);
  const [nativeTransition, setNativeTransition] = useState(false);
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const [view, setView] = useState<"home" | "settings">("home");
  const contentRef = useRef<HTMLDivElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const busyRef = useRef(false);
  const [initialWindowState] = useState(loadWorkbenchWindowState);
  const windowState = useRef(initialWindowState);
  const [workbenchWidth, setWorkbenchWidth] = useState(initialWindowState.width);
  const workbenchWidthRef = useRef(initialWindowState.width);
  const resizeSession = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [resizing, setResizing] = useState(false);
  const wasMaximized = useRef(false);
  const wasMinimized = useRef(false);
  const adaptAfterRestore = useRef<() => void>(() => {});
  const handledSettingsRequest = useRef(0);
  const previewOpenedWorkbench = useRef(false);
  const previewRef = useCallback((element: HTMLDivElement | null) => {
    onStylePreviewTarget?.(active && expanded && !closing && stylePreviewActive && view !== "settings" ? element : null);
  }, [active, expanded, closing, stylePreviewActive, view, onStylePreviewTarget]);
  const resizePreviewBy = useCallback((delta: number) => {
    if (!Number.isFinite(delta) || delta === 0) return;
    updateWorkbenchWidth(workbenchWidthRef.current + delta);
  }, [stylePreviewActive]);
  useEffect(() => {
    const available = active && expanded && !closing && stylePreviewActive && view !== "settings";
    onStylePreviewGeometry?.(available ? { width: workbenchWidth, resizeBy: resizePreviewBy } : null);
    return () => onStylePreviewGeometry?.(null);
  }, [active, expanded, closing, stylePreviewActive, view, workbenchWidth, resizePreviewBy, onStylePreviewGeometry]);
  useEffect(() => {
    let disposed = false;
    const check = async () => {
      try {
        const [maximized, minimized] = await Promise.all([appWindow.isMaximized(), appWindow.isMinimized()]);
        if (disposed) return;
        const restored = wasMinimized.current || (wasMaximized.current && !maximized);
        wasMinimized.current = minimized;
        if (minimized) return;
        wasMaximized.current = maximized;
        if (restored) adaptAfterRestore.current();
      } catch (error) {
        console.warn("无法读取工作台窗口状态", error);
      }
    };
    const unlisten = appWindow.onResized(check);
    void check();
    return () => { disposed = true; void unlisten.then(stop => stop()); };
  }, [appWindow]);
  const status = useConnection(s => s.state.status);
  const roomId = useConnection(s => s.state.roomId);
  const anchorName = useConnection(s => s.state.anchorName);
  const live = status === "connected" && Boolean(roomId);
  const label = rightWorkbenchToggleLabel(expanded);

  const maxResizableWorkbenchWidth = () => {
    const allowedMaximum = stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MAX_WIDTH : RIGHT_WORKBENCH_MAX_WIDTH;
    const sceneWidth = sceneColumnRef.current?.getBoundingClientRect().width;
    const panelWidth = asideRef.current?.getBoundingClientRect().width;
    if (!sceneWidth || !panelWidth) return allowedMaximum;
    // 现场已经较窄时不再继续挤压；正常窗口保留至少640px的现场可读宽度。
    const minSceneWidth = Math.min(sceneWidth, 640);
    return Math.max(stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MIN_WIDTH : RIGHT_WORKBENCH_MIN_WIDTH, Math.min(
      allowedMaximum,
      Math.floor(sceneWidth + panelWidth - minSceneWidth),
    ));
  };

  const updateWorkbenchWidth = (width: number) => {
    const nextWidth = clampRightWorkbenchWidth(Math.min(width, maxResizableWorkbenchWidth()), stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MAX_WIDTH : RIGHT_WORKBENCH_MAX_WIDTH, stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MIN_WIDTH : RIGHT_WORKBENCH_MIN_WIDTH);
    workbenchWidthRef.current = nextWidth;
    windowState.current.width = nextWidth;
    setWorkbenchWidth(nextWidth);
    saveWorkbenchWindowState(windowState.current);
  };

  const handleResizePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!expanded || closing || busyRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeSession.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: workbenchWidthRef.current };
    setResizing(true);
  };
  const handleResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const session = resizeSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    // 分隔带在工作台左侧：向左拖动增加工作台宽度，向右拖动减少宽度。
    updateWorkbenchWidth(session.startWidth + session.startX - event.clientX);
  };
  const finishResize = (event: PointerEvent<HTMLDivElement>) => {
    if (resizeSession.current?.pointerId !== event.pointerId) return;
    resizeSession.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setResizing(false);
  };
  const handleResizeKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 32 : 8;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateWorkbenchWidth(workbenchWidthRef.current + step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      updateWorkbenchWidth(workbenchWidthRef.current - step);
    }
  };

  async function geometry(scale: number): Promise<WindowGeometry> {
    const [size, position] = await Promise.all([appWindow.innerSize(), appWindow.outerPosition()]);
    return { width: size.width / scale, height: size.height / scale, x: position.x / scale, y: position.y / scale };
  }
  adaptAfterRestore.current = () => {
    // 已补偿过的展开周期沿用原快照，避免最大化往返重复加宽。
    if (expanded || windowState.current.adjusted) void toggle(true);
  };
  async function toggle(restoring = false) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const scene = sceneColumnRef.current;
    const opening = restoring ? expanded : !expanded;
    let toggled = false;
    const commit = () => {
      windowState.current.expanded = opening;
      saveWorkbenchWindowState(windowState.current);
      if (!restoring) flushSync(onToggle);
      toggled = true;
    };
    const oldFlex = scene?.style.flex ?? "";
    const oldWidth = scene?.style.width ?? "";
    const saved = windowState.current;
    const savedSnapshot = {
      expanded: saved.expanded,
      baseline: saved.baseline ? { ...saved.baseline } : null,
      adjusted: saved.adjusted ? { ...saved.adjusted } : null,
      width: saved.width,
    };
    const panelDelta = rightWorkbenchPanelDelta(workbenchWidthRef.current, stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MAX_WIDTH : RIGHT_WORKBENCH_MAX_WIDTH, stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MIN_WIDTH : RIGHT_WORKBENCH_MIN_WIDTH);
    let before: WindowGeometry | null = null;
    let geometryScale = 1;
    let nativeChanged = false;
    const commitWhileMinimized = () => {
      windowState.current = savedSnapshot;
      setNativeTransition(false);
      commit();
    };
    try {
      if (await appWindow.isMinimized()) {
        wasMinimized.current = true;
        commitWhileMinimized();
        return;
      }
      if (!opening && expanded && !restoring) {
        flushSync(() => setClosing(true));
        const content = contentRef.current;
        if (content) {
          // 读取样式让 CSS transition 生效，等待真实淡出结束再改变宽度。
          // 减少动态效果模式下没有动画，立即进入尺寸处理。
          void getComputedStyle(content).opacity;
          await Promise.allSettled(content.getAnimations().map(animation => animation.finished));
        }
      }
      if (!scene) { commit(); return; }
      const [scale, maximized, monitor, outer] = await Promise.all([
        appWindow.scaleFactor(), appWindow.isMaximized(), currentMonitor(), appWindow.outerSize(),
      ]);
      geometryScale = scale;
      const currentBefore = await geometry(scale);
      before = currentBefore;
      wasMaximized.current = maximized;
      let target: WindowGeometry | null = null;
      if (!maximized && opening && monitor) {
        // 重挂载/最大化往返后仍能认出已经补偿过的窗口。
        const sceneWidth = scene.getBoundingClientRect().width;
        const reuseCurrentGeometry = shouldReuseWorkbenchGeometry(
          saved,
          currentBefore,
          sceneWidth,
          minimumSceneWidth(scene),
        );
        if (reuseCurrentGeometry) {
          // 旧状态可能只有 baseline，没有 adjusted；补齐快照后，后续收起仍可识别。
          saved.adjusted = { ...currentBefore };
        } else if (!workbenchCloseTarget(saved, currentBefore)) {
          saved.baseline = currentBefore;
          saved.adjusted = null;
          const plan = planWorkbenchWindowResize({
            maximized, windowWidth: currentBefore.width, windowX: currentBefore.x,
            sceneWidth: sceneWidth + (expanded ? panelDelta : 0),
            minSceneWidth: minimumSceneWidth(scene), panelDelta,
            contentScale: uiScale,
            workX: monitor.workArea.position.x / scale, workWidth: monitor.workArea.size.width / scale,
            frameWidth: outer.width / scale - currentBefore.width,
          });
          if (Math.abs(plan.width - currentBefore.width) > 1 || Math.abs(plan.x - currentBefore.x) > 1)
            target = { ...currentBefore, width: plan.width, x: plan.x };
        }
      } else if (!maximized && !opening) {
        target = workbenchCloseTarget(saved, currentBefore) ?? workbenchCloseFallbackTarget(saved);
        // 只有本次没有发生自动扩宽时，当前窗口才是新的有效基准。
        if (!target) {
          saved.baseline = { ...currentBefore };
          saved.adjusted = { ...currentBefore };
        }
      }
      // 最大化时关闭只收起内容，不丢弃扩宽记录；还原时再撤回。
      if (!target) { setNativeTransition(false); commit(); return; }
      flushSync(() => setNativeTransition(true));
      const heldSceneWidth = scene.getBoundingClientRect().width + (restoring && opening ? (target.width - currentBefore.width) / uiScale : 0);
      scene.style.width = heldSceneWidth + "px";
      scene.style.flex = "none";
      const animateNativeResize = !restoring && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animateNativeResize) {
        // 展开和收起都固定现场宽度；工作台填满变化中的余宽，避免窗口先跳变、内容再滑入。
        if (asideRef.current) asideRef.current.style.flex = "1 0 64px";
        const started = performance.now();
        let progress = 0;
        while (progress < 1) {
          await frame();
          if (wasMinimized.current) { commitWhileMinimized(); return; }
          progress = Math.min(1, (performance.now() - started) / RIGHT_WORKBENCH_TRANSITION_MS);
          const next = workbenchResizeFrame(currentBefore, target, progress);
          if (target.x !== currentBefore.x || target.y !== currentBefore.y) {
            nativeChanged = true;
            await appWindow.setPosition(new LogicalPosition(next.x, next.y));
          }
          nativeChanged = true;
          await appWindow.setSize(new LogicalSize(next.width, next.height));
        }
      } else {
        nativeChanged = true;
        await appWindow.setPosition(new LogicalPosition(target.x, target.y));
        await appWindow.setSize(new LogicalSize(target.width, target.height));
      }
      if (!await waitForWindowGeometry(() => geometry(geometryScale), target, frame)) {
        throw new Error(uiText("rightWorkbench.RightWorkbench.toggle"));
      }
      // 原生窗口几何稳定后再提交展开状态，让内容进入动画从稳定的工作台宽度开始。
      if (opening) {
        saved.adjusted = await geometry(scale);
        commit();
      } else {
        saved.baseline = await geometry(scale);
        saved.adjusted = null;
        commit();
      }
    } catch (error) {
      if (wasMinimized.current || await appWindow.isMinimized()) {
        wasMinimized.current = true;
        commitWhileMinimized();
        return;
      }
      console.warn("工作台窗口尺寸调整失败，保留当前窗口布局", error);
      if (nativeChanged && before) {
        try {
          await appWindow.setPosition(new LogicalPosition(before.x, before.y));
          await appWindow.setSize(new LogicalSize(before.width, before.height));
          await waitForWindowGeometry(() => geometry(geometryScale), before, frame);
        } catch (restoreError) {
          console.warn("工作台窗口尺寸回滚失败", restoreError);
        }
      }
      if (!toggled) {
        windowState.current = savedSnapshot;
        saveWorkbenchWindowState(savedSnapshot);
        setNativeTransition(false);
      }
    } finally {
      if (scene) { scene.style.flex = oldFlex; scene.style.width = oldWidth; }
      if (asideRef.current) asideRef.current.style.flex = "";
      busyRef.current = false; setBusy(false);
      setClosing(false);
    }
  }

  useEffect(() => {
    if (!active && expanded) {
      // 登录态离开时工作台仍保持挂载，先走正常收起流程，避免主窗口把展开宽度带到欢迎页。
      void toggle();
    }
  }, [active, expanded]);

  const resetWorkbenchState = () => {
    const reset = resetWorkbenchWindowState(windowState.current);
    windowState.current = reset;
    workbenchWidthRef.current = reset.width;
    setWorkbenchWidth(reset.width);
    saveWorkbenchWindowState(reset);
    if (expanded) flushSync(onToggle);
  };

  const handleResetWindowLayout = async () => {
    resetWorkbenchState();
    await onResetWindowLayout();
  };

  const handleResetAllWindowLayout = async () => {
    resetWorkbenchState();
    await onResetAllWindowLayout();
  };

  useEffect(() => {
    if (!settingsRequest || settingsRequest.requestId === handledSettingsRequest.current) return;
    handledSettingsRequest.current = settingsRequest.requestId;
    setView("settings");
    if (!expanded) void toggle();
  }, [settingsRequest?.requestId]);

  useEffect(() => {
    if (!stylePreviewActive || busy || closing) return;
    setView("home");
    if (!expanded) {
      previewOpenedWorkbench.current = true;
      void toggle();
    }
  }, [stylePreviewActive, expanded, busy, closing]);

  useEffect(() => {
    if (stylePreviewActive || !previewOpenedWorkbench.current || !expanded || busy || closing) return;
    previewOpenedWorkbench.current = false;
    void toggle();
  }, [stylePreviewActive, expanded, busy, closing]);

  const handleSettingsClick = async () => {
    if (expanded && view === "settings") {
      await toggle();
      setView("home");
      return;
    }
    setView("settings");
    if (!expanded) await toggle();
  };
  const handleWorkbenchToggle = async () => {
    if (expanded) {
      await toggle();
      setView("home");
      return;
    }
    setView("home");
    await toggle();
  };
  const settingsButtonLabel = expanded && view === "settings" ? uiText("rightWorkbench.RightWorkbench.settingsButtonLabel") : uiText("rightWorkbench.RightWorkbench.settingsButtonLabel2");

  const standardWorkbenchWidth = rightWorkbenchWidth(expanded, workbenchWidth);
  return (
      <aside ref={asideRef} hidden={!active} aria-label={uiText("rightWorkbench.aria_label")}
      className={`right-workbench relative min-h-0 shrink-0 overflow-hidden border-l border-line bg-surface text-t1 ${resizing ? "is-resizing" : ""}`}
      data-native-transition={nativeTransition}
      style={{ width: expanded && stylePreviewActive ? Math.min(STYLE_PREVIEW_WORKBENCH_MAX_WIDTH, Math.max(STYLE_PREVIEW_WORKBENCH_MIN_WIDTH, workbenchWidth)) : standardWorkbenchWidth }}>
      {expanded && !closing && (
        <div
          className="right-workbench-resizer"
          role="separator"
          aria-label={uiText("rightWorkbench.aria_label2")}
          aria-orientation="vertical"
          aria-valuemin={stylePreviewActive ? STYLE_PREVIEW_WORKBENCH_MIN_WIDTH : RIGHT_WORKBENCH_MIN_WIDTH}
          aria-valuemax={maxResizableWorkbenchWidth()}
          aria-valuenow={workbenchWidth}
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={handleResizeKeyDown}
        />
      )}
      <div ref={contentRef} id="right-workbench-content" aria-hidden={!expanded || closing} inert={!expanded || closing}
        className={`right-workbench-content absolute inset-0 ${expanded && !closing ? "is-open" : ""}`}>
        {view === "settings" ? (
          <SettingsPanel
            sceneSettings={sceneSettings}
            setSceneSettings={setSceneSettings}
            displayOpen={displayOpen}
            displayLocked={displayLocked}
            onToggleDisplay={onToggleDisplay}
            onToggleDisplayLock={onToggleDisplayLock}
            onLocateDisplay={onLocateDisplay}
            giftOpen={giftOpen}
            giftLocked={giftLocked}
            onToggleGift={onToggleGift}
            onToggleGiftLock={onToggleGiftLock}
            onLocateGift={onLocateGift}
              revenueSelection={revenueSelection} onRevenueWindowMode={onRevenueWindowMode} onToggleRevenueChild={onToggleRevenueChild}
             onResetWindowLayout={handleResetWindowLayout}
             onResetDisplayWindowLayout={onResetDisplayWindowLayout}
             onResetGiftWindowLayout={onResetGiftWindowLayout}
             onResetAllWindowLayout={handleResetAllWindowLayout}
             diagnosticStatus={diagnosticStatus}
             diagnosticMarkers={diagnosticMarkers}
             onMarkDiagnosticIssue={onMarkDiagnosticIssue}
             onExportDiagnosticBundle={onExportDiagnosticBundle}
             onDiagnosticExportStateChange={onDiagnosticExportStateChange}
             onOpenDiagnosticDirectory={onOpenDiagnosticDirectory}
             onSaveNickname={onSaveNickname}
             onDeleteNickname={onDeleteNickname}
             archiveRepository={archiveRepository}
             onArchiveChanged={onArchiveChanged}
             request={settingsRequest}
          />
        ) : (
          <div data-workbench-surface={stylePreviewActive ? "style-preview" : "home"} className="settings-panel-frame absolute inset-3 flex min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-bg">
            <div className="settings-panel-header relative z-20 flex h-11 shrink-0 items-center border-b border-line px-4 pr-11">
              <h2 className="ui-type-section-title font-medium text-t1">{stylePreviewActive ? stylePreviewTitle ?? uiText("rightWorkbench.RightWorkbench") : uiText("rightWorkbench.RightWorkbench2")}</h2>
              {stylePreviewActive && <div ref={onStylePreviewHeaderTarget} className="native-preview-header-actions ml-auto flex items-center" />}
            </div>
            {stylePreviewActive ? <div ref={previewRef} className="flex min-h-0 flex-1 flex-col overflow-hidden" /> : <WorkbenchScroll>
              <section className="settings-section">
                <header className="settings-section-title">
                  <h3 className="ui-type-section-title font-medium text-t1">{uiText("rightWorkbench.RightWorkbench3")}</h3>
                </header>
                <div className="settings-status-row">
                  <span className={`size-2 shrink-0 rounded-full ${live ? "bg-success-indicator" : "bg-t3"}`} aria-hidden="true" />
                  <span className="ui-type-control text-t1">{live ? uiText("rightWorkbench.RightWorkbench4", { value: anchorName || uiText("rightWorkbench.RightWorkbench.value"), roomId: roomId }) : status === "connecting" || status === "reconnecting" ? uiText("rightWorkbench.RightWorkbench5") : uiText("rightWorkbench.RightWorkbench6")}</span>
                </div>
              </section>
              <section className="settings-section">
                <header className="settings-section-title">
                  <h3 className="ui-type-section-title font-medium text-t1">{uiText("rightWorkbench.RightWorkbench7")}</h3>
                </header>
                <div className="settings-control-row text-t3">
                  <span className="ui-type-control">{uiText("rightWorkbench.RightWorkbench8")}</span>
                </div>
              </section>
            </WorkbenchScroll>}
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-0 right-0 top-0 flex w-16 flex-col items-center py-3">
        <div aria-hidden="true" className={`right-workbench-rail absolute inset-0 bg-surface ${!expanded || closing ? "is-solid" : ""}`} />
        <button type="button" className={`${railButtonIdle} relative pointer-events-auto bg-accent-subtle cursor-pointer`} aria-label={label} title={label}
          aria-expanded={expanded} aria-controls="right-workbench-content" disabled={busy} onClick={() => void handleWorkbenchToggle()}>
          {expanded ? <LucidePanelRightOpen className="size-5" aria-hidden="true" /> : <LucidePanelRightClose className="size-5" aria-hidden="true" />}
        </button>
        <div className="right-workbench-settings relative mt-auto">
          <button type="button" aria-label={settingsButtonLabel} title={settingsButtonLabel} aria-pressed={expanded && view === "settings"}
            onClick={() => void handleSettingsClick()}
            className={`${railButtonIdle} pointer-events-auto ${view === "settings" ? "bg-accent-subtle text-accent-text" : "bg-accent-subtle"}`}>
            <IconSettings /><span className="sr-only">{uiText("common.settings")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
