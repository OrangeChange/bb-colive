import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { submitWindowRenderDiagnostic } from "./windowDiagnosticBridge.ts";
import { isEventWindowKind } from '../windows/eventWindowChannels.ts';
import {
  DiagnosticStreamLogger,
  getDiagnosticContext,
  getDiagnosticConnectionId,
  type DiagnosticContext,
  type DiagnosticStreamLoggerDependencies,
} from "./diagnosticLogger.ts";

export const RENDER_DIAGNOSTIC_SCHEMA_VERSION = 3;

export interface RenderDiagnosticInput {
  action: "new" | "update" | "remove";
  text: string;
  imgs: string[];
  sessionId?: string;
  eventId?: string;
  roomId?: string | number;
  connectionId?: string;
  windowLabel?: string;
  region?: string;
  msgType?: number;
  eventStyleType?: string;
  animationPreset?: string;
  animationDurationMs?: number;
  animationExitDurationMs?: number;
  eventPadding?: number;
  fontFamily?: string;
  fontLoaded?: boolean;
  imgStates?: Array<"pending" | "loaded" | "error">;
  imageStatus?: "loaded" | "error";
  imageIndex?: number;
}

export interface RenderFeatureDiagnosticInput {
  featureId: string;
  stage: string;
  action: string;
  outcome: string;
  sessionId?: string;
  eventId?: string;
  roomId?: string | number;
  connectionId?: string;
  windowLabel?: string;
  data?: Record<string, string | number | boolean | null>;
}

export type RenderDiagnosticLoggerDependencies = Omit<DiagnosticStreamLoggerDependencies, "stream">;

export class RenderDiagnosticLogger {
  private readonly logger: DiagnosticStreamLogger;

  constructor(dependencies: RenderDiagnosticLoggerDependencies = {}) {
    this.logger = new DiagnosticStreamLogger({ ...dependencies, stream: "render", invoke: dependencies.invoke ?? tauriInvoke });
  }

  record(input: RenderDiagnosticInput, context: DiagnosticContext = getDiagnosticContext()): string {
    if (submitWindowRenderDiagnostic(input)) return "";
    return this.logger.record({
      sessionId: input.sessionId,
      connectionId: input.connectionId ?? (isEventWindowKind(input.windowLabel ?? '') ? undefined : getDiagnosticConnectionId(context)),
      roomId: input.roomId,
      eventId: input.eventId,
      windowLabel: input.windowLabel,
      record: {
        renderSchemaVersion: RENDER_DIAGNOSTIC_SCHEMA_VERSION,
        action: input.action,
        text: input.text,
        imgs: input.imgs,
        ...(input.region === undefined ? {} : { region: input.region }),
        ...(input.msgType === undefined ? {} : { msgType: input.msgType }),
        ...(input.eventStyleType === undefined ? {} : { eventStyleType: input.eventStyleType }),
        ...(input.animationPreset === undefined ? {} : { animationPreset: input.animationPreset }),
        ...(input.animationDurationMs === undefined ? {} : { animationDurationMs: input.animationDurationMs }),
        ...(input.animationExitDurationMs === undefined ? {} : { animationExitDurationMs: input.animationExitDurationMs }),
        ...(input.eventPadding === undefined ? {} : { eventPadding: input.eventPadding }),
        ...(input.fontFamily === undefined ? {} : { fontFamily: input.fontFamily }),
        ...(input.fontLoaded === undefined ? {} : { fontLoaded: input.fontLoaded }),
        ...(input.imgStates === undefined ? {} : { imgStates: input.imgStates }),
        ...(input.imageStatus === undefined ? {} : { imageStatus: input.imageStatus }),
        ...(input.imageIndex === undefined ? {} : { imageIndex: input.imageIndex }),
      },
    });
  }

  recordFeature(input: RenderFeatureDiagnosticInput, context: DiagnosticContext = getDiagnosticContext()): string {
    if (submitWindowRenderDiagnostic(input)) return "";
    return this.logger.record({
      sessionId: input.sessionId,
      connectionId: input.connectionId ?? (isEventWindowKind(input.windowLabel ?? '') ? undefined : getDiagnosticConnectionId(context)),
      roomId: input.roomId,
      eventId: input.eventId,
      windowLabel: input.windowLabel,
      record: {
        renderSchemaVersion: RENDER_DIAGNOSTIC_SCHEMA_VERSION,
        featureId: input.featureId,
        stage: input.stage,
        action: input.action,
        outcome: input.outcome,
        ...(input.data === undefined ? {} : input.data),
      },
    });
  }

  flush() { return this.logger.flush(); }
  getHealthSnapshot() { return this.logger.getHealthSnapshot(); }
  stop() { this.logger.stop(); }
}

export function createRenderDiagnosticLogger(dependencies: RenderDiagnosticLoggerDependencies = {}): RenderDiagnosticLogger {
  return new RenderDiagnosticLogger(dependencies);
}

export const renderDiagnosticLogger = createRenderDiagnosticLogger();

/** 从实际 DOM 行提取渲染结果；头像不作为事件图片重复记录。 */
export function extractRenderedEventRow(row: Element): { text: string; imgs: string[]; imgStates: Array<"pending" | "loaded" | "error"> } {
  const text = (row.textContent || "").replace(/\s+/g, " ").trim();
  const imgs = Array.from(row.querySelectorAll("img"))
    .filter((img) => !img.className.includes("rounded-full"))
    .map((img) => img.src);
  const imageElements = Array.from(row.querySelectorAll<HTMLImageElement>("img"))
    .filter((img) => !img.className.includes("rounded-full"));
  const imgStates = imageElements.map((img) => !img.complete ? "pending" : img.naturalWidth > 0 ? "loaded" : "error");
  return { text, imgs, imgStates };
}

