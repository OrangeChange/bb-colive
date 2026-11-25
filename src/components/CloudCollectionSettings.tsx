import { Input } from "./shadcn/input";
import { Button } from "./shadcn/button";
import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { SettingsIcon } from './SettingsIcon';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  cloudServerApi,
  type CloudAuthStatus,
  type CloudRetentionPreview,
  type CloudRetentionSettings,
  type CloudRoomList,
  type CloudServerHealth,
  type LocalBilibiliSessionSummary,
} from '../cloudSync/cloudServerApi.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

const errorMessage = (reason: unknown) => {
  const code = reason instanceof Error ? reason.message : String(reason);
  if (code.includes('unauthorized') || code.includes('credential')) return uiText("cloudCollectionSettings.errorMessage");
  if (code.includes('network')) return uiText("cloudCollectionSettings.errorMessage2");
  if (code.includes('login_required')) return uiText("cloudCollectionSettings.errorMessage3");
  if (code.includes('room_limit_reached')) return uiText("cloudCollectionSettings.errorMessage4");
  if (code.includes('stop_pending')) return uiText("cloudCollectionSettings.errorMessage5");
  if (code.includes('local_session_missing')) return uiText("cloudCollectionSettings.errorMessage6");
  if (code.includes('local_refresh_token_missing')) return uiText("cloudCollectionSettings.errorMessage7");
  if (code.includes('account_replacement_required')) return uiText("cloudCollectionSettings.errorMessage8");
  if (code.includes('invalid_login')) return uiText("cloudCollectionSettings.errorMessage9");
  return code || uiText("cloudCollectionSettings.errorMessage10");
};

const accountState = (auth: CloudAuthStatus | null) => {
  if (!auth?.account) return uiText("cloudCollectionSettings.accountState");
  if (auth.state === 'valid') return uiText("cloudCollectionSettings.accountState2");
  if (auth.state === 'unavailable') return uiText("cloudCollectionSettings.accountState3");
  return uiText("cloudCollectionSettings.accountState4");
};

const roomState = (state: string) => {
  const labels: Record<string, string> = {
    receiving: uiText("cloudCollectionSettings.roomState.labels.receiving"),
    preparing: uiText("cloudCollectionSettings.roomState.labels.preparing"),
    transport_open: uiText("cloudCollectionSettings.roomState.labels.transport_open"),
    reconnecting: uiText("cloudCollectionSettings.roomState.labels.reconnecting"),
    waiting_login: uiText("cloudCollectionSettings.roomState.labels.waiting_login"),
    storage_unavailable: uiText("cloudCollectionSettings.roomState.labels.storage_unavailable"),
    stopped: uiText("cloudCollectionSettings.roomState.labels.stopped"),
  };
  return labels[state] ?? state;
};

