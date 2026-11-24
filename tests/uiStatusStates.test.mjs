import test from 'node:test';
import assert from 'node:assert/strict';
import { componentRuntime, findElement } from './helpers/componentRuntime.mjs';

const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : tree && typeof tree === 'object' ? text(tree.props?.children) : '';

test('二维码返回前显示生成状态，返回后才邀请扫码', () => {
  const state = {phase:'loggingIn',qrUrl:null,qrStatus:null,error:null,startLogin(){},restore(){}};
  const runtime = componentRuntime('src/components/LoginCard.tsx', {'../stores/session':{useSession:select=>select(state)}});
  assert.match(text(runtime.render('LoginScreen',{})), /正在生成二维码/);
  state.qrUrl='https://example.com/login';
  assert.match(text(runtime.render('LoginScreen',{})), /打开 B 站 App 扫码登录/);
  state.error='二维码获取失败，请重试';
  assert.match(text(runtime.render('LoginScreen',{})), /二维码获取失败/);
});

test('OBS 查询完成前不显示停止，不提供重试启动；失败可重新查询', async () => {
  let reject;
  const runtime = componentRuntime('src/obs/ObsServiceSettings.tsx', {
    '../generalSettings.ts':{useGeneralSettings:select=>select({showObsGiftEffect:false,showObsGuardEffect:false})},
    './obsService.ts':{obsServiceStatus:()=>new Promise((_,fail)=>reject=fail)},
    '@tauri-apps/api/event':{listen:async()=>()=>{},emit:async()=>{}},
  });
  let tree=runtime.render('ObsServiceSettings',{});
  assert.match(text(tree), /正在查询本机服务/);
  assert.equal(findElement(tree,el=>el.type==='button'&&text(el)==='重试启动'),null);
  runtime.effects();reject(new Error('unavailable'));await new Promise(resolve=>setImmediate(resolve));
  tree=runtime.render('ObsServiceSettings',{});
  assert.match(text(tree),/无法查询本机服务/);
  assert.ok(findElement(tree,el=>el.type==='button'&&text(el)==='重新查询'));
  runtime.close();
});
