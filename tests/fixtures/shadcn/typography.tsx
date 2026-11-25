import { createRoot } from 'react-dom/client';
import { Button } from '../../../src/components/shadcn/button';
import { Label } from '../../../src/components/shadcn/label';
import { Input } from '../../../src/components/shadcn/input';
import { Tabs, TabsList, TabsTrigger } from '../../../src/components/shadcn/tabs';
import { ToggleGroup, ToggleGroupItem } from '../../../src/components/shadcn/toggle-group';
import { Dialog, DialogTitle } from '../../../src/components/shadcn/dialog';
import { SettingsChoiceControl } from '../../../src/components/SettingsChoiceControl';
import '../../../src/shadcn.css';
createRoot(document.getElementById('root')!).render(<main style={{padding:32,display:'flex',flexDirection:'column',gap:24,maxWidth:700}}>
 <h1 className="ui-type-page-title font-semibold">界面字重</h1>
 <p>正文与辅助说明使用普通字重，选中状态保留强调。</p>
 <div style={{display:'flex',gap:12}}><Button variant="outline" id="ordinary">普通按钮</Button><Button variant="outline" id="emphasis" className="font-semibold">明确强调</Button></div>
 <Label htmlFor="field">设置标签</Label><Input id="field" defaultValue="字段内容"/>
 <Tabs defaultValue="a"><TabsList className="ui-segmented"><TabsTrigger className="ui-segmented-item" value="a">选中导航</TabsTrigger><TabsTrigger className="ui-segmented-item" value="b">普通导航</TabsTrigger></TabsList></Tabs>
 <ToggleGroup className="ui-segmented" type="single" defaultValue="a"><ToggleGroupItem className="ui-segmented-item" value="a">选中分段</ToggleGroupItem><ToggleGroupItem className="ui-segmented-item" value="b">普通分段</ToggleGroupItem></ToggleGroup>
 <SettingsChoiceControl label="设置选项" value="a" options={[{value:'a',label:'选中设置'},{value:'b',label:'普通设置'}]} onChange={()=>{}}/>
 <Dialog><DialogTitle>弹窗标题</DialogTitle></Dialog>
</main>);
