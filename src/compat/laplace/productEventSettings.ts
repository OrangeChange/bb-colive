import { uiText } from "../../i18n/index.ts";
import { readLaplaceSettings, type LaplaceSettings } from './settings.ts';

export const LAPLACE_PRODUCT_EVENTS_KEY = 'bb.laplace.product-events.v1';
export const LAPLACE_INTERACTION_CHILDREN = ['entry', 'follow', 'share', 'specialFollow', 'mutualFollow', 'like'] as const;
export type LaplaceInteractionChild = typeof LAPLACE_INTERACTION_CHILDREN[number];
export const LAPLACE_GIFT_CHILDREN = ['free', 'normal', 'blind', 'redEnvelope', 'lottery'] as const;
export type LaplaceGiftChild = typeof LAPLACE_GIFT_CHILDREN[number];
export interface LaplaceLegacyProductEventSettings {
  readonly version: 1;
  readonly interactions: { readonly enabled: boolean; readonly children: Readonly<Record<LaplaceInteractionChild, boolean>> };
}
export interface LaplaceV2ProductEventSettings {
  readonly version: 2;
  readonly interactions: LaplaceLegacyProductEventSettings['interactions'];
  readonly gifts: { readonly enabled: boolean; readonly children: Readonly<Record<LaplaceGiftChild, boolean>> };
}
export const LAPLACE_SYSTEM_CHILDREN = ['live', 'userMute', 'roomMute', 'roomChange', 'warning'] as const;
export type LaplaceSystemChild = typeof LAPLACE_SYSTEM_CHILDREN[number];
export interface LaplaceProductEventSettings {
  readonly version: 3;
  readonly interactions: LaplaceLegacyProductEventSettings['interactions'];
  readonly gifts: LaplaceV2ProductEventSettings['gifts'];
  readonly systems: { readonly children: Readonly<Record<LaplaceSystemChild, boolean>> };
}
export type LaplaceProductEventInput = LaplaceLegacyProductEventSettings | LaplaceV2ProductEventSettings | LaplaceProductEventSettings;
export interface LaplaceProductEventSnapshot {
  readonly settings: LaplaceProductEventSettings;
  readonly readOnly: boolean;
  readonly diagnostic: string;
}
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;
type StorageChange = { key: string | null; newValue: string | null; storageArea?: StorageAdapter | null };
const freeze = (settings: LaplaceProductEventSettings): LaplaceProductEventSettings => Object.freeze({ version: 3,
  interactions: Object.freeze({ enabled: settings.interactions.enabled, children: Object.freeze({ ...settings.interactions.children }) }),
  gifts: Object.freeze({ enabled: settings.gifts.enabled, children: Object.freeze({ ...settings.gifts.children }) }),
  systems: Object.freeze({ children: Object.freeze({ ...settings.systems.children }) }) });
function migrate(legacy: LaplaceSettings): LaplaceProductEventSettings {
  return freeze({ version: 3, interactions: { enabled: true, children: {
    entry: legacy.showEnterEvent, follow: legacy.showFollowEvent, share: legacy.showFollowEvent,
    specialFollow: legacy.showFollowEvent, mutualFollow: legacy.showFollowEvent, like: legacy.showFollowEvent,
  } }, gifts: { enabled: true, children: { free: legacy.showGift && legacy.showGiftFree,
    normal: legacy.showGift, blind: legacy.showGift, redEnvelope: legacy.showRedEnvelop, lottery: legacy.showLottery } }, systems: { children: { live: true, userMute: true, roomMute: true, roomChange: true, warning: true } } });
}
const owns = (value: unknown, key: string): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key);
function validGroup(value: any, keys: readonly string[]): boolean {
  return owns(value, 'enabled') && typeof value.enabled === 'boolean' && owns(value, 'children')
    && keys.every(key => owns(value.children, key) && typeof value.children[key] === 'boolean');
}
/** Public boundaries validate before inspecting events or neutralizing source settings. */
export function assertLaplaceProductEventSettings(value: unknown): asserts value is LaplaceProductEventInput {
  const input = value as LaplaceProductEventInput;
  if (!owns(input, 'version') || (input.version !== 1 && input.version !== 2 && input.version !== 3)
    || !owns(input, 'interactions') || !validGroup(input.interactions, LAPLACE_INTERACTION_CHILDREN)
    || (input.version === 2 || input.version === 3) && (!owns(input, 'gifts') || !validGroup(input.gifts, LAPLACE_GIFT_CHILDREN))
    || input.version === 3 && (!owns(input, 'systems') || !owns(input.systems, 'children')
      || !LAPLACE_SYSTEM_CHILDREN.every(key => owns(input.systems.children, key) && typeof input.systems.children[key] === 'boolean'))) {
    throw new TypeError('Invalid LAPLACE product event settings');
  }
}
function decode(raw: string): LaplaceProductEventInput | 'future' | null {
  try {
    const value = JSON.parse(raw);
    if (owns(value, 'version') && typeof value.version === 'number' && value.version > 3) return 'future';
    assertLaplaceProductEventSettings(value);
    const interactions = { enabled: value.interactions.enabled,
      children: Object.fromEntries(LAPLACE_INTERACTION_CHILDREN.map(key => [key, value.interactions.children[key]])) as Record<LaplaceInteractionChild, boolean> };
    if (value.version === 1) return { version: 1, interactions };
    const gifts = { enabled: value.gifts.enabled,
      children: Object.fromEntries(LAPLACE_GIFT_CHILDREN.map(key => [key, value.gifts.children[key]])) as Record<LaplaceGiftChild, boolean> };
    if (value.version === 2) return { version: 2, interactions, gifts };
    return freeze({ version: 3, interactions, gifts, systems: { children:
      Object.fromEntries(LAPLACE_SYSTEM_CHILDREN.map(key => [key, value.systems.children[key]])) as Record<LaplaceSystemChild, boolean> } });
  } catch { return null; }
}
/** Older storage notifications own only fields present in their schema. */
function mergeVersion(current: LaplaceProductEventSettings, incoming: LaplaceProductEventInput): LaplaceProductEventSettings {
  if (incoming.version === 3) return freeze(incoming);
  return freeze({ ...current, interactions: incoming.interactions,
    gifts: incoming.version === 2 ? incoming.gifts : current.gifts });
}
const FUTURE = uiText("productEventSettings.FUTURE");
const CORRUPT = uiText("productEventSettings.CORRUPT");
const MEMORY = uiText("productEventSettings.MEMORY");
/** One authority per realm. Reads/migration/storage notifications never write;
 * only an explicit setter persists, and future schemas lock setters entirely. */
