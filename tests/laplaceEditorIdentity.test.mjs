import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {laplaceEditorIdentity} from '../src/compat/laplace/renderer/editorIdentity.ts';
import {LAPLACE_CAPABILITY} from '../src/compat/laplace/theme.ts';
const {JSDOM}=createRequire(import.meta.url)('../vendor/blivechat/node_modules/jsdom');
test('正文点选读取所属事件身份并遵守身份优先级',()=>{
 const dom=new JSDOM('<div class="event guard-level--3 user-type--mod"><span class="message">正文</span></div>');
 const n=dom.window.document.querySelector('.message');
 const selection={identityPriority:LAPLACE_CAPABILITY.identityPriority,scopeSelectors:{identities:LAPLACE_CAPABILITY.identitySelectors}};
 assert.equal(laplaceEditorIdentity(n,selection),'captain');
 assert.equal(laplaceEditorIdentity(n,{...selection,identityPriority:['moderator','captain']}),'moderator');
 n.parentElement.className='event';assert.equal(laplaceEditorIdentity(n,selection),'normal');
 dom.window.close();
});
