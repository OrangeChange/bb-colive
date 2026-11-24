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

const INTERACTION_LABELS = { entry: '进房', follow: '关注', share: '分享', specialFollow: '特别关注', mutualFollow: '互相关注', like: '点赞' };
const SYSTEM_LABELS = { live: '开播与下播', userMute: '用户禁言', roomMute: '房间禁言', roomChange: '房间变更', warning: '警告与切断' };
const NO_SIMULATION_RECORDS: readonly LaplaceInputRecord[] = Object.freeze([]);
const GROUPS: { title: string; keys: LaplaceSettingKey[] }[] = [
  { title: '消息种类', keys: ['showDanmaku', 'showSuperChat', 'showToast'] },
  { title: '过滤与金额', keys: ['showPhoneNotVerified', 'showAutoDanmaku', 'showEnterEventCurrentGuardOnly', 'showGiftPriceAbove', 'showGiftHighlightAbove'] },
  { title: '身份与内容', keys: ['showUsername', 'showAvatar', 'showAvatarFrame', 'showGuardBadge', 'showMedal', 'showMedalLightenedOnly', 'showWealthMedal', 'showCurrentRank', 'showModBadge', 'showSpoiler'] },
  { title: '列表与置顶', keys: ['showStickyBar', 'limitEventAmount', 'showGiftStickyAbove', 'limitStickyAmount', 'baseFontSize'] },
];
const SIMULATION_TYPES = [
  ['message', '普通弹幕'], ['effect-message', '效果弹幕'], ['superchat', '醒目留言'], ['gift', '礼物'], ['toast', '大航海'], ['interaction', '互动'], ['like-click', '点赞'], ['system', '系统消息'], ['live-start', '开播'], ['live-end', '下播'], ['live-warning', '直播警告'], ['live-cutoff', '直播切断'], ['room-name-update', '房名更新'], ['room-mute-on', '房间禁言'], ['room-mute-off', '解除房间禁言'], ['red-envelope-start', '红包开始'], ['red-envelope-result', '红包结果'], ['lottery-start', '天选开始'], ['lottery-result', '天选结果'], ['user-block', '用户禁言'],
] as const;
type PreviewMode = 'static' | 'design' | 'simulation';
const MODE_OPTIONS = [{ value: 'static', label: '静态预览' }, { value: 'design', label: '样式设计预览' }, { value: 'simulation', label: '动态模拟' }];

