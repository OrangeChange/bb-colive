import type { RefObject } from 'react';
import { useStylePreviewPlayback } from './useStylePreviewPlayback.ts';
import { sourcePreviewCandidates, nextSourcePreviewRecord, type SourcePreviewRepetition, type PreviewEventDecision } from './sourcePreviewGeneration.ts';
import type { DanmakuEvent } from '../protocol/types.ts';
import { useEffect, useRef } from 'react';
import { DEFAULT_STYLE_PREVIEW_POLICY, type StylePreviewPolicySettings } from './stylePreviewPolicy.ts';

export function useSourcePreviewPlayback(ref: RefObject<HTMLIFrameElement | null>, options: {
  channel: 'bb-blivechat' | 'bb-openlive'; enabled: boolean; playing: boolean; speed: number;
  restart: number; target: 'live' | 'windows' | 'obs'; displayAll: boolean; visibility?: unknown;
  policy?: StylePreviewPolicySettings; eventType?: string; decision?: PreviewEventDecision;
  onFallback?(event: DanmakuEvent | null): void;
}) {
  const policy = options.policy ?? DEFAULT_STYLE_PREVIEW_POLICY;
  const sourceCandidates = sourcePreviewCandidates(options.channel === 'bb-blivechat' ? 'blivechat' : 'blivechat-open', { ...options, policy });
  const repetitions = useRef<SourcePreviewRepetition[]>([]);
  useEffect(()=>{if(!options.enabled){repetitions.current=[];options.onFallback?.(null);}},[options.enabled]);
  const sourceCount = new Set(sourceCandidates.map(record=>record.method)).size;
  const scope = JSON.stringify([options.restart, options.target, options.displayAll, options.eventType, options.visibility,
    policy.previewEventKinds, policy.filters, policy.windowFilters, policy.audienceFilters, policy.targetRoomId, policy.giftThreshold, policy.giftThresholdMode, policy.mergeSameDanmu, policy.sameDanmuWindowSeconds,
    policy.displayPreferences.onlyGuardEntry, policy.displayPreferences.showAutoDanmaku, policy.displayPreferences.showPhoneNotVerified]);
  const send = (command: string, data: unknown) => ref.current?.contentWindow?.postMessage({type:options.channel,command,data},location.origin);
  useStylePreviewPlayback({ enabled:options.enabled, playing:options.playing && sourceCount>0, speed:options.speed, scope,
    reset: session => { repetitions.current=[];options.onFallback?.(null);send('simulation-begin',{session,mergeSameDanmu:options.target!=='live'&&policy.mergeSameDanmu}); },
    next: (sequence,session) => {
      const record=nextSourcePreviewRecord({candidates:sourceCandidates,repetitions:repetitions.current,random:Math.random,now:Date.now,sequence,session});
      if(record)send('simulation-next',{session,sequence,record,mergeSameDanmu:options.target!=='live'&&policy.mergeSameDanmu});
    },
  });
}
