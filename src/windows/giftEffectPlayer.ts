import { uiText } from "../i18n/index.ts";
import Vap from "video-animation-player";
import type { GiftEffectResource } from "../protocol/giftEffects";
import { getDiagnosticContext } from "../diagnostics/diagnosticLogger.ts";
import { recordFeatureDiagnostic } from "../diagnostics/featureDiagnostics.ts";

export type GiftEffectPlayerEvent = "ended" | "error";

// 统一阶段名：matched、resource-missing、download-failure、player-init-failure、play-start、play-complete、play-cancel。

export interface GiftEffectPlayer {
  play(resource: GiftEffectResource, container: HTMLElement, eventId?: string): void;
  on(event: GiftEffectPlayerEvent, listener: () => void): () => void;
  destroy(): void;
}

type VapPlayer = {
  once(event: "ended", listener: () => void): VapPlayer;
  destroy(): void;
};

export function createTerminalOutcomeGate(): { readonly outcome: string | null; tryFinish(outcome: string): boolean } {
  let terminal: string | null = null;
  return { get outcome() { return terminal; }, tryFinish(outcome) { if (terminal !== null) return false; terminal = outcome; return true; } };
}

export function createGiftEffectTerminalCallbacks(input: {
  gate: ReturnType<typeof createTerminalOutcomeGate>;
  isCurrent: (token: number) => boolean;
  recordComplete: (outcome: string) => void;
  notify: (event: GiftEffectPlayerEvent, token: number) => void;
  token: number;
}) {
  const finish = (outcome: string, event: GiftEffectPlayerEvent) => {
    if (!input.isCurrent(input.token) || !input.gate.tryFinish(outcome)) return;
    input.recordComplete(outcome);
    input.notify(event, input.token);
  };
  return {
    onError: () => finish("failure", "error"),
    onEnded: () => finish("success", "ended"),
  };
}

/** 对官方 VAP 播放器做最小适配：只暴露队列需要的播放、结束、失败和销毁。 */
export function createGiftEffectPlayer(): GiftEffectPlayer {
  let player: VapPlayer | null = null;
  let playerHost: HTMLDivElement | null = null;
  let generation = 0;
  let activeEventId: string | undefined;
  let configurationRequest: AbortController | null = null;
  const listeners = new Map<GiftEffectPlayerEvent, Set<() => void>>([
    ["ended", new Set()],
    ["error", new Set()],
  ]);

  const notify = (event: GiftEffectPlayerEvent, token: number) => {
    if (token !== generation) return;
    listeners.get(event)?.forEach((listener) => listener());
  };

  const destroyCurrent = () => {
    generation += 1;
    configurationRequest?.abort();
    configurationRequest = null;
    player?.destroy();
    player = null;
    playerHost?.remove();
    playerHost = null;
  };

  const record = (action: string, outcome: string, eventId = activeEventId) => {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    try { getDiagnosticContext().record({ subsystem: "gift-effect", action, outcome, eventId }); } catch {}
    recordFeatureDiagnostic({
      featureId: "gift-effects",
      stage: outcome === "failure" ? "failure" : outcome === "cancelled" ? "cancel" : action === "matched" ? "request" : "success",
      action,
      outcome,
      eventId,
    });
  };

  return {
    play(resource, container, eventId) {
      if (player || playerHost) record("play-cancel", "cancelled");
      activeEventId = eventId;
      const terminal = createTerminalOutcomeGate();
      record("matched", "success");
      if (!resource.webMp4 && !resource.webMp4Json) {
        record("resource-missing", "failure");
        activeEventId = undefined;
        return;
      }
      destroyCurrent();
      const host = container.ownerDocument.createElement("div");
      host.className = "gift-effect-player-host";
      container.replaceChildren(host);
      playerHost = host;
      const token = generation;
      const terminalCallbacks = createGiftEffectTerminalCallbacks({
        gate: terminal,
        isCurrent: (callbackToken) => callbackToken === generation,
        recordComplete: (outcome) => {
          record("play-complete", outcome);
          activeEventId = undefined;
        },
        notify,
        token,
      });
      const start = (config: Record<string, unknown>) => {
        if (token !== generation) return;
        const info = config.info as {w?: number; h?: number} | undefined;
        container.style.setProperty("--gift-effect-aspect-ratio", (resource.kind === "guard" || resource.username !== undefined) && info?.w && info.h ? String(info.w / info.h) : "0.75");
        configurationRequest = null;
        try {
        player = Vap({
          ...(resource.username === undefined ? {} : {"live.guard.open.animation.user.name": resource.username}),
          container: host,
          src: resource.webMp4,
          config,
          loop: false,
          mute: true,
          precache: false,
          accurate: true,
          onLoadError: () => { if (token !== generation) return; record("download-failure", "failure"); terminalCallbacks.onError(); },
        });
        record("play-start", "success");
        player.once("ended", terminalCallbacks.onEnded);
      } catch {
        record("player-init-failure", "failure");
        player = null;
        playerHost?.remove();
        playerHost = null;
        activeEventId = undefined;
        terminalCallbacks.onError();
      }
      };
      configurationRequest = new AbortController();
      void fetch(resource.webMp4Json, { signal: configurationRequest.signal })
        .then(response => {
          if (!response.ok) throw new Error(uiText("giftEffectPlayer.createGiftEffectPlayer.play"));
          return response.json();
        })
        .then(start, () => {
          if (token !== generation) return;
          configurationRequest = null;
          record("download-failure", "failure");
          terminalCallbacks.onError();
        });
    },
    on(event, listener) {
      const eventListeners = listeners.get(event);
      eventListeners?.add(listener);
      return () => eventListeners?.delete(listener);
    },
    destroy() {
      if (player || playerHost) record("play-cancel", "cancelled");
      destroyCurrent();
      activeEventId = undefined;
    },
  };
}
