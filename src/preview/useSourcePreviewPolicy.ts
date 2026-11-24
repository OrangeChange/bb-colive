import { projectSourceNameFrame, projectCallbackNames } from "../events/displayNameProjection.ts";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { DanmakuEvent } from '../protocol/types.ts';
import type { PreviewEventDecision } from './sourcePreviewGeneration.ts';
import { useSourcePreviewFrame } from "./useSourcePreviewFrame.ts";
import type { PreviewFrame } from "./stylePreviewState.ts";
import { DEFAULT_STYLE_PREVIEW_POLICY, scopeStylePreviewSample, projectSourcePreviewFact, selectStylePreviewEvents, stylePreviewAnimation, type SourcePreviewRecord, type StylePreviewPolicySettings } from "./stylePreviewPolicy.ts";
import { orderBlivechatDesignRecords } from "../compat/blivechat/previewRecords.mjs";
import { isCompatibleThemeEventVisible } from "../themes/compatibleEventVisibility.ts";

/** 对现有来源帧施加软件策略，来源继续负责样例生成和原始渲染。 */
export function useSourcePreviewPolicy(
  ref: RefObject<HTMLIFrameElement | null>, ready: boolean, channel: "bb-blivechat" | "bb-openlive",
  frame: PreviewFrame | undefined, onFrame: ((frame: PreviewFrame) => void) | undefined,
  options: { maskUsername?: boolean; settings?: StylePreviewPolicySettings; target: "live" | "windows" | "obs"; mode: "static" | "design" | "simulation"; displayAll: boolean; thumbnail: boolean; visibility?: unknown; direction: "top" | "bottom"; alignment: "top" | "bottom"; restart: number; decision?: PreviewEventDecision },
) {
  const current = useRef(options); current.current = options;
  const publish = useRef(onFrame); publish.current = onFrame;
  const replay = useRef(frame); replay.current = frame;
  const raw = useRef<PreviewFrame | undefined>(undefined);
  const messages = useRef(new Map<string, Record<string, unknown>>());
  const sent = useRef("");
  const retired = useRef(new Set<string>());
  const deadline = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const native = useRef<DanmakuEvent[]>([]);
  const [fallback, setFallback] = useState<{events:DanmakuEvent[];sticky:ReturnType<typeof selectStylePreviewEvents>['sticky']}>({events:[],sticky:[]});
  const project = useCallback(() => {
    const input = replay.current ?? raw.current; if (!input || !ref.current?.contentWindow) return;
    const o = current.current, settings = o.settings ?? DEFAULT_STYLE_PREVIEW_POLICY;
    const source = channel === "bb-blivechat" ? "blivechat" : "blivechat-open";
    const records = (input.records ?? []) as SourcePreviewRecord[];
    const orderedRecords = o.mode === "design" ? orderBlivechatDesignRecords(records) : records;
    const facts = orderedRecords.map(record => {
      const fact=scopeStylePreviewSample(projectSourcePreviewFact(record, source),settings.targetRoomId);
      const rendered=messages.current.get(fact.id);
      if(fact.gift&&rendered&&Number.isFinite(rendered.price)&&Number.isFinite(rendered.num)){
        const total=Number(rendered.price),count=Number(rendered.num);
        fact.gift={...fact.gift,count,totalRmb:total,paymentRmb:total,total:total*1000,priceRmb:count>0?total/count:0};
      }
      return fact;
    }).filter(fact=>o.mode!=="simulation"||!input.presentation?.messages||messages.current.has(fact.id));
    const nativeEvents = (replay.current?.nativeEvents ?? native.current).filter(event=>o.target!=='obs' && (!o.decision || o.decision(event)==='fallback'));
    const nativeIds = new Set(nativeEvents.map(event=>event.id));
    const supported = [...facts.filter(event => o.decision ? o.decision(event)==='render' : o.displayAll || isCompatibleThemeEventVisible(source, o.visibility, event)),...nativeEvents];
    if (o.mode === "simulation") supported.sort((a,b)=>a.ts-b.ts);
    const now = replay.current?.now ?? (o.mode === "simulation" ? Date.now() : Math.max(0, ...facts.map(event => event.ts)) + 1);
    const selected = selectStylePreviewEvents(supported, settings, { ...o, now }, retired.current);
    retired.current = selected.retiredMainIds;
    const eligibleMainIds = new Set(replay.current?.mainEventIds ?? selected.events.filter(event => !event.scDeleted).map(event => event.id));
    const windowIds = input.windowed ? new Set((input.presentation?.messages ?? []).map(message => String((message as Record<string, unknown>).id))) : undefined;
    const mainIds = new Set(replay.current?.mainEventIds ?? selected.events.filter(event => !event.scDeleted && (!windowIds || windowIds.has(event.id))).map(event => event.id));
    const presentation = {
      messages: [...messages.current.values()].filter(message => mainIds.has(String(message.id))),
      paidMessages: selected.sticky.flatMap(card => {
        const message = messages.current.get(card.event.id);
        return message ? [{ ...message, addTime: new Date(card.startedAt).toISOString(), bbHostStartedAt: card.startedAt, bbHostExpiresAt: o.mode === "simulation" ? card.expiresAt : Number.MAX_SAFE_INTEGER }] : [];
      }),
    };
    const layout = [...(input.windowed ? eligibleMainIds : mainIds)].map(eventId => ({ kind: nativeIds.has(eventId)?"fallback":"source", eventId }));
    const nextFallback={events:selected.events.filter(event=>nativeIds.has(event.id)),sticky:selected.sticky.filter(card=>nativeIds.has(card.event.id))};
    setFallback(previous=>{
      if(JSON.stringify(previous)===JSON.stringify(nextFallback))return previous;
      const retained=new Map(previous.events.map(event=>[event.id,event]));
      return {...nextFallback,events:nextFallback.events.map(event=>{
        const existing=retained.get(event.id);
        return existing&&JSON.stringify(existing)===JSON.stringify(event)?existing:event;
      })};
    });
    if (o.direction === "top") layout.reverse();
    const host = { layout, stickyRecords: selected.sticky.flatMap(card => {
      const record = records.find(record => String((record.payload ?? record.data)?.id) === card.event.id);
      return record ? [{ record: projectCallbackNames(record, o.maskUsername === true), startedAt: card.startedAt, expiresAt: o.mode === "simulation" ? card.expiresAt : Number.MAX_SAFE_INTEGER }] : [];
    }), position: settings.stickySettings.position, direction: o.direction, contentAlignment: o.alignment, animation: stylePreviewAnimation(settings) };
    const rawPresentation = projectSourceNameFrame({ records, presentation }, false).presentation;
    const shownPresentation = projectSourceNameFrame({ records, presentation: rawPresentation }, o.maskUsername === true).presentation;
    const output = { ...input, nativeEvents, windowed: input.windowed === true, now, restart: o.restart, mainEventIds: [...eligibleMainIds], presentation: rawPresentation };
    const signature = JSON.stringify([input.epoch, input.records, nativeEvents, shownPresentation, host, o.restart]);
    if (signature !== sent.current) {
      sent.current = signature;
      const post = (command: string, data: unknown) => ref.current?.contentWindow?.postMessage({ type: channel, command, data }, location.origin);
      if (channel === "bb-blivechat" && !input.windowed && (replay.current || o.mode === "simulation")) {
        post("preview-present", { ...shownPresentation, epoch: input.epoch, restart: o.restart, hostPresentation: host });
      } else {
        if (!replay.current && !input.windowed && o.mode === "simulation") {
          post("preview-present", { ...shownPresentation, epoch: input.epoch, restart: o.restart });
        }
        post("presentation", host);
      }
      if (!replay.current) publish.current?.(output);
    }
    clearTimeout(deadline.current);
    if (o.mode === "simulation" && !replay.current) {
      const deadlines = [...selected.sticky.map(card => card.expiresAt), ...(o.target !== "live" && settings.expiry.enabled ? selected.events.map(event => event.ts + settings.expiry.seconds * 1000) : [])].filter(time => time > now);
      if (deadlines.length) deadline.current = setTimeout(project, Math.max(1, Math.min(...deadlines) - now));
    }
  }, [channel, ref]);
  const receive = useCallback((input: PreviewFrame) => {
    if (raw.current?.epoch !== input.epoch) { messages.current.clear(); retired.current.clear(); sent.current = ""; }
    raw.current = input;
    const ids = new Set(((input.records ?? []) as SourcePreviewRecord[]).map(record => String((record.payload ?? record.data)?.id)));
    for (const id of messages.current.keys()) if (!ids.has(id)) messages.current.delete(id);
    for (const message of [...(input.presentation?.messages ?? []), ...(input.presentation?.paidMessages ?? [])] as Record<string, unknown>[]) messages.current.set(String(message.id), message);
    project();
  }, [project]);
  // 生产端只观察现有时钟；接收端原样应用已筛选的呈现帧。
  useSourcePreviewFrame(ref, ready, channel, frame, !options.thumbnail && !frame ? receive : onFrame, options.maskUsername);
  const settingsKey = JSON.stringify(options);
  useEffect(() => {
    if (!ready) { sent.current = ""; return; }
    let active = true;
    // 来源先应用配置，再恢复呈现，避免配置初始化清空已暂停的快照。
    queueMicrotask(() => {
      if (!active) return;
      if (frame?.presentation) {
        messages.current = new Map(([...(frame.presentation.messages ?? []), ...(frame.presentation.paidMessages ?? [])] as Record<string, unknown>[]).map(message => [String(message.id), message]));
      }
      project();
    });
    return () => { active = false; };
  }, [ready, frame, settingsKey, project]);
  useEffect(() => () => clearTimeout(deadline.current), []);
  const appendFallback=useCallback((event:DanmakuEvent|null)=>{
    native.current=event?[...native.current,event].slice(-2000):[];
    if(!event){setFallback({events:[],sticky:[]});return;}
    project();
  },[project]);
  return {...fallback,appendFallback};
}
