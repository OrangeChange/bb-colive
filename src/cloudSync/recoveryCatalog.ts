import type { Catalog, CatalogRef, ObjectEntry, Root, SnapshotRef } from './recoveryContract.ts';
import { decimal, readRecoveryJSON, RecoveryError, validateRecovery } from './recoveryValidation.ts';

/** Persistent job-local index. Implementations page reads and enforce ID uniqueness
 * on disk; traversal never retains the whole catalog/reference set in memory. */
export interface RecoveryCatalogIndex {
  register(descriptor: CatalogRef | ObjectEntry): Promise<void>;
  addSnapshot(reference: SnapshotRef): Promise<void>;
  object(id: string): Promise<CatalogRef | ObjectEntry | null>;
  objects(): AsyncIterable<ObjectEntry>;
  snapshots(): AsyncIterable<SnapshotRef>;
}
export async function walkRecoveryCatalog(root: Root, fetchVerified: (ref: CatalogRef) => Promise<Uint8Array>, index: RecoveryCatalogIndex): Promise<{ objects: number; catalogNodes: number; byteSize: string }> {
  validateRecovery('Root', root);
  let total = 0n, objects = 0, catalogNodes = 0;
  const invalid = () => { throw new RecoveryError('invalid_catalog'); };
  const charge = (value: string) => { total += decimal(value); if (total > BigInt(root.limits.job_max_bytes)) invalid(); };
  async function register(ref: CatalogRef | ObjectEntry) { try { await index.register(ref); } catch { invalid(); } charge(ref.byte_size); }
  async function visit(ref: CatalogRef, parentLevel?: number): Promise<void> {
    validateRecovery('CatalogRef', ref);
    if (ref.level > 8 || parentLevel !== undefined && ref.level !== parentLevel - 1 || decimal(ref.byte_size) > BigInt(root.limits.catalog_page_max_bytes)) invalid();
    await register(ref); catalogNodes++;
    const bytes = await fetchVerified(ref);
    if (BigInt(bytes.length) !== decimal(ref.byte_size)) throw new RecoveryError('byte_length_mismatch');
    const catalog = await readRecoveryJSON<Catalog>(bytes, 'Catalog', ref.sha256);
    if (catalog.kind !== ref.kind || catalog.level !== ref.level) invalid();
    if (catalog.kind === 'catalog_index') {
      if (catalog.children.length > root.limits.catalog_fanout) invalid();
      for (const child of catalog.children) await visit(child, ref.level);
    } else {
      if (catalog.entries.length > root.limits.catalog_fanout) invalid();
      for (const entry of catalog.entries) {
        if (entry.type === 'snapshot_ref') { try { await index.addSnapshot(entry); } catch { invalid(); } continue; }
        if (entry.kind === 'snapshot' ? entry.media_type !== 'application/json' : entry.media_type !== 'application/x-ndjson' || entry.stream_id !== entry.kind || entry.kind === 'effects' && root.mode !== 'delta') invalid();
        if (decimal(entry.byte_size) > BigInt(root.limits.object_max_bytes) || entry.chunks.length !== entry.chunk_count || entry.chunk_count > 128) invalid();
        let size = 0n;
        for (let i = 0; i < entry.chunks.length; i++) { const chunk = entry.chunks[i]; if (chunk.index !== i || chunk.byte_size > root.limits.chunk_max_bytes) invalid(); size += BigInt(chunk.byte_size); }
        if (size !== decimal(entry.byte_size)) invalid();
        await register(entry); objects++;
      }
    }
  }
  await visit(root.catalog_root);
  let stream = '', next = 0;
  for await (const object of index.objects()) {
    if (object.stream_id !== stream) { stream = object.stream_id; next = 0; }
    if (object.stream_ordinal !== next++) invalid();
  }
  for await (const ref of index.snapshots()) {
    if (ref.server_id !== root.server_id || ref.room_id !== root.room_id) invalid();
    if (ref.availability === 'available') {
      if (!ref.object_id || !ref.sha256 || !ref.result) invalid();
      const descriptor = await index.object(ref.object_id!);
      if (!descriptor || descriptor.kind !== 'snapshot' || descriptor.stream_id !== ref.snapshot_id || descriptor.sha256 !== ref.sha256) invalid();
    } else if (ref.object_id !== null || ref.sha256 !== null || ref.result !== null) invalid();
  }
  return { objects, catalogNodes, byteSize: total.toString() };
}

