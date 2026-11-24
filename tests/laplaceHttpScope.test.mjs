import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REMOTE_CSS_PREPROCESS_ENDPOINT, remoteCssRequestUrl } from '../src/compat/laplace/styleLoader.ts';

test('LAPLACE 远程来源请求由主窗口的 HTTP 范围允许', async () => {
 const capability=JSON.parse(await readFile(new URL('../src-tauri/capabilities/default.json',import.meta.url),'utf8'));
 const permission=capability.permissions.find(p=>p.identifier==='http:allow-fetch');
 const request=remoteCssRequestUrl('https://rsrc.laplace.cn/assets/bubble-snow.css');
 assert(permission.allow.some(({url})=>url.startsWith(REMOTE_CSS_PREPROCESS_ENDPOINT)&&new RegExp('^'+url.split('*').map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('.*')+'$').test(request)));
});
