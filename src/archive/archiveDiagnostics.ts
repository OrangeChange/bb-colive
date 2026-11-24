import {
  recordFeatureDiagnostic,
  recordFeatureStreamDiagnostic,
} from "../diagnostics/featureDiagnostics.ts";
import type { FeatureDiagnosticStage } from "../diagnostics/featureCatalog.ts";

const MAX_SAMPLE_REFS = 8;
const MAX_COUNTED_ACTION_STAGES = 4096;

export interface ArchiveDiagnosticActionSummary {
  requested: number;
  succeeded: number;
  failed: number;
  canceled: number;
  lastCount: number | null;
  lastPathProvided: boolean | null;
}

export interface ArchiveDiagnosticSnapshot {
  version: 1;
  source: {
    rawEventCount: number;
    sampleRefs: string[];
  };
  projected: {
    count: number;
    sampleRefs: string[];
  };
  render: {
    count: number;
    sampleRefs: string[];
  };
  review: {
    route: string | null;
    query: {
      hasSearchText: boolean;
      filterKeys: string[];
      searchScope: string;
    };
    sort: {
      field: string | null;
      direction: string | null;
    };
    ownerMode: "sessions" | "events" | null;
    ownerSessionFilters: { activeKeys: string[] };
    ownerEventSearch: {
      activeFilterKeys: string[];
      groupCount: number;
      matchCount: number;
      durationMs: number;
    };
    ownerEventResultNavigation: { count: number; lastTargetFound: boolean | null };
    readingEventKey: string | null;
    projectedCount: number;
    renderCount: number;
    sampleRefs: string[];
  };
  actions: {
    favorite: ArchiveDiagnosticActionSummary;
    nickname: ArchiveDiagnosticActionSummary;
    import: ArchiveDiagnosticActionSummary;
    export: ArchiveDiagnosticActionSummary;
    delete: ArchiveDiagnosticActionSummary;
  };
}

export interface ArchiveDiagnosticContext {
  archiveId?: string;
  sessionId?: string;
  roomId?: string | number;
  eventId?: string;
  requestId?: string;
  connectionId?: string;
  sourceRef?: string;
  renderRef?: string;
  stream?: "source" | "render";
  windowLabel?: string;
  count?: number;
  pathProvided?: boolean;
  data?: Record<string, string | number | boolean | null>;
}

interface MutableArchiveDiagnosticSnapshot extends ArchiveDiagnosticSnapshot {}

function emptyAction(): ArchiveDiagnosticActionSummary {
  return {
    requested: 0,
    succeeded: 0,
    failed: 0,
    canceled: 0,
    lastCount: null,
    lastPathProvided: null,
  };
}

function createSnapshot(): MutableArchiveDiagnosticSnapshot {
  return {
    version: 1,
    source: { rawEventCount: 0, sampleRefs: [] },
    projected: { count: 0, sampleRefs: [] },
    render: { count: 0, sampleRefs: [] },
    review: {
      route: null,
      query: { hasSearchText: false, filterKeys: [], searchScope: "session" },
      sort: { field: null, direction: null },
      ownerMode: null,
      ownerSessionFilters: { activeKeys: [] },
      ownerEventSearch: { activeFilterKeys: [], groupCount: 0, matchCount: 0, durationMs: 0 },
      ownerEventResultNavigation: { count: 0, lastTargetFound: null },
      readingEventKey: null,
      projectedCount: 0,
      renderCount: 0,
      sampleRefs: [],
    },
    actions: {
      favorite: emptyAction(),
      nickname: emptyAction(),
      import: emptyAction(),
      export: emptyAction(),
      delete: emptyAction(),
    },
  };
}

let snapshot = createSnapshot();
let requestSequence = 0;
const countedActionStages = new Set<string>();

export function createArchiveRequestId(action: string): string {
  requestSequence += 1;
  return `archive-${action}-${Date.now()}-${requestSequence}`;
}

function addSample(target: string[], refs: readonly string[]): void {
  for (const ref of refs) {
    if (!ref || target.includes(ref)) continue;
    target.push(ref);
    if (target.length > MAX_SAMPLE_REFS) target.splice(0, target.length - MAX_SAMPLE_REFS);
  }
}

function sampleRefList(ref: string | undefined): string[] {
  return ref ? [ref] : [];
}

function actionKey(action: string): keyof ArchiveDiagnosticSnapshot["actions"] | null {
  if (action.includes("favorite")) return "favorite";
  if (action.includes("nickname")) return "nickname";
  if (action.includes("import")) return "import";
  if (action.includes("export")) return "export";
  if (action.includes("delete")) return "delete";
  return null;
}

function updateActionSummary(
  action: string,
  stage: FeatureDiagnosticStage,
  outcome: string,
  requestId: string | undefined,
  count: number | undefined,
  pathProvided: boolean | undefined,
): void {
  const key = actionKey(action);
  if (!key) return;
  if (requestId) {
    const stageKey = `${requestId}:${stage}`;
    if (countedActionStages.has(stageKey)) return;
    countedActionStages.add(stageKey);
    if (countedActionStages.size > MAX_COUNTED_ACTION_STAGES) {
      const oldest = countedActionStages.values().next().value as string | undefined;
      if (oldest) countedActionStages.delete(oldest);
    }
  }
  const target = snapshot.actions[key];
  if (stage === "request") target.requested += 1;
  if (stage === "success") target.succeeded += 1;
  if (stage === "failure" || outcome === "failed") target.failed += 1;
  if (stage === "cancel" || outcome === "canceled") target.canceled += 1;
  if (count !== undefined && Number.isFinite(count)) target.lastCount = count;
  if (pathProvided !== undefined) target.lastPathProvided = pathProvided;
}

