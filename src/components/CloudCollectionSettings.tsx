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
  if (code.includes('unauthorized') || code.includes('credential')) return '服务器身份码无效，请重新连接';
  if (code.includes('network')) return '无法连接服务器，请检查地址和网络后重试';
  if (code.includes('login_required')) return '服务器尚未登录 B 站，请先同步本地登录态';
  if (code.includes('room_limit_reached')) return '服务器采集房间已达到上限';
  if (code.includes('stop_pending')) return '服务器仍在保存记录，请稍后重试';
  if (code.includes('local_session_missing')) return '本地尚未登录 B 站';
  if (code.includes('local_refresh_token_missing')) return '本地登录态缺少刷新令牌，请重新扫码登录';
  if (code.includes('account_replacement_required')) return '服务器当前使用其他 B 站账号';
  if (code.includes('invalid_login')) return '本地登录态已失效，请重新扫码登录';
  return code || '操作失败，请稍后重试';
};

const accountState = (auth: CloudAuthStatus | null) => {
  if (!auth?.account) return '未登录';
  if (auth.state === 'valid') return '可用';
  if (auth.state === 'unavailable') return '暂时无法验证';
  return '需要重新登录';
};

const roomState = (state: string) => {
  const labels: Record<string, string> = {
    receiving: '采集中',
    preparing: '连接中',
    transport_open: '等待事件',
    reconnecting: '重连中',
    waiting_login: '等待登录',
    storage_unavailable: '保存异常',
    stopped: '已停止',
  };
  return labels[state] ?? state;
};

