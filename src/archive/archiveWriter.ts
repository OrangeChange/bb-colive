import { recordArchiveDiagnostic } from "./archiveDiagnostics.ts";
import { registerDiagnosticLogger } from "../diagnostics/diagnosticLogger.ts";
import type {
  ArchiveEventInput,
  ArchiveEventUpdate,
  ArchiveOwnerInput,
  ArchiveRepositoryContract,
  ArchiveSessionInput,
  ArchiveSessionUpdate,
} from "./archiveTypes.ts";
import {
  toArchiveEventInput,
  type ArchiveAppendMutation,
  type ArchiveMutation,
  type ArchiveUpdateMutation,
} from "./archiveEventMutations.ts";

export interface ArchiveEventBatch {
  archiveId: string;
  sessionId: string;
  roomId: number;
  ordinalStart?: number;
  owner?: ArchiveOwnerInput;
  session?: ArchiveSessionInput;
  sessionUpdate?: ArchiveSessionUpdate;
  mutations: readonly ArchiveMutation[];
}

export interface ArchiveFlushResult {
  pending: number;
  failed: number;
  flushed: number;
}

export interface ArchiveTransferControls {
  blockSessions(sessionIds: readonly string[], requestId?: string): void;
}

export interface ArchiveWriterStatus extends ArchiveFlushResult {
  closed: boolean;
  lastError: string | null;
  revision: number;
  frozenSessionIds: string[];
  pendingSessionIds: string[];
  failedSessionIds: string[];
}

type RepositoryFactory =
  | ArchiveRepositoryContract
  | Promise<ArchiveRepositoryContract>
  | (() => ArchiveRepositoryContract | Promise<ArchiveRepositoryContract>);

export interface ArchiveWriterOptions {
  repository: RepositoryFactory;
  registerWithDiagnostics?: boolean;
  runtimeId?: string;
  generation?: number;
}

function mutationEventIds(mutations: readonly ArchiveMutation[]): string[] {
  return mutations.flatMap((mutation) => mutation.kind === "append"
    ? [mutation.event.id]
    : [...mutation.targetEventKeys]);
}

import { toStoredArchiveEventKey as storedEventKey } from "../events/eventIdentity.ts";

function asAppendMutation(mutation: ArchiveMutation): ArchiveAppendMutation | null {
  return mutation.kind === "append" ? mutation : null;
}

function asUpdateMutation(mutation: ArchiveMutation): ArchiveUpdateMutation | null {
  return mutation.kind === "update" ? mutation : null;
}

export class ArchiveWriter {
  private readonly repositoryFactory: RepositoryFactory;
  private repositoryPromise: Promise<ArchiveRepositoryContract> | null = null;
  private pendingBatches: ArchiveEventBatch[] = [];
  private failedBatches = new Set<ArchiveEventBatch>();
  private queueTail: Promise<void> = Promise.resolve();
  private readonly blockedSessionIds = new Set<string>();
  private closed = false;
  private lastError: string | null = null;
  private revision = 0;
  private unregisterDiagnostics: (() => void) | null = null;
  private readonly runtimeData: Record<string, string | number>;

  constructor(options: ArchiveWriterOptions | RepositoryFactory) {
    const hasOptions = typeof options === "object" && options !== null && "repository" in options;
    this.repositoryFactory = hasOptions
      ? (options as ArchiveWriterOptions).repository
      : options as RepositoryFactory;
    this.runtimeData = hasOptions
      ? {
        ...((options as ArchiveWriterOptions).runtimeId === undefined ? {} : { runtimeId: (options as ArchiveWriterOptions).runtimeId }),
        ...((options as ArchiveWriterOptions).generation === undefined ? {} : { generation: (options as ArchiveWriterOptions).generation }),
      }
      : {};
    if (hasOptions && (options as ArchiveWriterOptions).registerWithDiagnostics !== false) {
      this.unregisterDiagnostics = registerDiagnosticLogger({
        flush: async () => {
          const result = await this.flush();
          return {
            failed: result.failed,
            flushed: result.flushed,
            pending: result.pending,
            writeFailures: result.failed,
            droppedRecords: 0,
          };
        },
      });
    }
  }

