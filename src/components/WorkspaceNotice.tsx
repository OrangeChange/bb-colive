import { uiText } from "../i18n/index.ts";
import { useEffect, useRef, useState } from "react";

export function notifyWorkspace(message: string) {
  window.dispatchEvent(new CustomEvent("style-workspace-notice", { detail: message }));
}

export function WorkspaceNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const [exiting, setExiting] = useState(false);
  const remaining = useRef(0);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  const failed = /失败|无法|错误|不存在|请先|未更新|未导入|已被|不可|不能/.test(message);
  useEffect(() => { remaining.current = failed ? 6000 : 2500; }, [message, failed]);
  useEffect(() => {
    if (!message || paused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => setExiting(true), remaining.current);
    return () => { window.clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [message, paused, failed]);
  useEffect(() => {
    if (!exiting) return;
    const timer = window.setTimeout(() => dismiss.current(), 160);
    return () => window.clearTimeout(timer);
  }, [exiting]);
  if (!message) return null;
  return <div className={`theme-workspace-notice${failed ? " is-error" : ""}${exiting ? " is-exiting" : ""}`} role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
    <span>{message}</span><button type="button" aria-label={uiText("workspaceNotice.aria_label")} onClick={onDismiss}>×</button>
  </div>;
}
