import { uiText } from "../i18n/index.ts";
import { ARCHIVE_SCHEMA_VERSION } from "./archiveSchema.ts";
import { readArchiveCloudMetadata } from './archiveCloudMetadata.ts';
import { normalizeArchiveSessionState } from './archiveSessionState.ts';
import { recordArchiveDiagnostic } from "./archiveDiagnostics.ts";
import type {
  ArchiveArchiveBundle,
  ArchiveDeletePreview,
  ArchiveDeleteScope,
  ArchiveEventRecord,
  ArchiveExportEvent,
  ArchiveExportSession,
  ArchiveExportSnapshot,
  ArchiveFavoriteExport,
  ArchiveImportCounts,
  ArchiveImportPlan,
  ArchiveImportPreview,
  ArchiveImportResult,
  ArchiveNicknameExport,
  ArchiveReadingState,
  ArchiveRepositoryContract,
  ArchiveSessionImportPatch,
  ArchiveTransferScope,
} from "./archiveTypes.ts";
import type { ArchiveTransferControls } from "./archiveWriter.ts";
import { collectArchiveResourceUrls, isArchiveResourceUrl } from "./archiveResourceUrls.ts";

export const ARCHIVE_TRANSFER_FORMAT = "danmu-archive" as const;
export const ARCHIVE_TRANSFER_FORMAT_VERSION = 1 as const;

const SUPPORTED_ARCHIVE_SCHEMA_VERSIONS = new Set([
  ARCHIVE_SCHEMA_VERSION,
  ARCHIVE_SCHEMA_VERSION - 1,
  ARCHIVE_SCHEMA_VERSION - 2,
  4,
  5,
  6,
]);

function isSupportedArchiveSchemaVersion(value: unknown): value is number {
  return typeof value === "number" && SUPPORTED_ARCHIVE_SCHEMA_VERSIONS.has(value);
}

export interface ArchiveWriterFlushResult {
  pending?: number;
  failed?: number;
}

export interface ArchiveTransferRepository extends Pick<
  ArchiveRepositoryContract,
  "getTransferSnapshot" | "getSession" | "getEvent" | "getDeletePreview" | "deleteArchive" | "commitArchiveImport"
> {}

export interface ArchiveTransferServiceOptions {
  repository: ArchiveTransferRepository;
  flushArchiveWriter?: () => Promise<ArchiveWriterFlushResult | void>;
  runArchiveTransfer?: <T>(
    operation: (controls: ArchiveTransferControls) => Promise<T> | T,
  ) => Promise<T>;
  now?: () => number;
}

export interface ArchiveOperationOptions {
  requestId?: string;
}

interface PendingImport {
  plan: ArchiveImportPlan;
}

interface PendingDelete {
  scope: ArchiveDeleteScope;
  sessionIds: string[];
  sessionSnapshots: ArchiveDeletePreview["sessionSnapshots"];
  blockedSessionCount: number;
  blockedSessionIds: string[];
  blockedSessionStates: ArchiveDeletePreview["blockedSessionStates"];
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(uiText("archiveTransfer.requireString", { label: label }));
  }
  return value;
}

function requireFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(uiText("archiveTransfer.requireFiniteNumber", { label: label }));
  }
  return value;
}

function requireCount(value: unknown, label: string): number {
  const count = requireFiniteNumber(value, label);
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(uiText("archiveTransfer.requireCount", { label: label }));
  }
  return count;
}

function asNullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return requireString(value, label);
}

function normalizeTagNames(value: unknown, label: string): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(uiText("archiveTransfer.normalizeTagNames", { label: label }));
  const names = value.map((item, index) => requireString(item, `${label}[${index}]`).trim()).filter(Boolean);
  return [...new Set(names)];
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function resourceUrlsForSnapshot(snapshot: ArchiveExportSnapshot): string[] {
  const urls = new Set<string>();
  collectArchiveResourceUrls(snapshot.owners, urls);
  for (const entry of snapshot.sessions) {
    collectArchiveResourceUrls(entry.session, urls);
    for (const event of entry.events) collectArchiveResourceUrls(event.payloadJson, urls);
  }
  collectArchiveResourceUrls(snapshot.historicalFavorites, urls);
  return [...urls].sort();
}

function sourceSummaryForSnapshot(snapshot: ArchiveExportSnapshot) {
  const sourceIds = new Set<string>();
  let missingCount = 0;
  for (const entry of snapshot.sessions) {
    for (const event of entry.events) {
      if (event.sourceId) sourceIds.add(event.sourceId);
      else missingCount += 1;
    }
  }
  return {
    sourceCount: sourceIds.size,
    missingCount,
    conflictCount: 0,
  } as const;
}

function decodeBundleInput(input: unknown): UnknownRecord {
  let value: unknown = input;
  if (input instanceof Uint8Array) {
    value = JSON.parse(new TextDecoder().decode(input));
  } else if (typeof input === "string") {
    value = JSON.parse(input);
  }
  if (!isRecord(value)) throw new Error(uiText("archiveTransfer.decodeBundleInput"));
  return value;
}

function normalizeStatus(value: unknown, label: string): ArchiveExportSession["session"]["status"] {
  const status = requireString(value, label);
  if (status !== "active" && status !== "ended" && status !== "unclean") {
    throw new Error(uiText("archiveTransfer.normalizeStatus", { label: label }));
  }
  return status;
}

function normalizeQuality(value: unknown, label: string): ArchiveExportSession["session"]["quality"] {
  const quality = requireString(value, label);
  if (quality !== "in-progress" && quality !== "complete" && quality !== "incomplete") {
    throw new Error(uiText("archiveTransfer.normalizeQuality", { label: label }));
  }
  return quality;
}

function normalizeRecordingStatus(value: unknown): ArchiveExportSession['session']['recordingStatus'] {
  if (value === undefined) return undefined;
  if (value === 'recording' || value === 'reconnecting' || value === 'stopped') return value;
  throw new Error(uiText("archiveTransfer.normalizeRecordingStatus"));
}

