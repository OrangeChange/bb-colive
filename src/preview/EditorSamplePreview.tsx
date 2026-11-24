import { useCallback, useMemo, useState } from "react";
import { StylePreviewContent } from "../components/StylePreviewContent.tsx";
import { createStylePreviewDesignEvents, createStylePreviewPartEvents, type PreviewEventKind } from "../components/stylePreviewEvents.ts";
import type { StylePreviewMotion, StylePreviewScheme } from "../components/StylePreviewToolbar.tsx";
import { getCompatibleThemeEditingSurface } from "../components/CompatibleThemePreview.tsx";
import { normalizeNativeThemeDisplaySettings, createAllNativeEventVisibility, type NativeThemeSettings } from "../themes/nativeComponentAppearance.ts";
import { tryComposeNativePreviewCss } from "../themes/nativeThemeCascade.ts";
import type { ThemeDocument } from "../themes/themeTypes.ts";
import { useGeneralSettings } from "../generalSettings.ts";
import type { EventStyleSettings } from "../eventStyleSettings.ts";
import { useNativePreviewEvents } from "./useNativePreviewEvents.ts";
import { useStylePreviewPolicy } from "./useStylePreviewPolicy.ts";
import { usePreviewCanvas } from "./usePreviewCanvas.ts";
import { useStylePreviewPublisher } from "./useStylePreviewPublisher.ts";
import type { NativeStylePreviewPayload, CompatibleStylePreviewState, PreviewFrame, StylePreviewDraft } from "./stylePreviewState.ts";

export interface EditorSamplePreviewProps {
 previewEventKinds?: readonly string[];
 document: ThemeDocument; roomId: number | null; kind: string; motion: StylePreviewMotion;
 playing: boolean; speed: number; restart: number; displayAll: boolean;
 scheme: StylePreviewScheme; background: string; width: number; displayScale: number;
}
function useSampleEnvironment(props: EditorSamplePreviewProps) {
 const policy = useStylePreviewPolicy();
 const previewPolicy = useMemo(() => ({...policy,targetRoomId:props.roomId ?? undefined,previewEventKinds:props.previewEventKinds}),[policy,props.roomId,props.previewEventKinds]);
 const scrollDirection=useGeneralSettings(s=>s.liveScrollDirection);
 const contentAlignment=useGeneralSettings(s=>s.liveContentAlignment);
 return {previewPolicy,scrollDirection,contentAlignment};
}
function NativeSamplePreview(props: EditorSamplePreviewProps) {
 const {document,kind,motion,playing,speed,restart,displayAll,scheme,background,width}=props;
 const {previewPolicy,scrollDirection,contentAlignment}=useSampleEnvironment(props);
 const settings=document.settings as NativeThemeSettings;
 const display=useMemo(()=>normalizeNativeThemeDisplaySettings(settings.display),[settings.display]);
 const softwareDisplay=useGeneralSettings(s=>s.eventDisplayPreferences);
 const previewPreferences=useMemo(()=>({...softwareDisplay,...display}),[softwareDisplay,display]);
 const events=useMemo(()=>motion==='design'?createStylePreviewDesignEvents(kind as PreviewEventKind):createStylePreviewPartEvents(kind as PreviewEventKind),[kind,motion==='design']);
 const {previewEvents,previewNow,previewMainEventIds}=useNativePreviewEvents({document,settings,baseFontSize:display.baseFontSize,events,previewContext:'obs',previewDisplayMode:displayAll?'all':'current',previewKind:kind as PreviewEventKind,previewMotion:motion,previewActive:true,previewPlaying:playing,previewSpeed:speed,previewPreferences,previewPolicy,restart});
 const css=useMemo(()=>tryComposeNativePreviewCss({...document,settings:displayAll?{...settings,eventVisibility:createAllNativeEventVisibility()}:settings},'.native-theme-preview').css,[document,settings,displayAll]);
 const payload=useMemo<NativeStylePreviewPayload>(()=>({previewCss:css,previewPolicy,previewMotion:motion==='dynamic'?'simulation':motion,previewNow,previewMainEventIds,context:'obs',mode:displayAll?'all':'current',events:previewEvents,eventStyleSettings:settings as EventStyleSettings,displayPreferences:previewPreferences,eventFontSize:display.baseFontSize,windowEventFontSize:display.baseFontSize,stickySettings:previewPolicy.stickySettings,scrollDirection,contentAlignment,previewScheme:scheme,previewBackground:background}),[css,previewPolicy,motion,previewNow,previewMainEventIds,displayAll,previewEvents,settings,previewPreferences,display.baseFontSize,scrollDirection,contentAlignment,scheme,background]);
 const canvas=usePreviewCanvas(width,scheme);
 const state=useMemo<StylePreviewDraft>(()=>({kind:'native',content:payload,...canvas.geometry,displayScale:props.displayScale,frame:{epoch:0,restart,playing,cursor:previewEvents.length}}),[payload,canvas.geometry,props.displayScale,restart,playing,previewEvents.length]);
 useStylePreviewPublisher(state);
 return <div ref={canvas.ref} className="native-theme-preview"><StylePreviewContent state={{...state,ownerId:'local',revision:0}} /></div>;
}
function CompatibleSamplePreview(props: EditorSamplePreviewProps) {
 const {document,kind,motion,playing,speed,restart,displayAll,scheme,background,width}=props;
 const {previewPolicy,scrollDirection,contentAlignment}=useSampleEnvironment(props);
 const surface=getCompatibleThemeEditingSurface(document.mode);
 const canvas=usePreviewCanvas(width,scheme);
 const [shared,setShared]=useState<{restart:number;frame:PreviewFrame}>({restart,frame:{epoch:0,records:[]}});
 const frame=shared.restart===restart?shared.frame:{epoch:0,records:[],presentation:{messages:[],paidMessages:[]}};
 const content=useMemo<CompatibleStylePreviewState>(()=>({document,previewPolicy,scrollDirection,contentAlignment,previewMode:motion==='dynamic'?'simulation':motion,previewEventType:kind,previewPlaying:playing,previewSpeed:speed,previewRestartKey:restart,displayAll,previewTarget:'obs',previewScheme:scheme,previewBackground:background,width}),[document,previewPolicy,scrollDirection,contentAlignment,motion,kind,playing,speed,restart,displayAll,scheme,background,width]);
 const state=useMemo<StylePreviewDraft>(()=>({kind:'compatible',content,...canvas.geometry,displayScale:props.displayScale,frame:{...frame,restart,playing}}),[content,canvas.geometry,props.displayScale,frame,restart,playing]);
 const publish=useStylePreviewPublisher(state);
 const onFrame=useCallback((frame:PreviewFrame)=>{publish(frame);setShared({restart,frame})},[publish,restart]);
 return surface?<div ref={canvas.ref} className="native-theme-preview"><StylePreviewContent state={{...state,ownerId:'local',revision:0}} onPreviewFrame={onFrame} /></div>:null;
}
export function EditorSamplePreview(props: EditorSamplePreviewProps) {
 return props.document.mode==='native'?<NativeSamplePreview {...props}/>:<CompatibleSamplePreview {...props}/>;
}
