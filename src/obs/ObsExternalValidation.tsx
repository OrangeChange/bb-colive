import { useEffect, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import type { ThemeRenderContext } from "../themes/themeModeAdapters.ts";
import { resolvePublishedBlivechatRender } from "../compat/blivechat/runtime.tsx";
import { compatibleExternalHtmlOf } from "../compat/CompatibleEventRenderer.tsx";
import { BlivechatExternalHtmlSurface } from "../compat/blivechat/BlivechatExternalHtmlSurface.tsx";
interface Candidate {
  requestId: string;
  document: ThemeDocument;
  context: ThemeRenderContext;
}
export function ObsExternalValidation() {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  useEffect(() => {
    let active = true;
    const stops: (() => void)[] = [];
    void listen<Candidate>(
      "compatible-theme-external-prepare:blivechat",
      (event) => {
        if (event.payload.context.target !== "live")
          setCandidates((current) => [
            ...current.filter(
              (c) => c.context.targetId !== event.payload.context.targetId,
            ),
            event.payload,
          ]);
      },
    ).then((stop) => {
      if (active) stops.push(stop);
      else stop();
    });
    void listen<string>("compatible-theme-external-cancel:blivechat", (event) =>
      setCandidates((current) =>
        current.filter((c) => c.requestId !== event.payload),
      ),
    ).then((stop) => {
      if (active) stops.push(stop);
      else stop();
    });
    return () => {
      active = false;
      stops.forEach((stop) => stop());
    };
  }, []);
  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        left: -10000,
        top: 0,
        width: 400,
        height: 720,
        pointerEvents: "none",
        opacity: 0,
      }}
    >
      {candidates.map((candidate) => {
        const render = resolvePublishedBlivechatRender(candidate, {
          target: candidate.context.target,
          targetId: candidate.context.targetId,
          roomId: Number(candidate.context.roomId),
          placement: "main",
        });
        const descriptor = compatibleExternalHtmlOf(render);
        if (!descriptor) return null;
        return (
          <BlivechatExternalHtmlSurface
            key={candidate.requestId}
            descriptor={{ ...descriptor, instanceId: candidate.requestId }}
            events={[]}
            fallback={null}
            holdUntilCommit
            onReady={() => {
              void emit(
                "compatible-theme-external-ready:blivechat",
                candidate.requestId,
              );
              setCandidates((current) =>
                current.filter((c) => c.requestId !== candidate.requestId),
              );
            }}
          />
        );
      })}
    </div>
  );
}
