import { emitTo, listen } from "@tauri-apps/api/event";
import { getAllWindows } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { DiagnosticRecordInput, DiagnosticFlushResult } from "./diagnosticTypes.ts";
import type { RenderDiagnosticInput, RenderFeatureDiagnosticInput } from "./renderLogger.ts";

import { EVENT_WINDOW_LABELS, isEventWindowKind, type EventWindowKind } from '../windows/eventWindowChannels.ts';
type WindowLabel = EventWindowKind;
export type WindowDiagnosticMessage =
  | { kind: "app"; windowLabel: WindowLabel; input: DiagnosticRecordInput }
  | { kind: "render"; windowLabel: WindowLabel; input: RenderDiagnosticInput | RenderFeatureDiagnosticInput };
type Submission = WindowDiagnosticMessage & { instanceId: string; submission: number; previousSubmission: number };
interface WindowFlushed {
  requestId: string;
  windowLabel: WindowLabel;
  instanceId: string;
  boundary: number;
  complete: boolean;
  droppedRecords: number;
}
export interface WindowDiagnosticFlushResult {
  requestId: string;
  complete: boolean;
  incompleteWindows: string[];
}
interface Transport {
  listen: <T>(channel: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
  emitTo: (label: string, channel: string, payload: unknown) => Promise<unknown>;
}
interface WindowDiagnosticCloseState {
  windowLabel: WindowLabel;
  instanceId: string;
  complete: boolean;
  droppedRecords: number;
}
const RECORD = "diagnostic:window-record";
const FLUSH = "diagnostic:window-flush";
const FLUSHED = "diagnostic:window-flushed";

export function createWindowDiagnosticSender(dependencies: Transport & {
  windowLabel: WindowLabel; instanceId?: string;
  storeCloseState?: (state: WindowDiagnosticCloseState) => Promise<unknown>;
}) {
  const instanceId = dependencies.instanceId ?? `${dependencies.windowLabel}-${crypto.randomUUID()}`;
  let submission = 0;
  let failures = 0;
  let pending = 0;
  let tail: Promise<number> = Promise.resolve(0);
  let installation: Promise<void> | undefined;
  let generation = 0;
  const stops: Array<() => void> = [];
  const drains = new Map<string, (complete: boolean) => void>();
  let nextDrain = 0;
  const submit = (message: WindowDiagnosticMessage) => {
    if (pending >= 1000) { failures++; return; }
    const id = ++submission;
    pending++;
    tail = tail.then(async (previousSubmission) => {
      try {
        await dependencies.emitTo("main", RECORD, { ...message, instanceId, submission: id, previousSubmission } satisfies Submission);
        return id;
      } catch { failures++; return previousSubmission; }
    })
      .finally(() => { pending--; });
  };
  return {
    submitApp(input: DiagnosticRecordInput) { submit({ kind: "app", windowLabel: dependencies.windowLabel, input }); },
    submitRender(input: RenderDiagnosticInput | RenderFeatureDiagnosticInput) { submit({ kind: "render", windowLabel: dependencies.windowLabel, input }); },
    start(): Promise<void> {
      if (installation) return installation;
      const current = ++generation;
      const install = async <T>(channel: string, handler: (event: { payload: T }) => void) => {
        const stop = await dependencies.listen<T>(channel, (event) => { if (current === generation) handler(event); });
        if (current !== generation) stop(); else stops.push(stop);
      };
      installation = Promise.all([install<{ requestId: string }>(FLUSH, ({ payload }) => {
        if (current !== generation) return;
        const submitted = tail;
        void submitted.then((boundary) => dependencies.emitTo("main", FLUSHED, {
          requestId: payload.requestId, windowLabel: dependencies.windowLabel, instanceId,
          boundary, complete: failures === 0, droppedRecords: failures,
        } satisfies WindowFlushed)).catch(() => {});
      }), install<{ requestId: string; complete: boolean }>(FLUSHED, ({ payload }) => {
        drains.get(payload.requestId)?.(payload.complete);
      })]).then(() => {});
      return installation;
    },
    stop() {
      generation++; stops.splice(0).forEach((stop) => stop()); installation = undefined;
      for (const finish of drains.values()) finish(false);
    },
    async drain(): Promise<boolean> {
      const requestId = `window-close-${instanceId}-${++nextDrain}`;
      const submitted = tail;
      const store = async (complete: boolean) => {
        try {
          await dependencies.storeCloseState?.({ windowLabel: dependencies.windowLabel, instanceId, complete, droppedRecords: failures });
          return true;
        } catch { return false; }
      };
      const started = await store(false);
      const complete = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => finish(false), 3000);
        const finish = (complete: boolean) => { clearTimeout(timer); drains.delete(requestId); resolve(complete); };
        drains.set(requestId, finish);
        void submitted.then((boundary) => dependencies.emitTo("main", FLUSH, {
          requestId, windowLabel: dependencies.windowLabel, instanceId,
          boundary, complete: failures === 0, droppedRecords: failures,
        } satisfies WindowFlushed)).catch(() => finish(false));
      });
      const stored = await store(started && complete);
      return started && complete && stored;
    },
  };
}

