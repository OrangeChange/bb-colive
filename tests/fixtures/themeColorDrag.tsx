import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {parseThemeColor,serializeThemeColor} from '../../src/components/themeColorValue';
import {ThemeColorField} from '../../src/components/ThemeColorField';
const report={previews:[] as string[],commits:[] as string[]};
(window as unknown as {colorDragReport:typeof report}).colorDragReport=report;
function App(){
  const [value,setValue]=useState('#ba5359');
  return <ThemeColorField opaque={location.hash.includes("opaque")} label="拖动测试" value={value} onChange={next=>{report.commits.push(next);setValue(location.hash.includes("opaque")?serializeThemeColor({...parseThemeColor(next)!,a:1},"hex"):next);}}
    onPreviewChange={next=>{report.previews.push(next);if(!location.hash.includes("opaque"))setTimeout(()=>setValue(next),50);}} onPreviewCancel={()=>setValue('#ba5359')}/>;
}
createRoot(document.getElementById('root')!).render(<App/>);