function normalizeQualityReasons(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some(reason => typeof reason !== 'string')) {
    throw new Error(uiText("archiveTransfer.normalizeQualityReasons"));
  }
  return value as string[];
}

function normalizeReadingState(
  value: unknown,
  sessionId: string,
  eventKeys: ReadonlySet<string>,
): ArchiveReadingState | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || value.sessionId !== sessionId) {
    throw new Error(uiText("archiveTransfer.normalizeReadingState", { sessionId: sessionId }));
  }
  const eventKey = value.eventKey === null || value.eventKey === undefined
    ? null
    : requireString(value.eventKey, `readingState(${sessionId}).eventKey`);
  if (eventKey !== null && !eventKeys.has(eventKey)) {
    throw new Error(uiText("archiveTransfer.normalizeReadingState2", { sessionId: sessionId }));
  }
  const fallbackEventTs = value.fallbackEventTs === null || value.fallbackEventTs === undefined
    ? null
    : requireFiniteNumber(value.fallbackEventTs, `readingState(${sessionId}).fallbackEventTs`);
  const sortDirection = requireString(value.sortDirection, `readingState(${sessionId}).sortDirection`);
  if (sortDirection !== "asc" && sortDirection !== "desc") throw new Error(uiText("archiveTransfer.normalizeReadingState3", { sessionId: sessionId }));
  const searchScope = requireString(value.searchScope, `readingState(${sessionId}).searchScope`);
  if (searchScope !== "session" && searchScope !== "owner" && searchScope !== "all") {
    throw new Error(uiText("archiveTransfer.normalizeReadingState4", { sessionId: sessionId }));
  }
  if (!isRecord(value.filters)) throw new Error(uiText("archiveTransfer.normalizeReadingState5", { sessionId: sessionId }));
  return {
    sessionId,
    eventKey,
    fallbackEventTs,
    sortDirection,
    filters: value.filters as ArchiveReadingState["filters"],
    searchScope,
    updatedAt: requireFiniteNumber(value.updatedAt, `readingState(${sessionId}).updatedAt`),
  };
}

function validateEvent(event: UnknownRecord, session: UnknownRecord, seenKeys: Set<string>): ArchiveExportEvent {
  const eventKey = requireString(event.eventKey, "event.eventKey");
  if (seenKeys.has(eventKey)) throw new Error(uiText("archiveTransfer.validateEvent", { eventKey: eventKey }));
  seenKeys.add(eventKey);
  const sessionId = requireString(event.sessionId, `event(${eventKey}).sessionId`);
  if (sessionId !== session.sessionId) throw new Error(uiText("archiveTransfer.validateEvent2", { eventKey: eventKey }));
  const roomId = requireFiniteNumber(event.roomId, `event(${eventKey}).roomId`);
  if (roomId !== session.roomId) throw new Error(uiText("archiveTransfer.validateEvent3", { eventKey: eventKey }));
  const payloadJson = requireString(event.payloadJson, `event(${eventKey}).payloadJson`);
  try {
    const payload = JSON.parse(payloadJson) as unknown;
    if (!isRecord(payload)) throw new Error(uiText("archiveTransfer.validateEvent4"));
  } catch (error) {
    throw new Error(uiText("archiveTransfer.validateEvent5", { eventKey: eventKey, value: error instanceof Error ? error.message : String(error) }));
  }
  return {
    eventKey,
    sessionId,
    roomId,
    ordinal: requireFiniteNumber(event.ordinal, `event(${eventKey}).ordinal`),
    eventTs: requireFiniteNumber(event.eventTs, `event(${eventKey}).eventTs`),
    primaryCategory: requireString(event.primaryCategory, `event(${eventKey}).primaryCategory`),
    secondaryCategory: asNullableString(event.secondaryCategory, `event(${eventKey}).secondaryCategory`),
    userUid: asNullableString(event.userUid, `event(${eventKey}).userUid`),
    userName: asNullableString(event.userName, `event(${eventKey}).userName`),
    searchText: typeof event.searchText === "string" ? event.searchText : "",
    payloadJson,
    sourceId: asNullableString(event.sourceId, `event(${eventKey}).sourceId`),
  };
}

