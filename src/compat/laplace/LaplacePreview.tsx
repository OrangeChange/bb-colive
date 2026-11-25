import { useUiLanguage } from "../../i18n/react.ts";
import { localized, uiText } from "../../i18n/index.ts";
import { NATIVE_TEXT_LEGACY_KEYS, useNativeTextSettingsHandoff, useNativeGuardEntrySettingsHandoff } from './useNativeTextSettingsHandoff';
import { nativeLaplaceTextSourceSettings } from './nativeTextFilters';
import { livePaidSettings, type PaidDisplayFilter } from '../livePaidSettings';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from 'react';
import { UiSelect } from '../../components/ui/Select';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DEFAULT_LAPLACE_SETTINGS, LAPLACE_SETTING_LABELS, LAPLACE_NUMERIC_RULES, LAPLACE_SETTINGS_STORAGE_KEY, pickLaplaceSettings, readLaplaceSettings, parseLaplaceNumericDraft, validateLaplaceSetting, type LaplaceSettingKey, type LaplaceNumericKey } from './settings';
import { LaplaceStyleLoader, LAPLACE_TEMPLATE_OPTIONS, CURATED_REMOTE_TEMPLATES } from './styleLoader';
import { CUSTOM_CSS_DEBOUNCE_MS, REMOTE_CSS_DEBOUNCE_MS, LAPLACE_CUSTOM_CSS_KEY, LAPLACE_APPEARANCE_KEY, readCustomCss, readRemoteHistory, persistRemoteHistory, readLaplaceAppearance, cssForExport, downloadLaplaceCss } from './styles';
import { RendererHost, useLaplaceProjection, useLaplaceQueuedEvents } from './RendererHost';
import { getOriginalSamples, generateOriginalSimulationEvent } from './renderer/samples';
import type { LaplaceEvent, LaplaceInputRecord } from './types';
import { laplacePreviewOwners, type LaplacePreviewOwner, type LaplacePreviewOwnerSlot } from './productPreviewOwners';
import { useLaplaceProductProjection, useLaplaceProductSnapshot } from './useLaplaceProductProjection';
import { useLaplaceProductEvents } from './useLaplaceProductEvents';
import { LAPLACE_INTERACTION_CHILDREN, LAPLACE_GIFT_CHILDREN, LAPLACE_SYSTEM_CHILDREN } from './productEventSettings';
import { allowsProductEvent, admitsLaplaceProductEvent, productLaplaceGiftSourceSettings } from './productAdmission';
import { useLaplaceProductPresentation } from './useLaplaceProductPresentation';
import './preview.css';
import { LaplaceLiveHost } from './LaplaceLiveHost';

const INTERACTION_LABELS = localized(() => ({ entry: uiText("laplacePreview.INTERACTION_LABELS.entry"), follow: uiText("laplacePreview.INTERACTION_LABELS.follow"), share: uiText("laplacePreview.INTERACTION_LABELS.share"), specialFollow: uiText("laplacePreview.INTERACTION_LABELS.specialFollow"), mutualFollow: uiText("laplacePreview.INTERACTION_LABELS.mutualFollow"), like: uiText("laplacePreview.INTERACTION_LABELS.like") }));
const SYSTEM_LABELS = localized(() => ({ live: uiText("laplacePreview.SYSTEM_LABELS.live"), userMute: uiText("laplacePreview.SYSTEM_LABELS.userMute"), roomMute: uiText("laplacePreview.SYSTEM_LABELS.roomMute"), roomChange: uiText("laplacePreview.SYSTEM_LABELS.roomChange"), warning: uiText("laplacePreview.SYSTEM_LABELS.warning") }));
const NO_SIMULATION_RECORDS: readonly LaplaceInputRecord[] = Object.freeze([]);
const GROUPS: { title: string; keys: LaplaceSettingKey[] }[] = localized(() => ([
  { title: '消息种类', keys: ['showDanmaku', 'showSuperChat', 'showToast'] },
  { title: uiText("laplacePreview.GROUPS.title"), keys: ['showPhoneNotVerified', 'showAutoDanmaku', 'showEnterEventCurrentGuardOnly', 'showGiftPriceAbove', 'showGiftHighlightAbove'] },
  { title: '身份与内容', keys: ['showUsername', 'showAvatar', 'showAvatarFrame', 'showGuardBadge', 'showMedal', 'showMedalLightenedOnly', 'showWealthMedal', 'showCurrentRank', 'showModBadge', 'showSpoiler'] },
  { title: uiText("laplacePreview.GROUPS.title2"), keys: ['showStickyBar', 'limitEventAmount', 'showGiftStickyAbove', 'limitStickyAmount', 'baseFontSize'] },
]));
const SIMULATION_TYPES = localized(() => ([
  ['message', uiText("laplacePreview.SIMULATION_TYPES")], ['effect-message', uiText("laplacePreview.SIMULATION_TYPES2")], ['superchat', uiText("laplacePreview.SIMULATION_TYPES3")], ['gift', uiText("laplacePreview.SIMULATION_TYPES4")], ['toast', uiText("laplacePreview.SIMULATION_TYPES5")], ['interaction', uiText("laplacePreview.SIMULATION_TYPES6")], ['like-click', uiText("laplacePreview.SIMULATION_TYPES7")], ['system', uiText("laplacePreview.SIMULATION_TYPES8")], ['live-start', uiText("laplacePreview.SIMULATION_TYPES9")], ['live-end', uiText("laplacePreview.SIMULATION_TYPES10")], ['live-warning', uiText("laplacePreview.SIMULATION_TYPES11")], ['live-cutoff', uiText("laplacePreview.SIMULATION_TYPES12")], ['room-name-update', uiText("laplacePreview.SIMULATION_TYPES13")], ['room-mute-on', uiText("laplacePreview.SIMULATION_TYPES14")], ['room-mute-off', uiText("laplacePreview.SIMULATION_TYPES15")], ['red-envelope-start', uiText("laplacePreview.SIMULATION_TYPES16")], ['red-envelope-result', uiText("laplacePreview.SIMULATION_TYPES17")], ['lottery-start', uiText("laplacePreview.SIMULATION_TYPES18")], ['lottery-result', uiText("laplacePreview.SIMULATION_TYPES19")], ['user-block', uiText("laplacePreview.SIMULATION_TYPES20")],
] as const));
type PreviewMode = 'static' | 'design' | 'simulation';
const MODE_OPTIONS = localized(() => ([{ value: 'static', label: uiText("laplacePreview.MODE_OPTIONS.label") }, { value: 'design', label: uiText("laplacePreview.MODE_OPTIONS.label2") }, { value: 'simulation', label: uiText("laplacePreview.MODE_OPTIONS.label3") }]));

