import { MsgType } from '../../protocol/eventTypeCodes.ts';
import type { LaplaceActivityFact, LaplaceSourceMetadata } from './types.ts';

const commands: Readonly<Record<string, { kind: LaplaceActivityFact['kind']; phase: LaplaceActivityFact['phase']; type: string; msgType: MsgType; key: string }>> = {
  ANCHOR_LOT_START: { kind: 'lottery', phase: 'start', type: 'lottery-start', msgType: MsgType.AnchorLotStart, key: 'id' },
  ANCHOR_LOT_AWARD: { kind: 'lottery', phase: 'end', type: 'lottery-result', msgType: MsgType.AnchorLotAward, key: 'id' },
  POPULARITY_RED_POCKET_START: { kind: 'redEnvelope', phase: 'start', type: 'red-envelope-start', msgType: MsgType.RedPocketStart, key: 'lot_id' },
  POPULARITY_RED_POCKET_V2_START: { kind: 'redEnvelope', phase: 'start', type: 'red-envelope-start', msgType: MsgType.RedPocketStart, key: 'lot_id' },
  POPULARITY_RED_POCKET_WINNER_LIST: { kind: 'redEnvelope', phase: 'end', type: 'red-envelope-result', msgType: MsgType.RedPocketWinner, key: 'lot_id' },
  POPULARITY_RED_POCKET_V2_WINNER_LIST: { kind: 'redEnvelope', phase: 'end', type: 'red-envelope-result', msgType: MsgType.RedPocketWinner, key: 'lot_id' },
};
const own = (value: unknown, key: string): PropertyDescriptor | undefined =>
  value !== null && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key) : undefined;
/** Never coerce IDs, inspect display IDs, or execute a carrier accessor. */
const idOf = (value: unknown): string | undefined => typeof value === 'number'
  ? Number.isSafeInteger(value) && value >= 0 ? String(value) : undefined
  : typeof value === 'string' && /^[0-9]+$/.test(value) ? value : undefined;
export function captureLaplaceActivity(command: string, type: string, data: unknown): LaplaceActivityFact | undefined {
  const rule = Object.prototype.hasOwnProperty.call(commands, command) ? commands[command] : undefined;
  if (!rule || rule.type !== type) return undefined;
  const id = idOf(own(data, rule.key)?.value);
  return id === undefined ? undefined : { kind: rule.kind, phase: rule.phase, id };
}
/** Raw facts are optional. A malformed present carrier is diagnosed once per
 * record; even a valid incoming terminal/identity value has no host authority. */
export function readLaplaceActivity(source: LaplaceSourceMetadata | undefined, type: string, msgType: MsgType): { fact?: LaplaceActivityFact; invalid: boolean } {
  const slot = own(source, 'activity');
  if (!slot) return { invalid: false };
  const invalid = { invalid: true };
  if (!('value' in slot)) return invalid;
  const value = slot.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid;
  const fields = Object.getOwnPropertyDescriptors(value);
  if (Object.values(fields).some(field => !('value' in field))) return invalid;
  const sourceMode = own(source, 'sourceMode')?.value, command = own(source, 'sourceCommand')?.value;
  const rule = typeof command === 'string' && Object.prototype.hasOwnProperty.call(commands, command) ? commands[command] : undefined;
  if (sourceMode !== 'direct' || !rule || rule.type !== type || rule.msgType !== msgType
    || fields.kind?.value !== rule.kind || fields.phase?.value !== rule.phase) return invalid;
  const id = idOf(fields.id?.value);
  return id === undefined ? invalid : { invalid: false, fact: { kind: rule.kind, phase: rule.phase, id } };
}
