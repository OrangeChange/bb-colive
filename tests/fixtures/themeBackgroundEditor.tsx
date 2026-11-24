import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ThemeVisualPropertyField} from '../../src/components/ThemeVisualPropertyField.tsx';
const report={commits:[] as string[],previews:[] as string[]};
Object.assign(window,{backgroundReport:report});
const initial=(window as Window & {backgroundInitial?:string}).backgroundInitial??'linear-gradient(rgba(255, 255, 255, 0.3), transparent 32px), rgb(50, 70, 90)';
function App(){
 const [value,setValue]=useState(initial),[preview,setPreview]=useState<string|null>(null);
 return <><ThemeVisualPropertyField property="background" label="事件背景" value={value} status="继承主题" fontFamilyOptions={[]} onOpenFonts={()=>{}} onChange={v=>{report.commits.push(String(v));setValue(String(v));setPreview(null);}} onPreviewChange={v=>{report.previews.push(String(v));setPreview(String(v));}} onPreviewCancel={()=>setPreview(null)}/><div id="sample" style={{width:300,height:120,background:preview??value}}>事件背景</div><output id="value">{value}</output></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
