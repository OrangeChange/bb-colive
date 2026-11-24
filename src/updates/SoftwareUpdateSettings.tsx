import { UpdateReleaseNotes } from './UpdateReleaseNotes';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { SettingsChoiceControl } from '../components/SettingsChoiceControl';
import { SwitchButton } from '../components/SettingsSwitch';
import { CoLiveLogo } from '../components/CoLiveLogo';
import { useSoftwareUpdate,useUpdatePreferences,updateReleasePage,type Route } from './store';
import './updates.css';
const bytes=(value:number)=>`${(value/1048576).toFixed(1)} MB`;
export function SoftwareUpdateSettings({version,onOpenAbout}:{version:string;onOpenAbout:()=>void}){
  const state=useSoftwareUpdate(),prefs=useUpdatePreferences();
  const busy=['checking','downloading','installing'].includes(state.phase);
  const title=({idle:'软件更新',checking:'正在检查更新',current:state.manualVersion?`发现新版本 ${state.manualVersion.replace(/^v/,'')}`:'已是最新版本',available:`发现新版本 ${state.offer?.version??''}`,downloading:`正在下载 ${state.offer?.version??''}`,ready:'更新已准备好',failed:'更新未完成',installing:'正在退出并更新'} as const)[state.phase];
  const face=busy?'connecting':state.phase==='failed'?'error':state.phase==='ready'||state.phase==='current'?'live':'idle';
  return <div className="software-update-settings">
    <button type="button" className="software-update-brand" aria-label="关于 BB CoLive" onClick={onOpenAbout}>
      <CoLiveLogo state={face} transition/>
      <span className="software-update-brand-identity"><strong>BB CoLive</strong><span>当前版本 {version}</span></span><ChevronRight size={18}/>
    </button>
    <div className="software-update-options">
      <div className="software-update-option"><span>启动时检查更新</span><SwitchButton label="启动时检查更新" checked={prefs.automatic} onChange={()=>prefs.setAutomatic(!prefs.automatic)}/></div>
      <div className="software-update-option"><span>更新线路</span><SettingsChoiceControl label="更新线路" value={prefs.route} disabled={busy} options={[{value:'auto' as Route,label:`自动（${state.source==='domestic'?'国内':'国外'}）`},{value:'domestic' as Route,label:'国内'},{value:'foreign' as Route,label:'国外'}]} onChange={route=>{prefs.setRoute(route);void state.check();}}/></div>
    </div>
    <div className="software-update-body">
      <h3 role="status">{title}</h3>
      {state.manualVersion&&!state.offer&&<p className="software-update-meta">请前往下载页下载安装。</p>}
      {state.offer&&<p className="software-update-meta">{state.offer.kind==='portable'?'便携版':'安装版'}{state.total>0?` · ${bytes(state.total)}`:''}</p>}
      {state.phase==='downloading'&&<div className="software-update-download"><div className="software-update-progress-caption"><span>下载进度</span><strong>{state.total?`${Math.min(100,Math.floor(state.received*100/state.total))}%`:'正在连接'}</strong></div><progress aria-label="更新下载进度" max={state.total||1} value={state.received}/><div className="software-update-transfer"><span>{bytes(state.received)} / {bytes(state.total)}</span><span>{bytes(state.speed)}/s</span></div></div>}
      {state.offer?.notes&&state.phase!=='downloading'&&<UpdateReleaseNotes notes={state.offer.notes}/>}
      {state.phase==='ready'&&<p className="software-update-meta">更新将暂停直播记录及窗口输出，完成后重新打开软件。</p>}
      {state.error&&<div className="software-update-error" role="alert"><p>更新未完成，请重试或前往下载页。</p><details><summary>错误详情</summary><p>{state.error}</p></details></div>}
      <div className="software-update-actions"><a href={updateReleasePage()} onClick={event=>{event.preventDefault();void openUrl(updateReleasePage());}}>前往下载页<ExternalLink size={13}/></a>
        {state.phase==='downloading'?<button type="button" onClick={()=>void state.cancel()}>取消下载</button>:state.phase==='ready'?<button type="button" className="software-update-primary" onClick={()=>void state.install()}>重启并更新</button>:state.phase==='available'||(state.phase==='failed'&&state.offer)?<button type="button" className="software-update-primary" onClick={()=>void state.download()}>{state.phase==='failed'?'重试下载':'下载更新'}</button>:<button type="button" disabled={busy} onClick={()=>void state.check()}>{state.phase==='failed'?'重试检查':'检查更新'}</button>}
      </div>
    </div>
  </div>;
}
