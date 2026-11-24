import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DanmakuEvent } from "../../protocol/types.ts";
import type { CompatibleExternalHtmlDescriptor } from "../CompatibleEventRenderer.tsx";
import { stableCompatibleEventId } from "../compatibleLiveBridge.ts";
import { projectBlivechatEvent } from "./projection.ts";
import { createBlivechatExternalHtmlBridge, createBlivechatExternalSnapshotSync, type BlivechatExternalMessage } from "./externalHtmlBridge.ts";

export function createBlivechatExternalLoadCycle(host: { connected: boolean; disconnect(): void; receive(event: { source: unknown; data: unknown }): boolean }) {
  let connectedBeforeLoad = false;
  return {
    connect(event: { source: unknown; data: unknown }) {
      if (host.connected && !connectedBeforeLoad) {
        if (!host.receive(event)) return false;
        host.disconnect();
      }
      const accepted = host.receive(event);
      if (accepted) connectedBeforeLoad = true;
      return accepted;
    },
    load() {
      if (connectedBeforeLoad) { connectedBeforeLoad = false; return false; }
      if (host.connected) host.disconnect();
      return true;
    },
  };
}

export function projectBlivechatExternalSnapshot(events: readonly DanmakuEvent[]): BlivechatExternalMessage[] {
  const messages: BlivechatExternalMessage[] = [];
  events.forEach((event, index) => {
    const projected = projectBlivechatEvent(event, { roomId: event.roomId, generation: 0 }, index, event.ts);
    if (!projected) return;
    const medal = event.user?.medal?.isCurrentRoom === false ? undefined : event.user?.medal;
    const common = { id: stableCompatibleEventId(event), avatarUrl: projected.avatarUrl, time: projected.time, authorName: projected.authorName, authorNamePronunciation: "", authorType: projected.authorType, privilegeType: projected.privilegeType, uid: event.user?.uid ?? "", medalLevel: medal?.level ?? 0, medalName: medal?.name ?? "" };
    if (projected.kind === "text") messages.push({ ...common, type: 0, content: projected.contentParts?.map(part => part.text).join("") ?? "", contentParts: projected.contentParts?.map(part => part.type === "text" ? { type: 0, text: part.text } : { type: 1, text: part.text, url: part.url, width: part.width, height: part.height }), translation: "" });
    else if (projected.kind === "gift") messages.push({ ...common, type: 1, price: projected.price ?? 0, giftName: projected.giftName ?? "", num: projected.giftCount ?? 1, totalFreeCoin: event.gift?.coinType === "gold" ? 0 : event.gift?.total ?? 0, giftId: event.gift?.id ?? 0, giftIconUrl: event.gift?.webp ?? event.gift?.gif ?? event.gift?.icon ?? "" });
    else if (projected.kind === "membership") messages.push({ ...common, type: 2, title: projected.membershipTitle ?? "", num: projected.membershipCount ?? 1, unit: projected.membershipUnit ?? "月", price: projected.membershipPrice ?? 0 });
    else messages.push({ ...common, type: 3, price: projected.price ?? 0, content: projected.content ?? "", ...(projected.translation ? { translation: projected.translation } : {}) });
  });
  return messages;
}

export function BlivechatExternalHtmlSurface({ descriptor, events, fallback, holdUntilCommit = false, onReady, onFailure }: { descriptor: CompatibleExternalHtmlDescriptor; events: readonly DanmakuEvent[]; fallback: ReactNode; holdUntilCommit?: boolean; onReady?: () => void; onFailure?: (message: string) => void }) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const messages = useMemo(() => projectBlivechatExternalSnapshot(events), [events]);
  const syncRef = useRef<ReturnType<typeof createBlivechatExternalSnapshotSync> | null>(null);
  const hostRef = useRef<ReturnType<typeof createBlivechatExternalHtmlBridge> | null>(null);
  const timerRef = useRef<number | null>(null);
  const callbacksRef = useRef({ holdUntilCommit, onReady, onFailure });
  callbacksRef.current = { holdUntilCommit, onReady, onFailure };
  const loadCycleRef = useRef<ReturnType<typeof createBlivechatExternalLoadCycle> | null>(null);
  useEffect(() => {
    const childWindow = frameRef.current?.contentWindow;
    if (!childWindow) return;
    setConnected(false); setError("");
    const host = createBlivechatExternalHtmlBridge({ url: descriptor.url, childWindow, config: descriptor.config, snapshot: messages });
    hostRef.current = host;
    const loadCycle = createBlivechatExternalLoadCycle(host); loadCycleRef.current = loadCycle;
    const sync = createBlivechatExternalSnapshotSync(host); sync.replace(messages); syncRef.current = sync;
    const receive = (event: MessageEvent) => {
      if (!loadCycle.connect(event)) return;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      sync.setConnected(true); setConnected(!callbacksRef.current.holdUntilCommit); setError(""); host.injectCss(descriptor.css); callbacksRef.current.onReady?.();
    };
    const initialFailure = "外部 HTML 加载超时，原输出已保留。请检查页面后重试。";
    timerRef.current = window.setTimeout(() => { if (!host.connected) { setError(initialFailure); callbacksRef.current.onFailure?.(initialFailure); } }, 10_000);
    window.addEventListener("message", receive);
    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); window.removeEventListener("message", receive); host.disconnect(); hostRef.current = null; syncRef.current = null; loadCycleRef.current = null; };
  }, [descriptor.instanceId, descriptor.url, descriptor.target, descriptor.targetId]);
  useEffect(() => { syncRef.current?.replace(messages); }, [messages]);
  useEffect(() => { if(hostRef.current?.connected)hostRef.current.injectCss(descriptor.css); }, [descriptor.css]);
  useEffect(() => { if (!holdUntilCommit && hostRef.current?.connected) setConnected(true); }, [holdUntilCommit]);
  return <div className="blivechat-external-html-host" data-target={descriptor.target} data-target-id={descriptor.targetId}>
    {!connected && fallback}
    <iframe ref={frameRef} title={`blivechat-${descriptor.target}-${descriptor.targetId}`} src={descriptor.url} sandbox="allow-scripts allow-same-origin" onLoad={() => {
      if (!loadCycleRef.current?.load()) return;
      syncRef.current?.setConnected(false); setConnected(false); setError("");
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => { if (!hostRef.current?.connected) { const message = "外部 HTML 重连失败，已保留原输出"; setError(message); callbacksRef.current.onFailure?.(message); } }, 10_000);
    }} style={{ display: connected ? "block" : "none", width: "100%", height: "100%", border: 0, background: "transparent" }} />
    {error && <div role="status" className="px-3 py-2 text-sm text-red-400">{error}</div>}
  </div>;
}