function normalizeBundle(input: unknown): ArchiveArchiveBundle {
  const root = decodeBundleInput(input);
  if (root.format !== ARCHIVE_TRANSFER_FORMAT) throw new Error(uiText("archiveTransfer.normalizeBundle"));
  if (root.formatVersion !== ARCHIVE_TRANSFER_FORMAT_VERSION) throw new Error(uiText("archiveTransfer.normalizeBundle2"));
  const sourceSchemaVersion = root.schemaVersion;
  if (!isSupportedArchiveSchemaVersion(sourceSchemaVersion)) throw new Error(uiText("archiveTransfer.normalizeBundle3"));
  if (root.manifest === undefined || !isRecord(root.manifest)) throw new Error(uiText("archiveTransfer.normalizeBundle4"));
  if (root.manifest.format !== ARCHIVE_TRANSFER_FORMAT || root.manifest.formatVersion !== ARCHIVE_TRANSFER_FORMAT_VERSION) {
    throw new Error(uiText("archiveTransfer.normalizeBundle5"));
  }
  if (root.manifest.schemaVersion !== sourceSchemaVersion) throw new Error(uiText("archiveTransfer.normalizeBundle6"));
  if (!isSupportedArchiveSchemaVersion(sourceSchemaVersion)) throw new Error(uiText("archiveTransfer.normalizeBundle7"));
  if (root.manifest.featureId !== "review-archive" || root.manifest.featureVersion !== 1) {
    throw new Error(uiText("archiveTransfer.normalizeBundle8"));
  }
  const exportedAt = requireFiniteNumber(root.manifest.exportedAt, "manifest.exportedAt");
  const scope = requireString(root.manifest.scope, "manifest.scope");
  if (scope !== "all" && scope !== "owner" && scope !== "session" && scope !== "date" && scope !== "result") {
    throw new Error(uiText("archiveTransfer.normalizeBundle9"));
  }
  if (scope === "result" || root.manifest.restorable !== true) {
    throw new Error(uiText("archiveTransfer.normalizeBundle10"));
  }
  if (!isRecord(root.manifest.resourcePolicy)
    || typeof root.manifest.resourcePolicy.binariesIncluded !== "boolean"
    || typeof root.manifest.resourcePolicy.urlsIncluded !== "boolean"
    || typeof root.manifest.resourcePolicy.cacheStrategy !== "string"
    || root.manifest.resourcePolicy.binariesIncluded !== false
    || root.manifest.resourcePolicy.urlsIncluded !== true
    || root.manifest.resourcePolicy.cacheStrategy !== "cache-first-network-fallback") {
    throw new Error(uiText("archiveTransfer.normalizeBundle11"));
  }
  if (!Array.isArray(root.manifest.resourceUrls)) {
    throw new Error(uiText("archiveTransfer.normalizeBundle12"));
  }
  const manifestResourceUrls = root.manifest.resourceUrls.map((url, index) => {
    const normalized = requireString(url, `manifest.resourceUrls[${index}]`).trim();
    if (!isArchiveResourceUrl(normalized)) throw new Error(uiText("archiveTransfer.normalizeBundle.manifestResourceUrls", { index: index }));
    return normalized;
  });
  if (new Set(manifestResourceUrls).size !== manifestResourceUrls.length) {
    throw new Error(uiText("archiveTransfer.normalizeBundle13"));
  }
  if (!isRecord(root.manifest.sourceSummary)) throw new Error(uiText("archiveTransfer.normalizeBundle14"));
  for (const key of ["sourceCount", "missingCount", "conflictCount"] as const) {
    requireCount(root.manifest.sourceSummary[key], `manifest sourceSummary.${key}`);
  }
  if (!isRecord(root.manifest.counts)) throw new Error(uiText("archiveTransfer.normalizeBundle15"));
  for (const key of ["ownerCount", "sessionCount", "eventCount", "favoriteCount", "nicknameCount", "readingStateCount"] as const) {
    requireCount(root.manifest.counts[key], `manifest counts.${key}`);
  }
  if (!Array.isArray(root.owners) || !Array.isArray(root.sessions) || !Array.isArray(root.nicknames) || !Array.isArray(root.historicalFavorites)) {
    throw new Error(uiText("archiveTransfer.normalizeBundle16"));
  }

  const ownerIds = new Set<string>();
  const ownerRooms = new Set<number>();
  const owners = root.owners.map((value, index) => {
    if (!isRecord(value)) throw new Error(uiText("archiveTransfer.normalizeBundle.owners", { index: index }));
    const ownerId = requireString(value.ownerId, `owners[${index}].ownerId`);
    const roomId = requireFiniteNumber(value.roomId, `owners[${index}].roomId`);
    if (ownerIds.has(ownerId) || ownerRooms.has(roomId)) throw new Error(uiText("archiveTransfer.normalizeBundle.owners2", { ownerId: ownerId }));
    ownerIds.add(ownerId);
    ownerRooms.add(roomId);
    return {
      ownerId,
      roomId,
      uid: asNullableString(value.uid, `owners[${index}].uid`),
      name: asNullableString(value.name, `owners[${index}].name`),
      avatarUrl: asNullableString(value.avatarUrl, `owners[${index}].avatarUrl`),
      createdAt: requireFiniteNumber(value.createdAt, `owners[${index}].createdAt`),
      updatedAt: requireFiniteNumber(value.updatedAt, `owners[${index}].updatedAt`),
    };
  });

  const sessionIds = new Set<string>();
  const seenEventKeys = new Set<string>();
  const sessions: ArchiveExportSession[] = root.sessions.map((value, index) => {
    if (!isRecord(value) || !isRecord(value.session) || !Array.isArray(value.events) || !Array.isArray(value.favorites)) {
      throw new Error(uiText("archiveTransfer.normalizeBundle.sessions", { index: index }));
    }
    const rawSession = value.session;
    const sessionId = requireString(rawSession.sessionId, `sessions[${index}].session.sessionId`);
    if (sessionIds.has(sessionId)) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions2", { sessionId: sessionId }));
    sessionIds.add(sessionId);
    const ownerId = requireString(rawSession.ownerId, `sessions[${index}].session.ownerId`);
    const ownerForSession = owners.find((item) => item.ownerId === ownerId);
    if (!ownerForSession) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions3", { sessionId: sessionId }));
    const roomId = requireFiniteNumber(rawSession.roomId, `sessions[${index}].session.roomId`);
    if (roomId !== ownerForSession.roomId) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions4", { sessionId: sessionId }));
    const session = normalizeArchiveSessionState({
      sessionId,
      ownerId,
      roomId,
      title: asNullableString(rawSession.title, `session(${sessionId}).title`),
      coverUrl: asNullableString(rawSession.coverUrl, `session(${sessionId}).coverUrl`),
      cloudMetadata: readArchiveCloudMetadata(rawSession.cloudMetadata),
      startedAt: requireFiniteNumber(rawSession.startedAt, `session(${sessionId}).startedAt`),
      endedAt: rawSession.endedAt === null || rawSession.endedAt === undefined ? null : requireFiniteNumber(rawSession.endedAt, `session(${sessionId}).endedAt`),
      status: normalizeStatus(rawSession.status, `session(${sessionId}).status`),
      quality: normalizeQuality(rawSession.quality, `session(${sessionId}).quality`),
      qualityReason: asNullableString(rawSession.qualityReason, `session(${sessionId}).qualityReason`),
      recordingStatus: normalizeRecordingStatus(rawSession.recordingStatus),
      stopReason: rawSession.stopReason === undefined ? undefined : asNullableString(rawSession.stopReason, `session(${sessionId}).stopReason`),
      qualityReasons: normalizeQualityReasons(rawSession.qualityReasons),
      latestTitle: asNullableString(rawSession.latestTitle, `session(${sessionId}).latestTitle`),
      titleSource: rawSession.titleSource as ArchiveExportSession['session']['titleSource'],
      liveKey: asNullableString(rawSession.liveKey, `session(${sessionId}).liveKey`),
      subSessionKey: asNullableString(rawSession.subSessionKey, `session(${sessionId}).subSessionKey`),
      sourceLiveStartedAt: rawSession.sourceLiveStartedAt == null ? null : requireFiniteNumber(rawSession.sourceLiveStartedAt, `session(${sessionId}).sourceLiveStartedAt`),
      identityEvidence: rawSession.identityEvidence as ArchiveExportSession['session']['identityEvidence'],
      eventCount: requireCount(rawSession.eventCount ?? 0, `session(${sessionId}).eventCount`),
      paidTotal: requireFiniteNumber(rawSession.paidTotal ?? 0, `session(${sessionId}).paidTotal`),
      favoriteCount: requireCount(rawSession.favoriteCount ?? 0, `session(${sessionId}).favoriteCount`),
      createdAt: requireFiniteNumber(rawSession.createdAt, `session(${sessionId}).createdAt`),
      updatedAt: requireFiniteNumber(rawSession.updatedAt, `session(${sessionId}).updatedAt`),
    });
    const ordinals = new Set<number>();
    const events = value.events.map((item, eventIndex) => {
      if (!isRecord(item)) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions.events", { index: index, eventIndex: eventIndex }));
      const normalized = validateEvent(item, rawSession, seenEventKeys);
      if (ordinals.has(normalized.ordinal)) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions.events2", { sessionId: sessionId }));
      ordinals.add(normalized.ordinal);
      return normalized;
    });
    const eventKeys = new Set(events.map((item) => item.eventKey));
    const favoriteKeys = new Set<string>();
    const favorites: ArchiveFavoriteExport[] = value.favorites.map((item, favoriteIndex) => {
      if (!isRecord(item)) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions.favorites", { index: index, favoriteIndex: favoriteIndex }));
      const eventKey = requireString(item.eventKey, `favorites[${favoriteIndex}].eventKey`);
      if (!eventKeys.has(eventKey)) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions.favorites2", { eventKey: eventKey }));
      if (favoriteKeys.has(eventKey)) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions.favorites3", { sessionId: sessionId, eventKey: eventKey }));
      favoriteKeys.add(eventKey);
      return {
        eventKey,
        sessionId: requireString(item.sessionId, `favorites[${favoriteIndex}].sessionId`),
        favoritedAt: requireFiniteNumber(item.favoritedAt, `favorites[${favoriteIndex}].favoritedAt`),
        note: typeof item.note === "string" ? item.note.trim() : "",
        tags: normalizeTagNames(item.tags, `favorites[${favoriteIndex}].tags`),
      };
    });
    for (const favorite of favorites) {
      if (favorite.sessionId !== sessionId) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions5", { eventKey: favorite.eventKey }));
    }
    if (session.eventCount !== events.length) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions6", { sessionId: sessionId }));
    if (session.favoriteCount !== favorites.length) throw new Error(uiText("archiveTransfer.normalizeBundle.sessions7", { sessionId: sessionId }));
    const readingState = normalizeReadingState(value.readingState, sessionId, eventKeys);
    return { session, events, favorites, readingState };
  });

  const nicknameUids = new Set<string>();
  const nicknames: ArchiveNicknameExport[] = root.nicknames.map((value, index) => {
    if (!isRecord(value)) throw new Error(uiText("archiveTransfer.normalizeBundle.nicknames", { index: index }));
    const userUid = requireString(value.userUid, `nicknames[${index}].userUid`);
    if (nicknameUids.has(userUid)) throw new Error(uiText("archiveTransfer.normalizeBundle.nicknames2", { userUid: userUid }));
    nicknameUids.add(userUid);
    return {
      userUid,
      nickname: asNullableString(value.nickname, `nicknames[${index}].nickname`),
      updatedAt: requireFiniteNumber(value.updatedAt, `nicknames[${index}].updatedAt`),
    };
  });

  const historicalFavorites = root.historicalFavorites.map((value, index) => {
    if (!isRecord(value)) throw new Error(uiText("archiveTransfer.normalizeBundle.historicalFavorites", { index: index }));
    return {
      legacyKey: requireString(value.legacyKey, `historicalFavorites[${index}].legacyKey`),
      roomId: requireFiniteNumber(value.roomId, `historicalFavorites[${index}].roomId`),
      eventId: requireString(value.eventId, `historicalFavorites[${index}].eventId`),
      event: (() => {
        if (!isRecord(value.event)) throw new Error(uiText("archiveTransfer.normalizeBundle.historicalFavorites.event", { index: index }));
        return value.event as unknown as ArchiveArchiveBundle["historicalFavorites"][number]["event"];
      })(),
      favoritedAt: requireFiniteNumber(value.favoritedAt, `historicalFavorites[${index}].favoritedAt`),
      label: requireString(value.label, `historicalFavorites[${index}].label`),
      note: typeof value.note === "string" ? value.note.trim() : "",
      tags: normalizeTagNames(value.tags, `historicalFavorites[${index}].tags`),
    };
  });
  const resourceUrls = resourceUrlsForSnapshot({ owners, sessions, nicknames, historicalFavorites });
  if (!sameStringSet(manifestResourceUrls, resourceUrls)) {
    throw new Error(uiText("archiveTransfer.normalizeBundle17"));
  }
  const actualCounts = {
    ownerCount: owners.length,
    sessionCount: sessions.length,
    eventCount: sessions.reduce((total, entry) => total + entry.events.length, 0),
    favoriteCount: sessions.reduce((total, entry) => total + entry.favorites.length, 0),
    nicknameCount: nicknames.length,
    readingStateCount: sessions.filter((entry) => entry.readingState !== null).length,
  };
  const actualSourceSummary = sourceSummaryForSnapshot({ owners, sessions, nicknames, historicalFavorites });
  if (root.manifest.sourceSummary.sourceCount !== actualSourceSummary.sourceCount
    || root.manifest.sourceSummary.missingCount !== actualSourceSummary.missingCount) {
    throw new Error(uiText("archiveTransfer.normalizeBundle18"));
  }
  for (const key of Object.keys(actualCounts) as Array<keyof typeof actualCounts>) {
    if (root.manifest.counts[key] !== actualCounts[key]) {
      throw new Error(uiText("archiveTransfer.normalizeBundle19", { key: key }));
    }
  }
  return {
    format: ARCHIVE_TRANSFER_FORMAT,
    formatVersion: ARCHIVE_TRANSFER_FORMAT_VERSION,
    schemaVersion: ARCHIVE_SCHEMA_VERSION,
    manifest: {
      ...root.manifest,
      exportedAt,
      scope,
      resourceUrls,
      sourceSummary: {
        ...actualSourceSummary,
        conflictCount: root.manifest.sourceSummary.conflictCount,
      },
      counts: actualCounts,
    } as ArchiveArchiveBundle["manifest"],
    owners,
    sessions,
    nicknames,
    historicalFavorites,
  };
}