export interface RenderedEventObserverOptions {
  windowLabel: string;
  region: string;
}

const renderedRows = new WeakMap<Element, RenderedEventObserverOptions>();

/** 观察实际渲染的事件行，记录新增行和后续合并/图片变化。 */
export function observeRenderedEventRows(root: Element, options: RenderedEventObserverOptions): () => void {
  const seen = new Set<Element>();
  const record = (row: Element, action: "new" | "update" | "remove", image?: { status: "loaded" | "error"; index: number }) => {
    const previous = renderedRows.get(row);
    if (action === "new" && previous?.windowLabel === options.windowLabel && previous.region === options.region) return;
    if (action === "remove") renderedRows.delete(row);
    else renderedRows.set(row, options);
    const { text, imgs, imgStates } = extractRenderedEventRow(row);
    const eventHost = row.closest<HTMLElement>("[data-event-id]");
    const eventId = eventHost?.dataset.eventId;
    const rawMsgType = eventHost?.dataset.eventMsgType;
    const msgType = rawMsgType === undefined ? undefined : Number(rawMsgType);
    const rawRoomId = eventHost?.dataset.eventRoomId;
    const roomId = rawRoomId === undefined ? undefined : Number(rawRoomId);
    const animationDurationMs = Number(eventHost?.dataset.eventAnimationDuration);
    const animationExitDurationMs = Number(eventHost?.dataset.eventAnimationExitDuration);
    const eventPadding = Number(eventHost?.dataset.eventPadding);
    const fontFamily = eventHost?.dataset.eventFontFamily;
    const fontLoaded = fontFamily && typeof document !== "undefined" && "fonts" in document
      ? document.fonts.check(`16px "${fontFamily.replace(/"/g, "\\\"")}"`)
      : undefined;
    renderDiagnosticLogger.record({
      action,
      text,
      imgs,
      imgStates,
      sessionId: eventHost?.dataset.eventSessionId,
      connectionId: eventHost?.dataset.eventConnectionId,
      ...(roomId !== undefined && Number.isFinite(roomId) ? { roomId } : {}),
      eventId,
      windowLabel: options.windowLabel,
      region: options.region,
      ...(msgType !== undefined && Number.isFinite(msgType) ? { msgType } : {}),
      eventStyleType: eventHost?.dataset.eventStyleType,
      animationPreset: eventHost?.dataset.eventAnimationPreset,
      ...(Number.isFinite(animationDurationMs) ? { animationDurationMs } : {}),
      ...(Number.isFinite(animationExitDurationMs) ? { animationExitDurationMs } : {}),
      ...(Number.isFinite(eventPadding) ? { eventPadding } : {}),
      fontFamily,
      ...(fontLoaded === undefined ? {} : { fontLoaded }),
      ...(image === undefined ? {} : { imageStatus: image.status, imageIndex: image.index }),
    });
  };
  const onImageState = (event: Event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement)) return;
    const row = image.closest(".event-row");
    if (!row || !seen.has(row) || (event.type !== "load" && event.type !== "error")) return;
    const imageElements = Array.from(row.querySelectorAll<HTMLImageElement>("img"))
      .filter((candidate) => !candidate.className.includes("rounded-full"));
    const index = imageElements.indexOf(image);
    if (index < 0) return;
    record(row, "update", { status: event.type === "load" ? "loaded" : "error", index });
  };
  root.addEventListener("load", onImageState, true);
  root.addEventListener("error", onImageState, true);
  const observer = new MutationObserver((mutations) => {
    const rows = new Map<Element, "new" | "update" | "remove">();
    for (const mutation of mutations) {
      if (mutation.type === "childList") {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const addedRows = [
            ...(node.classList.contains("event-row") ? [node] : []),
            ...Array.from(node.querySelectorAll(".event-row")),
          ];
          for (const row of addedRows) {
            if (!seen.has(row)) {
              seen.add(row);
              rows.set(row, "new");
            }
          }
        }
        for (const node of mutation.removedNodes) {
          if (!(node instanceof Element)) continue;
          const removedRows = [
            ...(node.classList.contains("event-row") ? [node] : []),
            ...Array.from(node.querySelectorAll(".event-row")),
          ];
          for (const row of removedRows) {
            if (seen.has(row)) rows.set(row, "remove");
          }
        }
      } else {
        const target = mutation.target instanceof Element ? mutation.target : mutation.target.parentElement;
        const row = target?.closest(".event-row");
        if (row && !rows.has(row) && seen.has(row)) rows.set(row, "update");
      }
    }
    for (const [row, action] of rows) {
      record(row, action);
      if (action === "remove") seen.delete(row);
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  // useEffect 在 React 提交初始 DOM 后才运行；先记录已经存在的行，避免首批事件只因
  // 观察器挂载时机而缺失。后续新增、合并和图片替换仍由 MutationObserver 记录。
  for (const row of Array.from(root.querySelectorAll(".event-row"))) {
    seen.add(row);
    record(row, "new");
  }
  return () => {
    observer.disconnect();
    root.removeEventListener("load", onImageState, true);
    root.removeEventListener("error", onImageState, true);
  };
}
