import { uiText } from "../i18n/index.ts";
import { useState } from 'react';
import { X } from 'lucide-react';
import { CoLiveLogo } from '../components/CoLiveLogo';
import { useSoftwareUpdate } from './store';
export function UpdateNotification({onOpen}:{onOpen:()=>void}){
  const state=useSoftwareUpdate();const [dismissed,setDismissed]=useState<string[]>([]);
  const version=state.offer?.version??state.manualVersion,ready=state.phase==='ready';
  const key=`${ready?'ready':'available'}:${version}`;
  if(!version||dismissed.includes(key)||!['available','ready','current'].includes(state.phase))return null;
  const dismiss=()=>setDismissed(keys=>[...keys,key]);
  return <section className="software-update-notification" role="status" aria-label={uiText("updateNotification.aria_label")}>
    <button type="button" className="software-update-notification-close" aria-label={uiText("updateNotification.aria_label2")} title={uiText("common.close")} onClick={dismiss}><X size={16}/></button>
    <div className="software-update-notification-heading"><CoLiveLogo state="live"/><div><strong>{ready?uiText("updateNotification.UpdateNotification"):uiText("updateNotification.UpdateNotification2", { value: version.replace(/^v/,'') })}</strong>{ready&&<p>{uiText("updateNotification.UpdateNotification3")}{version.replace(/^v/,'')}</p>}</div></div>
    <div className="software-update-notification-actions"><button type="button" onClick={()=>{dismiss();onOpen();}}>{uiText("updateNotification.UpdateNotification4")}</button>{ready&&<button type="button" className="software-update-primary" onClick={()=>void state.install()}>{uiText("updateNotification.UpdateNotification5")}</button>}</div>
  </section>;
}