function countBundle(bundle: ArchiveArchiveBundle): ArchiveImportCounts {
  return {
    ownerCount: bundle.owners.length,
    sessionCount: bundle.sessions.length,
    imported: 0,
    newEvents: 0,
    skipped: 0,
    completedFields: 0,
    conflicts: 0,
    unmatched: 0,
  };
}

function newPreviewId(prefix: string, now: number, sequence: number): string {
  return `${prefix}-${now}-${sequence}`;
}

function normalizeDeleteScope(scope: ArchiveDeleteScope): ArchiveDeleteScope {
  if (!scope || typeof scope !== "object") throw new Error(uiText("archiveTransfer.normalizeDeleteScope"));
  const hasAll = scope.all === true;
  const hasOwnerAll = scope.ownerAll === true;
  const hasKeepOnlyOwner = typeof scope.keepOnlyOwnerId === "string" && scope.keepOnlyOwnerId.trim() !== "";
  const hasSession = typeof scope.sessionId === "string" && scope.sessionId.trim() !== "";
  const hasSessionIds = scope.sessionIds !== undefined;
  const hasBefore = scope.beforeTs !== undefined;
  const hasFrom = scope.fromTs !== undefined;
  const hasTo = scope.toTs !== undefined;
  const normalizedSessionIds = hasSessionIds
    ? [...new Set(scope.sessionIds?.filter((sessionId) => typeof sessionId === "string" && sessionId.trim() !== "") ?? [])]
    : undefined;
  if (hasSessionIds && normalizedSessionIds?.length === 0) throw new Error(uiText("archiveTransfer.normalizeDeleteScope2"));
  if (hasAll) {
    if (hasOwnerAll || hasKeepOnlyOwner || hasSession || hasSessionIds || hasBefore || hasFrom || hasTo || scope.ownerId !== undefined || scope.ownerUid !== undefined) {
      throw new Error(uiText("archiveTransfer.normalizeDeleteScope3"));
    }
  } else if (hasOwnerAll) {
    if (!scope.ownerId && !scope.ownerUid) throw new Error(uiText("archiveTransfer.normalizeDeleteScope4"));
    if (hasKeepOnlyOwner || hasSession || hasSessionIds || hasBefore || hasFrom || hasTo) throw new Error(uiText("archiveTransfer.normalizeDeleteScope5"));
  } else if (hasKeepOnlyOwner) {
    if (hasSession || hasSessionIds || hasBefore || hasFrom || hasTo || scope.ownerId !== undefined || scope.ownerUid !== undefined) {
      throw new Error(uiText("archiveTransfer.normalizeDeleteScope6"));
    }
  } else if (!hasSession && !hasSessionIds && !hasBefore && !hasFrom && !hasTo) throw new Error(uiText("archiveTransfer.normalizeDeleteScope7"));
  if ((hasSession || hasSessionIds) && (hasBefore || hasFrom || hasTo)) throw new Error(uiText("archiveTransfer.normalizeDeleteScope8"));
  if (hasSession && hasSessionIds) throw new Error(uiText("archiveTransfer.normalizeDeleteScope9"));
  if (hasFrom !== hasTo) throw new Error(uiText("archiveTransfer.normalizeDeleteScope10"));
  if (hasFrom && (typeof scope.fromTs !== "number" || typeof scope.toTs !== "number" || scope.fromTs >= scope.toTs)) {
    throw new Error(uiText("archiveTransfer.normalizeDeleteScope11"));
  }
  for (const [label, value] of [["beforeTs", scope.beforeTs], ["fromTs", scope.fromTs], ["toTs", scope.toTs]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) throw new Error(uiText("archiveTransfer.normalizeDeleteScope12", { label: label }));
  }
  return { ...scope, ...(normalizedSessionIds ? { sessionIds: normalizedSessionIds } : {}) };
}

