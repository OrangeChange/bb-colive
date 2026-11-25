import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { NativeThemeEditor } from "../../src/components/NativeThemeEditor.tsx";
import { CompatibleThemeEditor } from "../../src/components/CompatibleThemeEditor.tsx";
import { getCompatibleThemeEditingSurface } from "../../src/components/CompatibleThemePreview.tsx";
import { StylePreviewPage } from "../../src/preview/StylePreviewPage.tsx";
import { getPreview, subscribePreview } from "../../src/preview/stylePreviewSession.ts";
import { previewMessage } from "../../src/preview/stylePreviewProtocol.ts";
import { createPreviewResourceSender } from "../../src/preview/stylePreviewResources.ts";
import { createBuiltinNativeTheme } from "../../src/themes/nativeBuiltinThemes.ts";
import { createCompatibleThemeModeAdapter } from "../../src/themes/themeModeAdapters.ts";
import { permissionsForOrigin, type ThemeMode } from "../../src/themes/themeTypes.ts";
import { useGeneralSettings } from "../../src/generalSettings.ts";
import { DEFAULT_STYLE_PREVIEW_POLICY } from "../../src/preview/stylePreviewPolicy.ts";
import { saveSceneSettings, loadSceneSettings } from "../../src/components/sceneSettings.ts";
import "../../src/compat/blivechat/register.tsx";
import "../../src/compat/openlive/register.tsx";
import "../../src/compat/laplace/register.tsx";
import "../../src/shadcn.css";
import "../../src/components/nativeThemeEditor.css";
const q=new URLSearchParams(location.search);
mockWindows('main');mockIPC(command=>command==='plugin:event|listen'?1:null);
const noop=()=>{};
const assetPreviewUrls=new Map<string,string>();
function theme(mode:ThemeMode,name:string){const d=mode==='native'?createBuiltinNativeTheme(q.get('theme')||'native-default'):createCompatibleThemeModeAdapter(mode).createBuiltinTheme();return {...d,themeId:`acceptance-${mode}-${name}`,origin:'custom' as const,permissions:permissionsForOrigin('custom'),metadata:{...d.metadata,name:`${mode} ${name}`},styles:{...d.styles,customCss:`[data-event-id],[data-compatible-event-id]{outline:2px solid ${name==='A'?'rgb(17, 99, 177)':'rgb(177, 55, 17)'}!important}`}}}
function Editor(){
 const [document,setDocument]=useState(()=>theme((q.get('mode')||'native') as ThemeMode,'A'));
 const [previewTarget,setPreviewTarget]=useState<HTMLElement|null>(null),[editing,setEditing]=useState(true);
 useEffect(()=>{const encode=createPreviewResourceSender();let previous=getPreview();return subscribePreview(state=>{const message=encode(previewMessage(previous,state));previous=state;(window as any).__publishPreview?.({state,message});});},[]);
 const configure=(value:any)=>{const store=useGeneralSettings.getState();if(value.expiry!==undefined)store.setEventExpiry({enabled:value.expiry,seconds:value.seconds??1});if(value.capacity!==undefined)store.setEventWindowCapacity(value.capacity);if(value.sticky!==undefined)store.setStickyEvents({...store.stickyEvents,enabled:value.sticky,obsEnabled:value.sticky,giftThreshold:0,maxCount:2});};
 useEffect(()=>{useGeneralSettings.setState({eventDisplayPreferences:{...DEFAULT_STYLE_PREVIEW_POLICY.displayPreferences,eventAnimationPreset:'none'},eventExpiry:{enabled:false,seconds:1},eventWindowCapacity:20,stickyEvents:{...DEFAULT_STYLE_PREVIEW_POLICY.stickySettings,enabled:true,obsEnabled:true,maxCount:2,giftThreshold:0}});saveSceneSettings({...loadSceneSettings(),giftThreshold:0});},[]);
 (window as any).editorAcceptance={getSnapshot:getPreview,configure,
  setVisibility:(eventVisibility:any)=>setDocument(d=>({...d,settings:{...d.settings,eventVisibility}})),
  setSceneFilters:(filters:any)=>saveSceneSettings({...loadSceneSettings(),filters}),
 };
 const common={assetPreviewUrls,document,previewDocument:document,visualCss:document.styles.visualCss,customCss:document.styles.customCss,cssMessage:'',visualCssControlled:[],previewTarget,previewGeometry:null,displayPreferences:DEFAULT_STYLE_PREVIEW_POLICY.displayPreferences,fontFamilyOptions:['Arial'],onOpenFonts:noop,onSettingsChange:(settings:any)=>setDocument(d=>({...d,settings})),onCustomCssChange:(customCss:string)=>setDocument(d=>({...d,styles:{...d.styles,customCss}})),onVisualCssChange:()=>'',onExportCss:noop,onAddAsset:noop,onRemoveAsset:noop,onBack:()=>setEditing(false),onSave:noop,onEditMetadata:noop,onApply:noop};
 const surface=getCompatibleThemeEditingSurface(document.mode);
 return <><div aria-label="验收主题选择">{(['native','blivechat','blivechat-open','laplace'] as const).flatMap(mode=>['A','B'].map(name=><button key={mode+name} onClick={()=>{setDocument(theme(mode,name));setEditing(true)}}>{`打开 ${mode} ${name}`}</button>))}</div><div style={{display:'flex',height:'calc(100vh - 35px)',minHeight:0}}><div style={{flex:1,minWidth:0}}>{editing&&(document.mode==='native'?<NativeThemeEditor key={document.themeId} {...common}/>:surface&&<CompatibleThemeEditor key={document.themeId} {...common} capability={surface.capability} renderer={surface.renderer} composeCss={surface.composeCss}/>)}</div><aside ref={setPreviewTarget} style={{width:440,minWidth:440,height:'100%'}}/></div></>;
}
createRoot(document.getElementById('root')!).render(location.pathname.endsWith('stylePreviewPolicyWeb.html')||q.get('surface')==='web'?<StylePreviewPage/>:<Editor/>);