export function recordArchiveDiagnostic(
  stage: FeatureDiagnosticStage,
  action: string,
  outcome: string,
  context: ArchiveDiagnosticContext = {},
): void {
  const sourceRef = context.sourceRef ?? (stage === "failure" ? `archive-source:${action}` : undefined);
  const renderRef = context.renderRef ?? (stage === "failure" ? `archive-render:${action}` : undefined);
  const data = {
    ...(context.data ?? {}),
    ...(context.archiveId === undefined ? {} : { archiveId: context.archiveId }),
    ...(context.sessionId === undefined ? {} : { sessionId: context.sessionId }),
    ...(context.roomId === undefined ? {} : { roomId: context.roomId }),
    ...(sourceRef === undefined ? {} : { sourceRef }),
    ...(renderRef === undefined ? {} : { renderRef }),
    ...(context.count === undefined ? {} : { count: context.count }),
    ...(context.pathProvided === undefined ? {} : { pathProvided: context.pathProvided }),
  };

  recordFeatureDiagnostic({
    featureId: "review-archive",
    stage,
    action,
    outcome,
    eventId: context.eventId,
    requestId: context.requestId,
    data,
  });
  if (context.stream) {
    recordFeatureStreamDiagnostic({
      featureId: "review-archive",
      stream: context.stream,
      stage,
      action,
      outcome,
      sessionId: context.sessionId,
      eventId: context.eventId,
      connectionId: context.connectionId,
      roomId: context.roomId,
      windowLabel: context.windowLabel,
      data,
    });
  }
  updateActionSummary(action, stage, outcome, context.requestId, context.count, context.pathProvided);
}

export function recordArchiveSourceEvent(sampleRef: string): void {
  snapshot.source.rawEventCount += 1;
  addSample(snapshot.source.sampleRefs, sampleRefList(sampleRef));
}

export function recordArchiveProjection(count: number, sampleRefs: readonly string[] = []): void {
  snapshot.projected.count = Math.max(0, count);
  snapshot.review.projectedCount = snapshot.projected.count;
  addSample(snapshot.projected.sampleRefs, sampleRefs);
  addSample(snapshot.review.sampleRefs, sampleRefs);
}

export function recordArchiveRender(count: number, sampleRefs: readonly string[] = []): void {
  snapshot.render.count = Math.max(0, count);
  snapshot.review.renderCount = snapshot.render.count;
  addSample(snapshot.render.sampleRefs, sampleRefs);
  addSample(snapshot.review.sampleRefs, sampleRefs);
}

export interface ArchiveReviewDiagnosticState {
  route?: string | null;
  hasSearchText?: boolean;
  filterKeys?: readonly string[];
  searchScope?: string;
  sortField?: string | null;
  sortDirection?: string | null;
  ownerMode?: "sessions" | "events" | null;
  ownerSessionFilterKeys?: readonly string[];
  ownerEventFilterKeys?: readonly string[];
  ownerEventSearch?: { groupCount: number; matchCount: number; durationMs: number };
  ownerEventResultFound?: boolean;
  readingEventKey?: string | null;
}

export function updateArchiveReviewState(state: ArchiveReviewDiagnosticState): void {
  if (state.route !== undefined) snapshot.review.route = state.route;
  if (state.hasSearchText !== undefined) snapshot.review.query.hasSearchText = state.hasSearchText;
  if (state.filterKeys !== undefined) snapshot.review.query.filterKeys = [...state.filterKeys].sort();
  if (state.searchScope !== undefined) snapshot.review.query.searchScope = state.searchScope;
  if (state.sortField !== undefined) snapshot.review.sort.field = state.sortField;
  if (state.sortDirection !== undefined) snapshot.review.sort.direction = state.sortDirection;
  if (state.ownerMode !== undefined) snapshot.review.ownerMode = state.ownerMode;
  if (state.ownerSessionFilterKeys !== undefined) {
    snapshot.review.ownerSessionFilters.activeKeys = [...state.ownerSessionFilterKeys].sort();
  }
  if (state.ownerEventFilterKeys !== undefined) {
    snapshot.review.ownerEventSearch.activeFilterKeys = [...state.ownerEventFilterKeys].sort();
  }
  if (state.ownerEventSearch !== undefined) {
    snapshot.review.ownerEventSearch.groupCount = Math.max(0, state.ownerEventSearch.groupCount);
    snapshot.review.ownerEventSearch.matchCount = Math.max(0, state.ownerEventSearch.matchCount);
    snapshot.review.ownerEventSearch.durationMs = Math.max(0, state.ownerEventSearch.durationMs);
  }
  if (state.ownerEventResultFound !== undefined) {
    snapshot.review.ownerEventResultNavigation.count += 1;
    snapshot.review.ownerEventResultNavigation.lastTargetFound = state.ownerEventResultFound;
  }
  if (state.readingEventKey !== undefined) snapshot.review.readingEventKey = state.readingEventKey;
}

export function getArchiveDiagnosticSnapshot(): ArchiveDiagnosticSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ArchiveDiagnosticSnapshot;
}

/** 测试隔离使用；不用于运行时清空用户诊断记录。 */
export function resetArchiveDiagnosticSnapshot(): void {
  snapshot = createSnapshot();
  countedActionStages.clear();
}
