import type { ReactNode } from "react";
import type { DanmakuEvent } from "../../protocol/types.ts";
import type { CompatibleExternalHtmlDescriptor } from "../CompatibleEventRenderer.tsx";
import { BlivechatExternalHtmlSurface } from "./BlivechatExternalHtmlSurface.tsx";

export function BlivechatExternalHtmlTarget({ active, candidate, events, fallback, onCandidateReady, onCandidateFailure, onActiveFailure }: {
  active?: CompatibleExternalHtmlDescriptor;
  candidate?: CompatibleExternalHtmlDescriptor;
  events: readonly DanmakuEvent[];
  fallback: ReactNode;
  onCandidateReady(): void;
  onCandidateFailure?: (message: string) => void;
  onActiveFailure?: (message: string) => void;
}) {
  const activeKey = active?.instanceId ?? (active ? `${active.url}:active` : "");
  const candidateKey = candidate?.instanceId ?? (candidate ? `${candidate.url}:candidate` : "");
  return <>
    {active ? <BlivechatExternalHtmlSurface key={activeKey} descriptor={active} events={events} fallback={fallback} onFailure={onActiveFailure} /> : fallback}
    {candidate && candidateKey !== activeKey ? <BlivechatExternalHtmlSurface key={candidateKey} descriptor={candidate} events={events} fallback={null} holdUntilCommit onReady={onCandidateReady} onFailure={onCandidateFailure} /> : null}
  </>;
}
