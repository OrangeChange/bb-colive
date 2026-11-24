/** Three independent style sources. IDs are labels, never synthetic cascade layers. */
export interface LaplaceCssSources { cloud: string; remote: string; custom: string }
export const EMPTY_LAPLACE_CSS: LaplaceCssSources = { cloud: '', remote: '', custom: '' };
export const CUSTOM_CSS_DEBOUNCE_MS = 400;
export const REMOTE_CSS_DEBOUNCE_MS = 800;
export const LAPLACE_CUSTOM_CSS_KEY = 'bb.laplace.customCss.v1';
export const LAPLACE_REMOTE_HISTORY_KEY = 'bb.laplace.remoteTemplateHistory.v1';
export const LAPLACE_APPEARANCE_KEY = 'bb.laplace.appearance.v1';
export const MAX_CSS_LENGTH = 5_000_000;
export interface RemoteTemplateMetadata { title?: string; description?: string; author?: string; version?: string; [key: string]: unknown }
export interface RemoteTemplateHistoryEntry { url: string; metadata: RemoteTemplateMetadata | null }
export interface LaplaceAppearance { demoBgColor: string; uiHue: number; uiChroma: number }
export const DEFAULT_LAPLACE_APPEARANCE: LaplaceAppearance = { demoBgColor: '', uiHue: 0, uiChroma: 0 };
export function clearCustomCss(sources: LaplaceCssSources): LaplaceCssSources { return { ...sources, custom: '' }; }
export function prependRemoteHistory(history: readonly RemoteTemplateHistoryEntry[], entry: RemoteTemplateHistoryEntry): RemoteTemplateHistoryEntry[] {
  return [entry, ...history.filter(item => item.url !== entry.url)].slice(0, 100);
}
export function readRemoteHistory(storage: Pick<Storage, 'getItem'>): RemoteTemplateHistoryEntry[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(LAPLACE_REMOTE_HISTORY_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item): item is RemoteTemplateHistoryEntry => Boolean(item) && typeof item === 'object' && typeof item.url === 'string' && item.url.length <= 8192 && (item.metadata == null || typeof item.metadata === 'object' && !Array.isArray(item.metadata))).slice(0, 100) : [];
  } catch { return []; }
}
/** Writing [] intentionally fixes the verified upstream final-history-item persistence bug. */
export function persistRemoteHistory(storage: Pick<Storage, 'setItem'>, history: readonly RemoteTemplateHistoryEntry[]): void {
  storage.setItem(LAPLACE_REMOTE_HISTORY_KEY, JSON.stringify(history));
}
export function readCustomCss(storage: Pick<Storage, 'getItem'>): string {
  try { return storage.getItem(LAPLACE_CUSTOM_CSS_KEY) || ''; } catch { return ''; }
}
export function readLaplaceAppearance(storage: Pick<Storage, 'getItem'>): LaplaceAppearance {
  try {
    const value = JSON.parse(storage.getItem(LAPLACE_APPEARANCE_KEY) || '{}');
    return { demoBgColor: typeof value.demoBgColor === 'string' && /^#[\da-f]{6}$/i.test(value.demoBgColor) ? value.demoBgColor : '', uiHue: typeof value.uiHue === 'number' && Number.isFinite(value.uiHue) ? value.uiHue : 0, uiChroma: typeof value.uiChroma === 'number' && Number.isFinite(value.uiChroma) ? value.uiChroma : 0 };
  } catch { return { ...DEFAULT_LAPLACE_APPEARANCE }; }
}
/** Toolbar uses persisted text; editor shortcut uses its current, possibly undebounced text. */
export function cssForExport(source: 'toolbar' | 'shortcut', persisted: string, draft: string): string { return source === 'toolbar' ? persisted : draft; }
export function downloadLaplaceCss(css: string, now = Date.now()): void {
  if (!css) return;
  const url = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = `theme-${now}.css`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

export { parseThemeCssMetadata as parseLaplaceCssMetadata } from '../../themes/themeCssMetadata.ts';
