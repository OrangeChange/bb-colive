import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ArchiveRepositoryContract } from '../archive/archiveTypes.ts';
import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics.ts';
import type { CloudRecoveryBindingState } from '../cloudSync/cloudRecoveryBinding.ts';
import { cloudRecoveryBindingClient, cloudRecoveryTask } from '../cloudSync/cloudRecoveryRuntime.ts';
import { CloudCollectionSettings } from './CloudCollectionSettings.tsx';
import { Eye, EyeOff, Link2, Unlink2, RefreshCw, Download, Pause } from 'lucide-react';
import { SettingsIcon } from './SettingsIcon';
import { SettingsHelp } from './SettingsHelp';

const message = (error: unknown) => {
  const code = error instanceof Error ? error.message : String(error);
  if (code === '恢复已暂停' || error instanceof DOMException && error.name === 'AbortError') return '恢复已暂停，可稍后继续';
  if (code.includes('credential') || code.includes('unauthorized')) return '身份码无效或已失效，请重新保存服务器信息';
  if (code.includes('incompatible')) return '服务器版本与当前软件不兼容';
  if (code.includes('fetch') || code.includes('network')) return '无法连接服务器，请检查地址和网络后重试';
  return code || '恢复失败，请稍后重试';
};

export function CloudRecoverySettings({ repository, onChanged, connectionRequested = false }: {
  repository: ArchiveRepositoryContract | null;
  onChanged?: () => void;
  connectionRequested?: boolean;
}) {
  const [binding, setBinding] = useState<CloudRecoveryBindingState>({ status: 'unbound', binding: null });
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [bindingBusy, setBindingBusy] = useState(false);
  const [bindingLoading, setBindingLoading] = useState(true);
  const [bindingLoadFailed, setBindingLoadFailed] = useState(false);
  const [bindingLoadRevision, setBindingLoadRevision] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedbackScope, setFeedbackScope] = useState<'binding' | 'restore'>('binding');
  const task = useSyncExternalStore(cloudRecoveryTask.subscribe, cloudRecoveryTask.getSnapshot, cloudRecoveryTask.getSnapshot);
  const restoring = task.status === 'starting' || task.status === 'running';
  const busy = bindingLoading || bindingBusy || restoring;

  useEffect(() => { recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'open', action: 'panel', outcome: 'opened' }); }, []);
  useEffect(() => {
    setBindingLoading(true); setBindingLoadFailed(false); setError(null); setFeedbackScope('binding');
    void cloudRecoveryBindingClient.load().then(value => { setBinding(value); if (value.binding) setBaseUrl(value.binding.baseUrl); })
      .catch(reason => { setBindingLoadFailed(true); setError(message(reason)); recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'failure', action: 'binding-load', outcome: 'failed' }); })
      .finally(() => setBindingLoading(false)); }, [bindingLoadRevision]);
  const run = async (action: () => Promise<void>) => {
    setBindingBusy(true); setError(null); setNotice(null); setFeedbackScope('binding');
    try { await action(); } catch (reason) { setError(message(reason));
      recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'failure', action: 'operation', outcome: 'failed' });
    } finally { setBindingBusy(false); }
  };
  const saveBinding = () => run(async () => {
    if (!baseUrl.trim() || !token) throw new Error('请填写服务器地址和身份码');
    const next = await cloudRecoveryBindingClient.save(baseUrl.trim(), token);
    setBinding(next); setBindingLoadFailed(false); setToken(''); setNotice('服务器已连接');
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'success', action: 'binding-save', outcome: 'connected' });
  });
  const restore = async () => {
    setError(null); setNotice(null); setFeedbackScope('restore');
    if (!repository) { setError('回看档案暂不可用，请稍后再试'); return; }
    if (!/^[1-9][0-9]*$/.test(roomId)) { setError('请输入正确的直播间号'); return; }
    const result = await cloudRecoveryTask.start({ roomId, ownerName: `直播间 ${roomId}`, repository, onChanged });
    if (result === 'binding-required') setError('请先连接服务器');
    if (result === 'busy') setError('已有直播间正在恢复，请等待完成或先暂停');
  };
  const removeBinding = () => run(async () => {
    await cloudRecoveryBindingClient.remove();
    setBinding({ status: 'unbound', binding: null });
    setToken(''); setNotice('已断开服务器');
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'setting-change', action: 'binding-remove', outcome: 'disconnected' });
  });
  const pause = () => { cloudRecoveryTask.pause();
    recordFeatureDiagnostic({ featureId: 'cloud-recovery', stage: 'cancel', action: 'restore', outcome: 'paused' }); };

  const feedback = (scope: 'binding' | 'restore') => feedbackScope === scope && <>
    {notice && <div role="status" className="rounded-md border border-success/30 bg-success/10 px-2.5 py-2 ui-type-meta text-success">{notice}</div>}
    {error && <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 px-2.5 py-2 ui-type-meta text-danger">{error}</div>}
  </>;

  return <div className="settings-cloud-tasks" data-settings-search="cloud-recovery">
    <section className="settings-task-group" aria-label="云端记录服务">
      <div className="settings-task-heading">
        <h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="云端记录服务" />云端记录服务</h3>
        <SettingsHelp label="连接说明">连接服务器后，可管理云端采集并将记录恢复到回看档案。</SettingsHelp>
        <span role="status" className={`settings-task-status ui-type-meta ${binding.status === 'ready' ? 'text-success' : 'text-t3'}`}><Link2 size={14} aria-hidden="true" />{bindingLoading ? '正在读取连接信息…' : bindingLoadFailed ? '无法读取连接信息，请重新查询' : binding.status === 'ready' ? '已连接' : binding.status === 'credential-required' ? '需要重新输入身份码' : '未连接'}</span>
      </div>
      <div className="grid gap-2">
      {connectionRequested && !bindingLoading && !bindingLoadFailed && binding.status !== 'ready' && <div role="status" className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-2 ui-type-meta text-warning">请先连接服务器，再恢复当前主播</div>}
      <label className="grid gap-1 ui-type-meta text-t3"><span>服务器地址</span>
        <input value={baseUrl} disabled={busy} onChange={event => setBaseUrl(event.target.value)} placeholder="https://example.com"
          className="h-8 min-w-0 rounded-md border border-line bg-bg px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
      </label>
      <label className="grid gap-1 ui-type-meta text-t3"><span>身份码</span>
        <span className="flex min-w-0 gap-1"><input type={showToken ? 'text' : 'password'} autoComplete="off" value={token} disabled={busy} onChange={event => setToken(event.target.value)} placeholder={binding.status === 'ready' ? '已安全保存；输入新身份码可更新' : '输入服务器身份码'}
          className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
          <button type="button" disabled={busy} title={showToken ? '隐藏身份码' : '显示身份码'} aria-label={showToken ? '隐藏身份码' : '显示身份码'} onClick={() => setShowToken(value => !value)} className="settings-icon-action h-8 rounded-md border border-line bg-bg px-2 ui-type-meta text-t2 enabled:hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring">{showToken ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button></span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={busy || !token} onClick={saveBinding} className="settings-action-button h-8 rounded-md border border-line bg-surface px-3 ui-type-control text-t1 enabled:hover:border-accent/50 enabled:hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"><Link2 size={15} aria-hidden="true" />{binding.status === 'ready' ? '更新连接' : '连接服务器'}</button>
        {binding.status !== 'unbound' && <button type="button" disabled={busy} onClick={removeBinding} className="settings-action-button h-8 rounded-md px-2 ui-type-control text-t3 enabled:hover:bg-surface enabled:hover:text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"><Unlink2 size={15} aria-hidden="true" />断开连接</button>}
        {bindingLoadFailed && <button type="button" disabled={busy} onClick={() => setBindingLoadRevision(value => value + 1)} className="settings-action-button h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 enabled:hover:bg-surface disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"><RefreshCw size={15} aria-hidden="true" />重新查询</button>}
      </div>
      {feedback('binding')}
      </div>
    </section>
    {binding.status === 'ready' && <CloudCollectionSettings serviceVersion={binding.binding.serviceVersion} serverId={binding.binding.serverId} />}
    <section className="settings-task-group grid gap-2" aria-label="记录恢复">
      <h3 className="settings-experience-heading ui-type-control font-medium text-t1"><SettingsIcon name="记录恢复" />记录恢复</h3>
      <p className="ui-type-meta text-t3">恢复该直播间的全部云端记录。</p>
      <label className="mt-2 grid gap-1 ui-type-meta text-t3"><span>直播间号</span>
        <input inputMode="numeric" value={roomId} disabled={busy} onChange={event => setRoomId(event.target.value.replace(/\D/g, ''))} placeholder="输入要恢复的直播间号"
          className="h-8 min-w-0 rounded-md border border-line bg-bg px-2 ui-type-control text-t1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring" />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy || binding.status !== 'ready' || !roomId} onClick={() => void restore()} className="settings-action-button h-8 rounded-md bg-accent-solid px-3 ui-type-control text-accent-fg enabled:hover:bg-accent-solid-hover enabled:active:bg-accent-solid-active disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"><Download size={15} aria-hidden="true" />恢复记录</button>
        {restoring && <button type="button" onClick={pause} className="settings-action-button h-8 rounded-md border border-line bg-bg px-3 ui-type-control text-t2 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-ring"><Pause size={15} aria-hidden="true" />暂停</button>}
      </div>
      {task.status !== 'idle' && <div role="status" className="ui-type-meta text-t3">恢复进度显示在窗口右下角</div>}
      {feedback('restore')}
    </section>
  </div>;
}
