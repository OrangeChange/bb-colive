import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../../src/App.css';
mockWindows('main');
mockIPC((command,args)=>(window as any).__realInvoke(command,args));
await import('../../src/compat/blivechat/register.tsx');
await import('../../src/compat/openlive/register.tsx');
await import('../../src/compat/laplace/register.tsx');
const {startObsHost}=await import('../../src/obs/obsService.ts');
await startObsHost();
const {ThemeWorkspace}=await import('../../src/components/ThemeWorkspace.tsx');
const {DEFAULT_EVENT_DISPLAY_PREFERENCES}=await import('../../src/eventDisplaySettings.ts');
function App(){const [target,setTarget]=useState<HTMLDivElement|null>(null),[header,setHeader]=useState<HTMLDivElement|null>(null);const [editing,setEditing]=useState(false);return <div style={{display:'flex',height:'100vh'}}><div style={{flex:1,minWidth:0,overflow:'auto'}}><ThemeWorkspace active displayPreferences={DEFAULT_EVENT_DISPLAY_PREFERENCES} applyThemeProjection={()=>{}} previewTarget={target} previewHeaderTarget={header} previewGeometry={{width:440,resizeBy:()=>{}}} onEditingChange={setEditing} onPreviewTitleChange={()=>{}} fontFamilyOptions={[]} /></div>{editing&&<aside style={{width:440,minWidth:440,display:'flex',flexDirection:'column'}}><div ref={setHeader}/><div ref={setTarget} style={{flex:1,minHeight:0}}/></aside>}</div>}
createRoot(document.getElementById('root')!).render(<App/>);
