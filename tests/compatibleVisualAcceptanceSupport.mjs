import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
export const out='.superpowers/sdd/2026-10-28-compatible-visual-editor-implementation';
export async function connect(){const browser=await chromium.connectOverCDP(process.env.PROGRAM_CDP||'http://127.0.0.1:9238');const page=browser.contexts()[0].pages().find(p=>!new URL(p.url()).searchParams.has('window'));page.setDefaultTimeout(7000);return {browser,page};}
export async function home(p){await p.keyboard.press('Escape');const back=p.getByRole('button',{name:'返回样式',exact:true});if(await back.isVisible().catch(()=>false))await back.click();const discard=p.getByRole('button',{name:'放弃修改',exact:true});if(await discard.isVisible().catch(()=>false))await discard.click();if(!await p.locator('.theme-library-card').first().isVisible().catch(()=>false))await p.getByRole('button',{name:'样式',exact:true}).click();}
export async function edit(p,name){await home(p);await p.locator('.theme-library-card').filter({has:p.locator('strong',{hasText:name,exact:true})}).getByRole('button',{name:'编辑',exact:true}).click();await p.getByRole('tab',{name:'可视化编辑'}).click();}
export async function expand(target){for(let n=0;n<16&&!await target.isVisible();n++){let opened=false;for(const a of await target.locator('xpath=ancestor::details').all()){if(await a.getAttribute('open')!==null)continue;const s=a.locator(':scope > summary');if(await s.isVisible()){await s.click({position:{x:5,y:8}});opened=true;break;}}if(!opened)break;}}
export async function node(p,id){const target=p.locator(`[data-navigation-id="${id}"]`);await expand(target);await target.click();await p.waitForTimeout(100);}
export async function field(p,property){const field=p.locator(`.native-property-field.is-${property}`);const input=field.locator('input[type=number]');await expand(input);return {field,input};}
export async function frame(p){for(let n=0;n<40;n++){for(const f of p.frames().slice(1)){const e=await f.frameElement().catch(()=>null);if(e&&await e.isVisible()&&await e.evaluate(e=>!!e.closest('.compatible-theme-preview:not(.is-thumbnail)')))return f;}await p.waitForTimeout(100)}throw Error('编辑预览未加载');}
export async function choose(p,label,value){const select=p.getByRole('combobox',{name:label,exact:true});if(await select.innerText()===value)return;await select.click();await p.getByRole('option',{name:value,exact:true}).click();}
export function save(name,rows){writeFileSync(`${out}/${name}.json`,JSON.stringify(rows,null,2));}
export {assert};
