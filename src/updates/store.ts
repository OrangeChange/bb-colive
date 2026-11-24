import { useTheme } from '../theme';
import { recordFeatureDiagnostic } from '../diagnostics/featureDiagnostics';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
export type Route = 'auto'|'domestic'|'foreign';
type Source = Exclude<Route,'auto'>;
export interface Offer {version:string;tag:string;notes:string;kind:'installer'|'portable';source:Source;releaseUrl:string;packages:{size:number}[]}
interface Region {countryCode:string;checkedAt:number}
interface Check {source:Source;region:Region|null;offer:Offer|null;manualVersion:string|null;releaseUrl:string}
export const useUpdatePreferences=create(persist<{route:Route;automatic:boolean;region:Region|null;setRoute:(route:Route)=>void;setAutomatic:(automatic:boolean)=>void}>((set)=>({route:'auto',automatic:true,region:null,setRoute:route=>set({route}),setAutomatic:automatic=>set({automatic})}),{name:'bb-colive-updates'}));
type Phase='idle'|'checking'|'current'|'available'|'downloading'|'ready'|'failed'|'installing';
interface State {phase:Phase;offer:Offer|null;source:Source;releaseUrl:string;manualVersion:string|null;error:string;received:number;total:number;speed:number;check:()=>Promise<void>;download:()=>Promise<void>;cancel:()=>Promise<void>;install:()=>Promise<void>}
let cancelRequested=false;
export const useSoftwareUpdate=create<State>((set,get)=>({
  phase:'idle',offer:null,source:'domestic',releaseUrl:'https://gitee.com/orange-chan/bb-colive/releases',manualVersion:null,error:'',received:0,total:0,speed:0,
  check:async()=>{
    if(['checking','downloading','installing','ready'].includes(get().phase))return;
    const {route,region}=useUpdatePreferences.getState();
    set({phase:'checking',error:'',offer:null,manualVersion:null,received:0,total:0});
    recordFeatureDiagnostic({featureId:'software-updates',stage:'request',action:'check-update',outcome:'started',data:{route}});
    try {const result=await invoke<Check>('check_software_update',{route,region});
      useUpdatePreferences.setState({region:result.region});
      set({...result,total:result.offer?.packages[0]?.size??0,phase:result.offer?'available':'current',error:''});
      recordFeatureDiagnostic({featureId:'software-updates',stage:'success',action:'check-update',outcome:result.offer?'available':'current',data:{source:result.source}});
    }catch(error){set({phase:'failed',error:String(error)});recordFeatureDiagnostic({featureId:'software-updates',stage:'failure',action:'check-update',outcome:'failed',data:{message:String(error)}});}
  },
  download:async()=>{
    if(get().phase==='downloading')return;
    cancelRequested=false;set({phase:'downloading',received:0,total:0,speed:0,error:''});
    let lastTime=performance.now(),lastBytes=0;
    const stop=await listen<{received:number;total:number;source:Source}>('software-update-progress',({payload})=>{
      const now=performance.now();
      const elapsed=now-lastTime;
      set({...payload,...(elapsed>=400?{speed:Math.max(0,(payload.received-lastBytes)*1000/elapsed)}:{})});
      if(elapsed>=400){lastTime=now;lastBytes=payload.received;}
    });
    try {await invoke('download_software_update');set({phase:'ready'});}
    catch(error){set({phase:cancelRequested?'available':'failed',error:cancelRequested?'':String(error)});}
    finally{stop();}
  },
  cancel:async()=>{cancelRequested=true;await invoke('cancel_software_update');},
  install:async()=>{set({phase:'installing',error:''});try{const {palette,mode,customColor}=useTheme.getState();const scheme=mode==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):mode;await invoke('install_software_update',{appearance:{palette,scheme,customColor}});}catch(error){set({phase:'ready',error:String(error)});}},
}));
let initialized=false;
export function initializeSoftwareUpdates(){
  if(initialized)return;initialized=true;
  void invoke<Offer|null>('restore_software_update').then(offer=>{
    if(offer)useSoftwareUpdate.setState({phase:'ready',offer,source:offer.source,total:offer.packages[0]?.size??0,releaseUrl:offer.releaseUrl});
    else if(useUpdatePreferences.getState().automatic)void useSoftwareUpdate.getState().check();
  }).catch(()=>{if(useUpdatePreferences.getState().automatic)void useSoftwareUpdate.getState().check();});
}
export function updateReleasePage(){
  const {route}=useUpdatePreferences.getState(),state=useSoftwareUpdate.getState();
  const source=route==='auto'?state.source:route;
  const root=source==='domestic'?'https://gitee.com/orange-chan/bb-colive/releases':'https://github.com/OrangeChange/bb-colive/releases';
  const tag=state.offer?.tag??state.manualVersion;
  return tag?`${root}/tag/${encodeURIComponent(tag)}`:root;
}
