import test from 'node:test';
import assert from 'node:assert/strict';
import {createThemeSessionHost} from '../src/themes/themeEditorSession.ts';
import {createCustomThemeDocument} from '../src/themes/themeTypes.ts';
test('更新失效通知保留脏会话，显式重载失败不替换缓存',async()=>{
 let disk=createCustomThemeDocument({themeId:'draft',mode:'native',name:'草稿'}), fail=false;
 const host=createThemeSessionHost({loadThemeDocument:async()=>{if(fail)throw Error('不可读');return structuredClone(disk)},saveThemeDocument:async()=>{}});
 const session=await host.openThemeSession('draft');host.updateThemeDraft(session,d=>({...d,styles:{...d.styles,customCss:'.message{color:red}'}}));
 host.updateThemeAsset(session,d=>d,'assets/test.svg',new Uint8Array([1]));
 disk.revision=2;host.discardThemeSession('draft',true);assert.equal(await host.openThemeSession('draft'),session);
 fail=true;await assert.rejects(host.reloadThemeSession(session));assert.equal(await host.openThemeSession('draft'),session);assert.equal(session.dirty,true);assert.equal(session.assetChanges['assets/test.svg'][0],1);
 fail=false;const next=await host.reloadThemeSession(session);assert.equal(next.saved.revision,2);assert.equal(next.dirty,false);assert.equal(next.document.styles.customCss,'');assert.equal((await host.openThemeSession('draft')),next);
});