export function createWindowDiagnosticReceiver(dependencies: Transport & {
  getWindowLabels: () => Promise<string[]>;
  recordApp: (input: DiagnosticRecordInput) => unknown;
  recordRender: (input: RenderDiagnosticInput | RenderFeatureDiagnosticInput) => unknown;
  flushLogs: () => Promise<DiagnosticFlushResult>;
  readCloseStates?: () => Promise<WindowDiagnosticCloseState[]>;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}) {
  const received = new Map<string, { boundary: number; later: Map<number, number> }>();
  const losses = new Map<string, { windowLabel: string; droppedRecords: number }>();
  const closing = new Map<string, WindowFlushed>();
  const closeStates = new Map<string, WindowDiagnosticCloseState>();
  const requests = new Map<string, { labels: string[]; responses: Map<string, WindowFlushed>; finish: (timeout?: boolean) => void }>();
  let nextRequest = 0;
  let installation: Promise<void> | undefined;
  let generation = 0;
  const stops: Array<() => void> = [];
  const setTimer = dependencies.setTimeout ?? setTimeout;
  const clearTimer = dependencies.clearTimeout ?? clearTimeout;
  const hasReceivedBoundary = (response: WindowFlushed) => (received.get(`${response.windowLabel}:${response.instanceId}`)?.boundary ?? 0) >= response.boundary;
  const rememberLoss = (response: WindowDiagnosticCloseState) => {
    if (response.droppedRecords > 0) losses.set(response.instanceId, { windowLabel: response.windowLabel,
      droppedRecords: Math.max(response.droppedRecords, losses.get(response.instanceId)?.droppedRecords ?? 0),
    });
  };
  const finishClosing = () => {
    for (const [requestId, response] of closing) {
      if (!hasReceivedBoundary(response)) continue;
      closing.delete(requestId); rememberLoss(response);
      void dependencies.emitTo(response.windowLabel, FLUSHED, { requestId, complete: response.complete }).catch(() => {});
    }
  };
  const receiver = {
    start(): Promise<void> {
      if (installation) return installation;
      const current = ++generation;
      const install = async <T>(channel: string, callback: (event: { payload: T }) => void) => {
        const stop = await dependencies.listen<T>(channel, (event) => { if (current === generation) callback(event); });
        if (current !== generation) stop(); else stops.push(stop);
      };
      installation = Promise.all([
        install<Submission>(RECORD, ({ payload }) => {
          if (!isEventWindowKind(payload.windowLabel)) return;
          const key = `${payload.windowLabel}:${payload.instanceId}`;
          const state = received.get(key) ?? { boundary: 0, later: new Map<number, number>() };
          if (payload.submission <= state.boundary || state.later.get(payload.previousSubmission) === payload.submission) return;
          const input = { ...payload.input, windowLabel: payload.windowLabel };
          try {
            if (payload.kind === "app") dependencies.recordApp(input as DiagnosticRecordInput);
            else if (payload.kind === "render") dependencies.recordRender(input as RenderDiagnosticInput);
            else return;
          } catch { return; }
          state.later.set(payload.previousSubmission, payload.submission);
          while (state.later.has(state.boundary)) {
            const next = state.later.get(state.boundary)!;
            state.later.delete(state.boundary); state.boundary = next;
          }
          received.set(key, state);
          finishClosing();
          for (const request of requests.values()) request.finish();
        }),
        install<WindowFlushed>(FLUSHED, ({ payload }) => {
          const request = requests.get(payload.requestId);
          if (!request || !request.labels.includes(payload.windowLabel)) return;
          request.responses.set(payload.windowLabel, payload);
          rememberLoss(payload);
          request.finish();
        }),
        install<WindowFlushed>(FLUSH, ({ payload }) => {
          if (!isEventWindowKind(payload.windowLabel)) return;
          closing.set(payload.requestId, payload); finishClosing();
        }),
      ]).then(() => {});
      return installation;
    },
    stop() {
      generation++; stops.splice(0).forEach((stop) => stop()); installation = undefined;
      for (const request of requests.values()) request.finish(true);
    },
    async flushWindows(): Promise<WindowDiagnosticFlushResult> {
      await receiver.start();
      const requestId = `window-flush-${++nextRequest}`;
      try {
        for (const state of await dependencies.readCloseStates?.() ?? []) {
          closeStates.set(state.instanceId, state); rememberLoss(state);
        }
      } catch { return { requestId, complete: false, incompleteWindows: [...EVENT_WINDOW_LABELS] }; }
      let labels: string[];
      try { labels = (await dependencies.getWindowLabels()).filter(isEventWindowKind); }
      catch { return { requestId, complete: false, incompleteWindows: [...EVENT_WINDOW_LABELS] }; }
      const lostWindows = () => [...new Set([
        ...[...losses.values()].map((loss) => loss.windowLabel),
        ...[...closing.values()].filter((response) => !hasReceivedBoundary(response)).map((response) => response.windowLabel),
        ...[...closeStates.values()].filter((state) => !state.complete).map((state) => state.windowLabel),
      ])];
      if (labels.length === 0) {
        const incompleteWindows = lostWindows();
        return { requestId, complete: incompleteWindows.length === 0, incompleteWindows };
      }
      return new Promise((resolve) => {
        const responses = new Map<string, WindowFlushed>();
        const accepted = (label: string) => {
          const response = responses.get(label);
          return response && hasReceivedBoundary(response);
        };
        const complete = (label: string) => Boolean(responses.get(label)?.complete && accepted(label));
        let timer: ReturnType<typeof setTimeout>;
        const finish = (timeout = false) => {
          if (!timeout && !labels.every(accepted)) return;
          clearTimer(timer); requests.delete(requestId);
          const incompleteWindows = [...new Set([...labels.filter((label) => !complete(label)), ...lostWindows()])];
          resolve({ requestId, complete: incompleteWindows.length === 0, incompleteWindows });
        };
        requests.set(requestId, { labels, responses, finish });
        timer = setTimer(() => finish(true), 3000);
        for (const label of labels) {
          void dependencies.emitTo(label, FLUSH, { requestId }).catch(() => {
            responses.set(label, { requestId, windowLabel: label as WindowLabel, instanceId: "", boundary: 0, complete: false, droppedRecords: 0 });
            finish();
          });
        }
      });
    },
    async flush(): Promise<DiagnosticFlushResult> {
      const windowFlush = await receiver.flushWindows();
      const result = await dependencies.flushLogs();
      return { ...result, failed: result.failed + (windowFlush.complete ? 0 : 1),
        droppedRecords: result.droppedRecords + [...losses.values()].reduce((total, loss) => total + loss.droppedRecords, 0), windowFlush };
    },
  };
  return receiver;
}

