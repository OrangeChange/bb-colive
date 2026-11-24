import { create } from "zustand";
import { ArchiveRepository, openArchiveDatabase } from "./archiveRepository.ts";
import { ArchiveWriter, type ArchiveFlushResult, type ArchiveTransferControls } from "./archiveWriter.ts";
import type { ConnectionRuntime } from "./connectionRuntime.ts";
import type { ArchiveRepositoryContract } from "./archiveTypes.ts";
import { createFavoriteActions } from "./favoriteActions.ts";
import { refreshFavoriteProjection, useEventAnnotations } from "../eventAnnotations.ts";

export function createArchiveFavoriteActions(repository: ArchiveRepositoryContract) {
  return createFavoriteActions({ repository, onCommitted: async (change) => {
    try {
      const favorites = await refreshFavoriteProjection(repository, () => useEventAnnotations.getState().favorites, change);
      useEventAnnotations.setState({ favorites });
    } finally {
      notifyArchiveRevision();
    }
  } });
}

function emptyWriterStatus(): ReturnType<ArchiveWriter["getStatus"]> {
  return { pending: 0, failed: 0, flushed: 0, closed: false, lastError: null, revision: 0, frozenSessionIds: [], pendingSessionIds: [], failedSessionIds: [] };
}

export const useArchiveRuntime = create(() => ({
  archiveRevision: 0,
  archiveMutationRevision: 0,
  archiveWriterStatus: emptyWriterStatus(),
}));

let ownerRuntime: ConnectionRuntime | null = null;
let archiveWriter: ArchiveWriter | null = null;
let archiveRepositoryPromise: Promise<ArchiveRepository> | null = null;
const ARCHIVE_WRITE_BATCH_DELAY_MS = 200;
let archiveWriterFlushTimer: ReturnType<typeof setTimeout> | null = null;

export function initializeArchiveRuntime(owner: ConnectionRuntime): void {
  ownerRuntime = owner;
  owner.addCleanup(() => {
    if (ownerRuntime !== owner) return;
    clearArchiveWriterFlushTimer();
    archiveWriter = null;
    archiveRepositoryPromise = null;
    ownerRuntime = null;
  });
}

export function clearArchiveWriterFlushTimer(): void {
  if (archiveWriterFlushTimer === null) return;
  clearTimeout(archiveWriterFlushTimer);
  archiveWriterFlushTimer = null;
}

export function getArchiveRepository(): Promise<ArchiveRepository> {
  archiveRepositoryPromise ??= openArchiveDatabase()
    .then((database) => new ArchiveRepository(database))
    .catch((error) => {
      archiveRepositoryPromise = null;
      throw error;
    });
  return archiveRepositoryPromise;
}

export function getArchiveWriter(): ArchiveWriter {
  if (archiveWriter) return archiveWriter;
  const sharedWriter = ownerRuntime?.getArchiveWriter<ArchiveWriter>();
  if (sharedWriter) {
    archiveWriter = sharedWriter;
    return sharedWriter;
  }
  archiveWriter = new ArchiveWriter({
    repository: () => getArchiveRepository(),
    runtimeId: ownerRuntime?.runtimeId,
    generation: ownerRuntime?.generation,
  });
  archiveWriter = ownerRuntime?.setArchiveWriter(archiveWriter) ?? archiveWriter;
  syncArchiveWriterStatus(archiveWriter);
  return archiveWriter;
}

export function syncArchiveWriterStatus(writer: ArchiveWriter, flushed = 0): void {
  if (!ownerRuntime?.isCurrent()) return;
  useArchiveRuntime.setState({
    archiveWriterStatus: { ...writer.getStatus(), flushed },
  });
}

function notifyArchiveWriteComplete(writer: ArchiveWriter, result: ArchiveFlushResult): void {
  if (!ownerRuntime?.isCurrent()) return;
  const current = useArchiveRuntime.getState();
  useArchiveRuntime.setState({
    archiveRevision: result.flushed > 0 ? current.archiveRevision + 1 : current.archiveRevision,
    archiveWriterStatus: { ...writer.getStatus(), flushed: result.flushed },
  });
}

function flushArchiveWriterAndNotify(writer: ArchiveWriter = getArchiveWriter()): void {
  const owner = ownerRuntime;
  void writer.flush().then((result) => {
    if (!owner?.isCurrent() || archiveWriter !== writer) return;
    notifyArchiveWriteComplete(writer, result);
  }, () => undefined);
}

/** 将相邻事件批次合并写入；显式 flush/退出仍会立即排空队列。 */
export function scheduleArchiveWriterFlushAndNotify(writer: ArchiveWriter): void {
  if (archiveWriterFlushTimer !== null) return;
  const owner = ownerRuntime;
  archiveWriterFlushTimer = setTimeout(() => {
    archiveWriterFlushTimer = null;
    if (!owner?.isCurrent() || archiveWriter !== writer) return;
    flushArchiveWriterAndNotify(writer);
  }, ARCHIVE_WRITE_BATCH_DELAY_MS);
}

/** 供正常退出、导出等外部生命周期在不阻塞现场的前提下等待档案写入。 */
export async function flushArchiveWriter(): Promise<ArchiveFlushResult> {
  clearArchiveWriterFlushTimer();
  const writer = getArchiveWriter();
  const result = await writer.flush();
  if (ownerRuntime?.isCurrent() && archiveWriter === writer) {
    notifyArchiveWriteComplete(writer, result);
  }
  return result;
}

/** 收藏、整理或档案导入/删除完成后，让各入口重新读取档案投影。 */
export function notifyArchiveRevision(): void {
  const current = useArchiveRuntime.getState();
  useArchiveRuntime.setState({
    archiveRevision: current.archiveRevision + 1,
    archiveMutationRevision: current.archiveMutationRevision + 1,
  });
}

export async function runArchiveTransfer<T>(
  operation: (controls: ArchiveTransferControls) => Promise<T> | T,
): Promise<T> {
  return getArchiveWriter().runTransferExclusive(operation);
}

export async function closeArchiveWriter(): Promise<ArchiveFlushResult> {
  clearArchiveWriterFlushTimer();
  const writer = getArchiveWriter();
  const result = await (ownerRuntime?.closeArchiveWriter() ?? writer.close());
  archiveWriter = null;
  archiveRepositoryPromise = null;
  syncArchiveWriterStatus(writer);
  return result as ArchiveFlushResult;
}

export function getArchiveWriterStatus() {
  return archiveWriter?.getStatus() ?? {
    pending: 0,
    failed: 0,
    flushed: 0,
    closed: false,
    lastError: null,
    revision: 0,
    frozenSessionIds: [],
    pendingSessionIds: [],
    failedSessionIds: [],
  };
}
