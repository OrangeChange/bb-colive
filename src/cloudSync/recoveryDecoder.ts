import type { BaselineRow, Effect, Fact, ObjectEntry, Snapshot } from './recoveryContract.ts';
import { decimal, RecoveryError, recoverySha256, recoveryUTF8, validateRecovery } from './recoveryValidation.ts';
export interface VerifiedRecoveryObject {
  objectId: string; sha256: string; byteSize: string; cacheHandle: string;
  kind: ObjectEntry['kind']; streamId: string; streamOrdinal: number; verified: true;
}
export interface RecoveryRawSpan {
  cacheHandle: string; objectId: string; streamId: string; streamOrdinal: number;
  lineIndex: string; byteOffset: string; byteLength: string; sha256: string;
  segments: RecoveryRawSegment[];
}
export interface RecoveryRawSegment { cacheHandle: string; objectId: string; byteOffset: string; byteLength: string }
export interface DecodedRecoveryRecord {
  value: Fact | BaselineRow | Effect | Snapshot | null;
  raw: RecoveryRawSpan; status: 'validated' | 'unsupported' | 'invalid'; failureCode: string | null;
}
/** Supplied only from the native committed material cursor, never a UI progress value. */
export interface RecoveryDecodeResume {kind:VerifiedRecoveryObject['kind'];streamId:string;streamOrdinal:number;byteOffset:string;lineIndex:string;previousSequence:string}
export interface RecoveryDecodeOptions { resume?:RecoveryDecodeResume; maxLineBytes?: number; serverId?: string; roomId?: string; eventFrom?: string; eventThrough?: string }
type SliceReader = (handle: string, offset: string, max: number) => Promise<Uint8Array>;
export function decodeRecoveryLines(object: VerifiedRecoveryObject, readSlice: SliceReader, options: RecoveryDecodeOptions = {}): AsyncGenerator<DecodedRecoveryRecord> {
  return decodeRecoveryStream((async function* () { yield object; })(), readSlice, options);
}
export async function* decodeRecoveryStream(objects: AsyncIterable<VerifiedRecoveryObject>, readSlice: SliceReader, options: RecoveryDecodeOptions = {}): AsyncGenerator<DecodedRecoveryRecord> {
  const max = options.maxLineBytes ?? 16777216;
  if (!Number.isSafeInteger(max) || max < 1 || max > 16777216) throw new RecoveryError('decode_limit_exceeded');
  const resume=options.resume?structuredClone(options.resume):undefined;
  if(resume&&(!['facts','baseline','effects','snapshot'].includes(resume.kind)||typeof resume.streamId!=='string'||!resume.streamId||new TextEncoder().encode(resume.streamId).length>64||!Number.isSafeInteger(resume.streamOrdinal)||resume.streamOrdinal<0||!['byteOffset','lineIndex','previousSequence'].every(key=>typeof resume[key as 'byteOffset'|'lineIndex'|'previousSequence']==='string'&&/^(0|[1-9][0-9]*)$/.test(resume[key as 'byteOffset'|'lineIndex'|'previousSequence']))))throw new RecoveryError('invalid_material_resume');
  if(resume&&(decimal(resume.lineIndex)>9223372036854775807n||decimal(resume.previousSequence)>18446744073709551615n||decimal(resume.previousSequence)<decimal(options.eventFrom??'0')))throw new RecoveryError('invalid_material_resume');
  if(resume&&resume.kind==='snapshot'&&(resume.lineIndex!=='0'||resume.byteOffset!=='0'))throw new RecoveryError('invalid_material_resume');
  let buffer = new Uint8Array(Math.min(65536, max)), used = 0, line = decimal(resume?.lineIndex??'0');
  let first: VerifiedRecoveryObject | null = null, stream: VerifiedRecoveryObject | null = null, ordinal = 0;
  let segments: RecoveryRawSegment[] = [], previousSequence = decimal(resume?.previousSequence ?? options.eventFrom ?? '0'), effectIndex = line;
  for await (const object of objects) {
    if (!object.verified || !Number.isSafeInteger(object.streamOrdinal) || object.streamOrdinal < 0 || !['facts', 'baseline', 'effects', 'snapshot'].includes(object.kind)) throw new RecoveryError('invalid_object');
    if (stream && (object.kind !== stream.kind || object.streamId !== stream.streamId || object.streamOrdinal !== ordinal)) throw new RecoveryError('invalid_stream_order');
    const firstObject=stream===null;
    if(firstObject&&resume&&(object.kind!==resume.kind||object.streamId!==resume.streamId||object.streamOrdinal!==resume.streamOrdinal))throw new RecoveryError('invalid_material_resume');
    stream ??= object; ordinal = object.streamOrdinal + 1;
    const length = decimal(object.byteSize); if (length > 268435456n || !length && object.kind === 'snapshot') throw new RecoveryError('invalid_object');
    const definition = object.kind === 'facts' ? 'Fact' : object.kind === 'baseline' ? 'BaselineRow' : object.kind === 'effects' ? 'Effect' : 'Snapshot';
    let offset = firstObject&&resume?decimal(resume.byteOffset):0n;
    if(offset>length)throw new RecoveryError('invalid_material_resume');
    while (offset < length) {
      const request = Number(length - offset > 65536n ? 65536n : length - offset);
      const bytes = await readSlice(object.cacheHandle, offset.toString(), request);
      if (!bytes.length || bytes.length > request) throw new RecoveryError('byte_length_mismatch');
      let position = 0;
      while (position < bytes.length) {
        const newline = bytes.indexOf(10, position), end = newline < 0 ? bytes.length : newline + 1, part = bytes.subarray(position, end);
        if (used + part.length > max) throw new RecoveryError('decode_limit_exceeded');
        if (used + part.length > buffer.length) { const grown = new Uint8Array(Math.min(max, Math.max(used + part.length, buffer.length * 2))); grown.set(buffer.subarray(0, used)); buffer = grown; }
        first ??= object;
        const localOffset = offset + BigInt(position), last = segments[segments.length - 1];
        if (last?.objectId === object.objectId && decimal(last.byteOffset) + decimal(last.byteLength) === localOffset) last.byteLength = (decimal(last.byteLength) + BigInt(part.length)).toString();
        else { if (segments.length >= 128) throw new RecoveryError('decode_limit_exceeded'); segments.push({ cacheHandle: object.cacheHandle, objectId: object.objectId, byteOffset: localOffset.toString(), byteLength: String(part.length) }); }
        buffer.set(part, used); used += part.length; position = end;
        if (newline < 0) continue;
        const rawBytes = buffer.subarray(0, used);
      if (rawBytes.length > max) throw new RecoveryError('decode_limit_exceeded');
      const text = recoveryUTF8(rawBytes, true);
        if (object.kind === 'snapshot' && (line !== 0n || segments.length !== 1 || localOffset + BigInt(part.length) !== length)) throw new RecoveryError('invalid_serialization');
      const raw: RecoveryRawSpan = { cacheHandle: first!.cacheHandle, objectId: first!.objectId, streamId: object.streamId, streamOrdinal: first!.streamOrdinal, lineIndex: line.toString(), byteOffset: segments[0].byteOffset, byteLength: String(rawBytes.length), sha256: await recoverySha256(rawBytes), segments };
      let value: DecodedRecoveryRecord['value'] = null, status: DecodedRecoveryRecord['status'] = 'validated', failureCode: string | null = null;
      try {
        const parsed: unknown = JSON.parse(text);
        if (object.kind === 'effects' && (!parsed || typeof parsed !== 'object' || !['session_upsert', 'assignment_replace', 'connection_upsert', 'quality_upsert', 'source_availability', 'session_tombstone', 'snapshot_reference', 'cover_upsert'].includes(String((parsed as { type?: unknown }).type)))) {
          status = 'unsupported'; failureCode = 'unsupported_effect';
        } else {
          value = validateRecovery<NonNullable<DecodedRecoveryRecord['value']>>(definition, parsed);
          if (object.kind === 'facts' && (value as Fact).protocol_version !== 3) { status = 'unsupported'; failureCode = 'unsupported_protocol'; }
        }
      } catch (error) { status = 'invalid'; failureCode = error instanceof RecoveryError ? error.code : 'invalid_json'; }
        if ((status === 'validated' || status === 'unsupported' && failureCode === 'unsupported_protocol' && value !== null) && object.kind === 'facts') {
          const fact = value as Fact, sequence = decimal(fact.server_sequence);
          if (sequence <= previousSequence || options.eventThrough !== undefined && sequence > decimal(options.eventThrough) || options.serverId !== undefined && fact.server_id !== options.serverId || options.roomId !== undefined && fact.room_id !== options.roomId) throw new RecoveryError('invalid_stream_order');
          previousSequence = sequence;
        }
        if (status === 'validated' && object.kind === 'effects') {
          const effect = value as Effect;
          if (BigInt(effect.effect_index) !== effectIndex++ || options.eventThrough !== undefined && effect.basis_event_head !== options.eventThrough) throw new RecoveryError('invalid_stream_order');
        }
      yield { value, raw, status, failureCode };
        line++; used = 0; segments = []; first = null;
      if (status !== 'validated' && !(object.kind === 'facts' && status === 'unsupported' && failureCode === 'unsupported_protocol' && value !== null)) return;
      }
      offset += BigInt(bytes.length);
    }
  }
  if (used || stream?.kind === 'snapshot' && !line) throw new RecoveryError('invalid_serialization');
}

