import { projectCallbackNames } from "../../events/displayNameProjection.ts";
import { StylePreviewFallbacks } from '../../components/StylePreviewFallbacks.tsx';
import { DEFAULT_STYLE_PREVIEW_POLICY, admitsStylePreviewEvent, projectSourcePreviewFact, scopeStylePreviewSample } from '../../preview/stylePreviewPolicy.ts';
import { useSourcePreviewPlayback } from '../../preview/useSourcePreviewPlayback.ts';
import { createBlivechatFixedPreviewRecords } from "../blivechat/previewRecords.mjs";
import { resolveFeedContentAlignment } from "../../events/feedScroll.ts";
import { useSourcePreviewPolicy } from "../../preview/useSourcePreviewPolicy.ts";
import type { PreviewFrame } from "../../preview/stylePreviewState.ts";
import { CompatibleFrameStatus, useCompatibleFrameLoad } from "../../components/CompatibleFrameStatus.tsx";
import { useEffect, useRef } from "react";
import type { CompatibleEditorInspection, CompatibleEditorSelectionState } from "../../themes/compatThemeCapabilities.ts";
import { applyCompatibleThumbnailFramePresentation } from "../thumbnailFramePresentation.ts";

type SourceMessage = { type: string; command: string; data?: unknown };
type PreviewRecord = { payload?: Record<string, unknown>; data?: Record<string, unknown>; receivedAt?: unknown; [key: string]: unknown };
const genericAvatar = "//static.hdslb.com/images/member/noface.gif";
const localGenericAvatar = "/media/noface.gif";

export function prepareOpenLivePreviewRecords(records: readonly PreviewRecord[], now = Date.now()): PreviewRecord[] {
  const latest = records.reduce((value, record) => Math.max(value, Number(record.receivedAt) || 0), 0);
  const offset = latest > 0 ? now - latest : 0;
  return records.map((record) => {
    const key = record.payload ? "payload" : record.data ? "data" : null;
    const source = key ? record[key] : undefined;
    const content = source ? {
      ...source,
      ...(source.avatarUrl === genericAvatar ? { avatarUrl: localGenericAvatar } : {}),
      ...(Number.isFinite(Number(source.timestamp)) ? { timestamp: Number(source.timestamp) + offset / 1000 } : {}),
      ...(Number.isFinite(Number(source.time)) ? { time: Number(source.time) + offset } : {}),
    } : undefined;
    return {
      ...record,
      ...(Number.isFinite(Number(record.receivedAt)) ? { receivedAt: Number(record.receivedAt) + offset } : {}),
      ...(key && content ? { [key]: content } : {}),
    };
  });
}

const methodByEvent: Record<string, string> = { danmaku: "onAddText", like: "onAddLike", interaction: "onAddLike", gift: "onAddGift", "gift-normal": "onAddGift", superchat: "onAddSuperChat", guard: "onAddMember" };
export function filterOpenLivePreviewRecords(records: readonly PreviewRecord[], displayAll: boolean, eventType?: string, now = Date.now()): PreviewRecord[] {
  const prepared = prepareOpenLivePreviewRecords(records, now);
  const method = eventType ? methodByEvent[eventType] : undefined;
  return displayAll || !method ? prepared : prepared.filter(record => {
    if (record.method !== method) return false;
    return true;
  });
}

function stableValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableValue(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function OpenLiveSourcePreview({ maskUsername = false, previewDecision, previewDocument,
  previewPolicy, previewTarget = "windows", eventVisibility,
  css,
  appearanceCss,
  config,
  previewFrame, onPreviewFrame,
  thumbnail,
  previewMode = "design",
  previewEventType,
  previewPlaying = true,
  previewSpeed = 1,
  previewRestartKey = 0,
  displayAll = true,
  scrollDirection = "bottom",
  contentAlignment: savedContentAlignment,
  editorSelection,
  onEditorInspection,
}: {
  maskUsername?: boolean;
  previewDecision?: import('../../preview/sourcePreviewGeneration.ts').PreviewEventDecision;
  previewDocument?: import('../../themes/themeTypes.ts').ThemeDocument;
  previewPolicy?: import("../../preview/stylePreviewPolicy.ts").StylePreviewPolicySettings; previewTarget?: "live" | "windows" | "obs"; eventVisibility?: unknown;
  previewFrame?:PreviewFrame;onPreviewFrame?:(frame:PreviewFrame)=>void;
  css: string;
  appearanceCss: string;
  config: Record<string, unknown>;
  thumbnail: boolean;
  previewMode?: "static" | "design" | "simulation";
  previewEventType?: string;
  previewPlaying?: boolean;
  previewSpeed?: number;
  previewRestartKey?: number;
  displayAll?: boolean;
  scrollDirection?: "top" | "bottom";
  contentAlignment?: "top" | "bottom";
  editorSelection?: CompatibleEditorSelectionState;
  onEditorInspection?: (inspection: CompatibleEditorInspection) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const { ready, error, setError, attempt, retry, loaded } = useCompatibleFrameLoad();
  const loadedRef = useRef(false);
  const contentAlignment = resolveFeedContentAlignment("blivechat-open", scrollDirection, savedContentAlignment);
  const fallback = useSourcePreviewPolicy(frameRef, ready, "bb-openlive", previewFrame, onPreviewFrame, { settings: previewPolicy, target: previewTarget, mode: previewMode, displayAll, thumbnail, visibility: eventVisibility, direction: scrollDirection, alignment: contentAlignment, restart: previewRestartKey, decision:previewDecision, maskUsername });
  const sampleClock = useRef({ mode: previewMode, restart: previewRestartKey, now: Date.now() });
  if (sampleClock.current.mode !== previewMode || sampleClock.current.restart !== previewRestartKey)
    sampleClock.current = { mode: previewMode, restart: previewRestartKey, now: Date.now() };
  const fixedRecords = filterOpenLivePreviewRecords(createBlivechatFixedPreviewRecords("blivechat-open", previewMode), displayAll, (previewEventType ?? editorSelection?.scope.eventType), sampleClock.current.now).filter(record => {
    const settings = previewPolicy ?? DEFAULT_STYLE_PREVIEW_POLICY;
    const fact = scopeStylePreviewSample(projectSourcePreviewFact(record, "blivechat-open"), settings.targetRoomId);
    return (!previewDecision || previewDecision(fact) === "render") && admitsStylePreviewEvent(fact, settings, { target: previewTarget, displayAll, mode: "static", now: 0 });
  });
  const projectedRecords = fixedRecords.map(record => projectCallbackNames(record, maskUsername));
  const fixedRecordsKey = JSON.stringify(projectedRecords);
  const configKey = stableValue(thumbnail ? config : { ...config, maxNumber: 10000, minGiftPrice: 0, minTickerPrice: 0, showDanmaku: true, showGift: true, showSuperchat: true, showNewMember: true, showLike: true, hostShowFreeGift: true, hostShowNormalGift: true });
  const editorSelectionStructureKey = stableValue(editorSelection ? Object.fromEntries(Object.entries(editorSelection).filter(([key]) => key !== "inspectionRevision")) : null);
  const post = (command: string, data?: unknown) => frameRef.current?.contentWindow?.postMessage({ type: "bb-openlive", command, data }, window.location.origin);

  useEffect(() => {
    if (!ready) return;
    post("host", { scale: 1, tickerEnabled: !thumbnail, enableBilibiliVideoLinks: false, direction: thumbnail ? "top" : scrollDirection, contentAlignment: thumbnail ? "top" : contentAlignment, managed: true, renderMode: "output" });
  }, [ready, thumbnail, scrollDirection, contentAlignment]);

  useEffect(() => {
    const receive = (event: MessageEvent<SourceMessage>) => {
      if (event.source !== frameRef.current?.contentWindow || event.origin !== window.location.origin || event.data?.type !== "bb-openlive") return;
      if (event.data.command === "ready") loaded();
      if (event.data.command === "error") {
        const data = event.data.data as { message?: unknown } | undefined;
        setError(typeof data?.message === "string" ? data.message : "开放版来源预览无法应用当前设置");
      }
      if (event.data.command === "editor-inspected") {
        const data = event.data.data as CompatibleEditorInspection | undefined;
        if (data?.scope && typeof data.scope.part === "string") onEditorInspection?.(data);
      }
      if (event.data.command === "hydrated") {
        if (thumbnail) {
          applyCompatibleThumbnailFramePresentation(frameRef.current?.contentDocument ?? null);
          post("scroll-latest");
        }
        if (editorSelection) post("editor-select", editorSelection);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onEditorInspection, editorSelection]);

  useEffect(() => {
    if (!ready) return;
    post("config", JSON.parse(configKey));
  }, [ready, configKey]);

  useEffect(() => {
    if (!ready) return;
    post("css", { css, appearanceCss, inspectionRevision: editorSelection?.inspectionRevision ?? 0 });
  }, [ready, css, appearanceCss, editorSelection?.inspectionRevision]);
  useEffect(() => {
    if (!ready) return;
    post("editor-select", editorSelection ?? null);
  }, [ready, editorSelectionStructureKey]);

  useEffect(() => {
    if (!ready || loadedRef.current || previewFrame || (!thumbnail && previewMode === "simulation")) return;
    loadedRef.current = true;
    let disposed = false;
    post("simulation", { enabled: false });
    const records = projectedRecords;
    if (!disposed) post(thumbnail ? "hydrate" : "preview-window", { records: thumbnail ? records.slice(0, 6) : records });
    return () => { disposed = true; loadedRef.current = false; };
  }, [fixedRecordsKey, ready, thumbnail, previewMode === "simulation", previewRestartKey]);

  useSourcePreviewPlayback(frameRef, { channel: 'bb-openlive', enabled: ready && !thumbnail && !previewFrame && previewMode === 'simulation',
    playing: previewPlaying, speed: previewSpeed, restart: previewRestartKey, target: previewTarget, displayAll,
    visibility: eventVisibility, policy: previewPolicy, decision:previewDecision, onFallback:fallback.appendFallback, eventType: displayAll ? undefined : (previewEventType ?? editorSelection?.scope.eventType) });
  const sample = thumbnail ? "fixed-571" : previewMode === "simulation" ? "source-simulation" : previewMode === "static" ? "static-fixed" : "design-fixed";
  return <div className="openlive-source-preview" data-source-sample={sample} style={{ position: "relative", width: "100%", height: "100%", display:"flex", flexDirection:"column" }}>
    <iframe key={attempt} ref={frameRef} title={thumbnail ? "开放版来源缩略图" : "开放版来源预览"} src="/openlive/renderer.html" sandbox="allow-scripts allow-same-origin" onLoad={() => { loadedRef.current = false;  }} style={{ display: "block", width: "100%", height: "100%", minHeight:0, flex:1, border: 0, background: "transparent", colorScheme: "normal" }} />
    <StylePreviewFallbacks frameDocument={ready?frameRef.current?.contentDocument??null:null} events={fallback.events} sticky={fallback.sticky} mode="blivechat-open" settings={previewDocument?.settings} target={previewTarget} policy={previewPolicy??DEFAULT_STYLE_PREVIEW_POLICY} now={previewFrame?.now??Date.now()}/>
    <CompatibleFrameStatus ready={ready} error={error} onRetry={retry} />
  </div>;
}