function normalizeTransferScope(scope: ArchiveTransferScope): ArchiveTransferScope {
  if (!scope || typeof scope !== "object" || typeof scope.kind !== "string") throw new Error(uiText("archiveTransfer.normalizeTransferScope"));
  if (scope.kind === "date") {
    if (!Number.isFinite(scope.fromTs) || !Number.isFinite(scope.toTs) || scope.fromTs >= scope.toTs) {
      throw new Error(uiText("archiveTransfer.normalizeTransferScope2"));
    }
  }
  if (scope.kind === "session" && (!scope.sessionId || scope.sessionId.trim() === "")) throw new Error(uiText("archiveTransfer.normalizeTransferScope3"));
  if (scope.kind === "result" && scope.eventKeys.length === 0) throw new Error(uiText("archiveTransfer.normalizeTransferScope4"));
  return scope;
}

function completedSessionFields(
  existing: ArchiveEventRecord extends never ? never : Record<string, unknown>,
  incoming: ArchiveExportSession["session"],
): ArchiveSessionImportPatch | null {
  const patch: ArchiveSessionImportPatch = { sessionId: incoming.sessionId };
  let count = 0;
  if (!existing.cloudMetadata && incoming.cloudMetadata) {
    patch.cloudMetadata = incoming.cloudMetadata;
    count += 1;
  }
  if ((!existing.title || String(existing.title).trim() === "") && incoming.title) {
    patch.title = incoming.title;
    count += 1;
  }
  if ((!existing.coverUrl || String(existing.coverUrl).trim() === "") && incoming.coverUrl) {
    patch.coverUrl = incoming.coverUrl;
    count += 1;
  }
  if ((existing.endedAt === null || existing.endedAt === undefined) && incoming.endedAt !== null && incoming.endedAt !== undefined) {
    patch.endedAt = incoming.endedAt;
    count += 1;
  }
  if ((!existing.qualityReason || String(existing.qualityReason).trim() === "") && incoming.qualityReason) {
    patch.qualityReason = incoming.qualityReason;
    count += 1;
  }
  const local = normalizeArchiveSessionState(existing as unknown as ArchiveExportSession['session']);
  const reasons = [...new Set([...local.qualityReasons, ...(incoming.qualityReasons ?? [])])];
  if (reasons.length > local.qualityReasons.length) {
    patch.qualityReasons = reasons;
    count += 1;
  }
  return count > 0 ? patch : null;
}

