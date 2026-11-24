import type { CatalogRef, CloudRecoverySelection, ObjectEntry, Root } from './recoveryContract.ts';
import type { VerifiedRecoveryObject } from './recoveryDecoder.ts';
import { decimal, readRecoveryJSON, RecoveryError, validateRecovery } from './recoveryValidation.ts';

export type RecoveryInvoke = <T>(command: string, args: Record<string, unknown>) => Promise<T>;

export interface StartedRecovery {
  localJobId: string;
  roomId: string;
  created: {
    job_id: string;
    state: 'building';
    created_at: string;
    expires_at: string;
    status_url: string;
  };
}

export interface CloudRecoverySessionItem {
  session_id: string; title: string | null; capture_started_at?: string; source_live_started_at?: string | null;
  ended_at?: string | null; live_status?: 'ongoing' | 'ended' | 'unknown'; event_count?: string;
  quality?: 'pending' | 'complete' | 'incomplete'; recording_status?: 'recording' | 'reconnecting' | 'stopped';
}
export interface CloudRecoverySessionPage {
  items: CloudRecoverySessionItem[]; nextCursor: string | null; hasMore: boolean; metadataRevision: string;
}

function nativeBytes(value: unknown, maximum: number): Uint8Array {
  if (!Array.isArray(value) || value.length > maximum
    || value.some(byte => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new RecoveryError('byte_length_mismatch');
  }
  return Uint8Array.from(value);
}

function catalogObject(reference: CatalogRef) {
  return {
    object_id: reference.object_id,
    kind: reference.kind,
    stream_id: 'catalog',
    stream_ordinal: reference.level,
    media_type: 'application/json',
    byte_size: reference.byte_size,
    sha256: reference.sha256,
    chunk_count: 1,
    chunks: [{
      index: 0,
      byte_size: Number(decimal(reference.byte_size)),
      sha256: reference.sha256,
    }],
  };
}

export function createRecoveryTransport(invoke?: RecoveryInvoke) {
  const native: RecoveryInvoke = invoke ?? (async (command, args) => {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core');
    return tauriInvoke(command, args);
  });

  return {
    async downloadCover(serverId: string, resourceId: string, mimeType: string): Promise<string> {
      return native('download_cloud_recovery_cover', { serverId, resourceId, mimeType });
    },
    async start(roomId: string, mode: 'baseline' | 'delta', fromCutId: string | undefined,
      selection: CloudRecoverySelection) {
      decimal(roomId);
      return native<StartedRecovery>('start_cloud_recovery_job', {
        roomId,
        mode,
        fromCutId,
        selection,
      });
    },
    async listSessions(roomId: string, cursor?: string): Promise<CloudRecoverySessionPage> {
      decimal(roomId);
      return native('list_cloud_recovery_sessions', { roomId, cursor });
    },
    async status(localJobId: string) {
      const result = await native<{
        state: 'building' | 'failed' | 'ready';
        jobId: string;
        failureCode: string | null;
        rootBytes: number[] | null;
        rootSha256: string | null;
        cacheHandle: string | null;
      }>('get_cloud_recovery_job_status', { localJobId });
      if (result.state !== 'ready') return { ...result, root: null };
      if (!result.rootBytes || !result.rootSha256 || !result.cacheHandle) {
        throw new RecoveryError('invalid_root');
      }
      const root = await readRecoveryJSON<Root>(
        nativeBytes(result.rootBytes, 16_384),
        'Root',
        result.rootSha256,
      );
      return { ...result, root };
    },
    async downloadObject(localJobId: string, object: ObjectEntry): Promise<VerifiedRecoveryObject> {
      validateRecovery('ObjectEntry', object);
      const { type: _type, ...descriptor } = object;
      return native('download_cloud_recovery_object', { localJobId, object: descriptor });
    },
    async downloadCatalog(localJobId: string, reference: CatalogRef): Promise<Uint8Array> {
      validateRecovery('CatalogRef', reference);
      const verified = await native<VerifiedRecoveryObject>('download_cloud_recovery_object', {
        localJobId,
        object: catalogObject(reference),
      });
      const bytes = new Uint8Array(Number(decimal(reference.byte_size)));
      let offset = 0;
      while (offset < bytes.length) {
        const maximum = Math.min(65_536, bytes.length - offset);
        const slice = nativeBytes(await native('read_cloud_recovery_slice', {
          localJobId,
          cacheHandle: verified.cacheHandle,
          offset: String(offset),
          maximum,
        }), maximum);
        if (!slice.length) throw new RecoveryError('byte_length_mismatch');
        bytes.set(slice, offset);
        offset += slice.length;
      }
      return bytes;
    },
    async readSlice(localJobId: string, cacheHandle: string, offset: string, maximum: number) {
      decimal(offset);
      return nativeBytes(await native('read_cloud_recovery_slice', {
        localJobId,
        cacheHandle,
        offset,
        maximum,
      }), maximum);
    },
    async cancel(localJobId: string): Promise<void> {
      await native('cancel_cloud_recovery_job', { localJobId });
    },
    async release(localJobId: string): Promise<void> {
      await native('release_cloud_recovery_job', { localJobId });
    },
  };
}