export function CloudCollectionSettings({ serviceVersion, serverId }: { serviceVersion: string; serverId: string }) {
  useUiLanguage();
  const [health, setHealth] = useState<CloudServerHealth | null>(null);
  const [auth, setAuth] = useState<CloudAuthStatus | null>(null);
  const [rooms, setRooms] = useState<CloudRoomList | null>(null);
  const [retention, setRetention] = useState<CloudRetentionSettings | null>(null);
  const [localSession, setLocalSession] = useState<LocalBilibiliSessionSummary | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [roomId, setRoomId] = useState('');
  const [retentionInput, setRetentionInput] = useState('');
  const [stopRoomId, setStopRoomId] = useState<string | null>(null);
  const [retentionPreview, setRetentionPreview] = useState<CloudRetentionPreview | null>(null);
  const [replaceAccount, setReplaceAccount] = useState(false);
  const [notice, setNotice] = useState('');

  const loadPart = async <T,>(key: string, load: () => Promise<T>, apply: (value: T) => void) => {
    setErrors(current => ({ ...current, [key]: '' }));
    try { apply(await load()); }
    catch (reason) { setErrors(current => ({ ...current, [key]: errorMessage(reason) })); }
  };
  const refreshHealth = () => loadPart('health', cloudServerApi.loadHealth, setHealth);
  const refreshAuth = () => loadPart('auth', cloudServerApi.loadAuthStatus, setAuth);
  const refreshRooms = () => loadPart('rooms', cloudServerApi.listRooms, setRooms);
  const refreshRetention = () => loadPart('retention', cloudServerApi.loadRetention, value => {
    setRetention(value);
    setRetentionInput(value.retentionDays === null ? '' : String(value.retentionDays));
  });
  const refreshLocal = () => loadPart('local', cloudServerApi.loadLocalSession, setLocalSession);

  useEffect(() => {
    void refreshHealth();
    void refreshAuth();
    void refreshRooms();
    void refreshRetention();
    void refreshLocal();
  }, []);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setNotice('');
    setErrors(current => ({ ...current, [key]: '' }));
    try { await action(); }
    catch (reason) { setErrors(current => ({ ...current, [key]: errorMessage(reason) })); }
    finally { setBusy(null); }
  };

  const enableRoom = () => run('rooms', async () => {
    if (!/^[1-9][0-9]*$/.test(roomId)) throw new Error(uiText("cloudCollectionSettings.CloudCollectionSettings.enableRoom"));
    await cloudServerApi.enableRoom(roomId);
    setRoomId('');
    setNotice(uiText("cloudCollectionSettings.CloudCollectionSettings.enableRoom2"));
    await refreshRooms();
  });

  const stopRoom = () => {
    if (!stopRoomId) return;
    return run('rooms', async () => {
      await cloudServerApi.stopRoom(stopRoomId);
      setStopRoomId(null);
      setNotice(uiText("cloudCollectionSettings.CloudCollectionSettings.stopRoom"));
      await refreshRooms();
    });
  };

  const previewRetention = () => run('retention', async () => {
    const days = retentionInput.trim() === '' ? null : Number(retentionInput);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365000)) {
      throw new Error(uiText("cloudCollectionSettings.CloudCollectionSettings.previewRetention"));
    }
    setRetentionPreview(await cloudServerApi.previewRetention(days));
  });

  const confirmRetention = () => {
    if (!retentionPreview) return;
    return run('retention', async () => {
      const next = await cloudServerApi.updateRetention(
        retentionPreview.retentionDays,
        retentionPreview.confirmationId,
      );
      setRetention(next);
      setRetentionPreview(null);
      setNotice(uiText("cloudCollectionSettings.CloudCollectionSettings.confirmRetention"));
    });
  };

  const syncLocal = (replace = false) => run('auth', async () => {
    const local = localSession ?? await cloudServerApi.loadLocalSession();
    if (!local.refreshCapable) throw new Error('local_refresh_token_missing');
    if (!replace && auth?.account && auth.account.uid !== local.uid) {
      setReplaceAccount(true);
      return;
    }
    const next = await cloudServerApi.syncLocalSession(local.uid, replace);
    setAuth(next);
    setReplaceAccount(false);
    setNotice(uiText("cloudCollectionSettings.CloudCollectionSettings.syncLocal"));
    await refreshRooms();
  });

  const openServerQr = () => run('auth', async () => {
    const session = await cloudServerApi.createQrSession();
    await openUrl(session.url);
    setNotice(uiText("cloudCollectionSettings.CloudCollectionSettings.openServerQr"));
  });

  const sectionClass = 'rounded-lg border border-line bg-bg px-3 py-3';
  const retryButton = (key: string, retry: () => void) => errors[key]
    ? <div className="mt-2 flex items-center justify-between gap-2"><span role="alert" className="ui-type-meta text-danger">{errors[key]}</span><Button variant="outline" type="button" className="h-7 rounded-md border border-line px-2 ui-type-meta text-t2 hover:bg-raised" onClick={retry}>{uiText("common.retry")}</Button></div>
    : null;

  return <div className="mt-3 grid gap-3" data-settings-search="cloud-collection">
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="server" />{uiText("cloudCollectionSettings.CloudCollectionSettings")}</h3><p className="mt-1 ui-type-meta text-t3">{uiText("cloudCollectionSettings.CloudCollectionSettings2")}{serviceVersion} {uiText("cloudCollectionSettings.CloudCollectionSettings3")}{serverId.slice(0, 8)}</p></div>
        {health && <span className={`ui-type-meta ${health.status === 'ready' ? 'text-success' : 'text-warning'}`}>{health.status === 'ready' ? uiText("cloudCollectionSettings.CloudCollectionSettings4") : uiText("cloudCollectionSettings.CloudCollectionSettings5")}</span>}
      </div>
      {retryButton('health', () => void refreshHealth())}
    </section>

    <section className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="account" />{uiText("cloudCollectionSettings.CloudCollectionSettings6")}</h3>
          <p className="mt-1 ui-type-meta text-t3">{auth?.account ? `${auth.account.name}（${auth.account.uid}） · ${accountState(auth)}` : accountState(auth)}</p>
          {auth?.account && <p className="mt-1 ui-type-micro text-t3">{auth.refreshCapable ? uiText("cloudCollectionSettings.CloudCollectionSettings7") : uiText("cloudCollectionSettings.CloudCollectionSettings8")}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" disabled={Boolean(busy) || !localSession} onClick={() => void syncLocal()}
            className="h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t1 enabled:hover:border-accent/50 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50">{uiText("cloudCollectionSettings.CloudCollectionSettings9")}</Button>
          <Button variant="outline" type="button" disabled={Boolean(busy)} onClick={() => void openServerQr()}
            className="h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t2 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50">{uiText("cloudCollectionSettings.CloudCollectionSettings10")}</Button>
          <Button variant="ghost" type="button" disabled={Boolean(busy)} aria-label={uiText("cloudCollectionSettings.aria_label")} title={uiText("cloudCollectionSettings.title")} onClick={() => void refreshAuth()}
            className="settings-icon-action h-8 rounded-md border border-line bg-surface px-2 ui-type-control text-t2 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={16} aria-hidden="true" /></Button>
        </div>
      </div>
      {localSession && <p className="mt-2 ui-type-meta text-t3">{uiText("cloudCollectionSettings.CloudCollectionSettings11")}{localSession.name}（{localSession.uid}）{localSession.refreshCapable ? '' : uiText("cloudCollectionSettings.CloudCollectionSettings12")}</p>}
      {retryButton('auth', () => void refreshAuth())}
      {retryButton('local', () => void refreshLocal())}
    </section>

    <section className={sectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="collection" />{uiText("cloudCollectionSettings.CloudCollectionSettings13")}</h3><p className="mt-1 ui-type-meta text-t3">{uiText("cloudCollectionSettings.CloudCollectionSettings14")}</p></div>
        <span className="ui-type-meta text-t3">{rooms ? uiText("cloudCollectionSettings.CloudCollectionSettings15", { length: rooms.items.filter(room => room.enabled).length, supportedEnabledRooms: rooms.supportedEnabledRooms }) : ''}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <Input inputMode="numeric" value={roomId} disabled={Boolean(busy)} onChange={event => setRoomId(event.target.value.replace(/\D/g, ''))}
          placeholder={uiText("cloudCollectionSettings.placeholder")} className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
        <Button variant="default" type="button" disabled={Boolean(busy) || !roomId} onClick={() => void enableRoom()}
          className="h-8 shrink-0 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:cursor-not-allowed disabled:opacity-50">{uiText("cloudCollectionSettings.CloudCollectionSettings16")}</Button>
      </div>
      {rooms && <div className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
        {rooms.items.length === 0 && <div className="px-3 py-4 text-center ui-type-meta text-t3">{uiText("cloudCollectionSettings.CloudCollectionSettings17")}</div>}
        {rooms.items.map(room => <div key={room.roomId} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1"><div className="truncate ui-type-control text-t1">{room.currentSession?.title || uiText("cloudCollectionSettings.CloudCollectionSettings18", { roomId: room.roomId })}</div><div className="ui-type-micro text-t3">{room.roomId} · {room.enabled ? roomState(room.state) : uiText("cloudCollectionSettings.CloudCollectionSettings19")}</div></div>
          {room.enabled
            ? <Button variant="outline" type="button" disabled={Boolean(busy)} onClick={() => setStopRoomId(room.roomId)} className="h-7 rounded-md px-2 ui-type-meta text-danger enabled:hover:bg-danger/10 disabled:opacity-50">{uiText("cloudCollectionSettings.CloudCollectionSettings20")}</Button>
            : <Button variant="outline" type="button" disabled={Boolean(busy)} onClick={() => { setRoomId(room.roomId); void run('rooms', async () => { await cloudServerApi.enableRoom(room.roomId); setNotice(uiText("cloudCollectionSettings.onClick")); await refreshRooms(); }); }} className="h-7 rounded-md px-2 ui-type-meta text-accent-text enabled:hover:bg-accent-subtle disabled:opacity-50">{uiText("cloudCollectionSettings.CloudCollectionSettings21")}</Button>}
        </div>)}
      </div>}
      {retryButton('rooms', () => void refreshRooms())}
    </section>

    <section className={sectionClass}>
      <h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="dataRetention" />{uiText("cloudCollectionSettings.CloudCollectionSettings22")}</h3>
      <p className="mt-1 ui-type-meta text-t3">{uiText("cloudCollectionSettings.CloudCollectionSettings23")}</p>
      <div className="mt-2 flex items-center gap-2">
        <Input inputMode="numeric" value={retentionInput} disabled={Boolean(busy)} onChange={event => setRetentionInput(event.target.value.replace(/\D/g, ''))}
          placeholder={uiText("cloudCollectionSettings.placeholder2")} aria-label={uiText("cloudCollectionSettings.aria_label2")} className="h-8 w-32 rounded-md border border-line bg-surface px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
        <span className="ui-type-control text-t3">{uiText("cloudCollectionSettings.CloudCollectionSettings24")}</span>
        <Button variant="outline" type="button" disabled={Boolean(busy) || !retention} onClick={() => void previewRetention()} className="h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t1 enabled:hover:bg-raised disabled:opacity-50">{uiText("cloudCollectionSettings.CloudCollectionSettings25")}</Button>
      </div>
      {retryButton('retention', () => void refreshRetention())}
    </section>

    {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 ui-type-meta text-success">{notice}</div>}
    {stopRoomId && <ConfirmDialog title={uiText("cloudCollectionSettings.title2")} description={uiText("cloudCollectionSettings.description", { stopRoomId: stopRoomId })} confirmLabel={uiText("cloudCollectionSettings.confirmLabel")} confirmTone="danger" onCancel={() => setStopRoomId(null)} onConfirm={stopRoom} />}
    {retentionPreview && <ConfirmDialog title={uiText("cloudCollectionSettings.title3")}
      description={uiText("cloudCollectionSettings.description2", { value: retentionPreview.retentionDays === null ? uiText("cloudCollectionSettings.description.value") : uiText("cloudCollectionSettings.description.value2", { retentionDays: retentionPreview.retentionDays }), sessionCount: retentionPreview.sessionCount, eventCount: retentionPreview.eventCount })}
      confirmLabel={uiText("cloudCollectionSettings.confirmLabel2")} confirmTone={retentionPreview.sessionCount > 0 ? 'danger' : 'accent'} onCancel={() => setRetentionPreview(null)} onConfirm={confirmRetention} />}
    {replaceAccount && localSession && <ConfirmDialog title={uiText("cloudCollectionSettings.title4")} description={uiText("cloudCollectionSettings.description3", { name: localSession.name, uid: localSession.uid })} confirmLabel={uiText("cloudCollectionSettings.confirmLabel3")} confirmTone="danger" onCancel={() => setReplaceAccount(false)} onConfirm={() => syncLocal(true)} />}
  </div>;
}