export default function LaplacePreview({ live = false, nativeTextFilters = false, nativeGuardEntry = false, paidFilter, sessionIdentity = 'laplace-preview' }: { live?: boolean; nativeTextFilters?: boolean; nativeGuardEntry?: boolean; paidFilter?: PaidDisplayFilter; sessionIdentity?: string }) {
  useUiLanguage();
  const { store: presentationStore, snapshot: presentation } = useLaplaceProductPresentation();
  const { store: productEventStore, snapshot: productEvents } = useLaplaceProductEvents();
  const [settings, setSettings] = useState(() => readLaplaceSettings(localStorage));
  const [customCss, setCustomCss] = useState(() => readCustomCss(localStorage));
  const [draftCss, setDraftCss] = useState(customCss);
  const [composing, setComposing] = useState(false);
  const [appearance, setAppearance] = useState(() => readLaplaceAppearance(localStorage));
  const [loader] = useState(() => new LaplaceStyleLoader(undefined, readRemoteHistory(localStorage)));
  const styleState = useSyncExternalStore(loader.subscribe, loader.getSnapshot);
  const [remoteDraft, setRemoteDraft] = useState(settings.remoteTheme || '');
  const lastRemoteAttempt = useRef('');
  const [remoteComposing, setRemoteComposing] = useState(false);
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    setNumericDrafts(previous => { const { showGiftHighlightAbove: _draft, ...rest } = previous; return rest; });
    setFieldErrors(previous => { const { showGiftHighlightAbove: _error, ...rest } = previous; return rest; });
  }, [presentation.externalRevision]);
  const [status, setStatus] = useState('');
  const [storageError, setStorageError] = useState('');
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mode, setMode] = useState<PreviewMode>('static');
  const [intervalMs, setIntervalMs] = useState(300);
  const [enabledTypes, setEnabledTypes] = useState(() => new Set<string>(SIMULATION_TYPES.map(([type]) => type)));
  const [following, setFollowing] = useState(true);
  const [owner, setOwner] = useState<LaplacePreviewOwner | null>(null);
  const settingsAuthority = useRef({});
  const activated = useRef<{ slot: LaplacePreviewOwnerSlot; identity: string } | null>(null);
  const effectiveNativeTextFilters = live && nativeTextFilters;
  const effectiveNativeGuardEntry = live && nativeGuardEntry;
  const nativeTextHandoff = useNativeTextSettingsHandoff(effectiveNativeTextFilters, settings, setSettings, setStorageError);
  const nativeGuardHandoff = useNativeGuardEntrySettingsHandoff(effectiveNativeGuardEntry, settings, setSettings, setStorageError);
  const consumerSettings = useMemo(() => {
    const source = live ? { ...settings, ...livePaidSettings(paidFilter) } : settings;
    return productLaplaceGiftSourceSettings(effectiveNativeTextFilters ? nativeLaplaceTextSourceSettings(source) : source);
  }, [live, settings, paidFilter?.threshold, paidFilter?.mode, effectiveNativeTextFilters]);
  const rendererSettings = useMemo(() => ({ ...consumerSettings, showCurrentRank: presentation.settings.showCurrentRank, showGiftHighlightAbove: presentation.settings.showGiftHighlightAbove, showAvatar: presentation.settings.showAvatar, showUsername: presentation.settings.showUsername }), [consumerSettings, presentation.settings]);
  useLayoutEffect(() => {
    const slot = live ? 'live-preview' : 'simulation-preview';
    const previous = activated.current;
    // Explicit parent session changes replace that finite slot. Remounts with
    // unchanged identity activate idempotently; view cleanup never disposes it.
    const next = previous?.slot === slot && previous.identity !== sessionIdentity
      ? laplacePreviewOwners.replace(slot, sessionIdentity, consumerSettings, settingsAuthority.current)
      : laplacePreviewOwners.activate(slot, sessionIdentity, consumerSettings, settingsAuthority.current);
    activated.current = { slot, identity: sessionIdentity }; setOwner(next);
    return () => laplacePreviewOwners.release(slot, settingsAuthority.current);
  }, [live, sessionIdentity, consumerSettings]);
  const productSnapshot = useLaplaceProductSnapshot(owner?.session ?? null);
  const records = owner?.simulation ? productSnapshot.records : NO_SIMULATION_RECORDS;
  const sourceGeneration = productSnapshot.resetEpoch;
  const ingestPreviewEvents = useCallback((events: LaplaceEvent[]) => { owner?.simulation?.ingest(events); }, [owner]);
  const editor = useRef<HTMLTextAreaElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const initialSettings = useRef(settings);
  const [staticSamples] = useState(() => getOriginalSamples('static') as LaplaceEvent[]);
  const [designSamples] = useState(() => getOriginalSamples('design') as LaplaceEvent[]);
  const queueOptions = useMemo(() => ({
    productEventGate: (event: LaplaceEvent) => allowsProductEvent(event, productEvents.settings),
    admit: (event: LaplaceEvent) => admitsLaplaceProductEvent(event, consumerSettings, productEvents.settings),
  }), [productEvents.settings, consumerSettings]);
  const queued = useLaplaceQueuedEvents(records, sourceGeneration, consumerSettings, following, true, false, true, queueOptions);
  const scrollable = mode !== 'simulation';
  useEffect(() => { if (!scrollable) setFollowing(true); }, [scrollable]);
  const samples = useMemo(() => mode === 'static' ? staticSamples.filter(event => allowsProductEvent(event, productEvents.settings)) : mode === 'design' ? designSamples : queued.events, [mode, staticSamples, designSamples, queued.events, productEvents.settings]);
  const sourceProjection = useLaplaceProjection(samples, consumerSettings, mode, scrollable);
  const productProjection = useLaplaceProductProjection(queued.records, productSnapshot, consumerSettings, 'simulation', false, productEvents.settings);
  const projection = mode === 'simulation' ? productProjection : sourceProjection;
  const css = useMemo(() => ({ cloud: styleState.cloud, remote: styleState.remote, custom: customCss }), [styleState.cloud, styleState.remote, customCss]);
  const loadRemote = useCallback(async (url: string) => {
    lastRemoteAttempt.current = url;
    const result = await loader.loadRemote(url);
    if (result) { setSettings(previous => ({ ...previous, remoteTheme: url })); setStatus(url ? uiText("laplacePreview.LaplacePreview.loadRemote") : uiText("laplacePreview.LaplacePreview.loadRemote2")); }
  }, [loader]);
  useEffect(() => {
    if (!live) document.title = uiText("laplacePreview.LaplacePreview");
    void loader.loadCloud(initialSettings.current.cloudTheme);
    if (initialSettings.current.remoteTheme) void loader.loadRemote(initialSettings.current.remoteTheme);
    return () => loader.dispose();
  }, [loader]);
  useEffect(() => {
    try {
      // Product-owned controls preserve raw legacy
      // fields if present, but never manufacture old defaults during source autosave.
      let legacy: Record<string, unknown> = {};
      const legacyBytes = localStorage.getItem(LAPLACE_SETTINGS_STORAGE_KEY);
      try { const raw = JSON.parse(legacyBytes || 'null');
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) legacy = raw;
      } catch { /* A malformed legacy object has no reliable own fields. */ }
      const { showCurrentRank: _rank, showGiftHighlightAbove: _highlight, showAvatar: _avatar, showUsername: _username, showGift: _gift, showGiftFree: _free, showRedEnvelop: _red, showLottery: _lottery, ...sourceSettings } = settings;
      const protectedLegacyKeys = [...nativeTextHandoff.protectedKeys.current, ...nativeGuardHandoff.protectedKeys.current];
      for (const key of protectedLegacyKeys) delete (sourceSettings as Partial<typeof settings>)[key];
      const preserved = Object.fromEntries(['showCurrentRank', 'showGiftHighlightAbove', 'showAvatar', 'showUsername', 'showGift', 'showGiftFree', 'showRedEnvelop', 'showLottery', ...protectedLegacyKeys]
        .filter(key => Object.prototype.hasOwnProperty.call(legacy, key)).map(key => [key, legacy[key]]));
      localStorage.setItem(LAPLACE_SETTINGS_STORAGE_KEY, JSON.stringify({ ...sourceSettings, ...preserved }));
    }
    catch { setStorageError(uiText("laplacePreview.LaplacePreview2")); }
  }, [settings, live, nativeTextFilters, nativeGuardEntry]);
  useEffect(() => {
    try { localStorage.setItem(LAPLACE_CUSTOM_CSS_KEY, customCss); }
    catch { setStorageError(uiText("laplacePreview.LaplacePreview3")); }
  }, [customCss]);
  useEffect(() => { try { persistRemoteHistory(localStorage, styleState.history); } catch { setStorageError(uiText("laplacePreview.LaplacePreview4")); } }, [styleState.history]);
  useEffect(() => { try { localStorage.setItem(LAPLACE_APPEARANCE_KEY, JSON.stringify(appearance)); } catch { setStorageError(uiText("laplacePreview.LaplacePreview5")); } }, [appearance]);
  useEffect(() => {
    if (composing) return;
    const timer = setTimeout(() => setCustomCss(draftCss), CUSTOM_CSS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draftCss, composing]);
  useEffect(() => {
    if (remoteComposing || !remoteDraft || remoteDraft === settings.remoteTheme || remoteDraft === lastRemoteAttempt.current) return;
    const timer = setTimeout(() => void loadRemote(remoteDraft), REMOTE_CSS_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [remoteDraft, settings.remoteTheme, remoteComposing, loadRemote]);
  useEffect(() => {
    if (live || mode !== 'simulation') return;
    const timer = setInterval(() => {
      const event = generateOriginalSimulationEvent({ enabledTypes }) as LaplaceEvent | null;
      if (event && event.type !== 'notice') ingestPreviewEvents([event]);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [live, mode, intervalMs, enabledTypes, ingestPreviewEvents]);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(entries => setCanvasWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(canvas.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!fullscreen) return;
    const keydown = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape' && !event.isComposing) { setFullscreen(false); editor.current?.focus(); } };
    document.addEventListener('keydown', keydown); return () => document.removeEventListener('keydown', keydown);
  }, [fullscreen]);
  const qaSnapshot = useRef({ settings, css, draftCss, mode, projection, records, sourceGeneration, following, rate: queued.rate, pendingCount: queued.pendingCount });
  qaSnapshot.current = { settings, css, draftCss, mode, projection, records, sourceGeneration, following, rate: queued.rate, pendingCount: queued.pendingCount };
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const target = window as unknown as Record<string, unknown>;
    target.__laplaceEditorQA = {
      snapshot: () => structuredClone(qaSnapshot.current),
      ingestFixtureBatch: ingestPreviewEvents,
      clearFixtureSource: () => { owner?.simulation?.clear(); },
      configure: (values: Record<string, unknown>) => setSettings(previous => pickLaplaceSettings({ ...previous, ...values })),
      setMode: (value: PreviewMode) => { if (MODE_OPTIONS.some(option => option.value === value)) setMode(value); },
      setFollowing,
    };
    return () => { delete target.__laplaceEditorQA; };
  }, [ingestPreviewEvents]);
  function editNumber(key: LaplaceNumericKey, raw: string) {
    setNumericDrafts(previous => ({ ...previous, [key]: raw }));
    const value = parseLaplaceNumericDraft(raw); const error = validateLaplaceSetting(key, value);
    setFieldErrors(previous => ({ ...previous, [key]: error || '' }));
    if (!error) {
      if (key === 'showGiftHighlightAbove') presentationStore.setShowGiftHighlightAbove(value);
      else setSettings(previous => ({ ...previous, [key]: value }));
    }
  }
  async function selectTemplate() {
    if (pendingTemplate === null) return;
    const value = pendingTemplate;
    const result = await loader.loadCloud(value);
    if (result === null) throw new Error('Template load failed');
    setDraftCss(result); setCustomCss(result); setSettings(previous => ({ ...previous, cloudTheme: value }));
    setStatus(value ? uiText("laplacePreview.LaplacePreview.selectTemplate") : uiText("laplacePreview.LaplacePreview.selectTemplate2"));
  }
  async function copyCss() {
    try { await navigator.clipboard.writeText(cssForExport('toolbar', customCss, draftCss)); setStatus(uiText("laplacePreview.LaplacePreview.copyCss")); }
    catch { setStatus(uiText("laplacePreview.LaplacePreview.copyCss2")); }
  }
  function editorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); downloadLaplaceCss(cssForExport('shortcut', customCss, draftCss)); }
    if (event.key === 'Tab') {
      event.preventDefault(); const { selectionStart, selectionEnd } = event.currentTarget;
      setDraftCss(previous => previous.slice(0, selectionStart) + '  ' + previous.slice(selectionEnd));
      requestAnimationFrame(() => editor.current?.setSelectionRange(selectionStart + 2, selectionStart + 2));
    }
  }
  const pageStyle = { ...(appearance.uiHue ? { '--primary-h': appearance.uiHue, '--secondary-h': appearance.uiHue } : {}), ...(appearance.uiChroma ? { '--secondary-c': appearance.uiChroma } : {}), ...(appearance.uiHue || appearance.uiChroma ? { '--laplace-page-accent': `oklch(${settings.colorScheme === 'dark' ? 90 : 64}% ${appearance.uiChroma || .212} ${appearance.uiHue || 8})` } : {}) } as CSSProperties;
  return <main className="laplace-preview" data-scheme={settings.colorScheme} style={pageStyle}>
    <header className="laplace-heading"><h1 className="ui-type-page-title">{live ? uiText("laplacePreview.LaplacePreview6") : uiText("laplacePreview.LaplacePreview")}</h1><p className="ui-type-micro">{uiText("laplacePreview.LaplacePreview7")}</p></header>
    <div className="laplace-workspace">
      <section className="laplace-editor-column" aria-label={uiText("laplacePreview.aria_label")}>
        <div className="laplace-template-row">
          <div className="laplace-field"><label htmlFor="laplace-template">{uiText("laplacePreview.LaplacePreview8")}</label><UiSelect id="laplace-template" ariaLabel={uiText("laplacePreview.ariaLabel")} value={settings.cloudTheme} onValueChange={setPendingTemplate} options={LAPLACE_TEMPLATE_OPTIONS} /></div>
          <div className="laplace-field"><label htmlFor="laplace-colorScheme">{uiText("laplacePreview.LaplacePreview9")}</label><UiSelect id="laplace-colorScheme" ariaLabel={uiText("laplacePreview.ariaLabel2")} value={settings.colorScheme} onValueChange={value => setSettings(previous => ({ ...previous, colorScheme: value as 'light' | 'dark' }))} options={[{ value: 'light', label: uiText("common.light") }, { value: 'dark', label: uiText("common.dark") }]} /></div>
        </div>
        {styleState.cloudLoading && <p role="status" className="laplace-help">{uiText("laplacePreview.LaplacePreview10")}</p>}
        {styleState.cloudError && <p role="alert" className="laplace-error">{styleState.cloudError}</p>}
        <details className="laplace-remote-picker"><summary>{uiText("laplacePreview.LaplacePreview11")}{settings.remoteTheme ? uiText("laplacePreview.LaplacePreview12") : ''}</summary>
          <form noValidate onSubmit={event => { event.preventDefault(); void loadRemote(remoteDraft); }}>
            <label htmlFor="laplace-remote-url">{uiText("laplacePreview.LaplacePreview13")}</label>
            <input id="laplace-remote-url" type="url" value={remoteDraft} onCompositionStart={() => setRemoteComposing(true)} onCompositionEnd={() => setRemoteComposing(false)} onChange={event => { loader.cancelPendingRemote(); lastRemoteAttempt.current = ''; setRemoteDraft(event.target.value); }} placeholder="https://example.com/theme.css" aria-describedby="laplace-remote-help" aria-invalid={Boolean(styleState.remoteError)} />
            <div className="laplace-actions"><button type="submit" disabled={styleState.remoteLoading || !remoteDraft}>{uiText("laplacePreview.LaplacePreview14")}</button><button type="button" onClick={() => { setRemoteDraft(''); void loadRemote(''); }} disabled={!remoteDraft && !styleState.remoteUrl}>{uiText("laplacePreview.LaplacePreview15")}</button></div>
            <p id="laplace-remote-help" className="laplace-help">{uiText("laplacePreview.LaplacePreview16")}</p>
            {styleState.remoteLoading && <p role="status">{uiText("laplacePreview.LaplacePreview17")}</p>}
            {styleState.remoteError && <p role="alert" className="laplace-error">{styleState.remoteError}</p>}
            {styleState.remoteUrl && <p className="laplace-source">{uiText("laplacePreview.LaplacePreview18")}{styleState.remoteUrl}</p>}
          </form>
          <div className="laplace-history"><h3 className="ui-type-section-title">{uiText("laplacePreview.LaplacePreview19")}</h3>{styleState.history.length ? styleState.history.map(item => <div className="laplace-history-row" key={item.url}><button type="button" onClick={() => { setRemoteDraft(item.url); void loadRemote(item.url); }} title={item.url}>{typeof item.metadata?.title === 'string' ? item.metadata.title : item.url}</button><button type="button" aria-label={uiText("laplacePreview.aria_label2", { url: item.url })} onClick={() => loader.removeHistory(item.url)}>{uiText("common.remove")}</button></div>) : <p className="laplace-help">{uiText("laplacePreview.LaplacePreview20")}</p>}</div>
          <h3 className="ui-type-section-title">{uiText("laplacePreview.LaplacePreview21")}</h3><div className="laplace-actions">{CURATED_REMOTE_TEMPLATES.map(item => <button type="button" key={item.url} onClick={() => { setRemoteDraft(item.url); void loadRemote(item.url); }}>{item.title}</button>)}</div>
        </details>
        <div className={`laplace-css-editor${fullscreen ? ' is-fullscreen' : ''}`}>
          <div className="laplace-editor-toolbar"><label htmlFor="laplace-css">{uiText("laplacePreview.LaplacePreview22")}</label><div className="laplace-actions"><button type="button" onClick={() => void copyCss()} disabled={!customCss}>{uiText("laplacePreview.LaplacePreview23")}</button><button type="button" onClick={() => downloadLaplaceCss(cssForExport('toolbar', customCss, draftCss))} disabled={!customCss}>{uiText("laplacePreview.LaplacePreview24")}</button><button type="button" onClick={() => setClearConfirmation(true)} disabled={!customCss}>{uiText("laplacePreview.LaplacePreview25")}</button><button type="button" onClick={() => { setFullscreen(value => !value); editor.current?.focus(); }} aria-pressed={fullscreen}>{fullscreen ? uiText("laplacePreview.LaplacePreview26") : uiText("laplacePreview.LaplacePreview27")}</button></div></div>
          <textarea ref={editor} id="laplace-css" className="resize-none" spellCheck={false} value={draftCss} onChange={event => setDraftCss(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={editorKeyDown} aria-describedby="laplace-css-help" placeholder={uiText("laplacePreview.placeholder")} />
          <p id="laplace-css-help" className="laplace-help">{uiText("laplacePreview.LaplacePreview28")}</p>
        </div>
        <p className="laplace-status" role="status">{status || (draftCss !== customCss ? uiText("laplacePreview.LaplacePreview29") : uiText("laplacePreview.LaplacePreview30"))}</p>
        {storageError && <p role="alert" className="laplace-error">{storageError}</p>}
        <details className="laplace-settings" open><summary>{uiText("laplacePreview.LaplacePreview31")}</summary>
          {effectiveNativeTextFilters && <p className="laplace-help">{uiText("laplacePreview.LaplacePreview32")}</p>}
          {GROUPS.map(group => <fieldset key={group.title}><legend className="ui-type-section-title">{group.title}</legend><div className="laplace-settings-grid">{group.keys.filter(key => (!live || key !== "showGiftPriceAbove") && (!effectiveNativeTextFilters || !["showAutoDanmaku", "showPhoneNotVerified"].includes(key))).filter(key => !effectiveNativeGuardEntry || key !== "showEnterEventCurrentGuardOnly").map(key => {
            const productField = key === 'showCurrentRank' || key === 'showGiftHighlightAbove' || key === 'showAvatar' || key === 'showUsername';
            const disabled = productField && presentation.readOnly || key === 'showMedalLightenedOnly' && !settings.showMedal || key === 'showGiftStickyAbove' && !settings.showStickyBar;
            const label = key === 'showCurrentRank' ? uiText("laplacePreview.LaplacePreview.label") : key === 'showGiftHighlightAbove' ? uiText("laplacePreview.LaplacePreview.label2") : LAPLACE_SETTING_LABELS[key];
            return typeof DEFAULT_LAPLACE_SETTINGS[key] === 'boolean' ? <label className="laplace-check" key={key} title={key === 'showEnterEventCurrentGuardOnly' ? uiText("laplacePreview.title") : undefined}><input id={`laplace-${key}`} type="checkbox" checked={key === 'showCurrentRank' || key === 'showAvatar' || key === 'showUsername' ? presentation.settings[key] : settings[key] as boolean} disabled={disabled} onChange={event => key === 'showCurrentRank' ? presentationStore.setShowCurrentRank(event.target.checked) : key === 'showAvatar' ? presentationStore.setShowAvatar(event.target.checked) : key === 'showUsername' ? presentationStore.setShowUsername(event.target.checked) : (() => { if ((NATIVE_TEXT_LEGACY_KEYS as readonly string[]).includes(key)) nativeTextHandoff.edit(key as typeof NATIVE_TEXT_LEGACY_KEYS[number]); if (key === 'showEnterEventCurrentGuardOnly') nativeGuardHandoff.edit(key); setSettings(previous => ({ ...previous, [key]: event.target.checked })); })()} />{label}</label> : <div className="laplace-field" key={key}><label htmlFor={`laplace-${key}`}>{label}</label><div className="laplace-number"><input id={`laplace-${key}`} type={key === 'showGiftHighlightAbove' ? 'text' : 'number'} inputMode={key === 'showGiftHighlightAbove' ? 'decimal' : undefined} min={LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].min} max={LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].max} step={LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].step} value={numericDrafts[key] ?? String(key === 'showGiftHighlightAbove' ? presentation.settings.showGiftHighlightAbove : settings[key])} disabled={disabled} onChange={event => editNumber(key as LaplaceNumericKey, event.target.value)} aria-invalid={Boolean(fieldErrors[key])} aria-describedby={fieldErrors[key] ? `laplace-${key}-error` : undefined} /><span>{LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].unit}</span></div>{fieldErrors[key] && <p id={`laplace-${key}-error`} className="laplace-error" role="alert">{fieldErrors[key]}</p>}</div>;
          })}</div>{group.title === '身份与内容' && <div><label className="laplace-check"><input id="laplace-classicElementScope" type="checkbox" checked={presentation.settings.classicElementScope} disabled={presentation.readOnly} onChange={event => presentationStore.setClassicElementScope(event.target.checked)} aria-describedby="laplace-classic-help" />{uiText("laplacePreview.LaplacePreview33")}</label><p id="laplace-classic-help" className="laplace-help">{uiText("laplacePreview.LaplacePreview34")}</p></div>}{group.title === '消息种类' && <div className="laplace-interaction-group" role="group" aria-label={uiText("laplacePreview.aria_label3")} aria-describedby="laplace-gift-help">
            <label className="laplace-check"><input id="laplace-gift-enabled" type="checkbox" checked={productEvents.settings.gifts.enabled} disabled={productEvents.readOnly} onChange={event => productEventStore.setGiftEnabled(event.target.checked)} />{uiText("laplacePreview.LaplacePreview35")}</label>
            <p id="laplace-gift-help" className="laplace-help">{uiText("laplacePreview.LaplacePreview36")}</p>
            <div className="laplace-settings-grid">{LAPLACE_GIFT_CHILDREN.map(key => <label className="laplace-check" key={key}><input id={`laplace-gift-${key}`} type="checkbox" checked={productEvents.settings.gifts.children[key]} disabled={productEvents.readOnly} onChange={event => productEventStore.setGiftChild(key, event.target.checked)} />{{ free: uiText("laplacePreview.LaplacePreview.free"), normal: uiText("laplacePreview.LaplacePreview.normal"), blind: uiText("laplacePreview.LaplacePreview.blind"), redEnvelope: uiText("laplacePreview.LaplacePreview.redEnvelope"), lottery: uiText("laplacePreview.LaplacePreview.lottery") }[key]}</label>)}</div>
          </div>}{group.title === '消息种类' && <div className="laplace-interaction-group" role="group" aria-label={uiText("laplacePreview.aria_label4")} aria-describedby="laplace-interaction-help">
            <label className="laplace-check"><input id="laplace-interaction-enabled" type="checkbox" checked={productEvents.settings.interactions.enabled} disabled={productEvents.readOnly} onChange={event => productEventStore.setEnabled(event.target.checked)} />{uiText("laplacePreview.LaplacePreview37")}</label>
            <p id="laplace-interaction-help" className="laplace-help">{productEvents.settings.interactions.enabled ? uiText("laplacePreview.LaplacePreview38") : uiText("laplacePreview.LaplacePreview39")}</p>
            <div className="laplace-settings-grid">{LAPLACE_INTERACTION_CHILDREN.map(key => <label className="laplace-check" key={key}><input id={`laplace-interaction-${key}`} type="checkbox" checked={productEvents.settings.interactions.children[key]} disabled={productEvents.readOnly} onChange={event => productEventStore.setChild(key, event.target.checked)} />{INTERACTION_LABELS[key]}</label>)}</div>
            {!live && productEvents.diagnostic && <p className="laplace-help" role="status">{productEvents.diagnostic}</p>}
          </div>}</fieldset>)}
          <fieldset aria-describedby="laplace-system-help"><legend className="ui-type-section-title">{uiText("laplacePreview.LaplacePreview40")}</legend>
            <label className="laplace-check"><input id="laplace-showSystemMessage" type="checkbox" checked={settings.showSystemMessage} onChange={event => setSettings(previous => ({ ...previous, showSystemMessage: event.target.checked }))} />{LAPLACE_SETTING_LABELS.showSystemMessage}</label>
            <div className="laplace-settings-grid">{LAPLACE_SYSTEM_CHILDREN.map(key => <label className="laplace-check" key={key}><input id={`laplace-system-${key}`} type="checkbox" checked={productEvents.settings.systems.children[key]} disabled={productEvents.readOnly} onChange={event => productEventStore.setSystemChild(key, event.target.checked)} />{SYSTEM_LABELS[key]}</label>)}</div>
            <p id="laplace-system-help" className="laplace-help">{uiText("laplacePreview.LaplacePreview41")}</p>
          </fieldset>
          {presentation.diagnostic && <p className="laplace-help" role="status">{presentation.diagnostic}</p>}
          <div className="laplace-field"><label htmlFor="laplace-roomIds">{uiText("laplacePreview.LaplacePreview42")}</label><input id="laplace-roomIds" value={settings.roomIds.join('、')} readOnly placeholder={uiText("laplacePreview.placeholder2")} /></div>
        </details>
      </section>
      <section className="laplace-preview-column" aria-label={uiText("laplacePreview.aria_label5")}>
        <div className="laplace-preview-controls">{!live && <UiSelect ariaLabel={uiText("laplacePreview.ariaLabel3")} value={mode} onValueChange={value => setMode(value as PreviewMode)} options={MODE_OPTIONS} />}<span className="laplace-width ui-type-micro">{canvasWidth || '…'} px</span></div>
        <div className="laplace-scene-controls"><div className="laplace-field"><label htmlFor="laplace-sceneName">{uiText("laplacePreview.LaplacePreview43")}</label><input id="laplace-sceneName" value={settings.sceneName} onChange={event => setSettings(previous => ({ ...previous, sceneName: event.target.value }))} placeholder={uiText("laplacePreview.placeholder3")} /></div><div className="laplace-field"><label htmlFor="laplace-demo-bg">{uiText("laplacePreview.LaplacePreview44")}</label><div className="laplace-color-row"><input id="laplace-demo-bg" aria-label={uiText("laplacePreview.aria_label6")} type="color" value={appearance.demoBgColor || '#299229'} onChange={event => setAppearance(previous => ({ ...previous, demoBgColor: event.target.value }))} /><button type="button" disabled={!appearance.demoBgColor} onClick={() => setAppearance(previous => ({ ...previous, demoBgColor: '' }))}>{uiText("laplacePreview.LaplacePreview45")}</button></div></div></div>
        {!live && mode === 'simulation' && <details className="laplace-simulation"><summary>{uiText("laplacePreview.LaplacePreview46")}{intervalMs}ms</summary><label htmlFor="laplace-simulation-speed">{uiText("laplacePreview.LaplacePreview47")}<output>{intervalMs}ms</output></label><input id="laplace-simulation-speed" className="settings-range" style={{ "--settings-range-progress": `${(2000 - intervalMs) / 1970 * 100}%` } as CSSProperties} type="range" min={30} max={2000} step={10} value={2030 - intervalMs} onChange={event => setIntervalMs(2030 - Number(event.target.value))} /><div className="laplace-speed-marks"><span>{uiText("laplacePreview.LaplacePreview48")}</span><span>{uiText("laplacePreview.LaplacePreview49")}</span><span>{uiText("laplacePreview.LaplacePreview50")}</span><span>{uiText("laplacePreview.LaplacePreview51")}</span></div><label className="laplace-check"><input type="checkbox" checked={enabledTypes.size === SIMULATION_TYPES.length} onChange={event => setEnabledTypes(event.target.checked ? new Set(SIMULATION_TYPES.map(([type]) => type)) : new Set())} />{uiText("laplacePreview.LaplacePreview52")}</label><div className="laplace-type-grid">{SIMULATION_TYPES.map(([type, label]) => <label key={type} className="laplace-check"><input type="checkbox" checked={enabledTypes.has(type)} onChange={event => setEnabledTypes(previous => { const next = new Set(previous); if (event.target.checked) next.add(type); else next.delete(type); return next; })} />{label}</label>)}</div></details>}
        <div ref={canvas} className="laplace-preview-canvas compat-preview-surface" data-scheme={settings.colorScheme} style={appearance.demoBgColor ? { background: appearance.demoBgColor } : undefined}>{live ? <>{owner && <LaplaceLiveHost nativeGuardEntry={effectiveNativeGuardEntry} nativeTextFilters={effectiveNativeTextFilters} key={sessionIdentity} productSession={owner.session} paidFilter={paidFilter} settings={settings} css={css} />}</> : <RendererHost variant="product" productElements={{ classicScope: presentation.settings.classicElementScope }} acquisitionMode="direct" settings={rendererSettings} css={css} appearance={appearance} events={projection.events} stickyEvents={projection.stickyEvents} preview scrollable={scrollable} rate={queued.rate} onFollowingChange={setFollowing} />}</div>
        <p className="laplace-help">{live ? uiText("laplacePreview.LaplacePreview53") : mode === 'design' ? uiText("laplacePreview.LaplacePreview54") : mode === 'static' ? uiText("laplacePreview.LaplacePreview55") : uiText("laplacePreview.LaplacePreview56", { length: projection.events.length, value: queued.pendingCount ? uiText("laplacePreview.LaplacePreview.value", { pendingCount: queued.pendingCount }) : '' })}</p>
        <p className="laplace-help">{uiText("laplacePreview.LaplacePreview57")}</p>
        <details className="laplace-appearance"><summary>{uiText("laplacePreview.LaplacePreview58")}</summary><p className="laplace-help">{uiText("laplacePreview.LaplacePreview59")}</p><div className="laplace-template-row"><div className="laplace-field"><label htmlFor="laplace-ui-hue">{uiText("laplacePreview.LaplacePreview60")}</label><input id="laplace-ui-hue" type="number" value={appearance.uiHue} onChange={event => { const value = parseLaplaceNumericDraft(event.target.value); if (Number.isFinite(value)) setAppearance(previous => ({ ...previous, uiHue: value })); }} /></div><div className="laplace-field"><label htmlFor="laplace-ui-chroma">{uiText("laplacePreview.LaplacePreview61")}</label><input id="laplace-ui-chroma" type="number" step="0.01" value={appearance.uiChroma} onChange={event => { const value = parseLaplaceNumericDraft(event.target.value); if (Number.isFinite(value)) setAppearance(previous => ({ ...previous, uiChroma: value })); }} /></div></div></details>
      </section>
    </div>
    {pendingTemplate !== null && <ConfirmDialog title={uiText("laplacePreview.title2")} description={pendingTemplate ? uiText("laplacePreview.description") : uiText("laplacePreview.description2")} confirmLabel={uiText("laplacePreview.confirmLabel")} onCancel={() => setPendingTemplate(null)} onConfirm={selectTemplate} errorMessage={uiText("laplacePreview.errorMessage")} />}
    {clearConfirmation && <ConfirmDialog title={uiText("laplacePreview.title3")} description={uiText("laplacePreview.description3")} confirmLabel={uiText("laplacePreview.confirmLabel2")} confirmTone="danger" onCancel={() => setClearConfirmation(false)} onConfirm={() => { setDraftCss(''); setCustomCss(''); setStatus(uiText("laplacePreview.onConfirm")); }} />}
  </main>;
}
