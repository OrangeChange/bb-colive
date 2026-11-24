import test from 'node:test';
import assert from 'node:assert/strict';
import { createStylePreviewEvents, createStylePreviewDesignEvents, createStylePreviewSimulationEvents } from '../src/components/stylePreviewEvents.ts';
import { createNativeDesignSamples } from '../src/preview/nativeDesignSamples.ts';

test('总督月费展示样例在普通和千舰图标下保留完整金额', () => {
  const events = [...createStylePreviewEvents('大航海'), ...createStylePreviewDesignEvents('大航海')];
  const governors = events.filter(event => event.guard?.level === 3);
  assert(governors.length >= 2);
  for (const event of governors) {
    assert.equal(event.guard.count, 1);
    assert.equal(event.guard.price, 19998000);
    assert.equal(event.guard.priceRmb, 19998);
  }
});

test('点选依照身份和事件分类排列，不改写捕获素材', () => {
  const pool=createStylePreviewSimulationEvents('混合流'), before=structuredClone(pool);
  const samples=createNativeDesignSamples(pool);
  const identities=samples.filter(s=>s.key.startsWith('identity-')).slice(0,6).map(s=>s.event.user);
  assert.deepEqual(identities.map(u=>u.guardLevel),[0,1,2,3,0,0]);
  assert.equal(identities[4].isAdmin,true);
  assert.equal(identities[5].isAnchor,true);
  const categories=[...new Set(samples.map(s=>s.category))];
  assert.deepEqual(categories,['弹幕','互动','礼物','醒目留言','大航海','天选','红包','系统']);
  const ranks=samples.map(s=>categories.indexOf(s.category));
  assert.deepEqual(ranks,ranks.toSorted((a,b)=>a-b));
  assert.deepEqual(pool,before);
  assert(samples.every(s=>s.sourceId&&Array.isArray(s.changedFields)));
  assert.equal(new Set(samples.map(s=>s.event.id)).size,samples.length);
});

test('正文六种形态、合并次数、价格梯度与开奖数量完整', () => {
  const rows=createNativeDesignSamples(createStylePreviewSimulationEvents('混合流'));
  for(const key of ['body-short','body-long','body-reply','body-inline-emote','body-big-emote','body-banner-emote'])assert(rows.some(s=>s.key===key),key);
  assert(rows.some(s=>s.event.danmuRepeatCount===3));
  assert.deepEqual(rows.filter(s=>s.key.startsWith('gift-band-')).map(s=>s.event.gift.totalRmb),[2,30,50,100,500,1000,2000]);
  assert.deepEqual(rows.filter(s=>s.key.startsWith('sc-band-')).map(s=>s.event.sc.price),[2,30,50,100,500,1000,2000]);
  assert.deepEqual(rows.filter(s=>s.key.startsWith('blind-')).map(s=>Math.sign(s.event.gift.blindHitPriceRmb-s.event.gift.blindPriceRmb)),[-1,0,1]);
  assert.equal(rows.filter(s=>s.event.msgType===5).length,1);
  assert.equal(rows.filter(s=>s.event.msgType===7).length,1);
  assert.deepEqual(rows.filter(s=>s.key.startsWith('honor-')).map(s=>s.event.honor.threshold),[100,666,888,1000,1314,2233,5200,10000]);
});

test('点选遵从当前金额档位，重复创建相互独立', () => {
  const events=createStylePreviewDesignEvents('礼物',[0,20,80]);
  assert.deepEqual(events.filter(e=>e.id.includes('gift-band-')).map(e=>e.gift.totalRmb),[2,20,80]);
  events[0].user.uname='改名';
  assert.notEqual(createStylePreviewDesignEvents('礼物',[0,20,80])[0].user.uname,'改名');
});

