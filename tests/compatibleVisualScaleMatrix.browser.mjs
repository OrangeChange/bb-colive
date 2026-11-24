import {BLIVECHAT_CAPABILITY as B} from '../src/compat/blivechat/theme.ts';
import {OPENLIVE_CAPABILITY as O} from '../src/compat/openlive/theme.ts';
import {LAPLACE_CAPABILITY as L} from '../src/compat/laplace/theme.ts';
import {buildCompatibleVisualNavigation} from '../src/themes/compatibleVisualNavigation.ts';
import {connect,home,edit,node,field,frame,choose,save,assert} from './compatibleVisualAcceptanceSupport.mjs';
const dimensions={fontSize:'font-size',lineHeight:'line-height',paddingX:'padding-inline-start',paddingY:'padding-block-start',marginX:'margin-inline-start',marginY:'margin-block-start',gap:'column-gap',width:'width',height:'height',borderWidth:'border-top-width',borderRadius:'border-top-left-radius'};
const {browser,page:p}=await connect();const rows=[];
await browser.contexts()[0].addInitScript(()=>window.addEventListener('message',e=>{const m=e.data;if(m?.channel==='bb-laplace'&&m.type==='render'){const msg=m.events.find(x=>x.type==='message');if(msg){msg.message='行内表情[表情]';msg.bmotes={'[表情]':{url:'/media/noface.gif'}};}}if(['bb-blivechat','bb-openlive'].includes(m?.type)&&m.command==='hydrate'){const r=m.data.records.find(x=>x.method==='onAddText');if(r){const d=r.payload??r.data;d.authorType=m.type==='bb-openlive'?2:1;d.privilegeType=3;}}}));await p.reload();
async function scale(mode,c){await p.getByRole('tab',{name:'基础设置'}).click();if(mode==='blivechat'){await p.getByRole('spinbutton',{name:'整体比例 G',exact:true}).fill(String(c.g));await p.getByRole('spinbutton',{name:'字体比例 F',exact:true}).fill(String(c.f));}if(mode==='laplace')await p.getByRole('spinbutton',{name:'基准字号 B',exact:true}).fill(String(c.b));await p.getByRole('tab',{name:'可视化编辑'}).click();await p.waitForTimeout(120);}
try{for(const [cap,name] of [[B,'BLC 原版默认'],[O,'BLC 开放版默认'],[L,'LAPLACE 默认']]){
 if(process.env.PROGRAM_MODE&&cap.mode!==process.env.PROGRAM_MODE)continue;
 await edit(p,name);const nodes=[];function walk(items){for(const n of items){if(n.part&&n.placement==='main')nodes.push(n);walk(n.children??[])}}for(const g of buildCompatibleVisualNavigation(cap.mode,cap.parts))walk(g.items);
 const keys=new Map();for(const n of nodes){const d=cap.parts[n.part];for(const property of d.properties.filter(x=>dimensions[x])){const key=`${property}|${d.scaleByProperty?.[property]??'fixed'}|${d.units?.[property]??'px'}`;if(!keys.has(key))keys.set(key,[]);keys.get(key).push(n);}}
 // Media categories have separate source constraints even when their scale chain is shared.
 for(const n of nodes.filter(n=>['avatar','smallEmote','largeEmote','giftImage','fanMedal'].includes(n.part))){for(const property of cap.parts[n.part].properties.filter(x=>['width','height','fontSize'].includes(x)))keys.set(`${n.part}|${property}`,[n]);}
 const combos=cap.mode==='blivechat'?[{g:1,f:1},{g:1.5,f:1},{g:1,f:1.5},{g:1.5,f:1.5},{g:.75,f:.8}]:cap.mode==='laplace'?[{b:20},{b:16},{b:24},{b:30}]:[{}];
 for(const [key,candidates]of keys){if(process.env.PROGRAM_CASE&&!process.env.PROGRAM_CASE.split(',').includes(key))continue;const row={mode:cap.mode,key,values:[]};try{
 await scale(cap.mode,combos[0]);let selected,control;
 for(const n of candidates){await node(p,n.id);if(!n.event&&!n.global){const all=p.locator('.native-event-scope-primary').getByRole('button',{name:'弹幕',exact:true});if(await all.isVisible())await all.click();}await p.waitForTimeout(80);const property=key.split('|').find(x=>dimensions[x]);control=await field(p,property);if(await control.input.isVisible().catch(()=>false)){selected=n;break;}}
 if(!selected){row.result='不适用';row.reason='当前来源布局不提供该数值字段';rows.push(row);save(process.env.PROGRAM_ARTIFACT||(process.env.PROGRAM_CASE?'program-scale-targeted':'program-scale-matrix'),rows);continue;}
 const property=key.split('|').find(x=>dimensions[x]),d=cap.parts[selected.part];row.id=selected.id;row.property=property;row.chain=d.scaleByProperty?.[property]??'fixed';const value=property==='lineHeight'&&d.units?.lineHeight==='number'?1.25:['fontSize','lineHeight'].includes(property)?14:['width','height'].includes(property)?8:property==='borderWidth'?2:3;
 const f=await frame(p);row.defaultActual=await f.locator('[data-compatible-editor-selected]').first().evaluate((e,css)=>getComputedStyle(e).getPropertyValue(css),dimensions[property]);await control.input.fill(String(value));
 for(const c of combos){await scale(cap.mode,c);control=await field(p,property);const factor=row.chain==='global'?c.g:row.chain==='global-font'?c.g*c.f:row.chain==='base-font'?c.b/20:1;const expected=value*factor;const dpr=await f.evaluate(()=>devicePixelRatio);const renderedExpected=property==='borderWidth'?Math.max(1,Math.floor(expected*dpr+.0001))/dpr:expected;const computedExpected=property==='lineHeight'&&d.units?.lineHeight==='number'?null:renderedExpected;
 if(computedExpected!==null)await f.waitForFunction(({css,value})=>[...document.querySelectorAll('[data-compatible-editor-selected]')].some(e=>Math.abs(parseFloat(getComputedStyle(e).getPropertyValue(css))-value)<.15),{css:dimensions[property],value:computedExpected},{timeout:2000});
 if(computedExpected===null)await f.waitForFunction(value=>[...document.querySelectorAll('[data-compatible-editor-selected]')].some(e=>Math.abs(parseFloat(getComputedStyle(e).lineHeight)/parseFloat(getComputedStyle(e).fontSize)-value)<.02),expected,{timeout:2000});
 const actual=await f.locator('[data-compatible-editor-selected]').first().evaluate((e,css)=>getComputedStyle(e).getPropertyValue(css),dimensions[property]);assert.ok(Math.abs(Number(await control.input.inputValue())-renderedExpected)<.15,`${key}: control ${await control.input.inputValue()} vs ${expected}`);row.values.push({base:c,control:Number(await control.input.inputValue()),actual,expected,renderedExpected});}
 await control.field.getByRole('button',{name:'恢复继承'}).click();row.result='通过';
 }catch(e){row.result='失败';row.error=String(e.stack||e).slice(0,1300);}
 rows.push(row);save(process.env.PROGRAM_ARTIFACT||(process.env.PROGRAM_CASE?'program-scale-targeted':'program-scale-matrix'),rows);console.log(row.mode,row.key,row.id,row.result,row.error??'');if(row.result==='失败'&&process.env.FAIL_FAST==='1')throw Error(row.error);
 }await home(p);
}}finally{await browser.close()}
assert.ok(rows.every(r=>r.result==='通过'||r.result==='不适用'));
