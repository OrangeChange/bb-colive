import { LAPLACE_SETTINGS_STORAGE_KEY } from './settings.ts';
import { validProductHighlightThreshold } from './productPresentationPolicy.ts';
export const LAPLACE_PRODUCT_PRESENTATION_KEY = 'bb.laplace.product-presentation.v1';
export interface LaplaceProductPresentationSettings {
  readonly version: 2;
  readonly showAvatar: boolean;
  readonly showUsername: boolean;
  readonly classicElementScope: boolean;
  readonly showCurrentRank: boolean;
  readonly showGiftHighlightAbove: number;
}
export interface LaplaceProductPresentationSnapshot {
  readonly settings: LaplaceProductPresentationSettings;
  /** Changes only when an external authority replaces presentation settings. */
  readonly externalRevision: number;
  readonly readOnly: boolean;
  readonly diagnostic: string;
}
type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>;
type StorageChange = { key: string | null; newValue: string | null; storageArea?: StorageAdapter | null };
const owns = (value: unknown, key: string): boolean => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, key);
const freeze = (settings: LaplaceProductPresentationSettings): LaplaceProductPresentationSettings => Object.freeze({ ...settings });
function migrate(raw: string | null): LaplaceProductPresentationSettings {
  let value;
  try { value = raw === null ? null : JSON.parse(raw); } catch { value = null; }
  return freeze({ version: 2,
    showAvatar: owns(value, 'showAvatar') && typeof value.showAvatar === 'boolean' ? value.showAvatar : true,
    showUsername: owns(value, 'showUsername') && typeof value.showUsername === 'boolean' ? value.showUsername : true,
    classicElementScope: false,
    showCurrentRank: owns(value, 'showCurrentRank') && typeof value.showCurrentRank === 'boolean' ? value.showCurrentRank : false,
    showGiftHighlightAbove: owns(value, 'showGiftHighlightAbove') && validProductHighlightThreshold(value.showGiftHighlightAbove) ? value.showGiftHighlightAbove : 30,
  });
}
type LegacyPresentation = Pick<LaplaceProductPresentationSettings, 'showCurrentRank' | 'showGiftHighlightAbove'> & { version: 1 };
function decode(raw: string): LaplaceProductPresentationSettings | LegacyPresentation | 'future' | null {
  try {
    const value = JSON.parse(raw);
    if (owns(value, 'version') && typeof value.version === 'number' && Number.isFinite(value.version) && value.version > 2) return 'future';
    if (!owns(value, 'version') || ![1, 2].includes(value.version) || !owns(value, 'showCurrentRank') || typeof value.showCurrentRank !== 'boolean'
      || !owns(value, 'showGiftHighlightAbove') || !validProductHighlightThreshold(value.showGiftHighlightAbove)) return null;
    if (value.version === 1) return { version: 1, showCurrentRank: value.showCurrentRank, showGiftHighlightAbove: value.showGiftHighlightAbove };
    if (['showAvatar', 'showUsername', 'classicElementScope'].some(key => !owns(value, key) || typeof value[key] !== 'boolean')) return null;
    return freeze({ version: 2, showCurrentRank: value.showCurrentRank, showGiftHighlightAbove: value.showGiftHighlightAbove, showAvatar: value.showAvatar, showUsername: value.showUsername, classicElementScope: value.classicElementScope });
  } catch { return null; }
}
const FUTURE = '呈现设置由较新版本保存，当前只读。请使用较新版本编辑，现有保存内容不会被覆盖。';
const CORRUPT = '呈现设置无法读取，已保留可用选择。修改开关后可重新保存。';
const MEMORY = '呈现设置无法保存或读取，当前选择仅在此页面有效。';
/** One authority per realm. Reads/migration/storage notifications never write;
 * only an explicit setter persists, and future schemas lock setters entirely. */
export function createLaplaceProductPresentationStore(getStorage: () => StorageAdapter) {
  const listeners = new Set<() => void>();
  let diagnostic = '';
  function legacy() {
    try { return migrate(getStorage().getItem(LAPLACE_SETTINGS_STORAGE_KEY)); }
    catch { diagnostic = MEMORY; return migrate(null); }
  }
  let initial = legacy(), readOnly = false;
  try {
    const raw = getStorage().getItem(LAPLACE_PRODUCT_PRESENTATION_KEY);
    if (raw !== null) {
      const parsed = decode(raw);
      if (parsed === 'future') { readOnly = true; diagnostic = FUTURE; }
      else if (parsed) initial = freeze({ ...initial, ...parsed, version: 2 });
      else diagnostic = CORRUPT;
    }
  } catch { diagnostic = MEMORY; }
  let snapshot: LaplaceProductPresentationSnapshot = Object.freeze({ settings: initial, readOnly, diagnostic, externalRevision: 0 });
  function publish(settings: LaplaceProductPresentationSettings, locked: boolean, message: string, external = false) {
    snapshot = Object.freeze({ settings, readOnly: locked, diagnostic: message, externalRevision: snapshot.externalRevision + (external ? 1 : 0) });
    for (const listener of [...listeners]) { try { listener(); } catch { /* A failed reader cannot block other consumers. */ } }
  }
  function save(settings: LaplaceProductPresentationSettings) {
    if (snapshot.readOnly) return;
    let message = '';
    try { getStorage().setItem(LAPLACE_PRODUCT_PRESENTATION_KEY, JSON.stringify(settings)); } catch { message = MEMORY; }
    publish(freeze(settings), false, message);
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    setShowCurrentRank(value: boolean) {
      if (typeof value !== 'boolean') return;
      save({ ...snapshot.settings, showCurrentRank: value });
    },
    setShowGiftHighlightAbove(value: number) {
      if (!validProductHighlightThreshold(value)) return;
      save({ ...snapshot.settings, showGiftHighlightAbove: value });
    },
    setShowAvatar(value: boolean) { if (typeof value === 'boolean') save({ ...snapshot.settings, showAvatar: value }); },
    setShowUsername(value: boolean) { if (typeof value === 'boolean') save({ ...snapshot.settings, showUsername: value }); },
    setClassicElementScope(value: boolean) { if (typeof value === 'boolean') save({ ...snapshot.settings, classicElementScope: value }); },
    handleStorageEvent(event: StorageChange) {
      if (event.key !== null && event.key !== LAPLACE_PRODUCT_PRESENTATION_KEY) return;
      if (event.storageArea) {
        try { if (event.storageArea !== getStorage()) return; } catch { publish(snapshot.settings, snapshot.readOnly, MEMORY); return; }
      }
      if (event.newValue === null || event.key === null) {
        diagnostic = ''; const settings = legacy();
        publish(settings, false, diagnostic || '呈现设置已移除，已按原显示设置重置。当前选择尚未保存。', true); return;
      }
      const parsed = decode(event.newValue);
      if (parsed === 'future') publish(snapshot.settings, true, FUTURE);
      else if (parsed) publish(freeze({ ...snapshot.settings, ...parsed, version: 2 }), false, '', true);
      else publish(snapshot.settings, false, CORRUPT);
    },
  };
}
export type LaplaceProductPresentationStore = ReturnType<typeof createLaplaceProductPresentationStore>;
let realmStore: LaplaceProductPresentationStore | undefined;
export function getLaplaceProductPresentationStore(): LaplaceProductPresentationStore {
  if (!realmStore) {
    realmStore = createLaplaceProductPresentationStore(() => globalThis.localStorage);
    if (typeof window !== 'undefined') window.addEventListener('storage', event => realmStore!.handleStorageEvent(event));
  }
  return realmStore;
}
