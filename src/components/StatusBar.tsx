import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { UpdateNotification } from "../updates/UpdateNotification";
/**
 * 底栏：直播间概览 · 当前房间事件数 · 版本 · 系统提醒；始终保持单行。
 */
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useConnection } from "../stores/connection";
import { RoomOverviewBar } from "./RoomOverviewBar";
import { SystemReminderBell } from "./SystemReminderBell";

export function StatusBar({onOpenUpdate}:{onOpenUpdate?:()=>void}) {
  useUiLanguage();
  const listCount = useConnection((s) => s.listCount);
  const events = useConnection((s) => s.events);
  const [version, setVersion] = useState("0.1.2");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => {});
  }, []);

  return (
    <footer className="status-bar flex h-9 min-h-9 max-h-9 shrink-0 flex-nowrap items-center gap-x-3 overflow-visible border-t border-line bg-surface px-4 ui-type-meta text-t2">
      <div className="status-bar-overview min-w-0 flex-1 overflow-x-auto overflow-y-hidden" tabIndex={0} role="region" aria-label={uiText("statusBar.aria_label")}>
        <RoomOverviewBar />
      </div>
      <div className="status-bar-actions ml-auto flex shrink-0 items-center gap-x-3 whitespace-nowrap">
        <span className="status-bar-event-count" title={uiText("statusBar.title")}>
          {uiText("statusBar.StatusBar")}<span className="font-mono">{listCount.toLocaleString('zh-CN')}</span>
        </span>
        <span className="status-bar-version shrink-0 whitespace-nowrap font-mono">v{version}</span>
        <SystemReminderBell events={events} placement="top">{onOpenUpdate&&<UpdateNotification onOpen={onOpenUpdate}/>}</SystemReminderBell>
      </div>
    </footer>
  );
}
