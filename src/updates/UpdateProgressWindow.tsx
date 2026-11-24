import { uiText } from "../i18n/index.ts";
import { useTheme, type Palette } from '../theme';
import { useEffect,useState,useRef,useLayoutEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Minus } from 'lucide-react';
import { CoLiveLogo } from '../components/CoLiveLogo';
import './updates.css';
interface Status {appearance?:{palette:Palette;scheme:"light"|"dark";customColor:string};phase:string;version:string;completed:number;total:number;error:string|null;releaseUrl:string}
export function UpdateProgressWindow(){
  const content=useRef<HTMLElement>(null);
  const [status,setStatus]=useState<Status>({phase:'waiting',version:'',completed:0,total:0,error:null,releaseUrl:''});
  useEffect(()=>{let disposed=false;let stop:(()=>void)|undefined;
    void(async()=>{stop=await listen<Status>('update-install-progress',event=>setStatus(event.payload));if(disposed){stop();return;}const initial=await invoke<Status>('update_helper_status');if(initial.appearance){const {palette,scheme,customColor}=initial.appearance;useTheme.setState({palette,mode:scheme,customColor});}setStatus(initial);await invoke('run_update_helper');})().catch(error=>setStatus(s=>({...s,phase:'failed',error:String(error)})));
    return()=>{disposed=true;stop?.();};
  },[]);
  const failed=['failed','launchFailed'].includes(status.phase);
  useLayoutEffect(()=>{
    const element=content.current;if(!element)return;
    let frame=0,lastHeight=0;
    const resize=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const height=Math.max(176,Math.ceil(element.getBoundingClientRect().height));if(height!==lastHeight){lastHeight=height;void getCurrentWindow().setSize(new LogicalSize(494,height));}});};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[]);
  const title=status.phase==='complete'?uiText("updateProgressWindow.UpdateProgressWindow.title"):status.phase==='launchFailed'?uiText("updateProgressWindow.UpdateProgressWindow.title2"):failed?uiText("updateProgressWindow.UpdateProgressWindow.title3"):status.phase==='launching'?uiText("updateProgressWindow.UpdateProgressWindow.title4"):uiText("updateProgressWindow.UpdateProgressWindow.title5");
  return <main ref={content} className="update-progress-window"><button className="update-minimize" aria-label={uiText("updateProgressWindow.aria_label")} onClick={()=>void getCurrentWindow().minimize()}><Minus size={18}/></button><div className="software-update-heading" data-tauri-drag-region><CoLiveLogo state={failed?'error':status.phase==='complete'?'live':'connecting'} transition/><div><h1 role="status">{title}</h1><p className="software-update-meta">{status.version&&uiText("updateProgressWindow.UpdateProgressWindow", { version: status.version })}</p></div></div>
    {!failed&&<progress aria-label={uiText("updateProgressWindow.aria_label2")} max={status.total||1} value={status.total?status.completed:undefined}/>}
    {failed?<div className="software-update-error"><p>{status.phase==='launchFailed'?uiText("updateProgressWindow.UpdateProgressWindow2"):uiText("updateProgressWindow.UpdateProgressWindow3")}</p><details><summary>{uiText("updateProgressWindow.UpdateProgressWindow4")}</summary><p>{status.error}</p></details></div>:<p className="software-update-meta">{status.phase==='complete'?uiText("updateProgressWindow.UpdateProgressWindow5"):status.phase==='launching'?uiText("updateProgressWindow.UpdateProgressWindow6"):uiText("updateProgressWindow.UpdateProgressWindow7")}</p>}
    {failed&&<div className="software-update-actions"><a href={status.releaseUrl} onClick={event=>{event.preventDefault();void openUrl(status.releaseUrl);}}>{uiText("updateProgressWindow.UpdateProgressWindow8")}</a><button onClick={()=>void getCurrentWindow().close()}>{uiText("common.close")}</button><button className="software-update-primary" onClick={()=>void invoke('run_update_helper')}>{status.phase==='launchFailed'?uiText("updateProgressWindow.UpdateProgressWindow9"):uiText("updateProgressWindow.UpdateProgressWindow10")}</button></div>}
  </main>;
}
