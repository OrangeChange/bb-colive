import { CompatibleFrameStatus, useCompatibleFrameLoad } from "../../components/CompatibleFrameStatus.tsx";
import type { LaplaceGuardEntryRecord } from './nativeGuardEntry';
import type { LaplaceTextFilterRecord } from './nativeTextFilters';
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useCompatibleOutputScheme } from '../../themes/compatPreviewScheme.ts';
import { admitsLaplaceEvent } from './admission';
import { laplaceEventRate, laplaceQueueDelay, selectLaplaceProjection, laplaceHostElementPresentation } from './projection';
import type { LaplaceEvent, LaplaceProjectionMode } from './types';
import { pickLaplaceSettings, type LaplaceSettings } from './settings';
import type { LaplaceAppearance, LaplaceCssSources } from './styles';
import type { CompatibleEditorInspection, CompatibleEditorSelectionState } from '../../themes/compatThemeCapabilities';
import {
  LAPLACE_CHANNEL, LAPLACE_BRIDGE_VERSION,
  hasValidProductElementsSlot, isLaplaceRenderEnvelope, sameLaplaceCss, isLaplaceRendererReply, pickLaplaceRendererEvent,
  type LaplaceRenderMessage, type LaplaceRenderEnvelope, type LaplaceRendererReply,
} from './renderer/bridge';

export interface LaplaceQueuedInput { event: LaplaceEvent; sequence: number; source?: LaplaceTextFilterRecord['source'] & LaplaceGuardEntryRecord['source'] & { scIdentity?: string } }
export interface LaplaceQueueOptions {
  /** Native live authority can change without restarting an existing delivery delay. */
  preserveGateTiming?: boolean;
  productEventGate?: (event: LaplaceEvent, record: LaplaceQueuedInput) => boolean;
  productInteractionGate?: (event: LaplaceEvent) => boolean;
  admit?: (event: LaplaceEvent, settings: LaplaceSettings, record: LaplaceQueuedInput) => boolean;
}
/** Delivery order is source sequence, not event ID: this is not a second deduper. */
export function useLaplaceQueuedEvents(records: readonly LaplaceQueuedInput[], sourceGeneration: number,
  settings: LaplaceSettings, following: boolean, enabled = true, hydrate = false, admitBeforeQueue = false, options: LaplaceQueueOptions = {}) {
  const { productEventGate, productInteractionGate, admit = admitsLaplaceEvent } = options;
  const delivered = useRef(new Set<number>());
  const generation = useRef<number | null>(null);
  const seen = useRef(new Set<number>());
  const pending = useRef<number[]>([]);
  const timingEventGate = options.preserveGateTiming ? undefined : productEventGate;
  const timingInteractionGate = options.preserveGateTiming ? undefined : productInteractionGate;
  const timingAdmit = options.preserveGateTiming ? undefined : admit;
  const current = useRef({ records, settings, following, enabled, productEventGate, productInteractionGate, admit });
  current.current = { records, settings, following, enabled, productEventGate, productInteractionGate, admit };
  const [revision, setRevision] = useState(0);
  const [rate, setRate] = useState(0);
  const rateRef = useRef(0);
  const count = useRef(0);
  const referenceCount = useRef(0);
  const referenceTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const explicitEmpty = records.length === 0 && seen.current.size > 0;
    if (generation.current !== sourceGeneration || explicitEmpty) {
      generation.current = sourceGeneration;
      delivered.current.clear(); seen.current.clear(); pending.current = [];
      count.current = 0; referenceCount.current = 0; rateRef.current = 0; setRate(0);
      referenceTimers.current.forEach(clearTimeout); referenceTimers.current.clear();
      if (hydrate) for (const record of records) { delivered.current.add(record.sequence); seen.current.add(record.sequence); }
    }
    const retained = new Set(records.map(record => record.sequence));
    delivered.current = new Set([...delivered.current].filter(sequence => retained.has(sequence)));
    pending.current = pending.current.filter(sequence => retained.has(sequence));
    for (const record of records) if (!seen.current.has(record.sequence)) {
      seen.current.add(record.sequence);
      if (productEventGate?.(record.event, record) === false || productInteractionGate?.(record.event) === false
        || admitBeforeQueue && !admit(record.event, current.current.settings, record)) delivered.current.add(record.sequence);
      else pending.current.push(record.sequence);
    }
    // Product toggles retire rejected product backlog in one batch. Other
    // source rejections retain the caller's existing live/simulation pacing.
    const bySequence = new Map(records.map(record => [record.sequence, record]));
    pending.current = pending.current.filter(sequence => {
      const record = bySequence.get(sequence);
      if (record && (productEventGate?.(record.event, record) === false || productInteractionGate?.(record.event) === false)) {
        delivered.current.add(sequence); return false;
      }
      return true;
    });
    seen.current = retained;
    setRevision(value => value + 1);
  }, [records, sourceGeneration, hydrate, admitBeforeQueue, productEventGate, productInteractionGate, admit]);
  useEffect(() => {
    if (!enabled || !following || !pending.current.length) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      if (!active || !current.current.enabled || !current.current.following || !pending.current.length) return;
      timer = setTimeout(() => {
        if (!active) return;
        // Recheck current intent at delivery, including render/effect races.
        // Rejected product events never spend an additional timer cycle.
        while (pending.current.length) {
          const next = current.current.records.find(record => record.sequence === pending.current[0]);
          if (!next || (current.current.productEventGate?.(next.event, next) !== false && current.current.productInteractionGate?.(next.event) !== false)) break;
          const skipped = pending.current.shift()!;
          if (next) delivered.current.add(skipped);
        }
        const sequence = pending.current.shift();
        const record = sequence === undefined ? undefined : current.current.records.find(record => record.sequence === sequence);
        if (record) {
          delivered.current.add(record.sequence);
          if (current.current.admit(record.event, current.current.settings, record)) {
            const acceptedCount = ++count.current;
            rateRef.current = laplaceEventRate(acceptedCount, referenceCount.current); setRate(rateRef.current);
            const referenceTimer = setTimeout(() => { referenceCount.current = acceptedCount; referenceTimers.current.delete(referenceTimer); }, 1000);
            referenceTimers.current.add(referenceTimer);
          }
        }
        setRevision(value => value + 1);
        schedule();
      }, laplaceQueueDelay(pending.current.length, rateRef.current));
    };
    schedule();
    return () => { active = false; clearTimeout(timer); };
  }, [records, sourceGeneration, settings, following, enabled, timingEventGate, timingInteractionGate, timingAdmit]);
  useEffect(() => () => { referenceTimers.current.forEach(clearTimeout); referenceTimers.current.clear(); }, []);
  const deliveredRecords = useMemo(() => records.filter(record => delivered.current.has(record.sequence)), [records, revision]);
  const events = useMemo(() => deliveredRecords.map(record => record.event), [deliveredRecords]);
  return { events, records: deliveredRecords, rate, pendingCount: pending.current.length };
}

