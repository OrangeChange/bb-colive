import { ObsOutputView } from "./ObsOutputView.tsx";
import { useEffect, useMemo, useState } from "react";
import type { DanmakuEvent } from "../protocol/types.ts";
import {
  subscribeObsThemeSnapshot,
  type ObsThemeSnapshot,
} from "./nativeObsTheme.ts";
import { selectStickyEvents } from "../windows/stickyEventModel.ts";
import { useCompatibleEventRender } from "../compat/CompatibleEventRenderer.tsx";
import { BlivechatExternalHtmlTarget } from "../compat/blivechat/BlivechatExternalHtmlTarget.tsx";
import { blivechatThemeRuntime } from "../compat/blivechat/runtime.tsx";
import { useGeneralSettings } from "../generalSettings.ts";

type NativeObsSnapshotSubscriber = (
  targetId: string,
  listener: (snapshot: ObsThemeSnapshot) => void,
) => Promise<() => void>;

export function subscribeNativeObsRendererTarget(
  targetId: string,
  listener: (snapshot: ObsThemeSnapshot) => void,
  subscribe: NativeObsSnapshotSubscriber = subscribeObsThemeSnapshot,
): () => void {
  let active = true;
  let dispose: (() => void) | undefined;
  void subscribe(targetId, (snapshot) => {
    if (active && snapshot.targetId === targetId) listener(snapshot);
  }).then((unlisten) => {
    if (!active) {
      unlisten();
      return;
    }
    dispose = unlisten;
  });
  return () => {
    active = false;
    dispose?.();
  };
}

export function createNativeObsRendererTargetController(
  listener: (snapshot: ObsThemeSnapshot | undefined) => void,
  subscribe: NativeObsSnapshotSubscriber = subscribeObsThemeSnapshot,
) {
  let stop: (() => void) | undefined;
  return {
    select(targetId: string | undefined) {
      stop?.();
      stop = undefined;
      listener(undefined);
      if (targetId)
        stop = subscribeNativeObsRendererTarget(targetId, listener, subscribe);
    },
    dispose() {
      stop?.();
      stop = undefined;
    },
  };
}

export function NativeObsRenderer({
  events,
  targetId = "default",
}: {
  events: DanmakuEvent[];
  targetId?: string;
}) {
  const [loadedSnapshot, setLoadedSnapshot] = useState<ObsThemeSnapshot>();
  const targetController = useMemo(
    () => createNativeObsRendererTargetController(setLoadedSnapshot),
    [],
  );
  useEffect(() => {
    targetController.select(targetId);
  }, [targetController, targetId]);
  useEffect(() => () => targetController.dispose(), [targetController]);
  const snapshot =
    loadedSnapshot?.targetId === targetId ? loadedSnapshot : undefined;
  const pendingExternalHtml = blivechatThemeRuntime.resolvePendingExternal({
    target: "obs",
    targetId,
    roomId: snapshot?.roomId ?? null,
    placement: "main",
  });
  if (!snapshot && !pendingExternalHtml)
    return (
      <div className="obs-native-root" style={{ background: "transparent" }} />
    );
  if (!snapshot)
    return (
      <div className="obs-native-root" style={{ background: "transparent" }}>
        <BlivechatExternalHtmlTarget
          candidate={pendingExternalHtml}
          events={events}
          fallback={null}
          onCandidateReady={() => {
            void blivechatThemeRuntime.markPendingExternalReady(targetId);
          }}
        />
      </div>
    );
  return (
    <NativeObsContent events={events} targetId={targetId} snapshot={snapshot} />
  );
}

export function NativeObsContent({
  events,
  targetId,
  snapshot,
}: {
  events: DanmakuEvent[];
  targetId: string;
  snapshot: ObsThemeSnapshot;
}) {
  const stickyEvents = useGeneralSettings((state) => state.stickyEvents);
  const contentAlignment = useGeneralSettings(state => state.liveContentAlignment);
  const scrollDirection = useGeneralSettings(
    (state) => state.liveScrollDirection,
  );
  const softwareDisplay = useGeneralSettings(
    (state) => state.eventDisplayPreferences,
  );
  const main = useCompatibleEventRender({
    target: "obs",
    targetId,
    roomId: snapshot.roomId,
    placement: "main",
  });
  const sticky = useCompatibleEventRender({
    target: "obs",
    targetId,
    roomId: snapshot.roomId,
    placement: "sticky",
  });
  return (
    <ObsOutputView
      events={events}
      snapshot={snapshot}
      stickyCards={selectStickyEvents(
        events,
        { ...stickyEvents, enabled: stickyEvents.obsEnabled },
        Date.now(),
      )}
      stickyEvents={stickyEvents}
      scrollDirection={scrollDirection}
      contentAlignment={contentAlignment}
      softwareDisplay={softwareDisplay}
      compatibleMainRender={main}
      compatibleStickyRender={sticky}
      pendingExternalHtml={blivechatThemeRuntime.resolvePendingExternal({
        target: "obs",
        targetId,
        roomId: snapshot.roomId,
        placement: "main",
      })}
      onCandidateReady={() => {
        void blivechatThemeRuntime.markPendingExternalReady(targetId);
      }}
    />
  );
}
