import type { ObsThemeSnapshot } from "./nativeObsTheme.ts";
import { resolvePublishedBlivechatRender } from "../compat/blivechat/runtime.tsx";
import { resolvePublishedOpenLiveRender } from "../compat/openlive/runtime.tsx";
import { resolvePublishedLaplaceRender } from "../compat/laplace/runtime.tsx";
export function resolveObsRenders(snapshot: ObsThemeSnapshot) {
  if (!("document" in snapshot)) return {};
  const current = {
    document: snapshot.document,
    context: {
      target: "obs" as const,
      targetId: snapshot.targetId,
      roomId: String(snapshot.roomId ?? ""),
      displayScale: snapshot.displayScale,
    },
  };
  const resolver =
    snapshot.mode === "blivechat"
      ? resolvePublishedBlivechatRender
      : snapshot.mode === "blivechat-open"
        ? resolvePublishedOpenLiveRender
        : resolvePublishedLaplaceRender;
  return {
    main: resolver(current, {
      target: "obs",
      targetId: snapshot.targetId,
      roomId: snapshot.roomId,
      placement: "main",
    }, snapshot.mode === "blivechat" ? snapshot.publicationId : undefined),
    sticky: resolver(current, {
      target: "obs",
      targetId: snapshot.targetId,
      roomId: snapshot.roomId,
      placement: "sticky",
    }, snapshot.mode === "blivechat" ? snapshot.publicationId : undefined),
  };
}