export function useLaplaceProjection(events: readonly LaplaceEvent[], settings: LaplaceSettings, mode: LaplaceProjectionMode, scrollable: boolean) {
  const [clock, setClock] = useState(Date.now);
  const projection = useMemo(() => selectLaplaceProjection(events, settings, { mode, scrollable, now: Date.now() }), [events, settings, mode, scrollable, clock]);
  useEffect(() => {
    if (projection.nextExpiryAt === null) return;
    const timer = setTimeout(() => setClock(Date.now()), Math.max(1, Math.min(2_147_483_647, projection.nextExpiryAt - Date.now())));
    return () => clearTimeout(timer);
  }, [projection.nextExpiryAt, clock]);
  return projection;
}

let rendererGeneration = 0;
export interface RendererHostProps {
  dashboardLiveGuards?: Record<string, { roomId: number; guardCount: number }>;
  settings: LaplaceSettings; css: LaplaceCssSources;
  events: LaplaceEvent[]; stickyEvents: LaplaceEvent[];
  appearance?: LaplaceAppearance; preview?: boolean; scrollable?: boolean; rate?: number; direction?: 'top' | 'bottom'; contentAlignment?: 'top' | 'bottom';
  followLatest?: boolean;
  tickerPosition?: 'top' | 'bottom'; renderMode?: 'dashboard' | 'obs'; enableBilibiliVideoLinks?: boolean; coordinateScale?: number;
  variant?: 'product';
  productElements?: { classicScope: boolean };
  animation?: { preset: 'none' | 'fade' | 'lift' | 'scale' | 'slide'; durationMs: number };
  removingEventIds?: string[];
  recalledEventIds?: string[];
  layout?: Array<{ kind: 'source' | 'fallback'; eventId: string }>;
  mode?: 'candidate'; acquisitionMode?: 'direct' | 'open-platform'; onFollowingChange?: (following: boolean, state?: Partial<LaplaceRendererReply>) => void;
  onAction?: (eventId: string, action: unknown) => void;
  onContextMenu?: (eventId: string, x: number, y: number) => void;
  onRendered?: () => void;
  onFrameDocument?: (document: Document | null) => void;
  onPointerDown?: () => void;
  editorSelection?: CompatibleEditorSelectionState;
  onEditorInspection?: (inspection: CompatibleEditorInspection) => void;
  onReady?: () => void;
  onFailure?: (message: string) => void;
}
export interface LaplaceRendererControl { scrollToLatest(): void; locate(eventId: string): void; restoreScroll(state: { eventId?: string; scrollTop?: number; anchorOffset?: number; followingLatest?: boolean }): void }
export const RendererHost = forwardRef<LaplaceRendererControl, RendererHostProps>(function RendererHost(props, ref) {
  if (!hasValidProductElementsSlot(props)) throw new Error('Invalid productElements host prop');
  const { mode = 'candidate', variant = 'product' } = props;
  if ('productElements' in props && variant !== 'product') throw new Error('Product elements require product renderer');
  if (variant === 'product' && mode !== 'candidate') throw new Error('Product renderer requires candidate host mode');
  return <RendererHostFrame ref={ref} key={`${mode}:${variant}`} {...props} />;
});
const RendererHostFrame = forwardRef<LaplaceRendererControl, RendererHostProps>(function RendererHostFrame({ mode = 'candidate', variant = 'product', onReady, onFailure, onFollowingChange, onAction, onContextMenu, onRendered, onFrameDocument, onPointerDown, onEditorInspection, coordinateScale = 1, ...payload }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [generation, setGeneration] = useState(() => ++rendererGeneration);
  const frameOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const frameUrl = `/laplace/product/index.html?generation=${generation}&parentOrigin=${encodeURIComponent(frameOrigin)}`;
  const sequence = useRef(0);
  const acceptedSequence = useRef(-1);
  const sentCss = useRef<LaplaceRenderMessage['css'] | undefined>(undefined);
  const sentEvents = useRef<typeof payload.events | null>(null);
  const { ready, error, setError, retry: resetLoad, loaded } = useCompatibleFrameLoad();
  useEffect(() => { if (error) onFailure?.(error); }, [error, onFailure]);
  const retry = () => { sequence.current = 0; acceptedSequence.current = -1; sentEvents.current = null; sentCss.current = undefined; setGeneration(++rendererGeneration); resetLoad(); };
  const hostScheme = useCompatibleOutputScheme();
  const giftEffectInteractive = Boolean(onAction) && !payload.preview;
  const latest = useRef({ payload, onReady, onFollowingChange, onAction, onContextMenu, onRendered, onFrameDocument, onPointerDown, onEditorInspection, coordinateScale }); latest.current = { payload, onReady, onFollowingChange, onAction, onContextMenu, onRendered, onFrameDocument, onPointerDown, onEditorInspection, coordinateScale };
  const control = (action: 'locate' | 'scroll-latest' | 'restore-scroll', data: { eventId?: string; scrollTop?: number; anchorOffset?: number; followingLatest?: boolean } = {}) => frame.current?.contentWindow?.postMessage({ channel:LAPLACE_CHANNEL,version:LAPLACE_BRIDGE_VERSION,type:'control',generation,action,...data }, '*');
  useImperativeHandle(ref, () => ({ scrollToLatest: () => control('scroll-latest'), locate: eventId => control('locate', { eventId }), restoreScroll: state => control('restore-scroll', state) }), [generation]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      const expectedOrigin = variant === 'product' ? frameOrigin : 'null';
      if (event.source !== frame.current?.contentWindow || event.origin !== expectedOrigin || !isLaplaceRendererReply(event.data)) return;
      const reply = event.data;
      if (reply.generation !== generation || reply.sequence < acceptedSequence.current || reply.sequence > sequence.current) return;
      if (reply.type === 'ready') {
        sentCss.current = undefined; loaded(); latest.current.onReady?.(); return;
      }
      if (reply.type === 'rendered') {
        if (reply.sequence !== sequence.current || sentEvents.current !== latest.current.payload.events) return;
        const element = frame.current, root = element?.contentDocument?.documentElement;
        if (variant === 'product' && element && root) element.style.colorScheme = element.contentWindow?.getComputedStyle(root).colorScheme || 'normal';
        latest.current.onFrameDocument?.(element?.contentDocument ?? null); latest.current.onRendered?.(); return;
      }
      acceptedSequence.current = reply.sequence;
      if (reply.type === 'error') setError(reply.message || '预览处理失败，请检查输入并重试。');
      else if (reply.type === 'scroll-state' && typeof reply.following === 'boolean') latest.current.onFollowingChange?.(reply.following, reply);
      else if (reply.type === 'action' && typeof reply.eventId === 'string') latest.current.onAction?.(reply.eventId, reply.action);
      else if (reply.type === 'context-menu' && typeof reply.eventId === 'string' && typeof reply.x === 'number' && typeof reply.y === 'number') {
        const bounds = frame.current?.getBoundingClientRect();
        latest.current.onContextMenu?.(reply.eventId, reply.x * latest.current.coordinateScale + (bounds?.left ?? 0), reply.y * latest.current.coordinateScale + (bounds?.top ?? 0));
      }
      else if (reply.type === 'pointer-down') latest.current.onPointerDown?.();
      else if (reply.type === 'editor-inspected' && reply.scope && reply.computed) latest.current.onEditorInspection?.({ scope: reply.scope, computed: reply.computed, layoutSupported: reply.layoutSupported, refresh: reply.refresh, inspectionRevision: reply.inspectionRevision });
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); latest.current.onFrameDocument?.(null); };
  }, [frameOrigin, generation, variant]);
  useLayoutEffect(() => {
    if (!ready || !frame.current?.contentWindow) return;
    const presentation = variant === 'product' ? laplaceHostElementPresentation({ ...payload.settings, classicElementScope: payload.productElements?.classicScope === true }, [...payload.events, ...payload.stickyEvents]) : undefined;
    const { cloudTheme: _cloud, remoteTheme: _remote, ...settings } = pickLaplaceSettings(presentation?.settings ?? payload.settings);
    const css = presentation ? { ...payload.css, custom: [payload.css.custom, presentation.css].filter(Boolean).join('\n') } : payload.css;
    const message: LaplaceRenderEnvelope = {
      channel: LAPLACE_CHANNEL, version: LAPLACE_BRIDGE_VERSION, type: 'render', generation, sequence: ++sequence.current,
      events: payload.events.map(pickLaplaceRendererEvent), stickyEvents: payload.stickyEvents.map(pickLaplaceRendererEvent),
      settings: variant === 'product' ? { ...settings, colorScheme: payload.editorSelection?.scheme ?? hostScheme } : settings, css, preview: payload.preview ?? false, scrollable: payload.scrollable ?? false, rate: payload.rate ?? 0,
      ...(payload.followLatest !== undefined ? {followLatest: payload.followLatest} : {}),
      giftEffectInteractive,
      ...(payload.direction ? { direction: payload.direction } : {}),
      ...(payload.contentAlignment ? { contentAlignment: payload.contentAlignment } : {}),
      ...(payload.tickerPosition ? { tickerPosition: payload.tickerPosition } : {}),
      ...(payload.renderMode ? { renderMode: payload.renderMode } : {}),
      ...(payload.enableBilibiliVideoLinks !== undefined ? { enableBilibiliVideoLinks: payload.enableBilibiliVideoLinks } : {}),
      ...(payload.layout ? { layout: payload.layout } : {}),
      ...(payload.productElements ? { productElements: payload.productElements } : {}),
      ...(payload.animation ? { animation: payload.animation } : {}),
      ...(payload.removingEventIds ? { removingEventIds: payload.removingEventIds } : {}),
      ...(payload.recalledEventIds ? { recalledEventIds: payload.recalledEventIds } : {}),
      ...(payload.dashboardLiveGuards ? { dashboardLiveGuards: payload.dashboardLiveGuards } : {}),
      ...(payload.appearance ? { appearance: payload.appearance } : {}),
      ...(payload.acquisitionMode ? { acquisitionMode: payload.acquisitionMode } : {}),
      ...(payload.editorSelection ? { editorSelection: payload.editorSelection } : {}),
    };
    if (sameLaplaceCss(sentCss.current, css)) delete message.css;
    if (!isLaplaceRenderEnvelope(message, sentCss.current)) { setError('预览输入未通过安全检查，请检查事件字段、设置或 CSS 大小。'); return; }
    setError(''); sentEvents.current = payload.events; frame.current.contentWindow.postMessage(message, '*'); sentCss.current = { ...css };
  }, [payload.settings, payload.css, payload.dashboardLiveGuards, payload.events, payload.stickyEvents, payload.appearance, payload.preview, payload.scrollable, payload.followLatest, payload.rate, payload.direction, payload.contentAlignment, payload.tickerPosition, payload.renderMode, payload.enableBilibiliVideoLinks, payload.layout, payload.acquisitionMode, payload.productElements, payload.animation, payload.removingEventIds, payload.recalledEventIds, payload.editorSelection, generation, ready, hostScheme, variant, giftEffectInteractive]);
  return <div className="laplace-renderer-host" data-ready={ready} style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}>
    <CompatibleFrameStatus ready={ready} error={error} onRetry={retry} />
    <iframe key={generation} ref={frame} title="LAPLACE 隔离预览" src={frameUrl} sandbox={variant === 'product' ? 'allow-scripts allow-same-origin' : 'allow-scripts'} className="laplace-renderer-frame" style={{ display: 'block', width: '100%', height: '100%', border: 0, background: 'transparent', pointerEvents: 'auto', ...(variant === 'product' ? { colorScheme: 'normal' } : {}) }} />
  </div>;
});
