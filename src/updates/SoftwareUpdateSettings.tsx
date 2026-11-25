import { useUiLanguage } from "../i18n/react.ts";
import { uiText } from "../i18n/index.ts";
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
  useUiLanguage();
  const state=useSoftwareUpdate(),prefs=useUpdatePreferences();
  const busy=['checking','downloading','installing'].includes(state.phase);
  const title=({idle:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.idle"),checking:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.checking"),current:state.manualVersion?uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.current", { value: state.manualVersion.replace(/^v/,'') }):uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.current2"),available:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.available", { value: state.offer?.version??'' }),downloading:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.downloading", { value: state.offer?.version??'' }),ready:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.ready"),failed:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.failed"),installing:uiText("softwareUpdateSettings.SoftwareUpdateSettings.title.installing")} as const)[state.phase];
  const face=busy?'connecting':state.phase==='failed'?'error':state.phase==='ready'||state.phase==='current'?'live':'idle';
  return <div className="software-update-settings">
    <button type="button" className="software-update-brand" aria-label={uiText("softwareUpdateSettings.aria_label")} onClick={onOpenAbout}>
      <CoLiveLogo state={face} transition/>
      <span className="software-update-brand-identity"><strong>BB CoLive</strong><span>{uiText("softwareUpdateSettings.SoftwareUpdateSettings")}{version}</span></span><ChevronRight size={18}/>
    </button>
    <div className="software-update-options">
      <div className="software-update-option"><span>{uiText("softwareUpdateSettings.SoftwareUpdateSettings2")}</span><SwitchButton label={uiText("softwareUpdateSettings.label")} checked={prefs.automatic} onChange={()=>prefs.setAutomatic(!prefs.automatic)}/></div>
      <div className="software-update-option"><span>{uiText("softwareUpdateSettings.SoftwareUpdateSettings3")}</span><SettingsChoiceControl label={uiText("softwareUpdateSettings.label2")} value={prefs.route} disabled={busy} options={[{value:'auto' as Route,label:uiText("softwareUpdateSettings.options.label", { value: state.source==='domestic'?uiText("softwareUpdateSettings.options.label.value"):uiText("softwareUpdateSettings.options.label.value2") })},{value:'domestic' as Route,label:uiText("softwareUpdateSettings.options.label2")},{value:'foreign' as Route,label:uiText("softwareUpdateSettings.options.label3")}]} onChange={route=>{prefs.setRoute(route);void state.check();}}/></div>
    </div>
    <div className="software-update-body">
      <h3 role="status">{title}</h3>
      {state.manualVersion&&!state.offer&&<p className="software-update-meta">{uiText("softwareUpdateSettings.SoftwareUpdateSettings4")}</p>}
      {state.offer&&<p className="software-update-meta">{state.offer.kind==='portable'?uiText("softwareUpdateSettings.SoftwareUpdateSettings5"):uiText("softwareUpdateSettings.SoftwareUpdateSettings6")}{state.total>0?` · ${bytes(state.total)}`:''}</p>}
      {state.phase==='downloading'&&<div className="software-update-download"><div className="software-update-progress-caption"><span>{uiText("softwareUpdateSettings.SoftwareUpdateSettings7")}</span><strong>{state.total?`${Math.min(100,Math.floor(state.received*100/state.total))}%`:uiText("softwareUpdateSettings.SoftwareUpdateSettings8")}</strong></div><progress aria-label={uiText("softwareUpdateSettings.aria_label2")} max={state.total||1} value={state.received}/><div className="software-update-transfer"><span>{bytes(state.received)} / {bytes(state.total)}</span><span>{bytes(state.speed)}/s</span></div></div>}
      {state.offer?.notes&&state.phase!=='downloading'&&<UpdateReleaseNotes notes={state.offer.notes}/>}
      {state.phase==='ready'&&<p className="software-update-meta">{uiText("softwareUpdateSettings.SoftwareUpdateSettings9")}</p>}
      {state.error&&<div className="software-update-error" role="alert"><p>{uiText("softwareUpdateSettings.SoftwareUpdateSettings10")}</p><details><summary>{uiText("softwareUpdateSettings.SoftwareUpdateSettings11")}</summary><p>{state.error}</p></details></div>}
      <div className="software-update-actions"><a href={updateReleasePage()} onClick={event=>{event.preventDefault();void openUrl(updateReleasePage());}}>{uiText("softwareUpdateSettings.SoftwareUpdateSettings12")}<ExternalLink size={13}/></a>
        {state.phase==='downloading'?<button type="button" onClick={()=>void state.cancel()}>{uiText("softwareUpdateSettings.SoftwareUpdateSettings13")}</button>:state.phase==='ready'?<button type="button" className="software-update-primary" onClick={()=>void state.install()}>{uiText("softwareUpdateSettings.SoftwareUpdateSettings14")}</button>:state.phase==='available'||(state.phase==='failed'&&state.offer)?<button type="button" className="software-update-primary" onClick={()=>void state.download()}>{state.phase==='failed'?uiText("softwareUpdateSettings.SoftwareUpdateSettings15"):uiText("softwareUpdateSettings.SoftwareUpdateSettings16")}</button>:<button type="button" disabled={busy} onClick={()=>void state.check()}>{state.phase==='failed'?uiText("softwareUpdateSettings.SoftwareUpdateSettings17"):uiText("softwareUpdateSettings.SoftwareUpdateSettings18")}</button>}
      </div>
    </div>
  </div>;
}
