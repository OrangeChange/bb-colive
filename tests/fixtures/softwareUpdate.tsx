import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mockIPC} from '@tauri-apps/api/mocks';
import {emit} from '@tauri-apps/api/event';
import '../../src/App.css';
import {SoftwareUpdateSettings} from '../../src/updates/SoftwareUpdateSettings';
import {useSoftwareUpdate,useUpdatePreferences} from '../../src/updates/store';
import {initTheme,useTheme} from '../../src/theme';
import {UpdateProgressWindow} from '../../src/updates/UpdateProgressWindow';
import {UpdateNotification} from '../../src/updates/UpdateNotification';
import {SystemReminderBell} from '../../src/components/SystemReminderBell';
import {AboutDialog} from '../../src/components/AboutDialog';
let cancelled=false;
const offer={version:'1.1.0',tag:'v1.1.0',notes:'## 更新内容\n- 软件内检查更新与国内、国外下载线路。\n- 安装版和便携版更新后自动启动。\n- 独立更新进度窗口，保留原有数据与主题。',kind:'portable',source:'domestic',releaseUrl:'https://gitee.com/orange-chan/bb-colive/releases/tag/v1.1.0',packages:[{size:10485760}]};
const calls:string[]=[];const controls={checkFailure:false};
mockIPC(async(command,args)=>{
 calls.push(command);
 if(command==='update_helper_status')return {phase:"installing",version:"1.0.0",completed:0,total:0,error:null,releaseUrl:"https://gitee.com/orange-chan/bb-colive/releases"};
 if(command==='check_software_update'){if(controls.checkFailure)throw new Error('无法连接所选线路');await new Promise(r=>setTimeout(r,40));return {source:args?.route==='foreign'?'foreign':'domestic',region:null,offer,manualVersion:null,releaseUrl:offer.releaseUrl};}
 if(command==='cancel_software_update'){cancelled=true;return;}
 if(command==='download_software_update'){
  cancelled=false;
  for(let received=0;received<=10485760;received+=1048576){await new Promise(r=>setTimeout(r,90));if(cancelled)throw new Error('下载已取消');await emit('software-update-progress',{received,total:10485760,source:'domestic'});}
 }
 return null;
},{shouldMockEvents:true});
initTheme();
function Fixture(){const [open,setOpen]=useState(false);return <div style={{padding:24,maxWidth:760,margin:'auto'}}><SoftwareUpdateSettings version="1.0.0" onOpenAbout={()=>setOpen(true)}/>{new URLSearchParams(location.search).has("notifications")&&<div style={{position:"fixed",bottom:24,right:24}}><SystemReminderBell events={[]} placement="top"><UpdateNotification onOpen={()=>{}}/></SystemReminderBell></div>}{open&&<AboutDialog version="1.0.0" onClose={()=>setOpen(false)}/>}</div>}
Object.assign(window,{updateTest:{state:useSoftwareUpdate,preferences:useUpdatePreferences,theme:useTheme,calls,controls,offer}});
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has("helper")?<UpdateProgressWindow/>:<Fixture/>);
