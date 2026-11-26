import type { OverlayRect } from "../components/eventOverlayGeometry";
import { FanMedalProfile } from "../components/FanMedalProfile";
import { stableCompatibleEventId } from "./compatibleLiveBridge";
import type { FanMedalInfo } from "../protocol/types";
import { forwardRef, useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { BlivechatSourceSurface, type BlivechatSourceControl } from "./blivechat/BlivechatSourceSurface.tsx";
import { LaplaceProductSurface } from "./laplace/LaplaceProductSurface.tsx";

import { compatibleRowBounds, observeCompatibleRows, observeCompatibleMedals, type CompatibleRowBounds } from "./compatibleRowInteraction.ts";
import type { RoomGuardProfile } from '../protocol/types.ts';
import { useVoiceSettings } from '../voice/voiceSettings.ts';
import { projectCompatibleDisplayNames } from './compatibleDisplayNames.ts';
type CompatibleListSurfaceProps = Omit<React.ComponentProps<typeof BlivechatSourceSurface>, "renderMode"> & { roomGuardProfile?: RoomGuardProfile; rate?: number; renderMode?: "dashboard" | "obs" | "output"; onRowHover?: (row: CompatibleRowBounds | null) => void; locatedEventId?: string | null; onLocatedRow?: (row: CompatibleRowBounds | null) => void };
export interface CompatibleRateWindow { seen: Set<string>; arrivals: number[] }
export function advanceCompatibleRateWindow(state: CompatibleRateWindow, eventIds: readonly string[], now: number): CompatibleRateWindow {
  const current = new Set(eventIds);
  const seen = new Set([...state.seen].filter(id => current.has(id)));
  const arrivals = state.arrivals.filter(value => value > now - 1000);
  for (const id of eventIds) if (!seen.has(id)) { seen.add(id); arrivals.push(now); }
  return { seen, arrivals };
}

export function useCompatibleEventRate(eventIds: readonly string[]): number {
  const windowState = useRef<CompatibleRateWindow>({ seen: new Set(eventIds), arrivals: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [rate, setRate] = useState(0);
  useEffect(() => {
    const refresh = () => {
      const now = Date.now();
      windowState.current = advanceCompatibleRateWindow(windowState.current, eventIds, now);
      setRate(windowState.current.arrivals.length);
      const oldest = windowState.current.arrivals[0];
      if (oldest !== undefined) timer.current = setTimeout(refresh, Math.max(1, oldest + 1000 - now));
    };
    if (timer.current) clearTimeout(timer.current);
    refresh();
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [eventIds]);
  return rate;
}

export const CompatibleListSurface = forwardRef<BlivechatSourceControl, CompatibleListSurfaceProps>(function CompatibleListSurface(props, ref) {
  const localNicknames = useVoiceSettings(state => state.userNicknames);
  const nicknames = props.userNicknames ?? localNicknames;
  const descriptor = useMemo(() => ({ ...props.descriptor, project(event: Parameters<typeof props.descriptor.project>[0], sequence: number) {
    return projectCompatibleDisplayNames(props.descriptor.project(event, sequence), event, nicknames, props.descriptor.maskUsername === true);
  } }), [props.descriptor, nicknames]);
  const eventIds = useMemo(() => props.events.map(event => event.reactKey ?? event.id), [props.events]);
  const measuredRate = useCompatibleEventRate(eventIds);
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const [medalProfile, setMedalProfile] = useState<{medal: FanMedalInfo; anchor: {left: number; top: number; width: number; height: number}; getAnchorRect: () => OverlayRect | null} | null>(null);
  useEffect(() => {
    if (props.renderMode !== 'dashboard' || !props.onRowHover) return;
    const root = container.current;
    let stop = () => {};
    const bind = () => {
      stop(); setMedalProfile(null);
      const frame = root?.querySelector('iframe');
      if (frame) stop = observeCompatibleMedals(frame, (id, anchor, getAnchorRect) => {
        const medal = latest.current.events.find(event => stableCompatibleEventId(event) === id)?.user?.medal;
        if (medal) setMedalProfile({medal, anchor, getAnchorRect});
      });
    };
    bind(); root?.addEventListener('load', bind, true);
    return () => { stop(); root?.removeEventListener('load', bind, true); };
  }, [props.renderMode, Boolean(props.onRowHover), props.descriptor.renderer, props.descriptor.protocol]);

  useLayoutEffect(() => {
    if (!props.onRowHover && !props.onLocatedRow) return;
    let stop = () => {}, frameId = 0, locatedKey = "";
    const bind = () => {
      stop();
      const frame = container.current?.querySelector("iframe");
      if (frame?.contentDocument) stop = observeCompatibleRows(frame, row => latest.current.onRowHover?.(row));
    };
    const loaded = (event: Event) => { if ((event.target as Element)?.tagName === "IFRAME") bind(); };
    const refresh = () => {
      const frame = container.current?.querySelector("iframe"), id = latest.current.locatedEventId;
      if (frame && id) {
        const row = [...(frame.contentDocument?.querySelectorAll<HTMLElement>("[data-compatible-event-id],[data-event-id]") ?? [])].find(node => (node.dataset.compatibleEventId ?? node.dataset.eventId) === id);
        const bounds = row ? compatibleRowBounds(frame, row) : null, key = JSON.stringify(bounds);
        if (key !== locatedKey) { locatedKey = key; latest.current.onLocatedRow?.(bounds); }
      }
      if (latest.current.locatedEventId) frameId = requestAnimationFrame(refresh);
    };
    bind(); refresh(); container.current?.addEventListener("load", loaded, true);
    const root = container.current;
    return () => { stop(); cancelAnimationFrame(frameId); root?.removeEventListener("load", loaded, true); };
  }, [props.descriptor.renderer, props.descriptor.protocol, Boolean(props.onRowHover), Boolean(props.onLocatedRow), props.locatedEventId]);
  const { roomGuardProfile: _roomProfile, rate, renderMode, onRowHover: _hover, locatedEventId: _located, onLocatedRow: _locatedRow, ...blivechatProps } = props;
  const rendererIdentity = props.descriptor.renderer ?? props.descriptor.protocol;
  return <div ref={container} className="theme-surface" style={{ width: "100%", height: "100%" }}>{props.descriptor.renderer === "laplace"
    ? <LaplaceProductSurface key={rendererIdentity} ref={ref} {...props} descriptor={descriptor} rate={rate ?? measuredRate} renderMode={renderMode === "dashboard" ? "dashboard" : "obs"} />
    : <BlivechatSourceSurface key={rendererIdentity} ref={ref} {...blivechatProps} descriptor={descriptor} renderMode={renderMode === "dashboard" ? "dashboard" : "output"} />}{medalProfile && <FanMedalProfile key={`${medalProfile.medal.anchorUid}:${medalProfile.anchor.top}`} medal={medalProfile.medal} anchor={medalProfile.anchor} getAnchorRect={medalProfile.getAnchorRect} onClose={() => setMedalProfile(null)} />}</div>;
});
