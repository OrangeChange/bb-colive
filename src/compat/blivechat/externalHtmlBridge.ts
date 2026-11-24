export interface BlivechatExternalConfig {
  showGiftName: boolean;
  mergeSimilarDanmaku: boolean;
  mergeGift: boolean;
  maxNumber: number;
}

export interface BlivechatExternalMessage { id: string; type: number; [key: string]: unknown }
type MessageTarget = { postMessage(message: unknown, targetOrigin?: string): void };

export function normalizeBlivechatExternalHtmlUrl(input: string): string {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error("请输入完整的 HTTP(S) 地址"); }
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("仅支持不含用户名和密码的 HTTP(S) 地址");
  return url.href;
}

export function createBlivechatExternalHtmlBridge(input: {
  url: string;
  childWindow: MessageTarget;
  config: BlivechatExternalConfig;
  snapshot: readonly BlivechatExternalMessage[];
  blcVersion?: string;
}) {
  const url = normalizeBlivechatExternalHtmlUrl(input.url);
  let connected = false;
  let config = { ...input.config };
  let snapshot = input.snapshot.map(item => structuredClone(item));
  const send = (type: string, data: unknown) => input.childWindow.postMessage({ type, data }, new URL(url).origin);
  return {
    get connected() { return connected; },
    receive(event: { source: unknown; data: unknown }): boolean {
      if (event.source !== input.childWindow || !event.data || typeof event.data !== "object" || (event.data as { type?: unknown }).type !== "blcTemplateConnect") return false;
      if (connected) return true;
      connected = true;
      send("blcInit", { blcVersion: input.blcVersion ?? "1.10.4", sdkVersion: "1.0.1", config: { ...config } });
      snapshot.forEach(message => send("blcAddMsg", structuredClone(message)));
      return true;
    },
    add(message: BlivechatExternalMessage) { if (connected) send("blcAddMsg", structuredClone(message)); },
    update(id: string, newValuesObj: Record<string, unknown>) { if (connected) send("blcUpdateMsg", { id, newValuesObj: structuredClone(newValuesObj) }); },
    remove(ids: readonly string[]) { if (connected) send("blcDelMsgs", { ids: [...ids] }); },
    injectCss(css: string) { if (connected && css) send("blcInjectCss", { injectCssUrls: [], injectCss: css }); },
    updateConfig(next: BlivechatExternalConfig) { config = { ...next }; },
    replaceSnapshot(messages: readonly BlivechatExternalMessage[]) { snapshot = messages.map(item => structuredClone(item)); },
    disconnect() { connected = false; },
  };
}

export function createBlivechatExternalHtmlFlow(input: {
  save(document: { themeId: string }): Promise<unknown>;
  apply(document: { themeId: string }): Promise<unknown>;
}) {
  let previewUrl = "";
  let handshake = false;
  return {
    beginPreview(url: string) { previewUrl = normalizeBlivechatExternalHtmlUrl(url); handshake = false; return previewUrl; },
    markHandshakeSucceeded() { if (!previewUrl) throw new Error("请先预览外部 HTML"); handshake = true; },
    async saveAndApply<T extends { themeId: string }>(document: T) {
      if (!handshake) throw new Error("外部 HTML 尚未完成 SDK 握手");
      await input.save(document);
      await input.apply(document);
    },
  };
}

export function blivechatExternalHtmlUrlOf(document: { metadata?: { externalHtml?: unknown } }): string | null {
  const value = document.metadata?.externalHtml;
  if (!value || typeof value !== "object") return null;
  const marker = value as { url?: unknown; sdk?: unknown; verified?: unknown };
  if (marker.sdk !== "blivechat-1.0.1" || marker.verified !== true || typeof marker.url !== "string") return null;
  try { return normalizeBlivechatExternalHtmlUrl(marker.url); } catch { return null; }
}

export function createBlivechatExternalSnapshotSync(port: {
  add(message: BlivechatExternalMessage): void;
  update(id: string, values: Record<string, unknown>): void;
  remove(ids: readonly string[]): void;
  replaceSnapshot(messages: readonly BlivechatExternalMessage[]): void;
}) {
  let connected = false;
  let current = new Map<string, BlivechatExternalMessage>();
  return {
    setConnected(value: boolean) { connected = value; },
    snapshot: () => [...current.values()].map(item => structuredClone(item)),
    replace(messages: readonly BlivechatExternalMessage[]) {
      const next = new Map(messages.map(item => [item.id, structuredClone(item)]));
      port.replaceSnapshot([...next.values()]);
      if (connected) {
        for (const [id, value] of next) {
          const previous = current.get(id);
          if (!previous) port.add(value);
          else if (JSON.stringify(previous) !== JSON.stringify(value)) port.update(id, value);
        }
        const removed = [...current.keys()].filter(id => !next.has(id));
        if (removed.length) port.remove(removed);
      }
      current = next;
    },
  };
}

export const blivechatExternalTargetKey = (target: "live" | "windows" | "obs", targetId: string): string => `${target}:${targetId}`;