function asArchiveEventInput(event: ArchiveExportEvent): ArchiveExportEvent {
  return cloneJson(event);
}

export class ArchiveTransferService {
  private readonly repository: ArchiveTransferRepository;
  private readonly flushArchiveWriter?: () => Promise<ArchiveWriterFlushResult | void>;
  private readonly runArchiveTransfer?: ArchiveTransferServiceOptions["runArchiveTransfer"];
  private readonly now: () => number;
  private sequence = 0;
  private readonly pendingImports = new Map<string, PendingImport>();
  private readonly pendingDeletes = new Map<string, PendingDelete>();

  constructor(options: ArchiveTransferServiceOptions) {
    this.repository = options.repository;
    this.flushArchiveWriter = options.flushArchiveWriter;
    this.runArchiveTransfer = options.runArchiveTransfer;
    this.now = options.now ?? Date.now;
  }

  private async ensureWriterIdle(): Promise<void> {
    const result = await this.flushArchiveWriter?.();
    if (result && ((result.pending ?? 0) > 0 || (result.failed ?? 0) > 0)) {
      throw new Error(uiText("archiveTransfer.ensureWriterIdle"));
    }
  }

  private async withTransferLock<T>(
    operation: (controls: ArchiveTransferControls) => Promise<T> | T,
  ): Promise<T> {
    if (this.runArchiveTransfer) return this.runArchiveTransfer(operation);
    await this.ensureWriterIdle();
    return operation({ blockSessions: () => undefined });
  }

