import { getInteractKind, isAllowedByOnlyGuardEntry } from '../../events/eventView.ts';
import { MsgType } from '../../protocol/eventTypeCodes.ts';
import type { DanmakuEvent } from '../../protocol/types.ts';
import { admitsLaplaceEvent } from './admission.ts';
import type { LaplaceAdmissionSettings, LaplaceEvent, LaplaceInputScope, LaplaceNativeGuardEntryDecision, LaplaceSourceMetadata } from './types.ts';

export interface LaplaceNativeGuardEntryFilters {
  onlyGuardEntry: boolean;
  scope: { roomId: number | null; generation: number };
}
export interface LaplaceGuardEntryRecord { source?: { nativeGuardEntryDecision?: unknown } }
const fields = ['kind', 'allowedWhenEnabled', 'roomId', 'generation', 'sourceMode', 'sourceCommand', 'sourceEventId'];
const own = (value: unknown, key: string) => value !== null && typeof value === 'object'
  ? Object.getOwnPropertyDescriptor(value, key) : undefined;
const valueOf = (value: unknown, key: string): unknown => {
  const slot = own(value, key);
  return slot?.enumerable && 'value' in slot ? slot.value : undefined;
};
const validRoom = (value: unknown) => Number.isSafeInteger(value) && (value as number) > 0;
const validGeneration = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const validId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 4096;
const coherentSource = (mode: unknown, command: unknown) => mode === 'canonical' && command === ''
  || mode === 'direct' && (command === 'INTERACT_WORD' || command === 'INTERACT_WORD_V2');

export function assertLaplaceNativeGuardEntryFilters(filters: unknown): asserts filters is LaplaceNativeGuardEntryFilters {
  const scope = valueOf(filters, 'scope');
  if (typeof valueOf(filters, 'onlyGuardEntry') !== 'boolean'
    || !(valueOf(scope, 'roomId') === null || validRoom(valueOf(scope, 'roomId')))
    || !validGeneration(valueOf(scope, 'generation'))) throw new TypeError('Invalid native guard entry filters');
}

/** Capture a native decision, never a new guard observation or source-derived rank. */
export function captureLaplaceNativeGuardEntry(event: DanmakuEvent, projected: LaplaceEvent,
  scope: LaplaceInputScope, sourceMode: LaplaceSourceMetadata['sourceMode'], sourceCommand: string): LaplaceNativeGuardEntryDecision | null | undefined {
  if (event.msgType !== MsgType.Interact || getInteractKind(event) !== 'entry') return undefined;
  const platform = own(event.laplace, 'platform');
  if (platform && (!platform.enumerable || !('value' in platform) || platform.value !== 'bilibili')) return null;
  if (!validRoom(scope.roomId) || !validGeneration(scope.generation) || !validId(event.id)
    || event.roomId !== scope.roomId || projected.origin !== scope.roomId
    || projected.type !== 'interaction' || projected.action !== 1 || !coherentSource(sourceMode, sourceCommand)) return null;
  return { kind: 'entry', allowedWhenEnabled: isAllowedByOnlyGuardEntry(event, true), roomId: scope.roomId,
    generation: scope.generation, sourceMode, sourceCommand, sourceEventId: event.id };
}

/** Absent means source-only. Present-invalid never falls back to source authority.
 * Descriptors are inspected without invoking accessors, including carrier slots. */
export function readLaplaceNativeGuardEntry(record: unknown,
  scope: { roomId: number | null; generation: number }): LaplaceNativeGuardEntryDecision | null | undefined {
  try {
    if (!record || typeof record !== 'object') return undefined;
    const sourceSlot = own(record, 'source');
    if (!sourceSlot) return 'source' in record ? null : undefined;
    if (!sourceSlot.enumerable || !('value' in sourceSlot)) return null;
    const source = sourceSlot.value;
    if (source === undefined) return undefined;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const slot = own(source, 'nativeGuardEntryDecision');
    if (!slot) return 'nativeGuardEntryDecision' in source ? null : undefined;
    if (!slot.enumerable || !('value' in slot)) return null;
    const fact = slot.value;
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)
      || Reflect.ownKeys(fact).length !== fields.length || Reflect.ownKeys(fact).some(key => !fields.includes(key as string))) return null;
    const prototype = Object.getPrototypeOf(fact);
    if (prototype !== null && prototype !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(fact);
    if (fields.some(key => !descriptors[key]?.enumerable || !('value' in descriptors[key]))) return null;
    const { kind, allowedWhenEnabled, roomId, generation, sourceMode, sourceCommand, sourceEventId } = Object.fromEntries(fields.map(key => [key, descriptors[key].value]));
    const event = valueOf(record, 'event');
    if (kind !== 'entry' || typeof allowedWhenEnabled !== 'boolean' || !validRoom(roomId) || !validGeneration(generation)
      || !coherentSource(sourceMode, sourceCommand) || !validId(sourceEventId)
      || valueOf(source, 'platform') !== 'bilibili' || valueOf(source, 'sourceMode') !== sourceMode
      || valueOf(source, 'sourceCommand') !== sourceCommand || valueOf(source, 'sourceEventId') !== sourceEventId
      || valueOf(event, 'origin') !== roomId || valueOf(event, 'type') !== 'interaction' || valueOf(event, 'action') !== 1
      || valueOf(scope, 'roomId') !== roomId || valueOf(scope, 'generation') !== generation) return null;
    return { kind, allowedWhenEnabled, roomId, generation, sourceMode, sourceCommand, sourceEventId };
  } catch { return null; }
}
export function allowsLaplaceNativeGuardEntryRecord(record: unknown, filters: LaplaceNativeGuardEntryFilters): boolean {
  assertLaplaceNativeGuardEntryFilters(filters);
  const decision = readLaplaceNativeGuardEntry(record, filters.scope);
  return decision !== null && (!decision || !filters.onlyGuardEntry || decision.allowedWhenEnabled);
}
/** Neutralize exactly one valid canonical record's old flag, retaining all other admission. */
export function admitsLaplaceNativeGuardEntryRecord(record: unknown, settings: LaplaceAdmissionSettings, filters: LaplaceNativeGuardEntryFilters): boolean {
  assertLaplaceNativeGuardEntryFilters(filters);
  const decision = readLaplaceNativeGuardEntry(record, filters.scope);
  if (decision === null || decision && filters.onlyGuardEntry && !decision.allowedWhenEnabled) return false;
  const event = valueOf(record, 'event') as LaplaceEvent | undefined;
  return Boolean(event && admitsLaplaceEvent(event, decision ? { ...settings, showEnterEventCurrentGuardOnly: false } : settings));
}
/** Bounded current snapshot only; no history, mutation or lifecycle clock. */
export function laplaceNativeGuardEntryDiagnostics(records: readonly unknown[], filters: LaplaceNativeGuardEntryFilters) {
  assertLaplaceNativeGuardEntryFilters(filters);
  const result = { invalid: 0, rejected: 0 };
  for (const record of records) {
    const decision = readLaplaceNativeGuardEntry(record, filters.scope);
    if (decision === null) result.invalid++;
    else if (decision && filters.onlyGuardEntry && !decision.allowedWhenEnabled) result.rejected++;
  }
  return result;
}
