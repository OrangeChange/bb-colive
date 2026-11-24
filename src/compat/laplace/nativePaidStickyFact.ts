import { MsgType } from '../../protocol/eventTypeCodes.ts';
import type { DanmakuEvent } from '../../protocol/types.ts';
import { stickyEventKey } from '../../windows/stickyEventModel.ts';
import type { LaplaceEvent, LaplaceInputScope, LaplaceNativePaidStickyFact, LaplaceSourceMetadata } from './types.ts';

const fields = ['kind', 'amountRmb', 'key', 'roomId', 'generation', 'sourceMode'];
const own = (value: unknown, key: string) => value !== null && typeof value === 'object'
  ? Object.getOwnPropertyDescriptor(value, key) : undefined;
const valueOf = (value: unknown, key: string): unknown => {
  const slot = own(value, key);
  return slot?.enumerable && 'value' in slot ? slot.value : undefined;
};
const validKey = (key: unknown): key is string => typeof key === 'string' && key.trim().length > 0 && key.length <= 4096;
const validScope = (scope: { roomId: unknown; generation: unknown }) => Number.isSafeInteger(scope.roomId)
  && (scope.roomId as number) > 0 && Number.isSafeInteger(scope.generation) && (scope.generation as number) >= 0;
const validMode = (mode: unknown): mode is LaplaceSourceMetadata['sourceMode'] => ['canonical', 'direct', 'open'].includes(mode as string);

/** Only the current canonical event can create payment authority. An incoming
 * source carrier is never read; invalid supported facts retain a null marker. */
export function captureLaplaceNativePaidSticky(event: DanmakuEvent, projected: LaplaceEvent,
  scope: LaplaceInputScope, sourceMode: LaplaceSourceMetadata['sourceMode']): LaplaceNativePaidStickyFact | null | undefined {
  const kind = event.msgType === MsgType.Gift ? 'gift' : event.msgType === MsgType.GuardBuy ? 'guard' : undefined;
  if (!kind) return undefined;
  const platform = own(event.laplace, 'platform');
  if (platform && (!('value' in platform) || platform.value !== undefined && platform.value !== 'bilibili')) return null;
  const key = stickyEventKey(event);
  if (!validScope(scope) || !validMode(sourceMode) || !validKey(key)
    || event.roomId !== scope.roomId || projected.origin !== scope.roomId
    || projected.type !== (kind === 'gift' ? 'gift' : 'toast')) return null;
  const amount = kind === 'gift' ? valueOf(event.gift, 'paymentRmb') : valueOf(event.guard, 'priceRmb');
  return { kind, key, ...scope, sourceMode,
    amountRmb: typeof amount === 'number' && Number.isFinite(amount) && amount > 0 ? amount : null };
}

/** undefined is absent/legacy; null is present-invalid and cannot use legacy
 * expiry. Inspect descriptors before values, including the carrier itself. */
export function readLaplaceNativePaidSticky(record: unknown,
  scope?: { roomId: number | null; generation: number }): LaplaceNativePaidStickyFact | null | undefined {
  try {
    if (!record || typeof record !== 'object') return undefined;
    const sourceSlot = own(record, 'source');
    if (!sourceSlot) return 'source' in record ? null : undefined;
    if (!('value' in sourceSlot) || !sourceSlot.enumerable) return null;
    const source = sourceSlot.value;
    if (source === undefined) return undefined;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const slot = own(source, 'nativePaidSticky');
    if (!slot) return 'nativePaidSticky' in source ? null : undefined;
    if (!('value' in slot) || !slot.enumerable) return null;
    const fact = slot.value;
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)
      || Reflect.ownKeys(fact).length !== fields.length || Reflect.ownKeys(fact).some(key => !fields.includes(key as string))) return null;
    const prototype = Object.getPrototypeOf(fact);
    if (prototype !== null && prototype !== Object.prototype) return null;
    const descriptors = Object.getOwnPropertyDescriptors(fact);
    if (fields.some(key => !descriptors[key] || !('value' in descriptors[key]) || !descriptors[key].enumerable)) return null;
    const { kind, key, amountRmb, roomId, generation, sourceMode } = Object.fromEntries(fields.map(key => [key, descriptors[key].value]));
    const event = valueOf(record, 'event');
    if ((kind !== 'gift' && kind !== 'guard') || !validKey(key) || !validScope({ roomId, generation }) || !validMode(sourceMode)
      || !(amountRmb === null || typeof amountRmb === 'number' && Number.isFinite(amountRmb) && amountRmb > 0)
      || valueOf(source, 'platform') !== 'bilibili' || valueOf(source, 'sourceMode') !== sourceMode
      || valueOf(event, 'origin') !== roomId || valueOf(event, 'type') !== (kind === 'gift' ? 'gift' : 'toast')
      || scope && (roomId !== scope.roomId || generation !== scope.generation)) return null;
    return { kind, key, amountRmb, roomId, generation, sourceMode };
  } catch { return null; }
}

/** Structured tuple avoids delimiter aliases without interpreting the native key. */
export const laplaceNativePaidStickyIdentity = (fact: LaplaceNativePaidStickyFact): string =>
  JSON.stringify([fact.sourceMode, fact.roomId, fact.generation, fact.kind, fact.key]);
