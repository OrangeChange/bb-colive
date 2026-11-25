import {useState} from 'react';import{createRoot}from'react-dom/client';
import {ThemeColorField} from '../../../src/components/ThemeColorField';
import {StylePreviewToolbar}from '../../../src/components/StylePreviewToolbar';
import{Popover,PopoverTrigger,PopoverContent}from '../../../src/components/shadcn/popover';
import{Button}from '../../../src/components/shadcn/button';import{UiSelect}from '../../../src/components/ui/Select';
import{ThemeActionMenu}from '../../../src/components/ThemeActionMenu';
import '../../../src/shadcn.css';import '../../../src/components/nativeThemeEditor.css';import '../../../src/components/themeWorkspace.css';
function App(){const [color,setColor]=useState('rgba(255,255,255,0.5)'),[width,setWidth]=useState(400),[theme,setTheme]=useState('1');return <main style={{padding:24,display:'grid',gap:24,maxWidth:460}}>
<ThemeColorField label="颜色" value={color} onChange={setColor}/>
<StylePreviewToolbar eventOptions={[]} eventValues={[]} onEventsChange={()=>{}} scheme="light" motion="static" background={color} onBackgroundChange={setColor} width={width} onWidthChange={setWidth} onSchemeChange={()=>{}} onMotionChange={()=>{}}/>
<Popover><PopoverTrigger asChild><Button>所有副窗口</Button></PopoverTrigger><PopoverContent className="theme-current-use-popover"><label>主题<UiSelect contentClassName="theme-current-use-menu" ariaLabel="主题选择" value={theme} onValueChange={setTheme} options={Array.from({length:15},(_,i)=>({value:String(i),label:'主题 '+i}))}/></label></PopoverContent></Popover>
<ThemeActionMenu label="导出 CSS" items={[{label:'基础与可视化 CSS',action:()=>{}},{label:'仅可视化 CSS',action:()=>{}}]}>导出 CSS</ThemeActionMenu>
<span style={{display:'inline-flex',alignItems:'center',border:'1px solid var(--border)',borderRadius:8,width:'fit-content'}}><span style={{padding:'0 8px'}}>用户名</span><Button variant="ghost" size="icon-xs" aria-label="移除用户名">×</Button></span>
</main>};createRoot(document.getElementById('root')!).render(<App/>);