test('点选区分表情来源，并覆盖自动弹幕、进房与千舰图标', () => {
 const rows=createNativeDesignSamples(createStylePreviewSimulationEvents('混合流'));
 const get=key=>{const row=rows.find(s=>s.key===key);assert(row,key);return row.event};
 for(const key of ['body-big-emote','body-room-emote','body-charge-emote','body-collection-emote']) assert(get(key).emoticon.url.startsWith('/media/'));
 assert(get('body-big-emote').emoticon.unique.startsWith('room_'));
 assert(get('body-room-emote').emoticon.unique.startsWith('room_'));
 assert.match(get('body-charge-emote').text,/充电/);
 assert.match(get('body-collection-emote').text,/收藏集/);
 assert.equal(get('body-charge-emote').user.uname,'充电专属表情');
 assert.match(get('body-charge-emote').emoticon.unique,/泥哭啦/);
 assert.equal(get('body-room-emote').user.uname,'房间专属表情');
 assert.deepEqual(rows.filter(s=>/^identity-.*-thousand$/.test(s.key)).map(s=>s.event.user.guardLevel),[1,2,3]);
 assert.deepEqual(rows.filter(s=>/^guard-\d-thousand$/.test(s.key)).map(s=>s.event.guard.level),[1,2,3]);
 assert.equal(get('body-auto').isAutoDanmaku,true);
 assert.equal(rows.filter(s=>s.event.isAutoDanmaku).length,1);
 assert.equal(get('interaction-guard-entry').user.guardLevel,3);
 for(const [ordinary,thousand] of [['identity-captain','identity-captain-thousand'],['guard-2-开通','guard-2-thousand']]){
  assert.equal(get(ordinary).user.guardMilestone,'standard');
  assert.equal(get(thousand).user.guardMilestone,'thousand');
  assert.equal(get(thousand).user.guardIconUrl,undefined);
 }
});


test('点选以说明式称呼和文案展示目的，媒体继续复用',()=>{
 const samples=createNativeDesignSamples(createStylePreviewSimulationEvents('混合流'));
 const normal=samples.find(s=>s.key==='identity-normal').event;
 assert.equal(normal.user.uname,'普通用户');assert.match(normal.text,/展示用户名配色/);
 const banner=samples.find(s=>s.key==='body-banner-emote').event;
 assert.equal(banner.text,'横条表情示例');assert(banner.emoticon.url);
 const long=samples.find(s=>s.key==='body-long').event;assert.match(long.text,/自动换行/);assert(long.text.length>60);
 assert(samples.filter(s=>s.event.sc).every(s=>/检查/.test(s.event.sc.message)));
});

test('点选弹幕按单一目的枚举，仅保留一条合并三次，天选只有完整版',()=>{
 const samples=createNativeDesignSamples(createStylePreviewSimulationEvents('混合流'));
 const chats=samples.filter(s=>s.event.msgType===0);
 assert.deepEqual(chats.filter(s=>s.event.danmuRepeatCount).map(s=>s.event.danmuRepeatCount),[3]);
 for(const s of chats){if(!s.key.startsWith('identity-')){assert.equal(s.event.user.guardLevel,0,s.key);assert(!s.event.user.isAdmin,s.key);assert(!s.event.user.isAnchor,s.key)}if(!s.key.startsWith('medal-'))assert.equal(s.event.user.medal,undefined,s.key);if(!s.key.startsWith('rank-'))assert.equal(s.event.user.currentRank,undefined,s.key);if(s.key!=='wealth-medal')assert.equal(s.event.user.wealthLevel,undefined,s.key)}
 const starts=samples.filter(s=>s.event.msgType===4);assert.equal(starts.length,1);assert(starts[0].event.lottery.danmu);assert(starts[0].event.lottery.giftName);assert(starts[0].event.lottery.requireText);
 const guards=samples.filter(s=>s.event.msgType===3&&!s.key.includes('duration')&&!s.key.includes('months')&&!s.key.endsWith('thousand'));assert.equal(guards.length,5);assert.equal(guards.filter(s=>s.event.guard.level===1).length,3);
});
