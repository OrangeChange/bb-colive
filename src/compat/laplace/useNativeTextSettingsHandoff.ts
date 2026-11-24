import { useCallback, useLayoutEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { LAPLACE_SETTINGS_STORAGE_KEY, pickLaplaceSettings, type LaplaceSettings } from './settings';

export const NATIVE_TEXT_LEGACY_KEYS = ['showAutoDanmaku', 'showPhoneNotVerified'] as const;
const NATIVE_GUARD_ENTRY_LEGACY_KEYS = ['showEnterEventCurrentGuardOnly'] as const;
type Key = typeof NATIVE_TEXT_LEGACY_KEYS[number] | typeof NATIVE_GUARD_ENTRY_LEGACY_KEYS[number];
/** Narrow same-mount handoff. A source editor only retakes a field on explicit edit. */
function useLegacySettingsHandoff<K extends Key>(keys: readonly K[], errorMessage: string, readOnEdit: boolean, active: boolean, settings: LaplaceSettings,
  setSettings: Dispatch<SetStateAction<LaplaceSettings>>, onReadError: (message: string) => void) {
  const protectedKeys = useRef(new Set<K>());
  const wasActive = useRef(false);
  const pendingRead = useRef(false);
  const refresh = useCallback(() => {
    if (!protectedKeys.current.size) return;
    try {
      const bytes = localStorage.getItem(LAPLACE_SETTINGS_STORAGE_KEY);
      let raw: unknown;
      try { raw = JSON.parse(bytes || '{}'); } catch { raw = {}; }
      const current = pickLaplaceSettings(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {});
      pendingRead.current = false;
      setSettings(previous => {
        const patch = Object.fromEntries([...protectedKeys.current].map(key => [key, current[key]]));
        return [...protectedKeys.current].some(key => previous[key] !== current[key]) ? { ...previous, ...patch } : previous;
      });
    } catch {
      pendingRead.current = true;
      onReadError(errorMessage);
    }
  }, [setSettings, onReadError, errorMessage]);
  // Layout precedes passive autosave, including the render that exits live mode.
  useLayoutEffect(() => {
    if (active) {
      keys.forEach(key => protectedKeys.current.add(key));
    } else {
      if (wasActive.current) pendingRead.current = true;
      if (pendingRead.current) refresh();
    }
    wasActive.current = active;
  }, [active, settings, refresh, keys]);
  useLayoutEffect(() => {
    if (active) return;
    const storage = (event: StorageEvent) => {
      if (event.storageArea === localStorage && (event.key === null || event.key === LAPLACE_SETTINGS_STORAGE_KEY)) refresh();
    };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, [active, refresh]);
  const edit = (key: K) => {
    if (active) return;
    if (readOnEdit && protectedKeys.current.has(key)) refresh();
    if (!pendingRead.current) protectedKeys.current.delete(key);
  };
  return { protectedKeys, edit };
}

/** Existing two-key API and handoff behavior stay unchanged. */
export function useNativeTextSettingsHandoff(active: boolean, settings: LaplaceSettings,
  setSettings: Dispatch<SetStateAction<LaplaceSettings>>, onReadError: (message: string) => void) {
  return useLegacySettingsHandoff(NATIVE_TEXT_LEGACY_KEYS, '无法读取最新模式设置；自动弹幕和手机号原值仍受保护，读取成功前不会被旧值覆盖。', false, active, settings, setSettings, onReadError);
}
export function useNativeGuardEntrySettingsHandoff(active: boolean, settings: LaplaceSettings,
  setSettings: Dispatch<SetStateAction<LaplaceSettings>>, onReadError: (message: string) => void) {
  return useLegacySettingsHandoff(NATIVE_GUARD_ENTRY_LEGACY_KEYS, '无法读取最新模式设置；大航海进房原值仍受保护，读取成功前不会被旧值覆盖。', true, active, settings, setSettings, onReadError);
}
