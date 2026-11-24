/** Browser-independent observed facts. Unknown is preserved; no source defaults are inferred. */
export function shouldShowAutoDanmakuFacts(facts, show) { return show || !facts.isDanmu || facts.isAutoDanmaku !== true; }
export function shouldShowPhoneNotVerifiedFacts(facts, show) { return show || !facts.isDanmu || facts.phoneVerified !== false; }
export function assertNativeTextFilters(value) {
  let valid = false;
  try {
    valid = Boolean(value && typeof value === 'object' && !Array.isArray(value)
      && ['showAutoDanmaku', 'showPhoneNotVerified'].every(key => {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        return descriptor && 'value' in descriptor && typeof descriptor.value === 'boolean';
      }));
  } catch { /* Invalid proxies are configuration errors. */ }
  if (!valid) throw new TypeError('Invalid native text filter settings');
}
/** undefined = absent, null = bounded invalid marker, object = validated own observations. */
export function readNativeTextFilterFacts(record) {
  try {
    if (!record) return undefined;
    const sourceSlot = Object.getOwnPropertyDescriptor(record, 'source');
    if (!sourceSlot) return 'source' in record ? null : undefined;
    if (!('value' in sourceSlot)) return null;
    const source = sourceSlot.value;
    if (source === undefined) return undefined;
    if (!source || typeof source !== 'object' || Array.isArray(source)) return null;
    const carrier = Object.getOwnPropertyDescriptor(source, 'nativeTextFilterFacts');
    if (!carrier) return 'nativeTextFilterFacts' in source ? null : undefined;
    if (!('value' in carrier)) return null;
    const value = carrier.value;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || Reflect.ownKeys(value).some(key => !['isDanmu', 'isAutoDanmaku', 'phoneVerified'].includes(key))) return null;
    const danmu = Object.getOwnPropertyDescriptor(value, 'isDanmu');
    if (!danmu || !('value' in danmu) || danmu.value !== true) return null;
    const facts = { isDanmu: true };
    for (const key of ['isAutoDanmaku', 'phoneVerified']) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) { if (key in value) return null; }
      else if (!('value' in descriptor) || typeof descriptor.value !== 'boolean') return null;
      else facts[key] = descriptor.value;
    }
    return facts;
  } catch { return null; }
}
export function evaluateNativeTextFilters(record, filters) {
  assertNativeTextFilters(filters);
  const facts = readNativeTextFilterFacts(record);
  if (facts === undefined) return {allowed:true,invalid:false,auto:false,phone:false};
  if (facts === null) return {allowed:false,invalid:true,auto:false,phone:false};
  const auto = !shouldShowAutoDanmakuFacts(facts, filters.showAutoDanmaku);
  const phone = !shouldShowPhoneNotVerifiedFacts(facts, filters.showPhoneNotVerified);
  return {allowed:!auto && !phone,invalid:false,auto,phone};
}
