import { uiText } from "../i18n/index.ts";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { emit, listen } from "@tauri-apps/api/event";
import type { NativeObsConfiguration } from "./nativeObsConfigurations.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import type { ObsWireState, ObsMessage } from "./obsProtocol.ts";
import type { StylePreviewDraft } from "../preview/stylePreviewState.ts";
import { EditorSamplePreview } from "../preview/EditorSamplePreview.tsx";
import { usePreviewCanvas } from "../preview/usePreviewCanvas.ts";
import { useStylePreviewPublisher } from "../preview/useStylePreviewPublisher.ts";
import { StylePreviewContent } from "../components/StylePreviewContent.tsx";
import { StylePreviewActions } from "../components/StylePreviewActions.tsx";
import { StylePreviewToolbar, type StylePreviewScheme, type StylePreviewMotion } from "../components/StylePreviewToolbar.tsx";
import { OBS_SAMPLE_KINDS } from "./obsSamples.ts";
import "./obs.css";

function RealtimePreview({state,width,scheme,background}:{state:ObsWireState;width:number;scheme:StylePreviewScheme;background:string}) {
 const canvas=usePreviewCanvas(width,scheme);
 const shared=useMemo<StylePreviewDraft>(()=>({kind:'obs',content:state,previewBackground:background,...canvas.geometry,frame:{epoch:0,cursor:state.events.length}}),[state,background,canvas.geometry]);
 useStylePreviewPublisher(shared);
 return <div ref={canvas.ref} className="native-theme-preview"><StylePreviewContent state={{...shared,ownerId:'local',revision:0}} /></div>;
}
export function ObsManagementPreview({configuration,saved,displayScale,loadDocument,geometry,previewHeaderTarget}:{
 configuration:NativeObsConfiguration;saved?:NativeObsConfiguration;displayScale:number;
 loadDocument:(id:string)=>Promise<ThemeDocument>;
 geometry?:import('../components/nativePreviewGeometry.ts').NativePreviewGeometry|null;
 previewHeaderTarget?:HTMLElement|null;
}) {
 const [document,setDocument]=useState<ThemeDocument>();
 const [error,setError]=useState('');
 const [eventKinds,setEventKinds]=useState<string[]>([]);
 const kind=document?.mode==='native'?uiText("obsManagementPreview.ObsManagementPreview.kind"):'all';
 const displayAll=true;
 const [realtime,setRealtime]=useState(false);
 const [live,setLive]=useState<ObsWireState>();
 const [scheme,setScheme]=useState<StylePreviewScheme>('light');
 const [motion,setMotion]=useState<StylePreviewMotion>('static');
 const [width,setWidth]=useState(400);
 const [background,setBackground]=useState('transparent');
 const [playing,setPlaying]=useState(true);
 const [speed,setSpeed]=useState(1);
 const [restart,setRestart]=useState(0);
 const options=OBS_SAMPLE_KINDS.map(value=>({value,label:value}));
 useEffect(()=>{let active=true;setDocument(undefined);setError('');void loadDocument(configuration.themeId).then(value=>{if(active)setDocument(value)}).catch(()=>{if(active)setError(uiText("obsManagementPreview.ObsManagementPreview"))});return()=>{active=false}},[configuration.themeId,loadDocument]);
 useEffect(()=>{
  if(!realtime||!saved)return;
  const clientId=`preview:${crypto.randomUUID()}`;let active=true;let stop:(()=>void)|undefined;
  void listen<{clientId:string;message:ObsMessage}>('obs:state',event=>{
   if(event.payload.clientId!==clientId)return;
   const message=event.payload.message;
   if(message.type==='state'){setLive(message);setError('')}
   else if(message.type==='status')setError(message.message);
  }).then(unlisten=>{if(!active){unlisten();return}stop=unlisten;void emit('obs:subscribe',{clientId,query:{room:saved.roomId,theme:saved.themeId,config:saved.id}})});
  return()=>{active=false;stop?.();void emit('obs:unsubscribe',clientId);setLive(undefined)};
 },[realtime,saved?.id,saved?.roomId,saved?.themeId]);
 const previewWidth=geometry?.width??width;
 return <div className="obs-management-preview">
  {previewHeaderTarget&&createPortal(<StylePreviewActions realtime={realtime} onRealtimeChange={()=>setRealtime(value=>!value)} realtimeDisabled={!saved}/>,previewHeaderTarget)}
  <StylePreviewToolbar
   eventValues={eventKinds} eventDisabled={realtime} eventOptions={options} onEventsChange={setEventKinds}
   scheme={scheme} onSchemeChange={setScheme} motion={realtime?'static':motion} supportedMotions={realtime?['static']:['static','design','dynamic']} onMotionChange={value=>{setMotion(value);setRestart(n=>n+1);if(value==='dynamic')setPlaying(true)}}
   playing={playing} onPlayingChange={()=>setPlaying(value=>!value)} onRestart={()=>{setRestart(n=>n+1);setPlaying(true)}}
   speed={speed} onSpeedChange={setSpeed}
   width={previewWidth} onWidthChange={value=>{const next=Math.max(160,Math.min(1920,Math.round(value)));if(geometry)geometry.resizeBy(next-previewWidth);else setWidth(next);}} background={background} onBackgroundChange={setBackground}/>
  {(error||(realtime&&live?.connection.message))&&<p className="obs-preview-status" role="status">{error||live?.connection.message}</p>}
  <div className={`native-preview-stage obs-preview-scroll${background === "transparent" ? " is-checkerboard" : ""} is-${scheme}`}><div className="native-preview-canvas obs-preview-canvas" style={{backgroundColor:background === "transparent" ? undefined : background}}>
   {realtime?(live&&<RealtimePreview state={live} width={previewWidth} scheme={scheme} background={background}/>):document&&<EditorSamplePreview key={configuration.id+':'+document.themeId} document={document} roomId={Number(configuration.roomId)||null} kind={kind} previewEventKinds={eventKinds} motion={motion} playing={playing} speed={speed} restart={restart} displayAll={displayAll} scheme={scheme} background={background} width={previewWidth} displayScale={displayScale}/>}
  </div></div>
 </div>;
}
