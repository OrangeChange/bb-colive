import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { Minus as LucideMinus, Square as LucideSquare, Copy as LucideCopy, X as LucideX } from "lucide-react";
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useConnection } from "../stores/connection";
import { useGeneralSettings } from "../generalSettings";
import { getWindowTitle } from "../windowTitle";
import { CoLiveLogo } from './CoLiveLogo';
import { resolveCoLiveState } from '../coliveLogo';

function IconMinimize() {
  return (
    <LucideMinus className="size-4" />
  );
}

function IconMaximize() {
  return (
    <LucideSquare className="size-4" />
  );
}

function IconRestore() {
  return (
    <LucideCopy className="size-4" />
  );
}

function IconClose() {
  return (
    <LucideX className="size-4" />
  );
}

const windowButton =
  "flex h-9 w-11 items-center justify-center text-t2 transition-colors hover:bg-raised hover:text-t1 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-ring";

export function TitleBar() {
  const uiLanguage = useUiLanguage();
  const [appWindow] = useState(() => getCurrentWindow());
  const [maximized, setMaximized] = useState(false);
  const windowState = useConnection((s) => s.state);
  const minimizeBehavior = useGeneralSettings((state) => state.minimizeBehavior);

  const { status, anchorName, roomId, liveStatus } = windowState;

  useEffect(() => {
    void appWindow.setTitle(getWindowTitle({ status, anchorName, roomId, liveStatus })).catch(() => {});
  }, [appWindow, status, anchorName, roomId, liveStatus, uiLanguage]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    const syncMaximized = async () => {
      try {
        const next = await appWindow.isMaximized();
        if (!disposed) setMaximized(next);
      } catch {
        // 在普通浏览器预览而非 Tauri 窗口中时，窗口 API 不可用。
      }
    };

    void syncMaximized();
    void appWindow
      .onResized(() => {
        void syncMaximized();
      })
      .then((stop) => {
        if (disposed) stop();
        else unlisten = stop;
      })
      .catch(() => {
        // Vite 独立预览没有 Tauri 事件总线，不影响界面渲染。
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appWindow]);

  const minimize = () => {
    const action = minimizeBehavior === "tray" ? appWindow.hide() : appWindow.minimize();
    void action.catch(() => {});
  };

  const toggleMaximize = () => {
    void appWindow.toggleMaximize().then(() => {
      void appWindow.isMaximized().then(setMaximized).catch(() => {});
    }).catch(() => {});
  };

  const close = () => {
    void appWindow.close().catch(() => {});
  };

  return (
    <header className="flex h-9 shrink-0 items-center bg-surface text-t1">
      <div
        data-tauri-drag-region
        onDoubleClick={toggleMaximize}
        className="flex h-full min-w-0 flex-1 cursor-default select-none items-center gap-1.5 px-3"
      >
        <CoLiveLogo state={resolveCoLiveState(status, liveStatus)} className="titlebar-logo pointer-events-none" />
        <span className="truncate ui-type-control font-medium text-t1">BB CoLive</span>
      </div>
      <div className="flex h-full shrink-0 items-center" aria-label={uiText("titleBar.aria_label")}>
        <Button variant="ghost" type="button" className={windowButton} aria-label={uiText("titleBar.aria_label2")} title={uiText("titleBar.title")} onClick={minimize}>
          <IconMinimize />
        </Button>
        <Button variant="ghost"
          type="button"
          className={windowButton}
          aria-label={maximized ? uiText("titleBar.aria_label3") : uiText("titleBar.aria_label4")}
          title={maximized ? uiText("titleBar.title2") : uiText("titleBar.title3")}
          onClick={toggleMaximize}
        >
          {maximized ? <IconRestore /> : <IconMaximize />}
        </Button>
        <Button variant="ghost"
          type="button"
          className={`${windowButton} hover:bg-danger-solid hover:text-danger-fg focus-visible:ring-danger`}
          aria-label={uiText("common.closeWindow")}
          title={uiText("common.close")}
          onClick={close}
        >
          <IconClose />
        </Button>
      </div>
    </header>
  );
}