  enqueueBatch(batch: ArchiveEventBatch): void {
    if (this.closed || this.blockedSessionIds.has(batch.sessionId)
      || batch.mutations.length === 0 && !batch.owner && !batch.session && !batch.sessionUpdate) return;
    this.pendingBatches.push(batch);
    recordArchiveDiagnostic("request", "archive-write", "queued", {
      archiveId: batch.archiveId,
      sessionId: batch.sessionId,
      roomId: batch.roomId,
      count: batch.mutations.length,
      data: this.diagnosticData({ queueDepth: this.pendingBatches.length }),
    });
  }

  setRuntimeContext(runtimeId: string, generation: number): void {
    this.runtimeData.runtimeId = runtimeId;
    this.runtimeData.generation = generation;
  }

  async flush(): Promise<ArchiveFlushResult> {
    let flushed = 0;
    const operation = this.queueTail.then(async () => {
      flushed = (await this.drainPendingBatches()).flushed;
    });
    this.queueTail = operation.then(() => undefined, () => undefined);
    await this.queueTail;
    return {
      pending: this.pendingBatches.length,
      failed: this.failedBatches.size,
      flushed,
    };
  }

  async runTransferExclusive<T>(operation: (controls: ArchiveTransferControls) => Promise<T> | T): Promise<T> {
    let completed = false;
    const transfer = this.queueTail.then(async () => {
      const result = await this.drainPendingBatches();
      if (result.pending > 0 || result.failed > 0) {
        throw new Error("档案仍有待写入或失败写入，当前操作不能继续");
      }
      const value = await operation({
        blockSessions: (sessionIds, requestId) => this.blockSessions(sessionIds, requestId),
      });
      completed = true;
      return value;
    });
    this.queueTail = transfer.then(() => undefined, () => undefined);
    try {
      return await transfer;
    } finally {
      if (completed && !this.closed && this.pendingBatches.length > 0) {
        void this.flush();
      }
    }
  }

  async close(): Promise<ArchiveFlushResult> {
    this.closed = true;
    const result = await this.flush();
    this.unregisterDiagnostics?.();
    this.unregisterDiagnostics = null;
    return result;
  }

  getStatus(): ArchiveWriterStatus {
    return {
      pending: this.pendingBatches.length,
      failed: this.failedBatches.size,
      flushed: 0,
      closed: this.closed,
      lastError: this.lastError,
      revision: this.revision,
      frozenSessionIds: [...this.blockedSessionIds].sort(),
      pendingSessionIds: [...new Set(this.pendingBatches.map((batch) => batch.sessionId))].sort(),
      failedSessionIds: [...new Set([...this.failedBatches].map((batch) => batch.sessionId))].sort(),
    };
  }

  private async getRepository(): Promise<ArchiveRepositoryContract> {
    if (this.repositoryPromise) return this.repositoryPromise;
    const value = typeof this.repositoryFactory === "function"
      ? this.repositoryFactory()
      : this.repositoryFactory;
    this.repositoryPromise = Promise.resolve(value).catch((error) => {
      this.repositoryPromise = null;
      throw error;
    });
    return this.repositoryPromise;
  }

  private async drainPendingBatches(): Promise<ArchiveFlushResult> {
    let flushed = 0;
    const batchesAtStart = this.pendingBatches.length;
    const deferred: ArchiveEventBatch[] = [];
    const failedSessions = new Set<string>();
    for (let index = 0; index < batchesAtStart && this.pendingBatches.length > 0; index += 1) {
      const batch = this.pendingBatches.shift();
      if (!batch) break;
      if (failedSessions.has(batch.sessionId)) {
        deferred.push(batch);
        continue;
      }
      if (this.blockedSessionIds.has(batch.sessionId)) {
        this.failedBatches.delete(batch);
        continue;
      }
      try {
        if (this.failedBatches.has(batch)) {
          recordArchiveDiagnostic("request", "archive-write", "retrying", {
            archiveId: batch.archiveId,
            sessionId: batch.sessionId,
            roomId: batch.roomId,
            data: this.diagnosticData({ phase: "retry" }),
          });
        }
        await this.writeBatch(batch);
        this.failedBatches.delete(batch);
        this.lastError = null;
        this.revision += 1;
        const eventIds = mutationEventIds(batch.mutations);
        recordArchiveDiagnostic("success", "archive-write", "committed", {
          archiveId: batch.archiveId,
          sessionId: batch.sessionId,
          roomId: batch.roomId,
          eventId: eventIds.join(",") || undefined,
          stream: "source",
          data: this.diagnosticData({ revision: this.revision }),
        });
        flushed += 1;
      } catch (error) {
        this.failedBatches.add(batch);
        deferred.push(batch);
        failedSessions.add(batch.sessionId);
        this.lastError = error instanceof Error ? error.message : String(error);
        this.recordFailure(batch, error);
      }
    }
    this.pendingBatches = [...deferred, ...this.pendingBatches];
    return {
      pending: this.pendingBatches.length,
      failed: this.failedBatches.size,
      flushed,
    };
  }

