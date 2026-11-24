import { allowsLaplaceNativeGuardEntryRecord, admitsLaplaceNativeGuardEntryRecord, laplaceNativeGuardEntryDiagnostics } from './nativeGuardEntry';
import { useGeneralSettings } from '../../generalSettings';
import { allowsLaplaceNativeTextRecord, laplaceNativeTextDiagnostics, nativeLaplaceTextSourceSettings, type LaplaceNativeTextFilters } from './nativeTextFilters';
import type { LaplaceQueuedInput } from './RendererHost';
import { livePaidSettings, type PaidDisplayFilter } from '../livePaidSettings';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { LaplaceEvent } from './types';
import type { LaplaceProductSessionReader } from './productSession';
import { useLaplaceProductProjection, useLaplaceProductSnapshot } from './useLaplaceProductProjection';
import { RendererHost, useLaplaceQueuedEvents } from './RendererHost';
import { readLaplaceSettings, type LaplaceSettings } from './settings';
import { LaplaceStyleLoader } from './styleLoader';
import { readCustomCss, type LaplaceCssSources } from './styles';
import { useLaplaceProductEvents } from './useLaplaceProductEvents';
import { allowsProductEvent, admitsLaplaceProductEvent, productLaplaceGiftSourceSettings } from './productAdmission';
import { useLaplaceProductPresentation } from './useLaplaceProductPresentation';
import './preview.css';
/** Only consumes the isolated, unmerged BB compatibility branch. Never opens a connection. */
interface LaplaceLiveHostProps {
  productSession: LaplaceProductSessionReader; settings?: LaplaceSettings; css?: Partial<LaplaceCssSources>; scrollable?: boolean; paidFilter?: PaidDisplayFilter;
  nativeTextFilters?: boolean;
  nativeGuardEntry?: boolean;
}
export function LaplaceLiveHost({ nativeTextFilters = false, ...props }: LaplaceLiveHostProps) {
  return nativeTextFilters ? <NativeTextLiveHost {...props} /> : <GuardEntryLiveHost {...props} />;
}
/** Only the opted-in child subscribes; legacy/direct callers keep their authority. */
function NativeTextLiveHost(props: LaplaceLiveHostProps) {
  const showAutoDanmaku = useGeneralSettings(state => state.eventDisplayPreferences.showAutoDanmaku);
  const showPhoneNotVerified = useGeneralSettings(state => state.eventDisplayPreferences.showPhoneNotVerified);
  const filters = useMemo(() => ({ showAutoDanmaku, showPhoneNotVerified }), [showAutoDanmaku, showPhoneNotVerified]);
  return <GuardEntryLiveHost {...props} filters={filters} />;
}
type NativeLiveConsumerProps = LaplaceLiveHostProps & { filters?: LaplaceNativeTextFilters };
function GuardEntryLiveHost({ nativeGuardEntry = false, ...props }: NativeLiveConsumerProps) {
  return nativeGuardEntry ? <NativeGuardEntryLiveHost {...props} /> : <LaplaceLiveConsumer {...props} />;
}
/** Independent opt-in: text-only and default callers never subscribe to this preference. */
function NativeGuardEntryLiveHost(props: NativeLiveConsumerProps) {
  const onlyGuardEntry = useGeneralSettings(state => state.eventDisplayPreferences.onlyGuardEntry);
  return <LaplaceLiveConsumer {...props} onlyGuardEntry={onlyGuardEntry} />;
}
function LaplaceLiveConsumer({ productSession, settings: suppliedSettings, css: suppliedCss, scrollable = false, paidFilter, filters, onlyGuardEntry }: NativeLiveConsumerProps & { onlyGuardEntry?: boolean }) {
  const [savedSettings] = useState(() => readLaplaceSettings(localStorage));
  const storedSettings = suppliedSettings ?? savedSettings;
  const { snapshot: productEvents } = useLaplaceProductEvents();
  const { snapshot: presentation } = useLaplaceProductPresentation();
  const snapshot = useLaplaceProductSnapshot(productSession);
  const nativeFiltersEnabled = filters !== undefined;
  const guardFilters = useMemo(() => onlyGuardEntry === undefined ? undefined : { onlyGuardEntry,
    scope: { roomId: snapshot.roomId, generation: snapshot.generation } }, [onlyGuardEntry, snapshot.roomId, snapshot.generation]);
  const settings = useMemo(() => productLaplaceGiftSourceSettings({ ...(nativeFiltersEnabled ? nativeLaplaceTextSourceSettings(storedSettings) : storedSettings), ...livePaidSettings(paidFilter), roomIds: snapshot.roomId === null ? [] : [String(snapshot.roomId)] }), [storedSettings, snapshot.roomId, paidFilter?.threshold, paidFilter?.mode, nativeFiltersEnabled]);
  const rendererSettings = useMemo(() => ({ ...settings, showCurrentRank: presentation.settings.showCurrentRank, showGiftHighlightAbove: presentation.settings.showGiftHighlightAbove, showAvatar: presentation.settings.showAvatar, showUsername: presentation.settings.showUsername }), [settings, presentation.settings]);
  const [following, setFollowing] = useState(true);
  const [loader] = useState(() => new LaplaceStyleLoader());
  const styles = useSyncExternalStore(loader.subscribe, loader.getSnapshot);
  const [savedCss] = useState(() => readCustomCss(localStorage));
  useEffect(() => { if (suppliedCss?.cloud === undefined) void loader.loadCloud(settings.cloudTheme); }, [settings.cloudTheme, loader, suppliedCss?.cloud]);
  useEffect(() => { if (suppliedCss?.remote === undefined) void loader.loadRemote(settings.remoteTheme); }, [settings.remoteTheme, loader, suppliedCss?.remote]);
  useEffect(() => () => loader.dispose(), [loader]);
  const acquisitionMode = useMemo(() => {
    for (let index = snapshot.records.length - 1; index >= 0; index--) {
      const mode = snapshot.records[index].source.sourceMode;
      if (mode === 'open') return 'open-platform' as const;
      if (mode === 'direct') return 'direct' as const;
    }
    return undefined;
  }, [snapshot.records]);
  const queueOptions = useMemo(() => ({
    preserveGateTiming: nativeFiltersEnabled || guardFilters !== undefined,
    productEventGate: (event: LaplaceEvent, record: LaplaceQueuedInput) => allowsProductEvent(event, productEvents.settings) && (!filters || allowsLaplaceNativeTextRecord(record, filters))
      && (!guardFilters || allowsLaplaceNativeGuardEntryRecord(record, guardFilters)),
    admit: (event: LaplaceEvent, sourceSettings: LaplaceSettings, record: LaplaceQueuedInput) => guardFilters
      ? allowsProductEvent(event, productEvents.settings) && admitsLaplaceNativeGuardEntryRecord(record, sourceSettings, guardFilters)
      : admitsLaplaceProductEvent(event, sourceSettings, productEvents.settings),
  }), [productEvents.settings, settings, filters, guardFilters]);
  const queued = useLaplaceQueuedEvents(snapshot.records, snapshot.resetEpoch, settings, !scrollable || following, true, true, false, queueOptions);
  const projection = useLaplaceProductProjection(queued.records, snapshot, settings, 'live', scrollable, productEvents.settings, filters, guardFilters);
  const diagnostics = useMemo(() => filters ? laplaceNativeTextDiagnostics(snapshot.records, filters) : null, [snapshot.records, filters]);
  const guardDiagnostics = useMemo(() => guardFilters ? laplaceNativeGuardEntryDiagnostics(snapshot.records, guardFilters) : null, [snapshot.records, guardFilters]);
  const css = useMemo(() => ({ cloud: suppliedCss?.cloud ?? styles.cloud, remote: suppliedCss?.remote ?? styles.remote, custom: suppliedCss?.custom ?? savedCss }), [suppliedCss, styles.cloud, styles.remote, savedCss]);
  const error = styles.cloudError || styles.remoteError;
  return <div className="laplace-renderer-host">
    {Boolean(diagnostics?.invalid) && <p className="laplace-frame-error" role="status">{diagnostics!.invalid} 条消息的原生筛选事实无效，已跳过显示。</p>}
    {Boolean(guardDiagnostics?.invalid) && <p className="laplace-frame-error" role="status">{guardDiagnostics!.invalid} 条消息的原生进房筛选判定无效，已跳过显示。</p>}
    {productEvents.diagnostic && <p className="laplace-frame-error" role="status">{productEvents.diagnostic}</p>}
    {presentation.diagnostic && <p className="laplace-frame-error" role="status">{presentation.diagnostic}</p>}
    {error && <p className="laplace-frame-error" role="alert">{error}</p>}
    <RendererHost variant="product" productElements={{ classicScope: presentation.settings.classicElementScope }} acquisitionMode={acquisitionMode} settings={rendererSettings} css={css} events={projection.events} stickyEvents={projection.stickyEvents} scrollable={scrollable} rate={queued.rate} onFollowingChange={setFollowing} />
  </div>;
}
