import schema from './recovery-v03.schema.json' with { type: 'json' };
import { defaultLimits } from './recoveryContract.ts';
import type { Limits, Root } from './recoveryContract.ts';

export class RecoveryError extends Error {
  constructor(public readonly code: string, public readonly reason: string | null = null) { super(code); this.name = 'RecoveryError'; }
}
type Schema = { [key: string]: unknown };
export type RecoveryDefinition = keyof typeof schema.$defs;
const definitions = schema.$defs as Record<string, Schema>;
const signedMax = 9223372036854775807n;
export function decimal(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/.test(value) || value.length > 19 || BigInt(value) > signedMax) throw new RecoveryError('invalid_decimal');
  return BigInt(value);
}
export async function recoverySha256(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
  return Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
}
function matches(rule: Schema, value: unknown): boolean {
  if (typeof rule.$ref === 'string') return matches(definitions[rule.$ref.replace('#/$defs/', '')], value);
  for (const alternative of ['anyOf', 'oneOf']) {
    if (Array.isArray(rule[alternative])) {
      const count = (rule[alternative] as Schema[]).filter(item => matches(item, value)).length;
      if (alternative === 'oneOf' ? count !== 1 : count === 0) return false;
    }
  }
  if ('const' in rule && value !== rule.const) return false;
  if (Array.isArray(rule.enum) && !rule.enum.includes(value)) return false;
  if (rule.type === 'null' && value !== null) return false;
  if (rule.type === 'boolean' && typeof value !== 'boolean') return false;
  if (rule.type === 'integer' && !Number.isSafeInteger(value)) return false;
  if (typeof value === 'number' && (!Number.isFinite(value) || typeof rule.minimum === 'number' && value < rule.minimum || typeof rule.maximum === 'number' && value > rule.maximum)) return false;
  if (rule.type === 'string') {
    if (typeof value !== 'string' || typeof rule.maxLength === 'number' && value.length > rule.maxLength || typeof rule.pattern === 'string' && !new RegExp(rule.pattern).test(value)) return false;
    if (rule.pattern === '^(0|[1-9][0-9]*)$') { try { decimal(value); } catch { return false; } }
    if (typeof rule.pattern === 'string' && rule.pattern.endsWith('Z$')) {
      const time = new Date(value); if (!Number.isFinite(time.getTime()) || time.toISOString() !== value) return false;
    }
  }
  if (rule.type === 'array') {
    if (!Array.isArray(value) || typeof rule.minItems === 'number' && value.length < rule.minItems || typeof rule.maxItems === 'number' && value.length > rule.maxItems) return false;
    if (rule.items && !value.every(item => matches(rule.items as Schema, item))) return false;
  }
  if (rule.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>, properties = (rule.properties ?? {}) as Record<string, Schema>;
    if (Array.isArray(rule.required) && rule.required.some(key => !Object.prototype.hasOwnProperty.call(record, key))) return false;
    if (Object.keys(record).some(key => key in properties ? !matches(properties[key], record[key]) : rule.additionalProperties === false)) return false;
  }
  return true;
}
export function validateRecoveryLimits(limits: Limits): void {
  for (const value of Object.values(limits)) if (!Number.isSafeInteger(value) || value <= 0) throw new RecoveryError('invalid_limits');
  for (const key of ['chunk_max_bytes', 'catalog_page_max_bytes', 'root_max_bytes', 'object_max_bytes', 'envelope_decode_max_bytes', 'snapshot_decode_max_bytes'] as const) {
    if (limits[key] > defaultLimits[key]) throw new RecoveryError('decode_limit_exceeded');
  }
  if (limits.prefetch_chunks !== 2 || limits.catalog_fanout < 2 || limits.catalog_fanout > 64 || limits.object_max_bytes > 128 * limits.chunk_max_bytes || limits.job_max_bytes > limits.global_max_bytes || limits.snapshot_decode_max_bytes > limits.object_max_bytes || limits.active_builds_per_room !== 1 || limits.workers !== 1 || limits.freeze_timeout_ms > 5000 || limits.build_timeout_seconds > 300) throw new RecoveryError('invalid_limits');
}
export function validateRecovery<T = unknown>(definition: RecoveryDefinition, value: unknown): T {
  if (!matches(definitions[definition], value)) throw new RecoveryError('invalid_schema');
  if (definition === 'Root') {
    const root = value as Root; validateRecoveryLimits(root.limits);
    if (decimal(root.room_id) === 0n || root.cut.server_id !== root.server_id || root.cut.room_id !== root.room_id || root.created_at >= root.expires_at || root.cut.issued_at >= root.cut.expires_at || decimal(root.counts.pending_assignments) > decimal(root.counts.facts)) throw new RecoveryError('invalid_root');
    if (root.mode === 'baseline') {
      const absorbed = root.absorbed_revisions;
      if (root.from_cut !== null || root.streams.effects !== null || (root.cut.revision_head === '0' ? absorbed !== null : absorbed?.from !== '1' || absorbed?.through !== root.cut.revision_head)) throw new RecoveryError('invalid_root');
    } else {
      const from = root.from_cut;
      if (!from || from.server_id !== root.server_id || from.room_id !== root.room_id || decimal(from.event_head) > decimal(root.cut.event_head) || decimal(from.revision_head) > decimal(root.cut.revision_head) || root.absorbed_revisions !== null || root.streams.effects !== 'effects') throw new RecoveryError('invalid_root');
    }
  }
  return value as T;
}
export function recoveryUTF8(bytes: Uint8Array, singleJSON = false): string {
  if (!bytes.length || bytes[bytes.length - 1] !== 10 || bytes.includes(13) || bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191 || singleJSON && bytes.subarray(0, -1).includes(10)) throw new RecoveryError('invalid_serialization');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new RecoveryError('invalid_utf8'); }
}
export async function readRecoveryJSON<T = unknown>(bytes: Uint8Array, definition: RecoveryDefinition, expectedHash: string): Promise<T> {
  const maximum = definition === 'Root' ? 16384 : definition === 'Catalog' ? 262144 : 16777216;
  if (bytes.length > maximum) throw new RecoveryError('decode_limit_exceeded');
  if (!/^[a-f0-9]{64}$/.test(expectedHash) || await recoverySha256(bytes) !== expectedHash) throw new RecoveryError('hash_mismatch');
  let value: unknown; try { value = JSON.parse(recoveryUTF8(bytes, true)); } catch (error) { if (error instanceof RecoveryError) throw error; throw new RecoveryError('invalid_json'); }
  return validateRecovery<T>(definition, value);
}

