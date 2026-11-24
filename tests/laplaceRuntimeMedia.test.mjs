import {createStylePreviewEvents} from '../src/components/stylePreviewEvents.ts';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {setLaplaceEventMedia,resolveLaplaceEventMedia,laplaceEventMediaSources,laplaceAvatarMediaKey} from '../src/compat/laplace/renderer/eventMedia.ts';
import {getOriginalSamples} from '../src/compat/laplace/renderer/samples.ts';
import userMedia from '../src/preview/previewUserMedia.json' with {type:'json'};

test('预览用户和中奖头像保留指定原图并按 UID 补齐',()=>{
 const samples=getOriginalSamples('static');setLaplaceEventMedia(samples,true);
 for(const event of samples){
  if(event.avatar||event.uid&&event.username)assert.match(event.avatar,/^\/(?:media\/|laplace\/files\/)/);
  if(['red-envelope-result','lottery-result'].includes(event.type))for(const winner of event.list||[])if(Array.isArray(winner)&&winner[0])assert.equal(resolveLaplaceEventMedia(`https://workers.laplace.cn/bilibili/avatar/${winner[0]}`),userMedia[winner[0]]?.sourceUrl?userMedia[winner[0]].avatar:'/media/laplace-preview/avatars/official-default.jpg');
 }
 setLaplaceEventMedia([],false);
});
test('运行时复用已有头像、收礼者、中奖头像和礼物图，不串用房间身份',()=>{
 setLaplaceEventMedia([{origin:123,uid:7,avatar:'/media/sender.jpg',giftId:55,giftIcon:'/media/gift.webp',receiver:{uid:8,avatar:'/media/receiver.jpg'},list:[[9,'用户','/media/winner.jpg']]}],false);
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/7?size=320'),'/media/sender.jpg');
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/8?size=960'),'/media/receiver.jpg');
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/9?size=320'),'/media/winner.jpg');
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/7?size=320&isRoom=1'),undefined);
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/room-gift-config/123?gift=55&size=960'),'/media/gift.webp');
 setLaplaceEventMedia([],false);assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/7?size=320'),undefined);
});
test('财富图标复用软件本地素材，预览房间头像只在预览中提供',()=>{
 setLaplaceEventMedia([],true);assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/wealth-config?level=11'),'/wealth-levels/11.png');
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/25034104?isRoom=1&size=320'),'/media/laplace-preview/avatars/2132180406.jpg');
 setLaplaceEventMedia([],false);assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/25034104?isRoom=1&size=320'),undefined);
});

test('样例未指定头像时使用对应 UID，指定头像不被同 UID 覆盖',()=>{
 for(const mode of ['static','design']){
  const samples=getOriginalSamples(mode);
  const implicit=samples.find(event=>event.type==='message'&&event.uid===2132180406);
  assert.equal(implicit.avatar,userMedia['2132180406'].avatar);
  const explicit=samples.find(event=>event.avatar==='/media/laplace-preview/avatars/source-2.jpg');
  assert.ok(explicit);
 }
 setLaplaceEventMedia([],true);
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/1?size=320'),userMedia['1'].avatar);
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/22?size=320'),'/media/laplace-preview/avatars/official-default.jpg');
 setLaplaceEventMedia([],false);
});

test('本地头像地址移除仅用于 B 站 CDN 的尺寸后缀',()=>{
 assert.equal(resolveLaplaceEventMedia('/media/laplace-preview/avatars/1.jpg@320w_320h'),'/media/laplace-preview/avatars/1.jpg');
});

test('后到头像只更新相关旧事件，并在资料事件淘汰后保留被引用头像',()=>{
 const old={uid:101,avatar:'/media/101.jpg',reply:{uid:102}},other={uid:103,avatar:'/media/103.jpg'};
 setLaplaceEventMedia([old,other],false);
 const before=laplaceEventMediaSources(old),unchanged=laplaceEventMediaSources(other),key=laplaceAvatarMediaKey({uid:102});
 setLaplaceEventMedia([old,other,{uid:102,avatar:'/media/102.jpg'}],false);
 assert.notDeepEqual(laplaceEventMediaSources(old),before);
 assert.deepEqual(laplaceEventMediaSources(other),unchanged);
 assert.notEqual(laplaceAvatarMediaKey({uid:102}),key);
 setLaplaceEventMedia([old],false);
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/102?size=320'),'/media/102.jpg');
 setLaplaceEventMedia([],false);
 assert.equal(resolveLaplaceEventMedia('https://workers.laplace.cn/bilibili/avatar/102?size=320'),undefined);
});

test('正式素材映射独立于历史对照目录',()=>{
 const source=readFileSync(new URL('../src/compat/laplace/renderer/runtime-context.mjs',import.meta.url),'utf8');
 assert.match(source,/import assetLocations from '\.\/asset-locations\.json'/);
 assert.doesNotMatch(source,/vendor\/laplace/);
 const map=JSON.parse(readFileSync(new URL('../src/compat/laplace/renderer/asset-locations.json',import.meta.url),'utf8'));
 assert.ok(Object.keys(map).length>=53);
});

test('原生样例的用户、回复及中奖资料携带本地头像',()=>{
 for(const event of createStylePreviewEvents('混合流')){
  for(const user of [event.user,event.replyTo,...(event.lottery?.winners??[])])if(user?.uid)assert.match(user.avatar,/^\/media\//,String(user.uid));
 }
});
