import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {NativeStylePreviewSurface} from '../../src/components/NativeStylePreviewSurface.tsx';
import {NativeThemeVisualEditor} from '../../src/components/NativeThemeVisualEditor.tsx';
import {createBuiltinNativeTheme} from '../../src/themes/nativeBuiltinThemes.ts';
import {createStylePreviewDesignEvents} from '../../src/components/stylePreviewEvents.ts';
import {tryComposeNativePreviewCss} from '../../src/themes/nativeThemeCascade.ts';
import {DEFAULT_EVENT_DISPLAY_PREFERENCES} from '../../src/eventDisplaySettings.ts';
import {DEFAULT_STYLE_PREVIEW_POLICY} from '../../src/preview/stylePreviewPolicy.ts';
import type {NativeVisualSelection} from '../../src/components/NativeThemeVisualEditor.tsx';
import '../../src/App.css';
import '../../src/components/nativeThemeEditor.css';
const query=new URLSearchParams(location.search);
const theme=createBuiltinNativeTheme(query.get('theme')||'native-default');
const samples=createStylePreviewDesignEvents('混合流');
const chat=structuredClone(samples.find(e=>e.id.endsWith('body-short'))!);
chat.user!.avatar=undefined;
const blind=structuredClone(samples.find(e=>e.id.endsWith('blind-loss'))!);
blind.gift!.count=3;
const result=structuredClone(samples.find(e=>e.msgType===7)!);
result.lottery!.winners=result.lottery!.winners!.slice(0,1);
result.lottery!.awardNum=3;
function Fixture(){
 const [settings,setSettings]=useState(theme.settings);
 const [selection,setSelection]=useState<NativeVisualSelection>({event:'all',identity:'all',part:'avatarPlaceholder'});
 const [root,setRoot]=useState<HTMLElement|null>(null);
 return <div style={{display:'flex',height:'100vh'}}>
  <div ref={setRoot} style={{width:440}}><NativeStylePreviewSurface title="条件部件预览" previewScheme="light" payload={{previewCss:tryComposeNativePreviewCss({...theme,settings},'.native-theme-preview').css,previewPolicy:DEFAULT_STYLE_PREVIEW_POLICY,previewMotion:'design',context:'obs',mode:'all',events:[chat,blind,result],eventStyleSettings:settings,displayPreferences:{...DEFAULT_EVENT_DISPLAY_PREFERENCES,showCurrentRank:true,showHonorLevel:true},eventFontSize:16,windowEventFontSize:16,scrollDirection:'top',contentAlignment:'top',previewScheme:'light',previewBackground:'transparent'}}/></div>
  <div style={{flex:1,minWidth:0}}><NativeThemeVisualEditor settings={settings} selection={selection} previewRoot={root} cssControlled={[]} fontFamilyOptions={['MiSans','Arial']} onOpenFonts={()=>{}} onSelectionChange={setSelection} onChange={visualModel=>setSettings(s=>({...s,visualModel}))} onDisplayChange={display=>setSettings(s=>({...s,display}))} onPreviewChange={()=>{}} onPreviewCancel={()=>{}}/></div>
 </div>;
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
