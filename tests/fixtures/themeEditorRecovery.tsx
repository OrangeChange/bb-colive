import {createRoot} from 'react-dom/client';
import {lazy,Suspense,useState} from 'react';
import {ThemeAdvancedEditorBoundary} from '../../src/components/ThemeAdvancedEditorBoundary.tsx';
const Failure=lazy(()=>Promise.reject(Error('module unavailable')));
function App(){const [advanced,setAdvanced]=useState(false);const [draft,setDraft]=useState('未保存草稿');return <><input aria-label="草稿" value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setAdvanced(true)}>高级编辑</button>{advanced?<ThemeAdvancedEditorBoundary onReturn={()=>setAdvanced(false)}><Suspense fallback="加载中"><Failure/></Suspense></ThemeAdvancedEditorBoundary>:<p>基础设置</p>}</>;}
createRoot(document.getElementById('root')!).render(<App/>);