  private blockSessions(sessionIds: readonly string[], requestId?: string): void {
    for (const sessionId of sessionIds) {
      if (sessionId) this.blockedSessionIds.add(sessionId);
    }
    if (this.blockedSessionIds.size === 0) return;
    this.pendingBatches = this.pendingBatches.filter((batch) => {
      const keep = !this.blockedSessionIds.has(batch.sessionId);
      if (!keep) {
        this.failedBatches.delete(batch);
        const eventIds = mutationEventIds(batch.mutations);
        recordArchiveDiagnostic("cancel", "archive-write", "canceled", {
          archiveId: batch.archiveId,
          sessionId: batch.sessionId,
          roomId: batch.roomId,
          requestId,
          eventId: eventIds.join(",") || undefined,
          stream: "source",
          data: this.diagnosticData({ reason: "session-deleted", eventCount: eventIds.length }),
        });
      }
      return keep;
    });
  }

  private async writeBatch(batch: ArchiveEventBatch): Promise<void> {
    const repository = await this.getRepository();
    if (batch.owner) await repository.upsertOwner(batch.owner);
    if (batch.session) await repository.upsertSession(batch.session);

    const appendEvents: ArchiveEventInput[] = [];
    const updateEvents: ArchiveEventUpdate[] = [];
    let ordinal = batch.ordinalStart ?? 0;
    if (batch.mutations.some((mutation) => mutation.kind === "append")) {
      ordinal = Math.max(ordinal, await repository.getNextEventOrdinal(batch.sessionId));
    }
    for (const mutation of batch.mutations) {
      const append = asAppendMutation(mutation);
      if (append) {
        appendEvents.push(toArchiveEventInput(append, {
          sessionId: batch.sessionId,
          roomId: batch.roomId,
          ordinal,
          eventKey: storedEventKey(batch.sessionId, append.eventKey),
        }));
        ordinal += 1;
        continue;
      }
      const update = asUpdateMutation(mutation);
      if (!update) continue;
      for (const eventKey of update.targetEventKeys) {
        updateEvents.push({
          eventKey: storedEventKey(batch.sessionId, eventKey),
          patch: update.patch,
        });
      }
    }

    if (appendEvents.length > 0) await repository.appendEvents(appendEvents);
    if (updateEvents.length > 0) {
      if (typeof repository.updateEvent !== "function") {
        throw new Error("archive repository does not support event updates");
      }
      for (const update of updateEvents) await repository.updateEvent(update);
    }
    let sessionUpdate = batch.sessionUpdate;
    if (appendEvents.length > 0 && sessionUpdate) {
      sessionUpdate = { ...sessionUpdate };
      delete sessionUpdate.eventCount;
    }
    if (sessionUpdate) await repository.updateSession(sessionUpdate);
  }

  private recordFailure(batch: ArchiveEventBatch, error: unknown): void {
    try {
      const eventIds = mutationEventIds(batch.mutations);
      recordArchiveDiagnostic("failure", "archive-write", "failed", {
        archiveId: batch.archiveId,
        sessionId: batch.sessionId,
        roomId: batch.roomId,
        eventId: eventIds.join(",") || undefined,
        sourceRef: `source:${batch.sessionId}:${eventIds.join(",") || "batch"}`,
        renderRef: `render:${batch.sessionId}:${eventIds.join(",") || "batch"}`,
        data: {
          eventIds: eventIds.join(","),
          error: error instanceof Error ? error.message : String(error),
          ...this.runtimeData,
        },
      });
    } catch {
      // 诊断本身是旁路，不能让写入失败影响现场事件。
    }
  }

  private diagnosticData(data: Record<string, string | number | boolean | null> = {}): Record<string, string | number | boolean | null> {
    return { ...this.runtimeData, ...data };
  }
}