export function createLaplaceProductEventStore(getStorage: () => StorageAdapter) {
  const listeners = new Set<() => void>();
  let diagnostic = '';
  function legacy() {
    let storage: StorageAdapter;
    try { storage = getStorage(); } catch { diagnostic = MEMORY; return migrate(readLaplaceSettings({ getItem: () => null })); }
    return migrate(readLaplaceSettings({ getItem(key) {
      try { return storage.getItem(key); } catch { diagnostic = MEMORY; return null; }
    } }));
  }
  let initial = legacy(), readOnly = false;
  try {
    const raw = getStorage().getItem(LAPLACE_PRODUCT_EVENTS_KEY);
    if (raw !== null) {
      const parsed = decode(raw);
      if (parsed === 'future') { readOnly = true; diagnostic = FUTURE; }
      else if (parsed) initial = mergeVersion(initial, parsed);
      else diagnostic = CORRUPT;
    }
  } catch { diagnostic = MEMORY; }
  let snapshot: LaplaceProductEventSnapshot = Object.freeze({ settings: initial, readOnly, diagnostic });
  function publish(settings: LaplaceProductEventSettings, locked: boolean, message: string) {
    snapshot = Object.freeze({ settings, readOnly: locked, diagnostic: message });
    for (const listener of [...listeners]) { try { listener(); } catch { /* A failed reader cannot block other consumers. */ } }
  }
  function save(settings: LaplaceProductEventSettings) {
    if (snapshot.readOnly) return;
    let message = '';
    try { getStorage().setItem(LAPLACE_PRODUCT_EVENTS_KEY, JSON.stringify(settings)); } catch { message = MEMORY; }
    publish(freeze(settings), false, message);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setEnabled(enabled: boolean) {
      if (typeof enabled !== 'boolean' || enabled === snapshot.settings.interactions.enabled) return;
      save({ ...snapshot.settings, interactions: { ...snapshot.settings.interactions, enabled } });
    },
    setChild(key: LaplaceInteractionChild, enabled: boolean) {
      if (!LAPLACE_INTERACTION_CHILDREN.includes(key) || typeof enabled !== 'boolean' || enabled === snapshot.settings.interactions.children[key]) return;
      save({ ...snapshot.settings, interactions: { ...snapshot.settings.interactions,
        children: { ...snapshot.settings.interactions.children, [key]: enabled } } });
    },
    setGiftEnabled(enabled: boolean) {
      if (typeof enabled !== 'boolean' || enabled === snapshot.settings.gifts.enabled) return;
      save({ ...snapshot.settings, gifts: { ...snapshot.settings.gifts, enabled } });
    },
    setGiftChild(key: LaplaceGiftChild, enabled: boolean) {
      if (!LAPLACE_GIFT_CHILDREN.includes(key) || typeof enabled !== 'boolean' || enabled === snapshot.settings.gifts.children[key]) return;
      save({ ...snapshot.settings, gifts: { ...snapshot.settings.gifts,
        children: { ...snapshot.settings.gifts.children, [key]: enabled } } });
    },
    setSystemChild(key: LaplaceSystemChild, enabled: boolean) {
      if (!LAPLACE_SYSTEM_CHILDREN.includes(key) || typeof enabled !== 'boolean' || enabled === snapshot.settings.systems.children[key]) return;
      save({ ...snapshot.settings, systems: {
        children: { ...snapshot.settings.systems.children, [key]: enabled } } });
    },
    handleStorageEvent(event: StorageChange) {
      if (event.key !== null && event.key !== LAPLACE_PRODUCT_EVENTS_KEY) return;
      if (event.storageArea) {
        try { if (event.storageArea !== getStorage()) return; } catch { publish(snapshot.settings, snapshot.readOnly, MEMORY); return; }
      }
      if (event.newValue === null || event.key === null) {
        diagnostic = ''; const settings = legacy();
        publish(settings, false, diagnostic || uiText("productEventSettings.createLaplaceProductEventStore.handleStorageEvent")); return;
      }
      const parsed = decode(event.newValue);
      if (parsed === 'future') publish(snapshot.settings, true, FUTURE);
      else if (parsed) publish(mergeVersion(snapshot.settings, parsed), false, '');
      else publish(snapshot.settings, false, CORRUPT);
    },
  };
}
export type LaplaceProductEventStore = ReturnType<typeof createLaplaceProductEventStore>;
let realmStore: LaplaceProductEventStore | undefined;
export function getLaplaceProductEventStore(): LaplaceProductEventStore {
  if (!realmStore) {
    realmStore = createLaplaceProductEventStore(() => globalThis.localStorage);
    if (typeof window !== 'undefined') window.addEventListener('storage', event => realmStore!.handleStorageEvent(event));
  }
  return realmStore;
}
