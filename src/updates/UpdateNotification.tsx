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
  return <section className="software-update-notification" role="status" aria-label="软件更新">
    <button type="button" className="software-update-notification-close" aria-label="关闭更新提示" title="关闭" onClick={dismiss}><X size={16}/></button>
    <div className="software-update-notification-heading"><CoLiveLogo state="live"/><div><strong>{ready?'更新已准备好':`发现新版本 ${version.replace(/^v/,'')}`}</strong>{ready&&<p>版本 {version.replace(/^v/,'')}</p>}</div></div>
    <div className="software-update-notification-actions"><button type="button" onClick={()=>{dismiss();onOpen();}}>查看更新</button>{ready&&<button type="button" className="software-update-primary" onClick={()=>void state.install()}>重启并更新</button>}</div>
  </section>;
}