export function CloudCollectionSettings({ serviceVersion, serverId }: { serviceVersion: string; serverId: string }) {
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
    if (!/^[1-9][0-9]*$/.test(roomId)) throw new Error('请输入正确的直播间号');
    await cloudServerApi.enableRoom(roomId);
    setRoomId('');
    setNotice('已开始采集该直播间');
    await refreshRooms();
  });

  const stopRoom = () => {
    if (!stopRoomId) return;
    return run('rooms', async () => {
      await cloudServerApi.stopRoom(stopRoomId);
      setStopRoomId(null);
      setNotice('已停止采集，历史记录仍会保留');
      await refreshRooms();
    });
  };

  const previewRetention = () => run('retention', async () => {
    const days = retentionInput.trim() === '' ? null : Number(retentionInput);
    if (days !== null && (!Number.isInteger(days) || days < 1 || days > 365000)) {
      throw new Error('保留天数必须是 1 到 365000 的整数');
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
      setNotice('数据保留设置已更新');
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
    setNotice('本地登录态已同步到服务器');
    await refreshRooms();
  });

  const openServerQr = () => run('auth', async () => {
    const session = await cloudServerApi.createQrSession();
    await openUrl(session.url);
    setNotice('已打开服务器扫码登录页面，完成后请刷新账号状态');
  });

  const sectionClass = 'rounded-lg border border-line bg-bg px-3 py-3';
  const retryButton = (key: string, retry: () => void) => errors[key]
    ? <div className="mt-2 flex items-center justify-between gap-2"><span role="alert" className="ui-type-meta text-danger">{errors[key]}</span><button type="button" className="h-7 rounded-md border border-line px-2 ui-type-meta text-t2 hover:bg-raised" onClick={retry}>重试</button></div>
    : null;

  return <div className="mt-3 grid gap-3" data-settings-search="cloud-collection">
    <section className={sectionClass}>
      <div className="flex items-center justify-between gap-3">
        <div><h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="服务器" />服务器</h3><p className="mt-1 ui-type-meta text-t3">版本 {serviceVersion} · 标识 {serverId.slice(0, 8)}</p></div>
        {health && <span className={`ui-type-meta ${health.status === 'ready' ? 'text-success' : 'text-warning'}`}>{health.status === 'ready' ? '运行正常' : '暂不可用'}</span>}
      </div>
      {retryButton('health', () => void refreshHealth())}
    </section>

    <section className={sectionClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="B站账号" />B站账号</h3>
          <p className="mt-1 ui-type-meta text-t3">{auth?.account ? `${auth.account.name}（${auth.account.uid}） · ${accountState(auth)}` : accountState(auth)}</p>
          {auth?.account && <p className="mt-1 ui-type-micro text-t3">{auth.refreshCapable ? '服务器可自动续期' : '服务器登录态无法自动续期'}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={Boolean(busy) || !localSession} onClick={() => void syncLocal()}
            className="h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t1 enabled:hover:border-accent/50 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50">同步本地登录态</button>
          <button type="button" disabled={Boolean(busy)} onClick={() => void openServerQr()}
            className="h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t2 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50">服务器扫码登录</button>
          <button type="button" disabled={Boolean(busy)} aria-label="刷新状态" title="刷新状态" onClick={() => void refreshAuth()}
            className="settings-icon-action h-8 rounded-md border border-line bg-surface px-2 ui-type-control text-t2 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50"><RefreshCw size={16} aria-hidden="true" /></button>
        </div>
      </div>
      {localSession && <p className="mt-2 ui-type-meta text-t3">本地账号：{localSession.name}（{localSession.uid}）{localSession.refreshCapable ? '' : ' · 缺少刷新令牌'}</p>}
      {retryButton('auth', () => void refreshAuth())}
      {retryButton('local', () => void refreshLocal())}
    </section>

    <section className={sectionClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="采集房间" />采集房间</h3><p className="mt-1 ui-type-meta text-t3">停止采集不会删除已经保存的记录。</p></div>
        <span className="ui-type-meta text-t3">{rooms ? `${rooms.items.filter(room => room.enabled).length} / ${rooms.supportedEnabledRooms} 个已开启` : ''}</span>
      </div>
      <div className="mt-2 flex gap-2">
        <input inputMode="numeric" value={roomId} disabled={Boolean(busy)} onChange={event => setRoomId(event.target.value.replace(/\D/g, ''))}
          placeholder="输入直播间号" className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
        <button type="button" disabled={Boolean(busy) || !roomId} onClick={() => void enableRoom()}
          className="h-8 shrink-0 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:cursor-not-allowed disabled:opacity-50">开始采集</button>
      </div>
      {rooms && <div className="mt-2 divide-y divide-line rounded-md border border-line bg-surface">
        {rooms.items.length === 0 && <div className="px-3 py-4 text-center ui-type-meta text-t3">还没有采集房间</div>}
        {rooms.items.map(room => <div key={room.roomId} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1"><div className="truncate ui-type-control text-t1">{room.currentSession?.title || `直播间 ${room.roomId}`}</div><div className="ui-type-micro text-t3">{room.roomId} · {room.enabled ? roomState(room.state) : '已停止'}</div></div>
          {room.enabled
            ? <button type="button" disabled={Boolean(busy)} onClick={() => setStopRoomId(room.roomId)} className="h-7 rounded-md px-2 ui-type-meta text-danger enabled:hover:bg-danger/10 disabled:opacity-50">停止采集</button>
            : <button type="button" disabled={Boolean(busy)} onClick={() => { setRoomId(room.roomId); void run('rooms', async () => { await cloudServerApi.enableRoom(room.roomId); setNotice('已重新开始采集'); await refreshRooms(); }); }} className="h-7 rounded-md px-2 ui-type-meta text-accent-text enabled:hover:bg-accent-subtle disabled:opacity-50">重新开始</button>}
        </div>)}
      </div>}
      {retryButton('rooms', () => void refreshRooms())}
    </section>

    <section className={sectionClass}>
      <h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="数据保留" />数据保留</h3>
      <p className="mt-1 ui-type-meta text-t3">留空表示永久保留。更新前会预览受影响的场次和事件。</p>
      <div className="mt-2 flex items-center gap-2">
        <input inputMode="numeric" value={retentionInput} disabled={Boolean(busy)} onChange={event => setRetentionInput(event.target.value.replace(/\D/g, ''))}
          placeholder="永久保留" aria-label="云端记录保留天数" className="h-8 w-32 rounded-md border border-line bg-surface px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
        <span className="ui-type-control text-t3">天</span>
        <button type="button" disabled={Boolean(busy) || !retention} onClick={() => void previewRetention()} className="h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t1 enabled:hover:bg-raised disabled:opacity-50">预览更改</button>
      </div>
      {retryButton('retention', () => void refreshRetention())}
    </section>

    {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 px-3 py-2 ui-type-meta text-success">{notice}</div>}
    {stopRoomId && <ConfirmDialog title="停止采集" description={`将停止采集直播间 ${stopRoomId}，已经保存的记录不会删除。`} confirmLabel="停止采集" confirmTone="danger" onCancel={() => setStopRoomId(null)} onConfirm={stopRoom} />}
    {retentionPreview && <ConfirmDialog title="更新数据保留设置"
      description={`将改为${retentionPreview.retentionDays === null ? '永久保留' : `保留 ${retentionPreview.retentionDays} 天`}。当前有 ${retentionPreview.sessionCount} 场、${retentionPreview.eventCount} 个事件符合清理条件。`}
      confirmLabel="确认更新" confirmTone={retentionPreview.sessionCount > 0 ? 'danger' : 'accent'} onCancel={() => setRetentionPreview(null)} onConfirm={confirmRetention} />}
    {replaceAccount && localSession && <ConfirmDialog title="替换服务器账号" description={`服务器当前账号与本地账号 ${localSession.name}（${localSession.uid}）不同。替换后，采集房间将改用本地账号连接。`} confirmLabel="替换账号" confirmTone="danger" onCancel={() => setReplaceAccount(false)} onConfirm={() => syncLocal(true)} />}
  </div>;
}