  async exportArchiveText(scope: ArchiveTransferScope, options: ArchiveOperationOptions = {}): Promise<string> {
    const normalizedScope = normalizeTransferScope(scope);
    recordArchiveDiagnostic("request", "archive-export", "started", {
      requestId: options.requestId,
      stream: "source",
      data: { phase: "start", scope: normalizedScope.kind },
    });
    try {
      return await this.withTransferLock(async () => {
        recordArchiveDiagnostic("request", "archive-export", "started", {
          requestId: options.requestId,
          stream: "source",
          data: { phase: "snapshot", scope: normalizedScope.kind },
        });
        const snapshot = await this.repository.getTransferSnapshot(normalizedScope);
        const scopedSnapshot: ArchiveExportSnapshot = normalizedScope.kind === "result"
          ? filterResultSnapshot(snapshot, normalizedScope.eventKeys)
          : snapshot;
        const normalizedSnapshot = { ...scopedSnapshot, sessions: scopedSnapshot.sessions.map(entry => ({
          ...entry, session: normalizeArchiveSessionState(entry.session),
        })) };
        const favoriteCount = normalizedSnapshot.sessions.reduce((count, item) => count + item.favorites.length, 0);
        const eventCount = normalizedSnapshot.sessions.reduce((count, item) => count + item.events.length, 0);
        const sourceSummary = sourceSummaryForSnapshot(normalizedSnapshot);
        const bundle: ArchiveArchiveBundle = {
          format: ARCHIVE_TRANSFER_FORMAT,
          formatVersion: ARCHIVE_TRANSFER_FORMAT_VERSION,
          schemaVersion: ARCHIVE_SCHEMA_VERSION,
          manifest: {
            format: ARCHIVE_TRANSFER_FORMAT,
            formatVersion: ARCHIVE_TRANSFER_FORMAT_VERSION,
            schemaVersion: ARCHIVE_SCHEMA_VERSION,
            featureId: "review-archive",
            featureVersion: 1,
            exportedAt: this.now(),
            scope: normalizedScope.kind,
            restorable: normalizedScope.kind !== "result",
            sourceSummary,
            resourcePolicy: {
              binariesIncluded: false,
              urlsIncluded: true,
              cacheStrategy: "cache-first-network-fallback",
            },
            resourceUrls: resourceUrlsForSnapshot(normalizedSnapshot),
            counts: {
              ownerCount: normalizedSnapshot.owners.length,
              sessionCount: normalizedSnapshot.sessions.length,
              eventCount,
              favoriteCount,
              nicknameCount: normalizedSnapshot.nicknames.length,
              readingStateCount: normalizedSnapshot.sessions.filter((item) => item.readingState !== null).length,
            },
          },
          owners: normalizedSnapshot.owners,
          sessions: normalizedSnapshot.sessions,
          nicknames: normalizedSnapshot.nicknames,
          historicalFavorites: normalizedSnapshot.historicalFavorites,
        };
        recordArchiveDiagnostic("success", "archive-export", "completed", {
          requestId: options.requestId,
          stream: "source",
          count: eventCount,
          data: {
            phase: "complete",
            ownerCount: bundle.manifest.counts.ownerCount,
            sessionCount: bundle.manifest.counts.sessionCount,
            eventCount,
            sourceCount: sourceSummary.sourceCount,
            missingCount: sourceSummary.missingCount,
          },
        });
        return JSON.stringify(bundle, null, 2);
      });
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-export", "failed", {
        requestId: options.requestId,
        stream: "source",
        data: { phase: "failure", scope: normalizedScope.kind, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async exportArchive(scope: ArchiveTransferScope, options: ArchiveOperationOptions = {}): Promise<Uint8Array> {
    return new TextEncoder().encode(await this.exportArchiveText(scope, options));
  }

  async previewImportArchive(input: unknown, options: ArchiveOperationOptions = {}): Promise<ArchiveImportPreview> {
    recordArchiveDiagnostic("request", "archive-import", "started", {
      requestId: options.requestId,
      stream: "source",
      data: { phase: "preview" },
    });
    try {
      await this.ensureWriterIdle();
      const bundle = normalizeBundle(input);
      const counts = countBundle(bundle);
      const sessionCreates = [] as ArchiveExportSession["session"][];
      const sessionPatches: ArchiveSessionImportPatch[] = [];
      const newEvents: ArchiveExportEvent[] = [];
      const affectedSessionIds = new Set<string>();
      const acceptedSessionIds = new Set<string>();

      for (const entry of bundle.sessions) {
        const existing = await this.repository.getSession(entry.session.sessionId);
        if (!existing) {
          sessionCreates.push({ ...entry.session, recordingStatus: 'stopped',
            status: entry.session.status === 'active' ? 'unclean' : entry.session.status });
          for (const event of entry.events) newEvents.push(asArchiveEventInput(event));
          counts.imported += entry.events.length;
          counts.newEvents += entry.events.length;
          acceptedSessionIds.add(entry.session.sessionId);
          affectedSessionIds.add(entry.session.sessionId);
          continue;
        }
        if (existing.ownerId !== entry.session.ownerId || existing.roomId !== entry.session.roomId) {
          counts.unmatched += 1;
          continue;
        }
        const patch = completedSessionFields(existing as unknown as Record<string, unknown>, entry.session);
        if (patch) {
          sessionPatches.push(patch);
          counts.completedFields += Object.keys(patch).length - 1;
        }
        acceptedSessionIds.add(entry.session.sessionId);
        for (const event of entry.events) {
          const current = await this.repository.getEvent(event.eventKey);
          if (!current) {
            newEvents.push(asArchiveEventInput(event));
            counts.imported += 1;
            counts.newEvents += 1;
            affectedSessionIds.add(entry.session.sessionId);
          } else if (current.sessionId !== event.sessionId || current.roomId !== event.roomId) {
            counts.conflicts += 1;
          } else if (current.payloadJson === event.payloadJson) {
            counts.skipped += 1;
          } else {
            counts.conflicts += 1;
          }
        }
      }

      const previewId = newPreviewId("archive-import", this.now(), ++this.sequence);
      const plan: ArchiveImportPlan = {
        sourceId: newPreviewId("archive-source", this.now(), this.sequence),
        counts,
        owners: cloneJson(bundle.owners),
        sessionCreates: cloneJson(sessionCreates),
        sessionPatches,
        newEvents,
        favorites: bundle.sessions
          .filter((entry) => acceptedSessionIds.has(entry.session.sessionId))
          .flatMap((entry) => entry.favorites),
        nicknames: cloneJson(bundle.nicknames),
        readingStates: bundle.sessions
          .filter((entry) => acceptedSessionIds.has(entry.session.sessionId))
          .flatMap((entry) => entry.readingState ? [entry.readingState] : []),
        historicalFavorites: cloneJson(bundle.historicalFavorites),
        affectedSessionIds: [...affectedSessionIds],
      };
      this.pendingImports.set(previewId, { plan });
      recordArchiveDiagnostic("success", "archive-import", "previewed", {
        requestId: options.requestId,
        stream: "source",
        count: counts.newEvents,
        data: {
          phase: "preview",
          newEvents: counts.newEvents,
          conflicts: counts.conflicts,
          unmatched: counts.unmatched,
        },
      });
      return { previewId, ...counts };
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-import", "failed", {
        requestId: options.requestId,
        stream: "source",
        data: { phase: "preview", error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  cancelImportPreview(previewId: string, requestId?: string): boolean {
    const canceled = this.pendingImports.delete(previewId);
    if (canceled) {
      recordArchiveDiagnostic("cancel", "archive-import", "canceled", {
        requestId,
        stream: "source",
        data: { phase: "preview-dismissed", previewId },
      });
    }
    return canceled;
  }

  async commitImportArchive(
    previewId: string,
    confirmationToken: string,
    options: ArchiveOperationOptions = {},
  ): Promise<ArchiveImportResult> {
    recordArchiveDiagnostic("request", "archive-import", "started", {
      requestId: options.requestId,
      stream: "source",
      data: { phase: "commit" },
    });
    try {
      if (confirmationToken !== previewId) throw new Error(uiText("archiveTransfer.commitImportArchive"));
      const pending = this.pendingImports.get(previewId);
      if (!pending) throw new Error(uiText("archiveTransfer.commitImportArchive2"));
      const result = await this.withTransferLock(() => this.repository.commitArchiveImport(pending.plan));
      this.pendingImports.delete(previewId);
      recordArchiveDiagnostic("success", "archive-import", "committed", {
        requestId: options.requestId,
        stream: "source",
        count: result.imported,
        data: { phase: "commit", conflicts: result.conflicts, skipped: result.skipped },
      });
      return result;
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-import", "failed", {
        requestId: options.requestId,
        stream: "source",
        data: { phase: "commit", error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  async previewDelete(
    scope: ArchiveDeleteScope,
    options: ArchiveOperationOptions = {},
  ): Promise<ArchiveDeletePreview & { previewId: string }> {
    recordArchiveDiagnostic("request", "archive-delete", "started", {
      requestId: options.requestId,
      stream: "source",
      data: { phase: "preview" },
    });
    try {
      const normalized = normalizeDeleteScope(scope);
      const preview = await this.withTransferLock(() => this.repository.getDeletePreview(normalized));
      const previewId = newPreviewId("archive-delete", this.now(), ++this.sequence);
      const result = {
        ...preview,
        previewId,
        ownerCount: preview.ownerCount ?? 0,
        sessionIds: preview.sessionIds ?? [],
        sessionSnapshots: preview.sessionSnapshots ?? [],
        resourceReferenceCount: preview.resourceReferenceCount ?? 0,
        blockedSessionCount: preview.blockedSessionCount ?? 0,
        blockedSessionIds: preview.blockedSessionIds ?? [],
        blockedSessionStates: preview.blockedSessionStates ?? [],
      };
      this.pendingDeletes.set(previewId, {
        scope: cloneJson(normalized),
        sessionIds: [...result.sessionIds],
        sessionSnapshots: cloneJson(result.sessionSnapshots),
        blockedSessionCount: result.blockedSessionCount,
        blockedSessionIds: [...result.blockedSessionIds],
        blockedSessionStates: cloneJson(result.blockedSessionStates),
      });
      recordArchiveDiagnostic("success", "archive-delete", "previewed", {
        requestId: options.requestId,
        stream: "source",
        count: result.eventCount,
        data: { phase: "preview", sessionCount: result.sessionCount, blockedSessionCount: result.blockedSessionCount },
      });
      return result;
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-delete", "failed", {
        requestId: options.requestId,
        stream: "source",
        data: { phase: "preview", error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }

  cancelDeletePreview(previewId: string, requestId?: string): boolean {
    const canceled = this.pendingDeletes.delete(previewId);
    if (canceled) {
      recordArchiveDiagnostic("cancel", "archive-delete", "canceled", {
        requestId,
        stream: "source",
        data: { phase: "preview-dismissed", previewId },
      });
    }
    return canceled;
  }

  async deleteArchive(
    previewId: string,
    confirmationToken: string,
    options: ArchiveOperationOptions = {},
  ): Promise<void> {
    recordArchiveDiagnostic("request", "archive-delete", "started", {
      requestId: options.requestId,
      stream: "source",
      data: { phase: "commit" },
    });
    try {
      if (confirmationToken !== previewId) throw new Error(uiText("archiveTransfer.deleteArchive"));
      const pending = this.pendingDeletes.get(previewId);
      if (!pending) throw new Error(uiText("archiveTransfer.deleteArchive2"));
      await this.withTransferLock(async (controls) => {
        const current = await this.repository.getDeletePreview(pending.scope);
        if (!sameStringSet(current.sessionIds, pending.sessionIds)
          || !sameSessionSnapshots(current.sessionSnapshots, pending.sessionSnapshots)
          || current.blockedSessionCount !== pending.blockedSessionCount
          || !sameStringSet(current.blockedSessionIds, pending.blockedSessionIds)
          || !sameBlockedSessionStates(current.blockedSessionStates, pending.blockedSessionStates)) {
          throw new Error(uiText("archiveTransfer.deleteArchive3"));
        }
        if (current.blockedSessionCount > 0) {
          throw new Error(uiText("archiveTransfer.deleteArchive4"));
        }
        await this.repository.deleteArchive(pending.scope, pending.sessionIds);
        controls.blockSessions(pending.sessionIds, options.requestId);
      });
      this.pendingDeletes.delete(previewId);
      recordArchiveDiagnostic("success", "archive-delete", "deleted", {
        requestId: options.requestId,
        stream: "source",
        count: pending.sessionIds.length,
        data: { phase: "commit", sessionCount: pending.sessionIds.length },
      });
    } catch (error) {
      recordArchiveDiagnostic("failure", "archive-delete", "failed", {
        requestId: options.requestId,
        stream: "source",
        data: { phase: "commit", error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
  }
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((value) => rightSet.has(value));
}

function sameBlockedSessionStates(
  left: ArchiveDeletePreview["blockedSessionStates"],
  right: ArchiveDeletePreview["blockedSessionStates"],
): boolean {
  const normalize = (items: ArchiveDeletePreview["blockedSessionStates"]) => items
    .map((item) => `${item.sessionId}\u0000${item.status}\u0000${item.recordingStatus ?? ''}`)
    .sort();
  return sameStringSet(normalize(left), normalize(right));
}

function sameSessionSnapshots(
  left: ArchiveDeletePreview["sessionSnapshots"],
  right: ArchiveDeletePreview["sessionSnapshots"],
): boolean {
  const normalize = (items: ArchiveDeletePreview["sessionSnapshots"]) => items
    .map((item) => [
      item.sessionId,
      item.ownerId,
      item.status,
      item.recordingStatus ?? '',
      String(item.updatedAt),
      item.quality,
    ].join("\u0000"))
    .sort();
  return sameStringSet(normalize(left), normalize(right));
}

function filterResultSnapshot(snapshot: ArchiveExportSnapshot, eventKeys: readonly string[]): ArchiveExportSnapshot {
  const allowed = new Set(eventKeys);
  const sessions = snapshot.sessions
    .map((entry) => {
      const events = entry.events.filter((event) => allowed.has(event.eventKey));
      const favorites = entry.favorites.filter((favorite) => allowed.has(favorite.eventKey));
      return { ...entry, events, favorites };
    })
    .filter((entry) => entry.events.length > 0);
  return {
    ...snapshot,
    sessions,
    owners: snapshot.owners.filter((owner) => sessions.some((entry) => entry.session.ownerId === owner.ownerId)),
    nicknames: snapshot.nicknames.filter((nickname) => sessions.some((entry) => entry.events.some((event) => event.userUid === nickname.userUid))),
    historicalFavorites: snapshot.historicalFavorites.filter((favorite) => sessions.some((entry) => entry.session.roomId === favorite.roomId)),
  };
}

export function createArchiveTransferService(options: ArchiveTransferServiceOptions): ArchiveTransferService {
  return new ArchiveTransferService(options);
}

export async function exportArchive(
  repository: ArchiveTransferRepository,
  scope: ArchiveTransferScope,
  options: Omit<ArchiveTransferServiceOptions, "repository"> = {},
): Promise<Uint8Array> {
  return new ArchiveTransferService({ repository, ...options }).exportArchive(scope);
}

export async function previewImportArchive(
  repository: ArchiveTransferRepository,
  input: unknown,
  options: Omit<ArchiveTransferServiceOptions, "repository"> = {},
): Promise<ArchiveImportPreview> {
  return new ArchiveTransferService({ repository, ...options }).previewImportArchive(input);
}
