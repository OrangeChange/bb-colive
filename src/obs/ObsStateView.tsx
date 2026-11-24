import { sameObsValue, useObsEventTransitions } from "./useObsEventTransitions.ts";
import { useEffect, useMemo, useRef, useState } from "react";
import { compatibleExternalHtmlOf } from "../compat/CompatibleEventRenderer.tsx";
import type { ObsThemeSnapshot } from "./nativeObsTheme.ts";
import type { ObsWireState } from "./obsProtocol.ts";
import { ObsOutputView } from "./ObsOutputView.tsx";
import { resolveObsRenders } from "./obsRenders.ts";
import { CompatibleOutputSchemeContext } from "../themes/compatPreviewScheme.ts";
export function ObsStateView({
  state,
  scheme,
  sceneName,
  onRenderStatus,
}: {
  state: ObsWireState;
  scheme?: "light" | "dark";
  sceneName?: string;
  onRenderStatus?: (message: { type: string; message?: string }) => void;
}) {
  const snapshotRef = useRef(state.snapshot);
  if (!sameObsValue(snapshotRef.current, state.snapshot)) snapshotRef.current = state.snapshot;
  const sourceSnapshot = snapshotRef.current;
  const snapshot = useMemo(() => sourceSnapshot.mode === "laplace" && sceneName !== undefined
    ? { ...sourceSnapshot, document: { ...sourceSnapshot.document, settings: { ...sourceSnapshot.document.settings, sceneName } } }
    : sourceSnapshot, [sourceSnapshot, sceneName]);
  const [committed, setCommitted] = useState(snapshot);
  const [candidate, setCandidate] = useState<ObsThemeSnapshot>();
  const failedCandidate = useRef<string | undefined>(undefined);
  const incomingRenders = useMemo(
    () => resolveObsRenders(snapshot),
    [snapshot],
  );
  const renders = useMemo(() => resolveObsRenders(committed), [committed]);
  const pending = useMemo(
    () =>
      candidate
        ? compatibleExternalHtmlOf(resolveObsRenders(candidate).main)
        : undefined,
    [candidate],
  );
  useEffect(() => {
    const next = compatibleExternalHtmlOf(incomingRenders.main);
    const active = compatibleExternalHtmlOf(resolveObsRenders(committed).main);
    if (next && next.instanceId !== active?.instanceId) {
      if (next.instanceId !== failedCandidate.current) setCandidate(snapshot);
    } else {
      setCommitted(snapshot);
      setCandidate(undefined);
    }
  }, [snapshot]);
  const [clock, setClock] = useState(Date.now);
  useEffect(() => {
    if (state.sampleAt !== undefined) return;
    const now = Date.now();
    const due = [
      ...state.sticky.map((card) => card.expiresAt),
      ...(state.preferences.eventExpiry.enabled
        ? state.events.map(
            (event) =>
              Number((event as { receivedAt?: number }).receivedAt ?? now) +
              state.preferences.eventExpiry.seconds * 1000,
          )
        : []),
    ].filter((at) => at > now);
    if (!due.length) return;
    const timer = setTimeout(
      () => setClock(Date.now()),
      Math.max(1, Math.min(...due) - now),
    );
    return () => clearTimeout(timer);
  }, [state, clock]);
  const now = state.sampleAt ?? Date.now();
  const events = state.events;
  const transitioning = useObsEventTransitions(events, state.preferences, state.immediateRemovalKeys, state.animatedRemovalKeys);
  const sticky = useMemo(
    () => state.sticky.filter((card) => card.expiresAt > now),
    [state.sticky, clock],
  );
  return (
    <CompatibleOutputSchemeContext.Provider value={scheme ?? state.scheme}>
      <div
        className={`obs-output-root ${(scheme ?? state.scheme) === "dark" ? "dark" : ""}`}
      >
        <ObsOutputView
          roomGuardProfile={state.connection.roomGuardProfile}
          events={transitioning.events}
          removingEventIds={transitioning.removingEventIds}
          userNicknames={state.userNicknames ?? {}}
          snapshot={committed}
          stickyCards={sticky}
          stickyEvents={state.preferences.stickyEvents}
          softwareDisplay={state.preferences.display}
          scrollDirection={state.preferences.scrollDirection}
          contentAlignment={state.preferences.contentAlignment}
          compatibleMainRender={renders.main}
          compatibleStickyRender={renders.sticky}
          pendingExternalHtml={pending}
          onCandidateReady={() => {
            failedCandidate.current = undefined;
            if (candidate) setCommitted(candidate);
            setCandidate(undefined);
            onRenderStatus?.({ type: "ready" });
          }}
          onActiveFailure={(message) =>
            onRenderStatus?.({ type: "failure", message })
          }
          onCandidateFailure={(message) => {
            failedCandidate.current = pending?.instanceId;
            setCandidate(undefined);
            onRenderStatus?.({ type: "failure", message });
          }}
        />
      </div>
    </CompatibleOutputSchemeContext.Provider>
  );
}