let activeSender: ReturnType<typeof createWindowDiagnosticSender> | undefined;
let activeReceiver: ReturnType<typeof createWindowDiagnosticReceiver> | undefined;
export function installWindowDiagnosticSender(windowLabel: WindowLabel) {
  activeSender ??= createWindowDiagnosticSender({ windowLabel, emitTo, listen,
    storeCloseState: (state) => invoke("set_window_diagnostic_close_state", { state }),
  });
  return activeSender.start();
}
export function submitWindowAppDiagnostic(input: DiagnosticRecordInput): boolean {
  if (!activeSender) return false;
  activeSender.submitApp(input); return true;
}
export function submitWindowRenderDiagnostic(input: RenderDiagnosticInput | RenderFeatureDiagnosticInput): boolean {
  if (!activeSender) return false;
  activeSender.submitRender(input); return true;
}
export function installWindowDiagnosticReceiver(dependencies: {
  recordApp: (input: DiagnosticRecordInput) => unknown;
  recordRender: (input: RenderDiagnosticInput | RenderFeatureDiagnosticInput) => unknown;
  flushLogs: () => Promise<DiagnosticFlushResult>;
}) {
  activeReceiver ??= createWindowDiagnosticReceiver({ ...dependencies, emitTo, listen,
    getWindowLabels: async () => (await getAllWindows()).map((window) => window.label),
    readCloseStates: () => invoke<WindowDiagnosticCloseState[]>("read_window_diagnostic_close_states"),
  });
  return activeReceiver.start();
}
export async function flushWindowDiagnosticLogs(): Promise<DiagnosticFlushResult> {
  if (!activeReceiver) throw new Error("副窗口诊断接收入口未安装");
  return activeReceiver.flush();
}
export async function drainWindowDiagnosticSubmissions(): Promise<boolean> { return await activeSender?.drain() ?? true; }
export function stopWindowDiagnosticBridge() { activeSender?.stop(); activeReceiver?.stop(); }
