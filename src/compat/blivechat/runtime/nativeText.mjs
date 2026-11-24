import { evaluateNativeTextFilters } from '../../../nativeTextFilterFacts.mjs';

export const NATIVE_TEXT_DEFAULTS = Object.freeze({ hostNativeTextFilter: false, hostShowAutoDanmaku: true, hostShowPhoneNotVerified: false });
export const NATIVE_VALUE_KEYS = ['hostShowAutoDanmaku', 'hostShowPhoneNotVerified'];
// One fixed-size ledger and at most one queued operation per retained text record.
// Numeric session/group identities and a reference to the existing member ID
// avoid retaining raw root objects. No ID or payload string is copied into a token.
export const TEXT_LEDGER_BYTES = 512;
export const TEXT_OPERATION = Symbol('blivechat.nativeTextOperation');
export function checkNativeTextConfig(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('Invalid native text configuration');
  for (const key of Object.keys(NATIVE_TEXT_DEFAULTS)) {
    if (!(key in patch)) continue;
    const descriptor = Object.getOwnPropertyDescriptor(patch, key);
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value') || typeof descriptor.value !== 'boolean')
      throw new TypeError(`Invalid native text setting: ${key}`);
  }
}
export function nativeTextAllowed(record, config) {
  return !config.hostNativeTextFilter || record.method !== 'onAddText' || evaluateNativeTextFilters(record, {
    showAutoDanmaku: config.hostShowAutoDanmaku, showPhoneNotVerified: config.hostShowPhoneNotVerified,
  }).allowed;
}
export function isTextRecord(record) { return record.method === 'onAddText' || record.method === 'onDebugMsg'; }
export function newTextLedger(record) {
  return { group: null, phase: 'new', consumedAt: record.preserveClock ? record.receivedAt : null, lane: null, hidden: false, evicted: false };
}
export function textOperation(runtime, record) { return { session: runtime.session, member: record.id }; }
export function attachTextOperation(message, token) {
  Object.defineProperty(message, TEXT_OPERATION, { value: token, configurable: true });
}