export default function LaplacePreview({ live = false, nativeTextFilters = false, nativeGuardEntry = false, paidFilter, sessionIdentity = 'laplace-preview' }: { live?: boolean; nativeTextFilters?: boolean; nativeGuardEntry?: boolean; paidFilter?: PaidDisplayFilter; sessionIdentity?: string }) {
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
    if (result) { setSettings(previous => ({ ...previous, remoteTheme: url })); setStatus(url ? '远程模板已应用' : '远程模板已清空'); }
  }, [loader]);
  useEffect(() => {
    if (!live) document.title = 'LAPLACE 兼容预览';
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
    catch { setStorageError('设置未能保存在此浏览器中。当前预览仍可使用，关闭页面后可能丢失。'); }
  }, [settings, live, nativeTextFilters, nativeGuardEntry]);
  useEffect(() => {
    try { localStorage.setItem(LAPLACE_CUSTOM_CSS_KEY, customCss); }
    catch { setStorageError('CSS 未能保存。请使用下载 CSS 保留当前内容。'); }
  }, [customCss]);
  useEffect(() => { try { persistRemoteHistory(localStorage, styleState.history); } catch { setStorageError('远程模板历史未能保存。'); } }, [styleState.history]);
  useEffect(() => { try { localStorage.setItem(LAPLACE_APPEARANCE_KEY, JSON.stringify(appearance)); } catch { setStorageError('页面外观未能保存。'); } }, [appearance]);
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
    setStatus(value ? '内置模板已写入编辑器并应用' : '内置模板和自定义 CSS 已清空');
  }
  async function copyCss() {
    try { await navigator.clipboard.writeText(cssForExport('toolbar', customCss, draftCss)); setStatus('CSS 已复制'); }
    catch { setStatus('复制失败。请从编辑器选择文本复制，或下载 CSS。'); }
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
    <header className="laplace-heading"><h1 className="ui-type-page-title">{live ? "LAPLACE 现场显示" : "LAPLACE 兼容预览"}</h1><p className="ui-type-micro">原版样本 · 独立设置 · 完整 CSS</p></header>
    <div className="laplace-workspace">
      <section className="laplace-editor-column" aria-label="LAPLACE 设置与 CSS">
        <div className="laplace-template-row">
          <div className="laplace-field"><label htmlFor="laplace-template">内置模板</label><UiSelect id="laplace-template" ariaLabel="内置模板" value={settings.cloudTheme} onValueChange={setPendingTemplate} options={LAPLACE_TEMPLATE_OPTIONS} /></div>
          <div className="laplace-field"><label htmlFor="laplace-colorScheme">浅色和深色</label><UiSelect id="laplace-colorScheme" ariaLabel="浅色和深色" value={settings.colorScheme} onValueChange={value => setSettings(previous => ({ ...previous, colorScheme: value as 'light' | 'dark' }))} options={[{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }]} /></div>
        </div>
        {styleState.cloudLoading && <p role="status" className="laplace-help">正在载入内置模板…</p>}
        {styleState.cloudError && <p role="alert" className="laplace-error">{styleState.cloudError}</p>}
        <details className="laplace-remote-picker"><summary>远程 CSS 模板{settings.remoteTheme ? ' · 已应用' : ''}</summary>
          <form noValidate onSubmit={event => { event.preventDefault(); void loadRemote(remoteDraft); }}>
            <label htmlFor="laplace-remote-url">远程模板地址</label>
            <input id="laplace-remote-url" type="url" value={remoteDraft} onCompositionStart={() => setRemoteComposing(true)} onCompositionEnd={() => setRemoteComposing(false)} onChange={event => { loader.cancelPendingRemote(); lastRemoteAttempt.current = ''; setRemoteDraft(event.target.value); }} placeholder="https://example.com/theme.css" aria-describedby="laplace-remote-help" aria-invalid={Boolean(styleState.remoteError)} />
            <div className="laplace-actions"><button type="submit" disabled={styleState.remoteLoading || !remoteDraft}>加载远程模板</button><button type="button" onClick={() => { setRemoteDraft(''); void loadRemote(''); }} disabled={!remoteDraft && !styleState.remoteUrl}>清空远程模板</button></div>
            <p id="laplace-remote-help" className="laplace-help">地址交给原版 CSS 预处理服务，成功后应用；CSS 正文不写入编辑器。</p>
            {styleState.remoteLoading && <p role="status">正在预处理远程 CSS…</p>}
            {styleState.remoteError && <p role="alert" className="laplace-error">{styleState.remoteError}</p>}
            {styleState.remoteUrl && <p className="laplace-source">当前远程来源：{styleState.remoteUrl}</p>}
          </form>
          <div className="laplace-history"><h3 className="ui-type-section-title">最近使用</h3>{styleState.history.length ? styleState.history.map(item => <div className="laplace-history-row" key={item.url}><button type="button" onClick={() => { setRemoteDraft(item.url); void loadRemote(item.url); }} title={item.url}>{typeof item.metadata?.title === 'string' ? item.metadata.title : item.url}</button><button type="button" aria-label={`移除历史：${item.url}`} onClick={() => loader.removeHistory(item.url)}>移除</button></div>) : <p className="laplace-help">尚无远程模板历史</p>}</div>
          <h3 className="ui-type-section-title">原版推荐模板</h3><div className="laplace-actions">{CURATED_REMOTE_TEMPLATES.map(item => <button type="button" key={item.url} onClick={() => { setRemoteDraft(item.url); void loadRemote(item.url); }}>{item.title}</button>)}</div>
        </details>
        <div className={`laplace-css-editor${fullscreen ? ' is-fullscreen' : ''}`}>
          <div className="laplace-editor-toolbar"><label htmlFor="laplace-css">完整自定义 CSS</label><div className="laplace-actions"><button type="button" onClick={() => void copyCss()} disabled={!customCss}>复制 CSS</button><button type="button" onClick={() => downloadLaplaceCss(cssForExport('toolbar', customCss, draftCss))} disabled={!customCss}>下载 CSS</button><button type="button" onClick={() => setClearConfirmation(true)} disabled={!customCss}>清空自定义 CSS</button><button type="button" onClick={() => { setFullscreen(value => !value); editor.current?.focus(); }} aria-pressed={fullscreen}>{fullscreen ? '退出全屏' : '全屏编辑'}</button></div></div>
          <textarea ref={editor} id="laplace-css" className="resize-none" spellCheck={false} value={draftCss} onChange={event => setDraftCss(event.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={editorKeyDown} aria-describedby="laplace-css-help" placeholder="粘贴完整 CSS，保留原选择器、层叠与文字" />
          <p id="laplace-css-help" className="laplace-help">编辑后 400ms 自动应用。清空只移除自定义 CSS。工具栏导出已保存文本；Ctrl / ⌘ + S 下载编辑框当前文本。</p>
        </div>
        <p className="laplace-status" role="status">{status || (draftCss !== customCss ? '正在等待应用 CSS…' : 'CSS 已同步到预览')}</p>
        {storageError && <p role="alert" className="laplace-error">{storageError}</p>}
        <details className="laplace-settings" open><summary>显示设置</summary>
          {effectiveNativeTextFilters && <p className="laplace-help">自动弹幕与手机号筛选使用软件设置；原来的模式专属值不再决定现场显示。</p>}
          {GROUPS.map(group => <fieldset key={group.title}><legend className="ui-type-section-title">{group.title}</legend><div className="laplace-settings-grid">{group.keys.filter(key => (!live || key !== "showGiftPriceAbove") && (!effectiveNativeTextFilters || !["showAutoDanmaku", "showPhoneNotVerified"].includes(key))).filter(key => !effectiveNativeGuardEntry || key !== "showEnterEventCurrentGuardOnly").map(key => {
            const productField = key === 'showCurrentRank' || key === 'showGiftHighlightAbove' || key === 'showAvatar' || key === 'showUsername';
            const disabled = productField && presentation.readOnly || key === 'showMedalLightenedOnly' && !settings.showMedal || key === 'showGiftStickyAbove' && !settings.showStickyBar;
            const label = key === 'showCurrentRank' ? '当前榜单名次' : key === 'showGiftHighlightAbove' ? '金额达到门槛时高亮' : LAPLACE_SETTING_LABELS[key];
            return typeof DEFAULT_LAPLACE_SETTINGS[key] === 'boolean' ? <label className="laplace-check" key={key} title={key === 'showEnterEventCurrentGuardOnly' ? '只限制进场，关注和分享仍由各自开关控制' : undefined}><input id={`laplace-${key}`} type="checkbox" checked={key === 'showCurrentRank' || key === 'showAvatar' || key === 'showUsername' ? presentation.settings[key] : settings[key] as boolean} disabled={disabled} onChange={event => key === 'showCurrentRank' ? presentationStore.setShowCurrentRank(event.target.checked) : key === 'showAvatar' ? presentationStore.setShowAvatar(event.target.checked) : key === 'showUsername' ? presentationStore.setShowUsername(event.target.checked) : (() => { if ((NATIVE_TEXT_LEGACY_KEYS as readonly string[]).includes(key)) nativeTextHandoff.edit(key as typeof NATIVE_TEXT_LEGACY_KEYS[number]); if (key === 'showEnterEventCurrentGuardOnly') nativeGuardHandoff.edit(key); setSettings(previous => ({ ...previous, [key]: event.target.checked })); })()} />{label}</label> : <div className="laplace-field" key={key}><label htmlFor={`laplace-${key}`}>{label}</label><div className="laplace-number"><input id={`laplace-${key}`} type={key === 'showGiftHighlightAbove' ? 'text' : 'number'} inputMode={key === 'showGiftHighlightAbove' ? 'decimal' : undefined} min={LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].min} max={LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].max} step={LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].step} value={numericDrafts[key] ?? String(key === 'showGiftHighlightAbove' ? presentation.settings.showGiftHighlightAbove : settings[key])} disabled={disabled} onChange={event => editNumber(key as LaplaceNumericKey, event.target.value)} aria-invalid={Boolean(fieldErrors[key])} aria-describedby={fieldErrors[key] ? `laplace-${key}-error` : undefined} /><span>{LAPLACE_NUMERIC_RULES[key as LaplaceNumericKey].unit}</span></div>{fieldErrors[key] && <p id={`laplace-${key}-error`} className="laplace-error" role="alert">{fieldErrors[key]}</p>}</div>;
          })}</div>{group.title === '身份与内容' && <div><label className="laplace-check"><input id="laplace-classicElementScope" type="checkbox" checked={presentation.settings.classicElementScope} disabled={presentation.readOnly} onChange={event => presentationStore.setClassicElementScope(event.target.checked)} aria-describedby="laplace-classic-help" />经典控制范围</label><p id="laplace-classic-help" className="laplace-help">开启后仅按 LAPLACE 原来的限定范围控制头像和用户名</p></div>}{group.title === '消息种类' && <div className="laplace-interaction-group" role="group" aria-label="礼物" aria-describedby="laplace-gift-help">
            <label className="laplace-check"><input id="laplace-gift-enabled" type="checkbox" checked={productEvents.settings.gifts.enabled} disabled={productEvents.readOnly} onChange={event => productEventStore.setGiftEnabled(event.target.checked)} />礼物</label>
            <p id="laplace-gift-help" className="laplace-help">关闭只暂停显示，子项选择仍保留并可修改。未知礼物在免费、普通、盲盒任一开启时保留。红包支持开始和开奖结果，投喂尚未接入。</p>
            <div className="laplace-settings-grid">{LAPLACE_GIFT_CHILDREN.map(key => <label className="laplace-check" key={key}><input id={`laplace-gift-${key}`} type="checkbox" checked={productEvents.settings.gifts.children[key]} disabled={productEvents.readOnly} onChange={event => productEventStore.setGiftChild(key, event.target.checked)} />{{ free: '免费', normal: '普通', blind: '盲盒', redEnvelope: '红包', lottery: '天选' }[key]}</label>)}</div>
          </div>}{group.title === '消息种类' && <div className="laplace-interaction-group" role="group" aria-label="互动" aria-describedby="laplace-interaction-help">
            <label className="laplace-check"><input id="laplace-interaction-enabled" type="checkbox" checked={productEvents.settings.interactions.enabled} disabled={productEvents.readOnly} onChange={event => productEventStore.setEnabled(event.target.checked)} />互动</label>
            <p id="laplace-interaction-help" className="laplace-help">{productEvents.settings.interactions.enabled ? '按以下六类独立显示已支持的互动；现场、静态预览与动态模拟共用。' : '互动已暂停，以下选择仍保留并可修改。'}</p>
            <div className="laplace-settings-grid">{LAPLACE_INTERACTION_CHILDREN.map(key => <label className="laplace-check" key={key}><input id={`laplace-interaction-${key}`} type="checkbox" checked={productEvents.settings.interactions.children[key]} disabled={productEvents.readOnly} onChange={event => productEventStore.setChild(key, event.target.checked)} />{INTERACTION_LABELS[key]}</label>)}</div>
            {!live && productEvents.diagnostic && <p className="laplace-help" role="status">{productEvents.diagnostic}</p>}
          </div>}</fieldset>)}
          <fieldset aria-describedby="laplace-system-help"><legend className="ui-type-section-title">系统消息</legend>
            <label className="laplace-check"><input id="laplace-showSystemMessage" type="checkbox" checked={settings.showSystemMessage} onChange={event => setSettings(previous => ({ ...previous, showSystemMessage: event.target.checked }))} />{LAPLACE_SETTING_LABELS.showSystemMessage}</label>
            <div className="laplace-settings-grid">{LAPLACE_SYSTEM_CHILDREN.map(key => <label className="laplace-check" key={key}><input id={`laplace-system-${key}`} type="checkbox" checked={productEvents.settings.systems.children[key]} disabled={productEvents.readOnly} onChange={event => productEventStore.setSystemChild(key, event.target.checked)} />{SYSTEM_LABELS[key]}</label>)}</div>
            <p id="laplace-system-help" className="laplace-help">关闭系统消息会保留子项选择。通用连接文字仍由系统消息总开关控制；原生专有提醒不在此列。</p>
          </fieldset>
          {presentation.diagnostic && <p className="laplace-help" role="status">{presentation.diagnostic}</p>}
          <div className="laplace-field"><label htmlFor="laplace-roomIds">房间来源</label><input id="laplace-roomIds" value={settings.roomIds.join('、')} readOnly placeholder="由 BB 提供；原版样本无需连接房间" /></div>
        </details>
      </section>
      <section className="laplace-preview-column" aria-label="预览与样本设置">
        <div className="laplace-preview-controls">{!live && <UiSelect ariaLabel="预览模式" value={mode} onValueChange={value => setMode(value as PreviewMode)} options={MODE_OPTIONS} />}<span className="laplace-width ui-type-micro">{canvasWidth || '…'} px</span></div>
        <div className="laplace-scene-controls"><div className="laplace-field"><label htmlFor="laplace-sceneName">场景名称</label><input id="laplace-sceneName" value={settings.sceneName} onChange={event => setSettings(previous => ({ ...previous, sceneName: event.target.value }))} placeholder="例如 blue" /></div><div className="laplace-field"><label htmlFor="laplace-demo-bg">演示背景</label><div className="laplace-color-row"><input id="laplace-demo-bg" aria-label="演示背景色" type="color" value={appearance.demoBgColor || '#299229'} onChange={event => setAppearance(previous => ({ ...previous, demoBgColor: event.target.value }))} /><button type="button" disabled={!appearance.demoBgColor} onClick={() => setAppearance(previous => ({ ...previous, demoBgColor: '' }))}>清空背景</button></div></div></div>
        {!live && mode === 'simulation' && <details className="laplace-simulation"><summary>模拟类型与速度 · {intervalMs}ms</summary><label htmlFor="laplace-simulation-speed">消息间隔 <output>{intervalMs}ms</output></label><input id="laplace-simulation-speed" className="settings-range" style={{ "--settings-range-progress": `${(2000 - intervalMs) / 1970 * 100}%` } as CSSProperties} type="range" min={30} max={2000} step={10} value={2030 - intervalMs} onChange={event => setIntervalMs(2030 - Number(event.target.value))} /><div className="laplace-speed-marks"><span>小 · 1800ms</span><span>中 · 900ms</span><span>大 · 300ms</span><span>原神 · 60ms</span></div><label className="laplace-check"><input type="checkbox" checked={enabledTypes.size === SIMULATION_TYPES.length} onChange={event => setEnabledTypes(event.target.checked ? new Set(SIMULATION_TYPES.map(([type]) => type)) : new Set())} />全部类型</label><div className="laplace-type-grid">{SIMULATION_TYPES.map(([type, label]) => <label key={type} className="laplace-check"><input type="checkbox" checked={enabledTypes.has(type)} onChange={event => setEnabledTypes(previous => { const next = new Set(previous); if (event.target.checked) next.add(type); else next.delete(type); return next; })} />{label}</label>)}</div></details>}
        <div ref={canvas} className="laplace-preview-canvas compat-preview-surface" data-scheme={settings.colorScheme} style={appearance.demoBgColor ? { background: appearance.demoBgColor } : undefined}>{live ? <>{owner && <LaplaceLiveHost nativeGuardEntry={effectiveNativeGuardEntry} nativeTextFilters={effectiveNativeTextFilters} key={sessionIdentity} productSession={owner.session} paidFilter={paidFilter} settings={settings} css={css} />}</> : <RendererHost variant="product" productElements={{ classicScope: presentation.settings.classicElementScope }} acquisitionMode="direct" settings={rendererSettings} css={css} appearance={appearance} events={projection.events} stickyEvents={projection.stickyEvents} preview scrollable={scrollable} rate={queued.rate} onFollowingChange={setFollowing} />}</div>
        <p className="laplace-help">{live ? '显示软件当前采集的事件；样式与设置独立保存。' : mode === 'design' ? '原版设计样本保留完整设计状态，消息准入开关不会隐藏这些样本。' : mode === 'static' ? '原版普通样本按显示开关筛选，静态预览不受最大显示数量截断。' : `原版随机生成逻辑 · ${projection.events.length} 条显示${queued.pendingCount ? ` · ${queued.pendingCount} 条排队` : ''}`}</p>
        <p className="laplace-help">兼容缓存最多保留 6 小时、20,000 条或 64 MB，任一上限先达到时移出最旧消息，包含尚未到期的置顶消息。直播存档不受影响。</p>
        <details className="laplace-appearance"><summary>页面主题色</summary><p className="laplace-help">色相与色度作用于页面及预览外壳的原版主题变量；0 使用默认值。</p><div className="laplace-template-row"><div className="laplace-field"><label htmlFor="laplace-ui-hue">色相</label><input id="laplace-ui-hue" type="number" value={appearance.uiHue} onChange={event => { const value = parseLaplaceNumericDraft(event.target.value); if (Number.isFinite(value)) setAppearance(previous => ({ ...previous, uiHue: value })); }} /></div><div className="laplace-field"><label htmlFor="laplace-ui-chroma">色度</label><input id="laplace-ui-chroma" type="number" step="0.01" value={appearance.uiChroma} onChange={event => { const value = parseLaplaceNumericDraft(event.target.value); if (Number.isFinite(value)) setAppearance(previous => ({ ...previous, uiChroma: value })); }} /></div></div></details>
      </section>
    </div>
    {pendingTemplate !== null && <ConfirmDialog title="覆盖自定义 CSS？" description={pendingTemplate ? '选择内置模板会将它的完整 CSS 写入编辑器，并保存内置模板名称。当前自定义 CSS 将被替换，远程模板保持不变。' : '此操作清空内置模板和自定义 CSS，远程模板保持不变。'} confirmLabel="应用模板" onCancel={() => setPendingTemplate(null)} onConfirm={selectTemplate} errorMessage="内置模板未能载入，现有样式已保留。请重试。" />}
    {clearConfirmation && <ConfirmDialog title="清空自定义 CSS？" description="只清空编辑框和自定义 CSS。已选内置模板与远程模板继续生效。" confirmLabel="清空自定义 CSS" confirmTone="danger" onCancel={() => setClearConfirmation(false)} onConfirm={() => { setDraftCss(''); setCustomCss(''); setStatus('自定义 CSS 已清空'); }} />}
  </main>;
}
